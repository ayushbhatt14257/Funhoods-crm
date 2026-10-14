// Run with: node seed/fixRoundingTotals.js
// One-time migration — recomputes every existing PI's and Invoice's line
// totals (and the subtotal/grand total that roll up from them) using the
// corrected formula: total = (unrounded per-unit rate+GST) × pcs, rounded
// only at the very end.
//
// The old formula rounded the per-unit GST/gross to 2 decimals FIRST and
// THEN multiplied by quantity — fine for small quantities, but the
// rounding error compounds on large ones (e.g. ₹35.25 at 5% GST is really
// ₹37.0125/unit; rounding that to ₹37.01 before multiplying by 2,880 pcs
// comes out ₹7.20 short of the true figure). This is what made invoice
// totals disagree with Tally, where GST is applied to the whole line
// rather than a pre-rounded per-unit price.
//
// Per-unit `tax`/`gross` display fields are left as they were (2-decimal
// rounding is normal and expected for a per-unit display value) — only
// `total` (and the document-level subtotal/total that depend on it) are
// corrected. Safe to re-run — it only touches a line/document whose total
// would actually change, and only ever adjusts by a few paise/rupees per
// line (never anything structural like rate or pcs).

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const PI = require('../modules/pi/model');
const Invoice = require('../modules/invoices/model');

function correctedLineTotal(l) {
  const rawGross = l.rate + (l.rate * (l.gstPct || 0)) / 100;
  return +(rawGross * l.pcs).toFixed(2);
}

async function fixDoc(doc, label) {
  let changed = false;
  doc.lines.forEach((l) => {
    const correct = correctedLineTotal(l);
    if (Math.abs(correct - l.total) >= 0.005) {
      console.log(`  ${label} line ${l.code}: total ₹${l.total} -> ₹${correct}`);
      l.total = correct;
      changed = true;
    }
  });
  if (!changed) return false;

  const newSubtotal = +doc.lines.reduce((s, l) => s + l.total, 0).toFixed(2);
  const newTotal = +(newSubtotal + (doc.transport || 0) + (doc.freightGst || 0)).toFixed(2);
  console.log(`${label}: subtotal ₹${doc.subtotal} -> ₹${newSubtotal}, total ₹${doc.total} -> ₹${newTotal}`);
  doc.subtotal = newSubtotal;
  doc.total = newTotal;
  await doc.save();
  return true;
}

async function run() {
  await connectDB();

  const pis = await PI.find();
  console.log(`Checking ${pis.length} PIs...\n`);
  let piFixed = 0;
  for (const pi of pis) {
    if (await fixDoc(pi, `PI ${pi.no}`)) piFixed++;
  }

  const invoices = await Invoice.find();
  console.log(`\nChecking ${invoices.length} invoices...\n`);
  let invFixed = 0;
  for (const inv of invoices) {
    if (await fixDoc(inv, `Invoice ${inv.no}`)) invFixed++;
  }

  console.log(`\nDone. PIs corrected: ${piFixed}/${pis.length}. Invoices corrected: ${invFixed}/${invoices.length}.`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
