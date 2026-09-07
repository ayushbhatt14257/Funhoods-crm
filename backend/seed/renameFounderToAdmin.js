// Run once with: node seed/renameFounderToAdmin.js
// (from the backend/ folder, e.g. via Render's Shell tab)
//
// The 'founder' role was renamed to 'admin' in code. That only affects new
// data going forward — any user already saved in MongoDB with role:'founder'
// stays exactly that until migrated. This finds and updates them. Safe to
// re-run: does nothing once there's no one left with the old role name.

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../modules/users/model');
const Notification = require('../modules/notifications/model');

async function run() {
  await connectDB();

  const userResult = await User.updateMany({ role: 'founder' }, { role: 'admin' });
  console.log(`Updated ${userResult.modifiedCount} user(s) from 'founder' to 'admin'.`);

  const notifResult = await Notification.updateMany({ forRole: 'founder' }, { forRole: 'admin' });
  console.log(`Updated ${notifResult.modifiedCount} notification(s) targeted at 'founder' to 'admin'.`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
