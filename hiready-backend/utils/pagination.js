/**
 * Pagination helper — clamps page/limit to safe bounds
 * Returns { page, limit, skip }
 */
function pagination(req) {
  const rawPage = parseInt(req.query.page, 10);
  const rawLimit = parseInt(req.query.limit, 10);
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.min(1e4, rawPage)) : 1;
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(50, rawLimit)) : 10;
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}
module.exports = pagination;
