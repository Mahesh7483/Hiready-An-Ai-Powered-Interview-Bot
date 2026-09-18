const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * How long a confirmed account is trusted before it is re-checked.
 *
 * Verifying the signature alone means a DELETED user keeps full access until
 * their token expires — up to 24 hours. Re-reading the user on every request
 * closes that, but makes authentication depend on a database round trip per
 * request: a Mongo blip would then log every user out at once, which is a
 * worse failure than the window it removes.
 *
 * So: confirm once, then trust for a minute. Revocation lands within 60s
 * instead of 24h, and the steady-state cost is one lookup per user per minute.
 */
const EXISTENCE_TTL_MS = 60_000;
const confirmedUntil = new Map();

/** Keeps the map from growing without bound on a long-lived process. */
function sweepConfirmed(now) {
  if (confirmedUntil.size < 5000) return;
  for (const [id, until] of confirmedUntil) {
    if (until <= now) confirmedUntil.delete(id);
  }
}

async function accountStillExists(userId) {
  const now = Date.now();
  const until = confirmedUntil.get(userId);
  if (until && until > now) return true;

  try {
    const found = await User.exists({ _id: userId }).maxTimeMS(3000);
    if (!found) {
      confirmedUntil.delete(userId);
      return false;
    }
    sweepConfirmed(now);
    confirmedUntil.set(userId, now + EXISTENCE_TTL_MS);
    return true;
  } catch (err) {
    // The database is unreachable or slow. A valid, unexpired, correctly
    // signed token is still evidence of authentication; refusing it here
    // would turn a storage hiccup into a full outage. Logged so the gap is
    // visible rather than silent.
    console.warn('[auth] account existence check unavailable:', err.message);
    return true;
  }
}

/**
 * Verifies the Bearer JWT issued by /api/auth/login.
 * Attaches `req.user = { id }` on success; rejects otherwise.
 */
async function requireAuth(req, res, next) {
  /**
   * Idempotent: mounting this twice on one path must cost what mounting it
   * once costs.
   *
   * /api/ai mounts it at the app level so the rate limiter that keys on
   * req.user.id has a user to key on, and aiRoutes keeps its own so the
   * router can never be served unauthenticated if it is mounted elsewhere.
   * Without this guard the second pass repeats the whole check — and when the
   * database is unreachable, accountStillExists returns true via its catch
   * WITHOUT populating the TTL cache, so each pass pays the full mongoose
   * buffer timeout. Two passes, twice the wait, for an answer already known.
   *
   * req.user is set only by this file and middleware/company.js. Nothing
   * derived from the request can forge it.
   */
  if (req.user && req.user.id) return next();

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  if (!payload || !payload.id) {
    return res.status(401).json({ error: "Invalid token payload" });
  }

  if (!(await accountStillExists(payload.id))) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.user = { id: payload.id };
  return next();
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
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  if (!payload || !payload.id) {
    return res.status(401).json({ error: "Invalid token payload" });
  }

  try {
    // `email` is fetched alongside `role` so the audit trail can name WHO did
    // something. Every AuditLog row used to store an empty adminEmail: the
    // writers read req.user.email, and this only ever set { id }. An audit log
    // that cannot identify the actor does not audit anything.
    const user = await User.findById(payload.id).select("role email").lean();
    if (!user || user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    req.user = { id: payload.id, email: user.email || "" };
    return next();
  } catch (err) {
    console.error("Admin auth error:", err.message);
    return res.status(500).json({ error: "Authorization check failed" });
  }
}

module.exports = { requireAuth, requireAdmin, _confirmedUntil: confirmedUntil };
