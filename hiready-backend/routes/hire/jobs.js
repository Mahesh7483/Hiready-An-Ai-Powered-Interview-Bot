const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Job = require('../../models/Job');
const Application = require('../../models/Application');
const AssessmentTemplate = require('../../models/AssessmentTemplate');
const { requireCompanyRole } = require('../../middleware/company');

/**
 * Jobs and the pipeline.
 *
 * Every query below is scoped by req.company.companyId. There is no code path
 * that reads a Job or Application without that filter — that is the tenant
 * boundary, and it is applied at the query rather than checked afterwards.
 */

const refuse = (res) => res.status(404).json({ error: 'Not found' });

// GET /api/hire/jobs — this company's jobs with funnel counts
router.get('/', async (req, res) => {
  try {
    const jobs = await Job.find({ companyId: req.company.companyId })
      .sort({ createdAt: -1 })
      .lean();

    const counts = await Application.aggregate([
      { $match: { companyId: req.company.companyOid } },
      { $group: { _id: { job: '$jobId', stage: '$stage' }, n: { $sum: 1 } } },
    ]);

    const byJob = new Map();
    counts.forEach((c) => {
      const k = String(c._id.job);
      if (!byJob.has(k)) byJob.set(k, {});
      byJob.get(k)[c._id.stage] = c.n;
    });

    res.json({
      jobs: jobs.map((j) => ({
        ...j,
        funnel: byJob.get(String(j._id)) || {},
        total: Object.values(byJob.get(String(j._id)) || {}).reduce((a, b) => a + b, 0),
      })),
    });
  } catch (err) {
    console.error('hire jobs list error:', err.message);
    res.status(500).json({ error: 'Failed to load jobs' });
  }
});

// POST /api/hire/jobs — viewers may not create
router.post('/', requireCompanyRole('owner', 'recruiter'), async (req, res) => {
  try {
    const { title, description = '', location = '', templateId = null } = req.body;
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'title is required' });
    }

    // A company may attach its OWN private template or a platform-wide one.
    // Never another company's instrument.
    if (templateId) {
      if (!mongoose.Types.ObjectId.isValid(templateId)) return refuse(res);
      const tpl = await AssessmentTemplate.findOne({
        _id: templateId,
        $or: [{ companyId: req.company.companyId }, { companyId: null }],
      })
        .select('_id')
        .lean();
      if (!tpl) return refuse(res);
    }

    const job = await Job.create({
      companyId: req.company.companyId,
      title: title.slice(0, 150),
      description: String(description).slice(0, 4000),
      location: String(location).slice(0, 120),
      templateId,
      // A job nobody can open is not a job. `status` had no writer at all, so
      // every row stayed 'draft' forever and the {companyId,status} index was
      // unreachable. Created open by default — a recruiter making a job means
      // to hire — and closable below.
      status: 'open',
      createdBy: req.user.id,
    });
    res.status(201).json(job);
  } catch (err) {
    console.error('hire job create error:', err.message);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// GET /api/hire/jobs/:id — one job and its pipeline
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return refuse(res);
    const job = await Job.findOne({
      _id: req.params.id,
      companyId: req.company.companyId, // tenant filter, not a post-hoc check
    }).lean();
    if (!job) return refuse(res);

    const applications = await Application.find({
      jobId: job._id,
      companyId: req.company.companyId,
    })
      .select('candidateId stage source attemptId createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .lean();

    // Identity is deliberately absent here. The board shows pipeline position;
    // resolving a candidate to a person requires candidateAccess, which the
    // candidate detail route performs one at a time.
    res.json({
      job,
      applications: applications.map((a) => ({
        applicationId: a._id,
        candidateId: a.candidateId,
        stage: a.stage,
        source: a.source,
        hasAttempt: Boolean(a.attemptId),
        updatedAt: a.updatedAt,
      })),
    });
  } catch (err) {
    console.error('hire job detail error:', err.message);
    res.status(500).json({ error: 'Failed to load job' });
  }
});

// PATCH /api/hire/jobs/:id — open or close a job
router.patch('/:id', requireCompanyRole('owner', 'recruiter'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return refuse(res);
    const { status } = req.body;
    if (!['draft', 'open', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const job = await Job.findOneAndUpdate(
      { _id: req.params.id, companyId: req.company.companyId },
      { $set: { status } },
      { new: true }
    ).lean();
    if (!job) return refuse(res);
    res.json(job);
  } catch (err) {
    console.error('hire job status error:', err.message);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// PATCH /api/hire/jobs/:id/applications/:appId — move a candidate along
router.patch(
  '/:id/applications/:appId',
  requireCompanyRole('owner', 'recruiter'),
  async (req, res) => {
    try {
      const { stage } = req.body;
      if (!Application.RECRUITER_STAGES.includes(stage)) {
        // `withdrawn` is the candidate's lever and is rejected here on purpose.
        return res.status(400).json({ error: 'Invalid stage' });
      }
      // Both ids, not just appId: an unvalidated jobId reaches the query as a
      // cast target and throws, surfacing as a 500 — a third distinct response
      // shape on a path the design says must always refuse identically.
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) return refuse(res);
      if (!mongoose.Types.ObjectId.isValid(req.params.appId)) return refuse(res);

      const app = await Application.findOne({
        _id: req.params.appId,
        jobId: req.params.id,
        companyId: req.company.companyId,
      });
      if (!app) return refuse(res);
      if (app.stage === 'withdrawn') {
        return res.status(409).json({ error: 'Candidate has withdrawn' });
      }

      const from = app.stage;
      app.stage = stage;
      // Rejection decisions get disputed. Record who moved it and when.
      app.history.push({ from, to: stage, actorId: req.user.id, at: new Date() });
      await app.save();

      res.json({ applicationId: app._id, stage: app.stage, from });
    } catch (err) {
      console.error('hire stage change error:', err.message);
      res.status(500).json({ error: 'Failed to update stage' });
    }
  }
);

module.exports = router;
