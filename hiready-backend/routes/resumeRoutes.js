const express = require('express');
const mongoose = require('mongoose');
const ResumeAnalysis = require('../models/ResumeAnalysis');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// POST /api/resumes — persist a completed analysis
router.post('/', async (req, res) => {
  const { label, targetRole, experienceLevel, resultJson, sourceText } = req.body;

  if (!targetRole || typeof targetRole !== 'string') {
    return res.status(400).json({ error: 'targetRole is required' });
  }
  if (!experienceLevel || typeof experienceLevel !== 'string') {
    return res.status(400).json({ error: 'experienceLevel is required' });
  }
  if (!resultJson || typeof resultJson !== 'object' || Array.isArray(resultJson)) {
    return res.status(400).json({ error: 'resultJson object is required' });
  }
  for (const key of ['atsScore', 'keywordMatch', 'formatScore', 'overallScore']) {
    const v = resultJson[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) {
      return res.status(400).json({ error: `resultJson.${key} must be a 0-100 number` });
    }
  }

  try {
    const doc = new ResumeAnalysis({
      user: req.user.id,
      label: String(label || '').slice(0, 120),
      targetRole: String(targetRole).slice(0, 120),
      experienceLevel: String(experienceLevel).slice(0, 60),
      atsScore: Math.round(resultJson.atsScore),
      keywordMatch: Math.round(resultJson.keywordMatch),
      formatScore: Math.round(resultJson.formatScore),
      overallScore: Math.round(resultJson.overallScore),
      skills: Array.isArray(resultJson.extractedSkills)
        ? resultJson.extractedSkills.slice(0, 20).map((s) => String(s).slice(0, 60))
        : [],
      missingKeywords: Array.isArray(resultJson.missingKeywords)
        ? resultJson.missingKeywords.slice(0, 15).map((s) => String(s).slice(0, 60))
        : [],
      sourceText: typeof sourceText === 'string' ? sourceText.slice(0, 30000) : '',
      resultJson
    });
    await doc.save();
    res.status(201).json({ message: 'Analysis saved', id: doc._id });
  } catch (err) {
    console.error('Save resume analysis error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/resumes — my saved analyses (summary list, newest first)
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const items = await ResumeAnalysis.find({ user: req.user.id })
      .select('label targetRole experienceLevel atsScore keywordMatch formatScore overallScore createdAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ items });
  } catch (err) {
    console.error('List resume analyses error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/resumes/:id — one full analysis (must own it)
router.get('/:id', async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const item = await ResumeAnalysis.findOne({ _id: req.params.id, user: req.user.id }).lean();
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    console.error('Get resume analysis error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/resumes/:id — rename an analysis (label only)
router.patch('/:id', async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  const { label } = req.body;
  if (typeof label !== 'string') return res.status(400).json({ error: 'label string is required' });
  try {
    const updated = await ResumeAnalysis.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { label: label.slice(0, 120) },
      { new: true }
    ).select('_id label').lean();
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Renamed', label: updated.label });
  } catch (err) {
    console.error('Rename resume analysis error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/resumes/:id — remove one of my analyses
router.delete('/:id', async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const deleted = await ResumeAnalysis.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete resume analysis error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

