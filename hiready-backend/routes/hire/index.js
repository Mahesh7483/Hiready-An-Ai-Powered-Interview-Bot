const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middleware/auth');
const { requireCompany, listMemberships } = require('../../middleware/company');

/**
 * The recruiter surface.
 *
 * Nothing under this tree may import a model marked NEVER in
 * policy/dataAccess.js. tests/backend/hireBoundary.test.js walks the transitive
 * require graph from every file here and fails the build otherwise — so
 * evidence reaches these routes only through services/hire/readers.js.
 */
router.use(requireAuth);

/**
 * GET /api/hire/me — deliberately NOT behind requireCompany.
 *
 * This is how a client discovers which companies it may act as, including the
 * case where the user belongs to several and must therefore send an
 * x-company-id header on every other call. Gating it on requireCompany would
 * make that state undiscoverable: the user would be refused without ever being
 * told they simply needed to pick.
 */
router.get('/me', async (req, res) => {
  try {
    const memberships = await listMemberships(req.user.id);
    const usable = memberships.filter((m) => m.status === 'active');
    if (!usable.length) return res.status(404).json({ error: 'Not found' });
    res.json({
      companies: usable,
      // When there is exactly one, the client may omit x-company-id entirely.
      defaultCompanyId: usable.length === 1 ? usable[0].companyId : null,
    });
  } catch (err) {
    console.error('hire me error:', err.message);
    res.status(404).json({ error: 'Not found' });
  }
});

// Everything below requires a RESOLVED company.
router.use(requireCompany);

router.use('/jobs', require('./jobs'));
router.use('/candidates', require('./candidates'));
router.use('/invites', require('./invites'));
router.use('/discover', require('./discover'));

module.exports = router;
