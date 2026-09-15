const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const CandidateCompanyConsent = require('../../models/CandidateCompanyConsent');
const AssessmentAttempt = require('../../models/AssessmentAttempt');
const { requireCompanyRole } = require('../../middleware/company');

/**
 * Pseudonymous discovery over candidates who opened themselves to THIS
 * company.
 *
 * Two rules make this safe, and both are structural rather than cosmetic:
 *
 *  1. The candidate set comes from CandidateCompanyConsent where
 *     state === 'DISCOVERABLE' AND companyId === this company. A student who
 *     has not opted in to this company is not in the result set at all — not
 *     anonymised, absent. They do not appear in counts either.
 *
 *  2. No identity is resolved here and none can be: this route never calls
 *     candidateAccess(), and DISCOVERABLE deliberately yields no capability,
 *     so there is no path from a search result to a person. Recruiters express
 *     interest against the opaque handle; the CANDIDATE decides whether that
 *     becomes a name.
 *
 * Note this works identically for a college placement cell and an open
 * marketplace — the two differ only in how candidates come to be DISCOVERABLE,
 * which is an onboarding concern, not a query concern.
 */

const refuse = (res) => res.status(404).json({ error: 'Not found' });

// GET /api/hire/discover?minScore=&limit=
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
    const minScore = Math.min(Math.max(parseInt(req.query.minScore, 10) || 0, 0), 100);

    const consents = await CandidateCompanyConsent.find({
      companyId: req.company.companyId,
      state: 'DISCOVERABLE',
      revokedAt: null,
    })
      .select('candidateId')
      .limit(500)
      .lean();

    if (!consents.length) return res.json({ candidates: [], total: 0 });

    const ids = consents.map((c) => c.candidateId);

    // Verified assessment performance only. Practice history is NEVER in
    // policy/dataAccess.js and is not consulted, here or anywhere under /hire.
    const rows = await AssessmentAttempt.aggregate([
      {
        $match: {
          userId: { $in: ids },
          status: { $in: ['completed', 'auto_submitted'] },
        },
      },
      { $unwind: '$sectionResults' },
      {
        $group: {
          _id: '$userId',
          scored: { $sum: '$sectionResults.score' },
          possible: { $sum: '$sectionResults.maxScore' },
          attempts: { $addToSet: '$_id' },
          lastAt: { $max: '$completedAt' },
        },
      },
      {
        $project: {
          attempts: { $size: '$attempts' },
          lastAt: 1,
          percent: {
            $cond: [
              { $gt: ['$possible', 0] },
              { $round: [{ $multiply: [{ $divide: ['$scored', '$possible'] }, 100] }, 0] },
              null,
            ],
          },
        },
      },
      { $match: { percent: { $gte: minScore } } },
      { $sort: { percent: -1, lastAt: -1 } },
      { $limit: limit },
    ]);

    res.json({
      total: rows.length,
      candidates: rows.map((r) => ({
        // The opaque handle. It is the candidate id, which is fine precisely
        // because it resolves to nothing without consent — candidateAccess
        // refuses a DISCOVERABLE row, so possessing this buys an attacker
        // nothing beyond what this endpoint already returned.
        handle: r._id,
        assessmentPercent: r.percent,
        assessments: r.attempts,
        lastActiveAt: r.lastAt,
      })),
    });
  } catch (err) {
    console.error('hire discover error:', err.message);
    res.status(500).json({ error: 'Failed to search' });
  }
});

/**
 * POST /api/hire/discover/:handle/interest
 *
 * Expresses interest. This does NOT grant the company anything — it flags the
 * candidate, who then chooses whether to reveal. The asymmetry is the product:
 * a company can ask, only the candidate can answer.
 */
router.post('/:handle/interest', requireCompanyRole('owner', 'recruiter'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.handle)) return refuse(res);

    const consent = await CandidateCompanyConsent.findOne({
      candidateId: req.params.handle,
      companyId: req.company.companyId,
      state: 'DISCOVERABLE',
      revokedAt: null,
    });
    if (!consent) return refuse(res);

    // Recorded on the consent row the candidate already owns, so it surfaces
    // on their privacy screen as "Company X asked to see your profile".
    consent.set('interestAt', new Date());
    consent.set('interestBy', req.user.id);
    await consent.save();

    res.json({ ok: true, handle: req.params.handle, state: consent.state });
  } catch (err) {
    console.error('hire interest error:', err.message);
    res.status(500).json({ error: 'Failed to express interest' });
  }
});

module.exports = router;
