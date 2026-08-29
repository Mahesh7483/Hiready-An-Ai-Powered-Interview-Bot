// E2E test: calls the REAL /api/ai/resume-analyze HTTP route with a real JWT
require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/hireadyDB');
  const user = await User.findOne({}).select('_id').lean();
  if (!user) { console.log('No user in DB — create one first'); process.exit(1); }
  const token = jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const body = {
    resumeText: `John Doe — Senior Full-Stack Developer, 6 years experience.
Skills: React, TypeScript, Node.js, Express, MongoDB, PostgreSQL, Docker, AWS, CI/CD.
Experience: Built e-commerce platform (50k DAU), led team of 4, migrated monolith to microservices, cut page load 40%.
Education: B.Tech CS. Projects: realtime chat app, ML recommender.`,
    targetRole: 'Senior Backend Engineer',
    experienceLevel: 'senior'
  };

  const t = Date.now();
  try {
    const r = await fetch('http://localhost:5000/api/ai/resume-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    console.log('HTTP', r.status, 'in', ((Date.now() - t) / 1000).toFixed(1) + 's');
    if (r.ok) {
      console.log('matchScore:', j.matchScore, '| strengths:', (j.strengths || []).length, '| gaps:', (j.gaps || []).length, '| skills found:', (j.keywords?.matched || j.skillGaps ? 'yes' : 'n/a'));
      console.log('E2E: SUCCESS ✅');
    } else {
      console.log('E2E: FAILED —', JSON.stringify(j).slice(0, 200));
    }
  } catch (e) {
    console.log('E2E: REQUEST FAILED after', ((Date.now() - t) / 1000).toFixed(1) + 's —', e.message);
  }
  await mongoose.disconnect();
})();