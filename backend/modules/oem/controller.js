const XLSX = require('xlsx');
const OemOrder = require('./model');
const Dealer = require('../dealers/model');
const { STATUSES } = require('./model');

const EDIT_STATUSES = ['Draft', 'Confirmed'];

function buildLines(inputLines) {
  const lines = [];
  for (const il of inputLines || []) {
    const name = String(il.name || '').trim();
    const qty = +il.qty || 0;
    const rate = +il.rate || 0;
    if (!name) continue;
    if (qty <= 0) throw new Error(`Quantity required for "${name}"`);
    const gstPct = il.gstPct != null && il.gstPct !== '' ? +il.gstPct : 18;
    const amount = +(qty * rate).toFixed(2);
    const tax = +((amount * gstPct) / 100).toFixed(2);
    lines.push({
      no: lines.length + 1,
      name,
      spec: String(il.spec || '').trim(),
      qty,
      unit: String(il.unit || 'pcs').trim() || 'pcs',
      rate,
      gstPct,
      amount,
      tax,
      total: +(amount + tax).toFixed(2),
    });
  }
  if (!lines.length) throw new Error('At least one line item is required');
  return lines;
}

function applyTotals(order) {
  order.subtotal = +order.lines.reduce((s, l) => s + l.amount, 0).toFixed(2);
  order.taxTotal = +order.lines.reduce((s, l) => s + l.tax, 0).toFixed(2);
  order.total = +(order.subtotal + order.taxTotal).toFixed(2);
}

// POST /api/oem
async function create(req, res) {
  try {
    const { dealerCode, lines: inputLines, deliveryDate, advance, remark } = req.body;
    const dealer = await Dealer.findOne({ code: String(dealerCode || '').toUpperCase() });
    if (!dealer) return res.status(400).json({ message: 'Dealer not found' });
    if (!dealer.isOEM) return res.status(400).json({ message: 'This customer is not marked as an OEM customer' });

    const lines = buildLines(inputLines);
    const count = await OemOrder.countDocuments();
    const no = 'OEM-' + new Date().toISOString().slice(2, 7).replace('-', '') + '-' + String(count + 1).padStart(4, '0');
    const order = new OemOrder({
      no,
      dealer: dealer.code,
      dealerName: dealer.name,
      lines,
      deliveryDate: deliveryDate || null,
      advance: +advance || 0,
      remark: remark || '',
      status: 'Draft',
      by: req.user.name,
      createdBy: req.user._id,
      history: [{ status: 'Draft', note: 'Created', by: req.user.name }],
    });
    applyTotals(order);
    await order.save();
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// GET /api/oem?status=&q=&dealer=
async function list(req, res) {
  const { status, q, dealer } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (dealer) filter.dealer = dealer;
  if (q) {
    const safe = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ no: new RegExp(safe, 'i') }, { dealerName: new RegExp(safe, 'i') }];
  }
  const orders = await OemOrder.find(filter).sort({ createdAt: -1 });
  res.json(orders);
}

async function counts(req, res) {
  const rows = await OemOrder.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
  const out = { all: 0 };
  STATUSES.forEach((s) => { out[s] = 0; });
  rows.forEach((r) => { out[r._id] = r.n; out.all += r.n; });
  res.json(out);
}

async function getOne(req, res) {
  const order = await OemOrder.findOne({ no: req.params.no });
  if (!order) return res.status(404).json({ message: 'OEM order not found' });
  res.json(order);
}

// PUT /api/oem/:no — only while Draft or Confirmed
async function update(req, res) {
  try {
    const order = await OemOrder.findOne({ no: req.params.no });
    if (!order) return res.status(404).json({ message: 'OEM order not found' });
    if (!EDIT_STATUSES.includes(order.status)) {
      return res.status(400).json({ message: `A ${order.status} order can no longer be edited.` });
    }
    const { lines, deliveryDate, advance, remark } = req.body;
    if (Array.isArray(lines)) order.lines = buildLines(lines);
    if (deliveryDate !== undefined) order.deliveryDate = deliveryDate || null;
    if (advance != null) order.advance = +advance || 0;
    if (remark != null) order.remark = remark;
    applyTotals(order);
    if (order.status === 'Confirmed') order.history.push({ status: 'Confirmed', note: 'Order edited', by: req.user.name });
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// Forward-only flow; Cancelled allowed from anything not yet Delivered/Cancelled.
const NEXT = {
  Draft: ['Confirmed'],
  Confirmed: ['In Production'],
  'In Production': ['Ready'],
  Ready: ['Delivered'],
};

// POST /api/oem/:no/status  { status, note }
async function setStatus(req, res) {
  try {
    const order = await OemOrder.findOne({ no: req.params.no });
    if (!order) return res.status(404).json({ message: 'OEM order not found' });
    const { status, note } = req.body;
    const allowed = [...(NEXT[order.status] || [])];
    if (!['Delivered', 'Cancelled'].includes(order.status)) allowed.push('Cancelled');
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `Cannot move a ${order.status} order to ${status}` });
    }
    order.status = status;
    order.history.push({ status, note: note || '', by: req.user.name });
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

async function remove(req, res) {
  const order = await OemOrder.findOne({ no: req.params.no });
  if (!order) return res.status(404).json({ message: 'OEM order not found' });
  if (order.status !== 'Draft') return res.status(400).json({ message: 'Only Draft orders can be deleted — cancel it instead.' });
  await order.deleteOne();
  res.json({ message: 'Deleted' });
}

// GET /api/oem/export.xlsx?status=
async function exportExcel(req, res) {
  const filter = req.query.status ? { status: req.query.status } : {};
  const orders = await OemOrder.find(filter).sort({ createdAt: -1 });
  const rows = orders.map((o) => ({
    'Order no': o.no,
    Date: o.date ? new Date(o.date).toISOString().slice(0, 10) : '',
    Customer: o.dealerName,
    Items: o.lines.map((l) => `${l.name} x${l.qty}`).join('; '),
    Subtotal: o.subtotal,
    GST: o.taxTotal,
    Total: o.total,
    Advance: o.advance,
    Balance: +(o.total - o.advance).toFixed(2),
    'Delivery date': o.deliveryDate ? new Date(o.deliveryDate).toISOString().slice(0, 10) : '',
    Status: o.status,
    'Created by': o.by,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'OEM Orders');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="OEM_Orders.xlsx"');
  res.send(buf);
}

module.exports = { create, list, counts, getOne, update, setStatus, remove, exportExcel };
