const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Auto-promotes emails listed in the ADMIN_EMAILS env var (comma-separated)
 * to the admin role. Called after every identity-issuing flow.
 */
async function maybePromoteAdmin(userDoc) {
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!adminEmails.length || !userDoc.email) return;
  if (adminEmails.includes(String(userDoc.email).toLowerCase()) && userDoc.role !== "admin") {
    userDoc.role = "admin";
    await userDoc.save();
    console.log(`Admin role granted to ${userDoc.email} via ADMIN_EMAILS`);
  }
}

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "1d" });
}

// ── Firebase ID token verification (no firebase-admin dependency) ──────
// Verifies RS256 signatures against Google's public x509 certificates and
// checks the issuer/audience against FIREBASE_PROJECT_ID.
const googleCertCache = { certs: null, fetchedAt: 0 };

async function getGoogleCerts() {
  if (googleCertCache.certs && Date.now() - googleCertCache.fetchedAt < 60 * 60 * 1000) {
    return googleCertCache.certs;
  }
  const res = await fetch(
    "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
  );
  if (!res.ok) throw new Error(`Failed to fetch Google certs (${res.status})`);
  googleCertCache.certs = await res.json();
  googleCertCache.fetchedAt = Date.now();
  return googleCertCache.certs;
}

async function verifyFirebaseIdToken(idToken) {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || !decoded.header || !decoded.header.kid) {
    throw new Error("Malformed ID token");
  }
  const certs = await getGoogleCerts();
  const cert = certs[decoded.header.kid];
  if (!cert) throw new Error("Unknown token key");

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Server is not configured for Firebase sign-in");

  return jwt.verify(idToken, cert, {
    algorithms: ["RS256"],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`
  });
}

// GOOGLE / FIREBASE SIGN-IN — exchanges a Firebase ID token for a backend JWT
router.post("/google", async (req, res) => {
  const { idToken } = req.body;

  if (!idToken || typeof idToken !== "string") {
    return res.status(400).json({ message: "idToken is required" });
  }

  try {
    let payload;
    try {
      payload = await verifyFirebaseIdToken(idToken);
    } catch (err) {
      console.error("Firebase token verify failed:", err.message);
      return res.status(401).json({ message: "Invalid Google sign-in token" });
    }

    const uid = payload.sub;
    const email = payload.email ? String(payload.email).toLowerCase() : null;
    const name = payload.name || (email ? email.split("@")[0] : "Google User");

    if (!email) {
      return res.status(400).json({ error: "Your Google account has no email" });
    }

    if (!payload.email_verified) {
      return res.status(403).json({ error: "Email must be verified with Google to sign in" });
    }

    // Link by uid first, then by email (so existing accounts adopt the Google identity)
    let user = await User.findOne({ firebaseUid: uid });
    if (!user) user = await User.findOne({ email });

    if (!user) {
      user = new User({
        name,
        email,
        password: null, // Google-only account — cannot password-login
        firebaseUid: uid
      });
    } else if (!user.firebaseUid) {
      user.firebaseUid = uid;
      // Invalidate unverified password on Google link to prevent pre-hijacking
      user.password = null;
      if (!user.name || user.name === "Unknown") user.name = name;
    }

    await user.save();
    await maybePromoteAdmin(user);

    res.json({
      message: "Login successful",
      token: signToken(user._id),
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Google auth error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// SIGNUP
router.post("/signup", async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return res.status(400).json({ message: "Name must be at least 2 characters" });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ message: "A valid email is required" });
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters" });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ message: "Passwords do not match" });
  }

  try {
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: "Unable to register with these details" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name: name.trim(),
      email: email.toLowerCase(),
      password: hashedPassword
    });

    await user.save();
    await maybePromoteAdmin(user);

    // Auto-login: hand back the same session payload as /login
    res.json({
      message: "User registered successfully",
      token: signToken(user._id),
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Signup error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !EMAIL_RE.test(email) || !password) {
    return res.status(400).json({ message: "Invalid credentials" });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() });

    // Google-only accounts have no password hash — they cannot use this route
    if (!user || !user.password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    await maybePromoteAdmin(user);
    const isAdmin = user.role === "admin";

    const token = signToken(user._id);

    // Respond with only safe fields — never leak the password hash
    res.json({
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: isAdmin ? "admin" : "user"
      }
    });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
