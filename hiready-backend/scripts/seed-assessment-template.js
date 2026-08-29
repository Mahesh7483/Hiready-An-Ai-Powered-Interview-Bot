/**
 * seed-assessment-template.js
 * Seeds a sample "Full Stack Fresher — Unified Round" assessment template so the
 * /assessments landing page + admin panel have something to show immediately.
 *
 * Usage:
 *   node scripts/seed-assessment-template.js
 *
 * Safe to re-run (upserts by title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const AssessmentTemplate = require('../models/AssessmentTemplate');

const TEMPLATE = {
  title: 'Full Stack Fresher — Unified Round',
  description:
    'A complete technical assessment: aptitude screening, coding problems, and a brief voice interview. Breaks scheduled between sections.',
  targetRole: 'Full Stack Developer (Fresher)',
  resumeDriven: true,
  attemptLimit: 1,
  cooldownDays: 3,
  violationThreshold: 100,
  sections: [
    {
      type: 'aptitude',
      title: 'Aptitude Screening',
      topic: 'Quantitative Aptitude',
      count: 10,
      negativeMarking: true,
      minutes: 10,
    },
    {
      type: 'coding',
      title: 'Coding Round',
      codingCount: 2,
      codingDifficulty: 'easy',
      minutes: 30,
    },
    {
      type: 'voice-interview',
      title: 'HR / Behavioral Interview',
      interviewDurationMin: 8,
      focusAreas: ['Teamwork', 'Problem solving', 'Career goals'],
      minutes: 8,
    },
  ],
  breaks: [{ afterSectionIndex: 0, minutes: 2 }],
};

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/hireadyDB');
  const existing = await AssessmentTemplate.findOne({ title: TEMPLATE.title });
  if (existing) {
    await AssessmentTemplate.updateOne({ _id: existing._id }, { $set: TEMPLATE });
    console.log(`Updated template: "${TEMPLATE.title}" (${existing._id})`);
  } else {
    const t = await AssessmentTemplate.create(TEMPLATE);
    console.log(`Created template: "${TEMPLATE.title}" (${t._id})`);
  }
  const all = await AssessmentTemplate.countDocuments();
  console.log(`Total assessment templates: ${all}`);
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});