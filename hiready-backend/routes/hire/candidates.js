const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { candidateAccess } = require('../../services/hire/access');
const { getFullScorecard } = require('../../services/hire/readers');
const { recordDisclosure } = require('../../services/hire/consent');

/**
 * The candidate scorecard — the only screen that can show a real person.
 *
 * Note what is NOT here: no Model.find() of any kind. Every byte returned
 * comes from services/hire/readers.js, which only accepts a capability from
 * candidateAccess(). If you find yourself wanting to add a query to this file,
 * that is the signal to add a reader instead.
 */


/**
 * The scopes that actually yielded something, so the audit records what was
 * really disclosed rather than what was merely permitted.
 */
function disclosedScopes(card, access) {
  const used = [];
  if (card.identity) used.push('identity');
  if (card.assessments && card.assessments.length) used.push('assessment');
  if (card.interviews && card.interviews.length) used.push('interview');
  if (card.resume) used.push('resume');
  // Nothing came back, but the read still happened under this authorization.
  return used.length ? used : access.scopes();
}

// GET /api/hire/candidates/:id
router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      // expose is required: without it middleware/errorHandler.js substitutes
      // "Internal server error", producing a second refusal shape that a caller
      // can tell apart from candidateAccess()'s "Not found" — and dumping a
      // stack trace for every fat-fingered URL.
      const e = new Error('Not found');
      e.status = 404;
      e.expose = true;
      throw e;
    }

    // The door. Throws an identical 404 for "no such candidate", "never
    // consented", "revoked" and "only DISCOVERABLE".
    const access = await candidateAccess(req, req.params.id);
    const scorecard = await getFullScorecard(access);

    // Record the disclosure at the moment it happens, not merely the
    // authorization that permitted it.
    //
    // NOT gated on identity. A viewer reads assessment, interview and resume
    // evidence with identity null — that evidence still left the platform and
    // must appear in the candidate's "who has seen my results?". Gating on a
    // name also lost the audit whenever the User row had been deleted.
    recordDisclosure(access, disclosedScopes(scorecard, access), req.user.id, {
      route: 'GET /api/hire/candidates/:id',
    });

    res.json(scorecard);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/hire/candidates/compare  { candidateIds: [...] }
 *
 * Scoped to candidates the caller already has access to. Deliberately no job
 * ranking or composite "best candidate" number: comparing people who sat
 * different instruments is a false comparison presented with a confident
 * figure, which is worse than no feature. The UI compares section by section.
 */
router.post('/compare', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.candidateIds) ? req.body.candidateIds.slice(0, 5) : [];
    if (ids.length < 2) {
      return res.status(400).json({ error: 'Provide 2 to 5 candidateIds' });
    }

    const cards = [];
    for (const id of ids) {
      if (!mongoose.Types.ObjectId.isValid(id)) continue;
      try {
        const access = await candidateAccess(req, id);
        const card = await getFullScorecard(access);
        cards.push(card);
        // One row per candidate actually returned. This path previously
        // disclosed up to five full scorecards, identities included, and wrote
        // nothing at all — so the candidate's own record showed it never happened.
        recordDisclosure(access, disclosedScopes(card, access), req.user.id, {
          route: 'POST /api/hire/candidates/compare',
        });
      } catch {
        // One inaccessible candidate must not reveal itself by changing the
        // response shape — it is simply absent.
      }
    }
    res.json({ candidates: cards });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
