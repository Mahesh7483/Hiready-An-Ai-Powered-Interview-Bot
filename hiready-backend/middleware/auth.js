const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Verifies the Bearer JWT issued by /api/auth/login.
 * Attaches `req.user = { id }` on success; rejects otherwise.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload || !payload.id) {
      return res.status(401).json({ error: "Invalid token payload" });
    }
    req.user = { id: payload.id };
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Requires an authenticated user whose CURRENT DB role is admin.
 * Role is re-checked on every request so promotions/demotions take
 * effect immediately without re-issuing tokens.
 */
async function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  if (!payload || !payload.id) {
    return res.status(401).json({ error: "Invalid token payload" });
  }

  try {
    const user = await User.findById(payload.id).select("role").lean();
    if (!user || user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    req.user = { id: payload.id };
    return next();
  } catch (err) {
    console.error("Admin auth error:", err.message);
    return res.status(500).json({ error: "Authorization check failed" });
  }
}

module.exports = { requireAuth, requireAdmin };
