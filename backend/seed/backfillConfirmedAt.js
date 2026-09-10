// Run once with: node seed/backfillConfirmedAt.js
// (from the backend/ folder, e.g. via Render's Shell tab, or locally against
// the same MONGO_URI)
//
// confirmedAt is a brand-new field — every PI confirmed before this feature
// existed has it as null. This backfills it for PIs still sitting in exactly
// 'Confirmed' status: since nothing has touched them since (no dispatch, no
// cancel, no edit), their last-saved timestamp (updatedAt) genuinely IS the
// moment they were confirmed.
//
// PIs that have since moved on (Partial/Fully Dispatched, Cancelled) are
// deliberately left alone — their updatedAt reflects that LATER action, not
// the original confirm, so backfilling them would show a wrong date. Those
// stay as "—" permanently; there's no way to recover their true historical
// confirm date since it was never recorded. Safe to re-run.

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const PI = require('../modules/pi/model');

async function run() {
  await connectDB();

  const result = await PI.updateMany(
    { status: 'Confirmed', confirmedAt: null },
    [{ $set: { confirmedAt: '$updatedAt' } }]
  );
  console.log(`Backfilled confirmedAt for ${result.modifiedCount} PI(s) still in 'Confirmed' status.`);
  console.log(`PIs already Partial/Fully Dispatched or Cancelled were left as "—" — their true confirm date can't be recovered.`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
