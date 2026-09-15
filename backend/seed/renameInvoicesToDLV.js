// Run once with: node seed/renameInvoicesToDLV.js
// (from the backend/ folder, e.g. via Render's Shell tab, or locally against
// the same MONGO_URI)
//
// "Tax Invoice" was renamed to "Delivery Challan" throughout the app, and
// the document number prefix changed from INV- to DLV- for all NEW
// documents automatically. This one-off script renames every EXISTING
// invoice number the same way (INV-2609-1077 -> DLV-2609-1077), and updates
// the matching Ledger entries that reference those numbers, so old and new
// records use the same numbering scheme consistently. Safe to re-run —
// does nothing once there's nothing left starting with "INV-".

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Invoice = require('../modules/invoices/model');
const Ledger = require('../modules/ledger/model');

async function run() {
  await connectDB();

  const invoices = await Invoice.find({ no: /^INV-/ });
  console.log(`Found ${invoices.length} invoice(s) to rename.`);

  let ledgerUpdated = 0;
  for (const inv of invoices) {
    const oldNo = inv.no;
    const newNo = oldNo.replace(/^INV-/, 'DLV-');

    inv.no = newNo;
    await inv.save();

    const result = await Ledger.updateMany({ type: 'Invoice', ref: oldNo }, { ref: newNo });
    ledgerUpdated += result.modifiedCount;
  }

  console.log(`Renamed ${invoices.length} invoice(s) to the DLV- prefix.`);
  console.log(`Updated ${ledgerUpdated} matching ledger entr(y/ies) to reference the new numbers.`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
