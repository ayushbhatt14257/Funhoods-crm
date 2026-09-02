// Run with: npm run seed
// Creates the 8 role-covering users (with real passwords this time, not the demo's
// passwordless role-picker) and a default Settings document. Safe to re-run —
// upserts by mobile number.

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../modules/users/model');
const Settings = require('../modules/settings/model');

const USERS = [
  { name: 'Ramesh Kumar', mobile: '9000000001', role: 'field', states: ['Madhya Pradesh', 'Rajasthan'], password: 'Field@123' },
  { name: 'Priya Sharma', mobile: '9000000002', role: 'field', states: ['Gujarat', 'Maharashtra'], password: 'Field@123' },
  { name: 'Ajay Verma', mobile: '9000000003', role: 'field', states: ['Delhi', 'UP', 'Haryana', 'Punjab'], password: 'Field@123' },
  { name: 'Sunita Rao', mobile: '9000000004', role: 'field', states: ['Karnataka', 'Tamil Nadu', 'Kerala', 'Telangana'], password: 'Field@123' },
  { name: 'Anil Mehta', mobile: '9000000005', role: 'mhead', states: [], password: 'Mhead@123' },
  { name: 'Meera Rao', mobile: '9000000006', role: 'accounts', states: [], password: 'Accounts@123' },
  { name: 'Kumar Singh', mobile: '9000000007', role: 'dispatch', states: [], password: 'Dispatch@123' },
  { name: 'Gaurav Jain', mobile: '9000000008', role: 'founder', states: [], password: 'Founder@123', email: 'founder@funhoods.com' },
];

async function run() {
  await connectDB();

  for (const u of USERS) {
    const existing = await User.findOne({ mobile: u.mobile });
    if (existing) {
      console.log(`Skipping ${u.name} (${u.mobile}) — already exists`);
      continue;
    }
    await User.create(u); // password hashed automatically via pre-save hook
    console.log(`Created ${u.role.toUpperCase()}: ${u.name} — mobile ${u.mobile} / password ${u.password}`);
  }

  const settings = await Settings.findOne({ singleton: 'main' });
  if (!settings) {
    await Settings.create({
      singleton: 'main',
      company: 'Funhoods',
      address: '',
      phone: '',
      email: '',
      gstin: '',
    });
    console.log('Default Settings document created — fill in company details from the app.');
  }

  console.log('\nSeed complete.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
