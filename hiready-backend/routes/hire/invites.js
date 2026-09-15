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

/**
 * Masks an address to a recognisable hint: ada@example.com -> a…a@example.com
 *
 * Used for invites that were NOT accepted. Declining is not consent, and a
 * refusal must not become a disclosure — but a recruiter still needs enough to
 * recognise their own outgoing invite in a list.
 */
function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '…';
  const head = local.slice(0, 1);
  const tail = local.length > 2 ? local.slice(-1) : '';
  return `${head}…${tail}@${domain}`;
}

/**
 * GET /api/hire/invites — this company's invites. Tokens never come back.
 *
 * Role-gated, and the raw address is returned only where the candidate has
 * actually consented. Without both, this route is a hole straight through the
 * capability system: an invite in `sent`, `declined`, `expired` or `revoked`
 * has NO CandidateCompanyConsent row at all (grantViaInvite only runs on
 * accept), so a viewer — who scopesFor() deliberately denies the `identity`
 * scope — could otherwise read every address the company ever touched, plus
 * who refused it.
 */
router.get('/', requireCompanyRole('owner', 'recruiter'), async (req, res) => {
  try {
    const invites = await CompanyInvite.find({ companyId: req.company.companyId })
      .select('email status jobId createdAt acceptedAt expiresAt')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json({
      invites: invites.map((i) => ({
        ...i,
        // Accepted means consent exists. Anything else stays masked.
        email: i.status === 'accepted' ? i.email : maskEmail(i.email),
        emailMasked: i.status !== 'accepted',
      })),
    });
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
