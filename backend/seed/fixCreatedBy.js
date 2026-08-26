// Run with: npm run fix:createdby
// One-time migration — updates the "by" field on every existing PI and Invoice
// to match their dealer's assigned salesperson (Dealer.assignedTo), same rule
// now applied automatically to new PIs/Invoices going forward.
// Dealers with no assignedTo are left untouched (their PIs/Invoices keep
// whoever actually created them).
// Safe to re-run — it only touches records where the value would actually change.

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Dealer = require('../models/Dealer');
const PI = require('../models/PI');
const Invoice = require('../models/Invoice');

async function run() {
  await connectDB();

  const dealers = await Dealer.find({ assignedTo: { $ne: '' } }).select('code assignedTo name');
  console.log(`Found ${dealers.length} dealers with an assigned salesperson.\n`);

  let piUpdated = 0, piSkipped = 0, invUpdated = 0, invSkipped = 0;

  for (const dealer of dealers) {
    const pis = await PI.find({ dealer: dealer.code });
    for (const pi of pis) {
      if (pi.by !== dealer.assignedTo) {
        console.log(`PI ${pi.no} (${dealer.name}): "${pi.by}" -> "${dealer.assignedTo}"`);
        pi.by = dealer.assignedTo;
        await pi.save();
        piUpdated++;
      } else {
        piSkipped++;
      }
    }

    const invoices = await Invoice.find({ dealer: dealer.code });
    for (const inv of invoices) {
      if (inv.by !== dealer.assignedTo) {
        console.log(`Invoice ${inv.no} (${dealer.name}): "${inv.by}" -> "${dealer.assignedTo}"`);
        inv.by = dealer.assignedTo;
        await inv.save();
        invUpdated++;
      } else {
        invSkipped++;
      }
    }
  }

  console.log(`\nDone.`);
  console.log(`PIs updated: ${piUpdated}, already correct: ${piSkipped}`);
  console.log(`Invoices updated: ${invUpdated}, already correct: ${invSkipped}`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
