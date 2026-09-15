const CandidateCompanyConsent = require('../../models/CandidateCompanyConsent');
const DisclosureAudit = require('../../models/DisclosureAudit');
const Application = require('../../models/Application');

/**
 * Consent transitions, and the audit that accompanies every one of them.
 *
 * Every state change writes a DisclosureAudit row. That trail is what answers
 * "who has seen my results?" long after the consent itself has been revoked,
 * which is why the audit is a separate collection and is never deleted
 * alongside the consent it references.
 *
 * Legal transitions:
 *
 *   (no row) ──grantViaInvite──▶ REVEALED
 *   (no row) ──openToDiscovery─▶ DISCOVERABLE
 *   DISCOVERABLE ──reveal──────▶ REVEALED       (candidate accepts interest)
 *   REVEALED ──attachApplication▶ IN_PROCESS
 *   any ──revoke───────────────▶ REVOKED
 *   REVOKED ──grant*───────────▶ REVEALED|DISCOVERABLE  (candidate may return)
 */

function audit(entry) {
  // Never block the caller on the audit write, but never swallow it silently
  // either — a missing disclosure record is a real problem worth seeing.
  return DisclosureAudit.create(entry).catch((err) =>
    console.error('DisclosureAudit write failed:', err.message, entry)
  );
}

/**
 * A company invited this candidate and they accepted.
 *
 * Accepting an invite IS the consent event — it grants this one company
 * access without the candidate becoming discoverable to anyone else. That is
 * the private-market path: PRIVATE -> REVEALED to Company A, with no global
 * visibility in between.
 */
async function grantViaInvite({ candidateId, companyId, actorId = null }) {
  const consent = await CandidateCompanyConsent.findOneAndUpdate(
    { candidateId, companyId },
    {
      $set: { state: 'REVEALED', source: 'invite', revokedAt: null, grantedAt: new Date() },
      $setOnInsert: { candidateId, companyId, grantedBy: actorId },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await audit({
    candidateId, companyId, consentId: consent._id,
    action: 'granted', scopes: ['identity', 'assessment', 'interview', 'resume'],
    actorId, meta: { source: 'invite', state: 'REVEALED' },
  });
  return consent;
}

/**
 * The candidate opts into pseudonymous discovery by one company.
 *
 * Deliberately does NOT downgrade an existing grant. An unconditional
 * $set would drop a live REVEALED/IN_PROCESS consent back to DISCOVERABLE,
 * silently cutting a recruiter off from a candidate mid-pipeline and
 * rewriting `source` so the row no longer records that it began as an invite.
 * Opting into discovery is strictly an increase in visibility.
 */
async function openToDiscovery({ candidateId, companyId }) {
  const existing = await CandidateCompanyConsent.findOne({ candidateId, companyId }).lean();
  if (existing && ['REVEALED', 'IN_PROCESS'].includes(existing.state) && !existing.revokedAt) {
    return existing; // already more visible than DISCOVERABLE — nothing to do
  }

  const consent = await CandidateCompanyConsent.findOneAndUpdate(
    { candidateId, companyId },
    {
      $set: { state: 'DISCOVERABLE', source: 'discovery', revokedAt: null, grantedAt: new Date() },
      $setOnInsert: { candidateId, companyId },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await audit({
    candidateId, companyId, consentId: consent._id,
    action: 'granted', scopes: [], // pseudonymous — nothing identifying disclosed
    actorId: null, meta: { source: 'discovery', state: 'DISCOVERABLE' },
  });
  return consent;
}

/** The candidate accepts a company's expression of interest. */
async function reveal({ candidateId, companyId }) {
  const consent = await CandidateCompanyConsent.findOne({ candidateId, companyId });
  if (!consent || consent.state === 'REVOKED') return null;
  const from = consent.state;
  consent.state = 'REVEALED';
  consent.revokedAt = null;
  // The prompt has been answered; it must not linger on the privacy screen.
  consent.interestAt = null;
  consent.interestBy = null;
  await consent.save();
  await audit({
    candidateId, companyId, consentId: consent._id,
    action: 'state_changed', scopes: ['identity', 'assessment', 'interview', 'resume'],
    actorId: null, meta: { from, to: 'REVEALED' },
  });
  return consent;
}

/**
 * Revocation.
 *
 * Stops FUTURE access. It does not reach back and delete assessments a company
 * already ran — you cannot un-ring that bell, and pretending otherwise would
 * be the dishonest design. The UI should say so in those words. Invariant 10.
 */
async function revoke({ candidateId, companyId, actorId = null }) {
  const consent = await CandidateCompanyConsent.findOne({ candidateId, companyId });
  if (!consent) return null;
  const from = consent.state;
  consent.state = 'REVOKED';
  consent.revokedAt = new Date();
  consent.interestAt = null;
  consent.interestBy = null;
  await consent.save();

  // Without this the candidate stays on the company's pipeline board with
  // their id, stage and attempt flag visible, and a recruiter can still move
  // them to hired or rejected — only the identity lookup was blocked. The
  // board already renders `withdrawn` as a non-actionable badge.
  await Application.updateMany(
    { candidateId, companyId, stage: { $nin: ['withdrawn', 'rejected', 'hired'] } },
    {
      $set: { stage: 'withdrawn' },
      $push: { history: { from: 'revoked-consent', to: 'withdrawn', actorId, at: new Date() } },
    }
  );

  await audit({
    candidateId, companyId, consentId: consent._id,
    action: 'revoked', scopes: [], actorId,
    meta: { from, to: 'REVOKED', note: 'future access only; prior results retained' },
  });
  return consent;
}

/**
 * Called by readers at the moment identity actually reaches a recruiter, so
 * the audit records disclosures rather than merely authorisations.
 */
async function recordDisclosure(access, scopes, actorId, meta = {}) {
  return audit({
    candidateId: access.candidateId,
    companyId: access.companyId,
    consentId: access.consentId,
    action: 'disclosed',
    scopes,
    actorId,
    meta,
  });
}


/**
 * A candidate now has a live application with this company.
 *
 * IN_PROCESS was documented as a state and branched on in four modules, but
 * nothing ever wrote it — the transition existed only in a comment. Called when
 * an Application is created so the candidate's privacy screen can say
 * "interviewing you" rather than the flat "can see you".
 */
async function attachApplication({ candidateId, companyId }) {
  const consent = await CandidateCompanyConsent.findOne({ candidateId, companyId });
  if (!consent || consent.state !== 'REVEALED' || consent.revokedAt) return consent;
  consent.state = 'IN_PROCESS';
  await consent.save();
  await audit({
    candidateId, companyId, consentId: consent._id,
    action: 'state_changed', scopes: [], actorId: null,
    meta: { from: 'REVEALED', to: 'IN_PROCESS' },
  });
  return consent;
}

/** Every company that can currently see this candidate — powers the privacy screen. */
async function companiesWithAccess(candidateId) {
  return CandidateCompanyConsent.find({
    candidateId,
    state: { $in: ['DISCOVERABLE', 'REVEALED', 'IN_PROCESS'] },
    revokedAt: null,
  })
    .populate('companyId', 'name domain')
    .lean();
}

module.exports = {
  grantViaInvite,
  attachApplication,
  openToDiscovery,
  reveal,
  revoke,
  recordDisclosure,
  companiesWithAccess,
};
