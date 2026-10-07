const XLSX = require('xlsx');
const Invoice = require('./model');
const Dealer = require('../dealers/model');
const Notification = require('../notifications/model');
const CartonBarcode = require('../inventory/cartonBarcodeModel');
const Inventory = require('../inventory/model');
const PI = require('../pi/model');
const User = require('../users/model');
const { uploadBuffer, destroyAsset } = require('../../config/cloudinary');

async function list(req, res) {
  const { q, status, by, dealer, from, to } = req.query;
  const filter = {};
  if (status) {
    const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
    filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
  }
  if (dealer) filter.dealer = dealer;
  if (by) filter.by = by;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(new Date(to).getTime() + 86399999);
  }
  if (q) filter.$or = [{ no: new RegExp(q, 'i') }, { dealerName: new RegExp(q, 'i') }];
  if (['field', 'mhead'].includes(req.user.role)) {
    const myDealers = await Dealer.find({ assignedTo: req.user.name }).select('code');
    filter.dealer = { $in: myDealers.map((d) => d.code) };
  }
  const invoices = await Invoice.find(filter).sort({ createdAt: -1 }).populate('createdBy', 'name');

  const dealerCodes = [...new Set(invoices.map((i) => i.dealer))];
  const dealers = await Dealer.find({ code: { $in: dealerCodes } }).select('code assignedTo');
  const assignedByCode = Object.fromEntries(dealers.map((d) => [d.code, d.assignedTo || '']));

  const withAssigned = invoices.map((i) => ({ ...i.toObject(), dealerAssignedTo: assignedByCode[i.dealer] || '' }));
  res.json(withAssigned);
}

async function getOne(req, res) {
  const inv = await Invoice.findOne({ no: req.params.no }).populate('createdBy', 'name');
  if (!inv) return res.status(404).json({ message: 'Invoice not found' });

  // The stored `cartons` field only ever counts entries in the OPTIONAL
  // packing-list mapping (cartonMap) — a separate, manual "which box did
  // this go in" step most dispatches never fill in. It has nothing to do
  // with real QR-tracked cartons, so a perfectly normal scan-based dispatch
  // shows "Cartons: 0" here even though real physical cartons went out.
  // Every carton actually scanned against this invoice gets
  // dispatchedInvoice set to its number (see dispatch/controller.js) — that
  // is the real, trustworthy count, kept separate by outer/inner as usual.
  const cartons = await CartonBarcode.find({ dispatchedInvoice: inv.no }).select('kind').lean();
  const outerCartons = cartons.filter((c) => c.kind !== 'inner').length;
  const innerCartons = cartons.filter((c) => c.kind === 'inner').length;

  // `by` is the dealer's assigned salesperson (dealer.assignedTo) — not
  // necessarily createdBy, which is just whichever logged-in account
  // physically processed this dispatch (often dispatch/admin staff on the
  // rep's behalf). Look up that SAME `by` person's mobile by name, rather
  // than createdBy's, which could belong to someone else entirely.
  const rep = inv.by ? await User.findOne({ name: inv.by }).select('mobile') : null;

  res.json({ ...inv.toObject(), outerCartons, innerCartons, repMobile: rep?.mobile || '' });
}

async function markDelivered(req, res) {
  const inv = await Invoice.findOneAndUpdate(
    { no: req.params.no },
    { status: 'Delivered', deliveredDate: new Date() },
    { new: true }
  );
  if (!inv) return res.status(404).json({ message: 'Invoice not found' });
  if (inv.by) {
    await Notification.create({
      type: 'delivered',
      message: `${inv.no} for ${inv.dealerName} was marked delivered.`,
      relatedNo: inv.no,
      relatedKind: 'invoice',
      forUserName: inv.by,
    });
  }
  res.json(inv);
}

// PUT /api/invoices/:no/builty  (multipart, field "file") — the LR/builty receipt for this dispatch
async function uploadBuilty(req, res) {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const inv = await Invoice.findOne({ no: req.params.no });
  if (!inv) return res.status(404).json({ message: 'Invoice not found' });

  if (inv.builty?.publicId) await destroyAsset(inv.builty.publicId, 'image'); // replacing — clear the old one
  const result = await uploadBuffer(req.file.buffer, {
    folder: `funhoods-crm/customers/${inv.dealer}/builty`,
    resourceType: 'auto',
  });
  inv.builty = { url: result.secure_url, publicId: result.public_id };
  await inv.save();
  res.json(inv);
}

// PATCH /api/invoices/:no/mark-paid — marks payment received. This is a
// standalone tracking flag on the invoice for the 30-day reminder; it does
// NOT touch the Ledger (that stays driven by the existing manual
// "record payment" flow on the dealer's ledger, since one payment often
// covers several invoices at once).
async function markPaid(req, res) {
  const inv = await Invoice.findOneAndUpdate(
    { no: req.params.no },
    { paymentReceived: true, paymentReceivedAt: new Date(), paymentReceivedBy: req.user.name },
    { new: true }
  );
  if (!inv) return res.status(404).json({ message: 'Invoice not found' });
  res.json(inv);
}

