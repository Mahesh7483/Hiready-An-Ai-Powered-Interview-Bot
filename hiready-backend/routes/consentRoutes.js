const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const CompanyInvite = require('../models/CompanyInvite');
const CandidateCompanyConsent = require('../models/CandidateCompanyConsent');
const Company = require('../models/Company');
const User = require('../models/User');
const Application = require('../models/Application');
const {
  grantViaInvite, openToDiscovery, reveal, revoke, companiesWithAccess, attachApplication,
} = require('../services/hire/consent');

/**
 * The candidate's side of consent. Everything here is the student acting on
 * their own data — never a recruiter.
 *
 * This is the screen that makes the whole hiring product defensible: a student
 * can see exactly who can see them, and take it back in one click.
 */
router.use(requireAuth);

// GET /api/consent/me — who can currently see me
router.get('/me', async (req, res) => {
  try {
    const consents = await companiesWithAccess(req.user.id);
    res.json({
      companies: consents.map((c) => ({
        consentId: c._id,
        company: c.companyId ? { id: c.companyId._id, name: c.companyId.name } : null,
        state: c.state,
        source: c.source,
        grantedAt: c.grantedAt,
        // Surfaces as "Company X asked to see your profile"
        interestAt: c.interestAt || null,
      })),
    });
  } catch (err) {
    console.error('consent list error:', err.message);
    res.status(500).json({ error: 'Failed to load consent' });
  }
});

// GET /api/consent/invite/:token — preview an invite before deciding
router.get('/invite/:token', async (req, res) => {
  try {
    const invite = await CompanyInvite.findOne({
      tokenHash: CompanyInvite.hashToken(req.params.token),
      status: 'sent',
    }).lean();
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.expiresAt < new Date()) return res.status(410).json({ error: 'Invite expired' });

    // Same binding as accept: previewing someone else's invite must not confirm
    // which address a company approached.
    const me = await User.findById(req.user.id).select('email').lean();
    if (!me || String(me.email).toLowerCase() !== String(invite.email).toLowerCase()) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    const company = await Company.findById(invite.companyId).select('name').lean();
    res.json({
      company: company ? company.name : 'Unknown company',
      email: invite.email,
      expiresAt: invite.expiresAt,
      // Said plainly, because this is the moment consent is given.
      grants: 'This company will be able to see your assessment results, '
        + 'interview scores, resume analysis, name and email.',
    });
  } catch (err) {
    console.error('invite preview error:', err.message);
    res.status(500).json({ error: 'Failed to load invite' });
  }
});

// POST /api/consent/invite/:token/accept — accepting IS the consent event
router.post('/invite/:token/accept', async (req, res) => {
  try {
    const invite = await CompanyInvite.findOne({
      tokenHash: CompanyInvite.hashToken(req.params.token),
      status: 'sent',
    });
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.expiresAt < new Date()) {
      invite.status = 'expired';
      await invite.save();
      return res.status(410).json({ error: 'Invite expired' });
    }

    // The token alone must not be enough. The recruiter holds the plaintext
    // from the API response before it is ever emailed, so without this check a
    // forwarded link, a shared mailbox, or the recruiter's own student account
    // could redeem an invite addressed to someone else — creating consent for
    // the wrong person, opening an Application for them, and burning the
    // invite so the real invitee is permanently locked out.
    const me = await User.findById(req.user.id).select('email').lean();
    if (!me || String(me.email).toLowerCase() !== String(invite.email).toLowerCase()) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    // Grants exactly ONE company access. The candidate does not become
    // discoverable to anyone else — this is the private-market path.
    const consent = await grantViaInvite({
      candidateId: req.user.id,
      companyId: invite.companyId,
      actorId: req.user.id,
    });

    invite.status = 'accepted';
    invite.acceptedBy = req.user.id;
    invite.acceptedAt = new Date();
    await invite.save();

    if (invite.jobId) {
      await Application.findOneAndUpdate(
        { jobId: invite.jobId, candidateId: req.user.id },
        {
          $setOnInsert: {
            jobId: invite.jobId,
            companyId: invite.companyId,
            candidateId: req.user.id,
            consentId: consent._id,
            source: 'invite',
            stage: 'invited',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      // A live application is a stronger relationship than "can see you".
      await attachApplication({ candidateId: req.user.id, companyId: invite.companyId });
    }

    const current = await CandidateCompanyConsent.findById(consent._id).select('state').lean();
    res.json({ ok: true, state: current ? current.state : consent.state });
  } catch (err) {
    console.error('invite accept error:', err.message);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

// POST /api/consent/invite/:token/decline
router.post('/invite/:token/decline', async (req, res) => {
  try {
    const me = await User.findById(req.user.id).select('email').lean();
    if (!me) return res.status(404).json({ error: 'Invite not found' });
    // Bound to the invitee: a third party must not be able to decline on
    // someone else's behalf and burn their invite.
    const invite = await CompanyInvite.findOneAndUpdate(
      {
        tokenHash: CompanyInvite.hashToken(req.params.token),
        status: 'sent',
        email: String(me.email).toLowerCase(),
      },
      { $set: { status: 'declined' } },
      { new: true }
    ).lean();
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to decline invite' });
  }
});

// POST /api/consent/discoverable/:companyId — opt into pseudonymous discovery
router.post('/discoverable/:companyId', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.companyId)) {
      return res.status(404).json({ error: 'Not found' });
    }
    const company = await Company.findOne({ _id: req.params.companyId, status: 'active' })
      .select('_id')
      .lean();
    if (!company) return res.status(404).json({ error: 'Not found' });

    const consent = await openToDiscovery({
      candidateId: req.user.id,
      companyId: req.params.companyId,
    });
    res.json({ ok: true, state: consent.state });
  } catch (err) {
    console.error('discoverable error:', err.message);
    res.status(500).json({ error: 'Failed to update visibility' });
  }
});

// POST /api/consent/:companyId/reveal — accept a company's expressed interest
router.post('/:companyId/reveal', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.companyId)) {
      return res.status(404).json({ error: 'Not found' });
    }
    const consent = await reveal({
      candidateId: req.user.id,
      companyId: req.params.companyId,
    });
    if (!consent) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, state: consent.state });
  } catch (err) {
    console.error('reveal error:', err.message);
    res.status(500).json({ error: 'Failed to reveal' });
  }
});

/**
 * DELETE /api/consent/:companyId — revoke.
 *
 * The response says plainly what this does and does not do. Revocation stops
 * future access; a company that already ran an assessment keeps that result.
 * Claiming otherwise in the UI would be a lie we cannot honour.
 */
router.delete('/:companyId', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.companyId)) {
      return res.status(404).json({ error: 'Not found' });
    }
    const consent = await revoke({
      candidateId: req.user.id,
      companyId: req.params.companyId,
      actorId: req.user.id,
    });
    if (!consent) return res.status(404).json({ error: 'Not found' });
    res.json({
      ok: true,
      state: consent.state,
      note: 'This company can no longer see you or receive new results. '
        + 'Assessments it already ran remain with it.',
    });
  } catch (err) {
    console.error('revoke error:', err.message);
    res.status(500).json({ error: 'Failed to revoke' });
  }
});

module.exports = router;
