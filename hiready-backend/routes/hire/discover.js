const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const CandidateCompanyConsent = require('../../models/CandidateCompanyConsent');
const AssessmentAttempt = require('../../models/AssessmentAttempt');
const AssessmentTemplate = require('../../models/AssessmentTemplate');
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
      // Sorted so the cap is deterministic. Without it, which slice of a larger
      // consenting pool gets considered is whatever order the collection returns.
      .sort({ grantedAt: -1 })
      .limit(500)
      .lean();

    if (!consents.length) return res.json({ candidates: [], total: 0 });

    const ids = consents.map((c) => c.candidateId);

    // Same tenant scoping as services/hire/readers.js getScorecard(): rank only
    // on attempts this company is entitled to see. Aggregating over every
    // attempt the candidate ever made would rank them partly on another
    // company's private instrument, and partly on their own self-practice.
    const templates = await AssessmentTemplate.find({
      $or: [{ companyId: req.company.companyId }, { companyId: null }],
    })
      .select('_id')
      .lean();
    const templateIds = templates.map((t) => t._id);

    // Verified assessment performance only. Practice history is NEVER in
    // policy/dataAccess.js and is not consulted, here or anywhere under /hire.
    const rows = await AssessmentAttempt.aggregate([
      {
        $match: {
          userId: { $in: ids },
          templateId: { $in: templateIds },
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
    ]);

    /**
     * The consent list is the source of truth, not the attempt aggregate.
     *
     * Ranking straight off the pipeline made this a LEFT JOIN in name only: a
     * candidate with no attempt on one of this company's templates produces no
     * group, so they vanished entirely — despite having opted in, and despite
     * the promise at the top of this file that only non-opted-in candidates
     * are absent. In a placement-cell setting that is precisely the student a
     * company most wants to reach: consented, available, not yet assessed.
     *
     * So build from the consents and merge the stats in. No evidence reads as
     * `null`, which is honest, rather than as absence, which is a lie.
     */
    const statsById = new Map(rows.map((r) => [String(r._id), r]));

    let candidates = consents.map((c) => {
      const stat = statsById.get(String(c.candidateId));
      return {
        // The opaque handle. It is the candidate id, which is fine precisely
        // because it resolves to nothing without consent — candidateAccess
        // refuses a DISCOVERABLE row, so possessing this buys an attacker
        // nothing beyond what this endpoint already returned.
        handle: c.candidateId,
        assessmentPercent: stat ? stat.percent : null,
        assessments: stat ? stat.attempts : 0,
        lastActiveAt: stat ? stat.lastAt : null,
      };
    });

    // A score floor is a statement about evidence, so it excludes candidates
    // who have none. At the default floor of 0 they are included.
    if (minScore > 0) {
      candidates = candidates.filter(
        (c) => c.assessmentPercent !== null && c.assessmentPercent >= minScore
      );
    }

    // Scored candidates first, best to worst; unscored after, most recently
    // consenting first. Sorting `null` numerically would scatter them.
    candidates.sort((a, b) => {
      if (a.assessmentPercent === null && b.assessmentPercent === null) return 0;
      if (a.assessmentPercent === null) return 1;
      if (b.assessmentPercent === null) return -1;
      if (b.assessmentPercent !== a.assessmentPercent) {
        return b.assessmentPercent - a.assessmentPercent;
      }
      return new Date(b.lastActiveAt || 0) - new Date(a.lastActiveAt || 0);
    });

    // `total` is the size of the matching pool, computed BEFORE the cap — it
    // was previously the length of the already-limited page, so a recruiter
    // reading "25 candidates" was reading the page size.
    const total = candidates.length;

    res.json({
      total,
      capped: total > limit,
      candidates: candidates.slice(0, limit),
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