// GET /api/invoices/:no/packing-list.xlsx
async function packingListExcel(req, res) {
  const inv = await Invoice.findOne({ no: req.params.no });
  if (!inv) return res.status(404).json({ message: 'Invoice not found' });

  const rows = [['Carton #', 'Product Code', 'Product Name', 'Pieces', 'Mixed Carton?']];
  inv.packing.forEach((c) => {
    c.items.forEach((it) => rows.push([c.no, it.code, it.name, it.pcs, c.mixed ? 'Yes' : 'No']));
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Packing List');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Disposition', `attachment; filename=Packing_List_${inv.no}.xlsx`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
}

// PATCH /api/invoices/:no/revert — masterAdmin only. Fully undoes a
// dispatch: cancels the invoice, puts every pcs (paid AND free gift) back
// into physical stock, un-dispatches every carton that was scanned for
// this invoice (back to in_stock, so it can be rescanned into a future
// dispatch), and restores pending qty on whichever PI/line it actually
// came from. Can only ever be done once per invoice — an already-Cancelled
// invoice has nothing left to revert.
//
// PI restoration has two paths:
//  - invoice.consumedFrom (set automatically for every invoice created
//    after this feature shipped — see dispatchFromPool) is authoritative:
//    exactly which PI/line/pcs to restore, no guessing involved.
//  - An older invoice has no consumedFrom recorded at all (it predates this
//    tracking), so there's nothing here to restore PI pending from
//    automatically. The caller can optionally pass `manualPiRestore:
//    [{piNo, code, rate, pcs}]` in the request body — reviewed and typed in
//    by a person who worked out which PI(s) this dispatch actually drew
//    from (e.g. from the original PI screenshots) — and those are applied
//    exactly like a real consumedFrom entry would be. If omitted, physical
//    stock and cartons still revert correctly; only the PI's pending figure
//    is left untouched, and the response says so explicitly.
async function revertDispatch(req, res) {
  const inv = await Invoice.findOne({ no: req.params.no });
  if (!inv) return res.status(404).json({ message: 'Invoice not found' });
  if (inv.status === 'Cancelled') return res.status(400).json({ message: 'Already cancelled — nothing to revert.' });

  const manualPiRestore = Array.isArray(req.body.manualPiRestore) ? req.body.manualPiRestore : [];
  const restoreEntries = inv.consumedFrom?.length ? inv.consumedFrom : manualPiRestore;
  const piNotes = [];

  // 1) Physical stock — every paid pcs plus every catalog-gift pcs on this
  // invoice leaves via the same physical decrement at dispatch time (see
  // dispatchFromPool/dispatchManual), so both get added back the same way.
  // A custom gift (no `code`) never touched stock, so it's naturally
  // skipped here.
  const physicalDeltaByCode = {};
  inv.lines.forEach((l) => { physicalDeltaByCode[l.code] = (physicalDeltaByCode[l.code] || 0) + l.pcs; });
  (inv.gifts || []).forEach((g) => { if (g.code) physicalDeltaByCode[g.code] = (physicalDeltaByCode[g.code] || 0) + (g.pcs || 0); });
  for (const [code, pcs] of Object.entries(physicalDeltaByCode)) {
    await Inventory.findOneAndUpdate({ code }, { $inc: { physical: pcs } }, { upsert: true });
  }

  // 2) Cartons — every carton this invoice actually marked dispatched goes
  // back to in_stock, clearing the OUT-event fields so it reads as never
  // having left and can be scanned again on a future dispatch. Does NOT
  // attempt to reverse a split-cascade (a sealed outer this invoice opened
  // to dispatch one of its inner children) — that's rare enough in
  // practice, and safely unwinding it (re-sealing every sibling inner back
  // to pending) is a separate, more invasive operation than this covers.
  const revertedCartons = await CartonBarcode.updateMany(
    { dispatchedInvoice: inv.no, status: 'dispatched' },
    { $set: { status: 'in_stock', dispatchedTo: '', dispatchedInvoice: '', dispatchedBy: '', dispatchedAt: null, dispatchOverride: false } }
  );

  // 3) PI pending — add back exactly what this invoice (or the manually
  // supplied entries) took, capped so it can never exceed the line's own
  // original pcs (defensive — in case the PI was edited since).
  if (restoreEntries.length) {
    const piNos = [...new Set(restoreEntries.map((e) => e.piNo))];
    const pis = await PI.find({ no: { $in: piNos } });
    const piByNo = Object.fromEntries(pis.map((p) => [p.no, p]));
    for (const entry of restoreEntries) {
      const pi = piByNo[entry.piNo];
      if (!pi) { piNotes.push(`${entry.piNo} not found — ${entry.pcs} pcs of ${entry.code} not restored to any PI.`); continue; }
      const line = pi.lines.find((l) => l.code === entry.code && l.rate === entry.rate);
      if (!line) { piNotes.push(`${entry.piNo} has no matching line for ${entry.code} @ ₹${entry.rate} — ${entry.pcs} pcs not restored.`); continue; }
      const currentPending = line.pending != null ? line.pending : line.pcs;
      line.pending = Math.min(line.pcs, currentPending + entry.pcs);
    }
    for (const pi of pis) {
      const allPending = pi.lines.every((l) => (l.pending != null ? l.pending : l.pcs) === l.pcs);
      const anyPending = pi.lines.some((l) => (l.pending != null ? l.pending : l.pcs) > 0);
      if (['Confirmed', 'Partial Dispatched', 'Fully Dispatched'].includes(pi.status)) {
        pi.status = allPending ? 'Confirmed' : anyPending ? 'Partial Dispatched' : 'Fully Dispatched';
      }
      await pi.save();
    }
  } else {
    piNotes.push('This invoice has no recorded PI source (older than the auto-tracking, and no manualPiRestore given) — PI pending was left untouched.');
  }

  inv.status = 'Cancelled';
  inv.revertedAt = new Date();
  inv.revertedBy = req.user.name;
  await inv.save();

  res.json({
    message: `${inv.no} reverted — stock and ${revertedCartons.modifiedCount} carton(s) restored.${piNotes.length ? ' ' + piNotes.join(' ') : ''}`,
    invoice: inv,
    piNotes,
  });
}

module.exports = { list, getOne, markDelivered, packingListExcel, uploadBuilty, markPaid, revertDispatch };
