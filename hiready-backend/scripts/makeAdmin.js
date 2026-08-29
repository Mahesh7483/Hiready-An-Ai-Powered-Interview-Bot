/**
 * CLI: promote (or demote) a user by email.
 *
 *   node scripts/makeAdmin.js user@example.com          # promote to admin
 *   node scripts/makeAdmin.js user@example.com --revoke # demote to user
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function main() {
  const [email, flag] = process.argv.slice(2);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: node scripts/makeAdmin.js <email> [--revoke]');
    process.exit(1);
  }

  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set in .env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    console.error(`No user found with email: ${email}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  user.role = flag === '--revoke' ? 'user' : 'admin';
  await user.save();

  console.log(`${user.email} is now role="${user.role}"`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
