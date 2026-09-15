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

// GET /api/hire/candidates/:id
router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      const e = new Error('Not found');
      e.status = 404;
      throw e;
    }

    // The door. Throws an identical 404 for "no such candidate", "never
    // consented", "revoked" and "only DISCOVERABLE".
    const access = await candidateAccess(req, req.params.id);
    const scorecard = await getFullScorecard(access);

    // Record the disclosure at the moment it happens, not merely the
    // authorization that permitted it.
    if (scorecard.identity) {
      recordDisclosure(access, access.scopes(), req.user.id, {
        route: 'GET /api/hire/candidates/:id',
      });
    }

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
        cards.push(await getFullScorecard(access));
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
