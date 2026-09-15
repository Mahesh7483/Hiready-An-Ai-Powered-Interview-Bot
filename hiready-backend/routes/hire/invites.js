const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const CompanyInvite = require('../../models/CompanyInvite');
const Job = require('../../models/Job');
const { requireCompanyRole } = require('../../middleware/company');

/**
 * Inviting candidates by email.
 *
 * The plaintext token is returned to the CALLER once, for the invite email,
 * and never stored — only its SHA-256 hash is persisted. A database leak
 * therefore does not hand an attacker a set of working consent-granting links.
 *
 * Acceptance happens on the candidate side (routes/consentRoutes.js), because
 * accepting is the candidate's consent event, not a recruiter action.
 */

const INVITE_TTL_DAYS = 14;
const refuse = (res) => res.status(404).json({ error: 'Not found' });

// POST /api/hire/invites  { email | emails[], jobId? }
router.post('/', requireCompanyRole('owner', 'recruiter'), async (req, res) => {
  try {
    const raw = Array.isArray(req.body.emails)
      ? req.body.emails
      : [req.body.email].filter(Boolean);
    const emails = [
      ...new Set(
        raw
          .map((e) => String(e || '').trim().toLowerCase())
          .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
      ),
    ].slice(0, 200);

    if (!emails.length) return res.status(400).json({ error: 'No valid email addresses' });

    const { jobId = null } = req.body;
    if (jobId) {
      if (!mongoose.Types.ObjectId.isValid(jobId)) return refuse(res);
      const job = await Job.findOne({ _id: jobId, companyId: req.company.companyId })
        .select('_id')
        .lean();
      if (!job) return refuse(res);
    }

    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 864e5);
    const created = [];

    for (const email of emails) {
      const { token, tokenHash } = CompanyInvite.mintToken();
      const invite = await CompanyInvite.findOneAndUpdate(
        { companyId: req.company.companyId, email, status: 'sent' },
        {
          $set: { tokenHash, expiresAt, jobId, invitedBy: req.user.id },
          $setOnInsert: { companyId: req.company.companyId, email, status: 'sent' },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      // token travels to the mail layer and nowhere else
      created.push({ inviteId: invite._id, email, token, expiresAt });
    }

    res.status(201).json({ invited: created.length, invites: created });
  } catch (err) {
    console.error('hire invite error:', err.message);
    res.status(500).json({ error: 'Failed to create invites' });
  }
});

// GET /api/hire/invites — this company's invites. Tokens never come back.
router.get('/', async (req, res) => {
  try {
    const invites = await CompanyInvite.find({ companyId: req.company.companyId })
      .select('email status jobId createdAt acceptedAt expiresAt')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({ invites });
  } catch (err) {
    console.error('hire invite list error:', err.message);
    res.status(500).json({ error: 'Failed to load invites' });
  }
});

// DELETE /api/hire/invites/:id — revoke an unaccepted invite
router.delete('/:id', requireCompanyRole('owner', 'recruiter'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return refuse(res);
    const invite = await CompanyInvite.findOneAndUpdate(
      { _id: req.params.id, companyId: req.company.companyId, status: 'sent' },
      { $set: { status: 'revoked' } },
      { new: true }
    )
      .select('_id status')
      .lean();
    if (!invite) return refuse(res);
    res.json(invite);
  } catch (err) {
    console.error('hire invite revoke error:', err.message);
    res.status(500).json({ error: 'Failed to revoke invite' });
  }
});

module.exports = router;
