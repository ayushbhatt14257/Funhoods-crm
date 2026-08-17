// Run with: npm run seed
// Fully interactive — asks you for each user's details in the terminal.
// No names, mobiles, or passwords are hardcoded anywhere in this file,
// so it's safe to commit to a public repo.

require('dotenv').config();
const crypto = require('crypto');
const readline = require('readline');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { ROLES } = require('../models/User');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

function generatePassword() {
  const part = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${part()}-${part()}-${part()}`;
}

async function createOneUser() {
  console.log(`\nRoles available: ${ROLES.join(', ')}`);
  const name = (await ask('Full name: ')).trim();
  const mobile = (await ask('Mobile (used for login): ')).trim();
  let role = (await ask('Role: ')).trim().toLowerCase();
  while (!ROLES.includes(role)) {
    role = (await ask(`"${role}" isn't valid. Pick one of ${ROLES.join(', ')}: `)).trim().toLowerCase();
  }
  const email = (await ask('Email (optional, press enter to skip): ')).trim();

  const existing = await User.findOne({ mobile });
  if (existing) {
    console.log(`A user with mobile ${mobile} already exists — skipped.`);
    return;
  }

  const password = generatePassword();
  await User.create({ name, mobile, role, email: email || undefined, password });
  console.log(`\n✓ Created ${role.toUpperCase()} — ${name}`);
  console.log(`  mobile: ${mobile}`);
  console.log(`  password: ${password}   (copy this now — shown only once)\n`);
}

async function run() {
  await connectDB();

  let more = true;
  while (more) {
    await createOneUser();
    const again = (await ask('Add another user? (y/n): ')).trim().toLowerCase();
    more = again === 'y' || again === 'yes';
  }

  const settings = await Settings.findOne({ singleton: 'main' });
  if (!settings) {
    await Settings.create({ singleton: 'main', company: '', address: '', phone: '', email: '', gstin: '' });
    console.log('Default (empty) Settings document created — fill in company details from the app.');
  }

  console.log('\nDone. Save the password(s) above somewhere safe — they will not be shown again.');
  rl.close();
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  rl.close();
  process.exit(1);
});