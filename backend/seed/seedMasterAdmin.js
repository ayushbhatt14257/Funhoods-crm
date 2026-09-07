// Run once with: node seed/seedMasterAdmin.js
// (from the backend/ folder, e.g. via Render's Shell tab)
//
// Creates the Master Admin account — the one role above Admin that owns
// team/user management and approves any admin-level price discounts on a
// PI. Safe to re-run: if this mobile number already exists, it upgrades that
// user to masterAdmin and resets the password to the one below instead of
// creating a duplicate.

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../modules/users/model');

const MASTER_ADMIN = {
  name: 'Master Admin',
  mobile: '9131295174',
  role: 'masterAdmin',
  password: 'masteradmin@123',
};

async function run() {
  await connectDB();

  const existing = await User.findOne({ mobile: MASTER_ADMIN.mobile });
  if (existing) {
    existing.role = MASTER_ADMIN.role;
    existing.password = MASTER_ADMIN.password; // re-hashed by the pre-save hook
    existing.active = true;
    await existing.save();
    console.log(`Updated existing user (${existing.name}) to masterAdmin — mobile ${MASTER_ADMIN.mobile} / password ${MASTER_ADMIN.password}`);
  } else {
    await User.create(MASTER_ADMIN);
    console.log(`Created MASTER ADMIN: ${MASTER_ADMIN.name} — mobile ${MASTER_ADMIN.mobile} / password ${MASTER_ADMIN.password}`);
  }

  console.log('\nDone. Log in with this mobile number, then change the password from Profile.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
