require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Question = require('../models/Question');

async function verify() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/hireadyDB');
  console.log('Connected to MongoDB');

  const stats = await Question.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 }, 
      diffs: { $push: '$difficulty' },
      hasExpl: { $sum: { $cond: [{ $ne: ['$Explanation', ''] }, 1, 0] } },
      optA: { $sum: { $cond: [{ $ne: ['$Option A', ''] }, 1, 0] } },
      optB: { $sum: { $cond: [{ $ne: ['$Option B', ''] }, 1, 0] } },
      optC: { $sum: { $cond: [{ $ne: ['$Option C', ''] }, 1, 0] } },
      optD: { $sum: { $cond: [{ $ne: ['$Option D', ''] }, 1, 0] } },
      ansDist: { $push: '$Answer' }
    }},
    { $sort: { _id: 1 } }
  ]);

  console.table(stats.map(s => ({
    Category: s._id,
    Count: s.count,
    Easy: s.diffs.filter(d => d === 'easy').length,
    Medium: s.diffs.filter(d => d === 'medium').length,
    Hard: s.diffs.filter(d => d === 'hard').length,
    HasExplanation: s.hasExpl,
    OptA: s.optA,
    OptB: s.optB,
    OptC: s.optC,
    OptD: s.optD,
    AnsA: s.ansDist.filter(a => a === 'A').length,
    AnsB: s.ansDist.filter(a => a === 'B').length,
    AnsC: s.ansDist.filter(a => a === 'C').length,
    AnsD: s.ansDist.filter(a => a === 'D').length,
  })));

  // Check for duplicates
  const dupes = await Question.aggregate([
    { $group: { _id: '$Question', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]);
  console.log('\nDuplicate questions:', dupes.length);
  if (dupes.length) console.table(dupes);

  await mongoose.disconnect();
}

verify().catch((e) => {
  console.error(e);
  process.exit(1);
});