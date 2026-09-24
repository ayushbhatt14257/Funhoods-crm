const XLSX = require('xlsx');
const Invoice = require('./model');
const Dealer = require('../dealers/model');
const Notification = require('../notifications/model');
const CartonBarcode = require('../inventory/cartonBarcodeModel');
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

module.exports = { list, getOne, markDelivered, packingListExcel, uploadBuilty, markPaid };
