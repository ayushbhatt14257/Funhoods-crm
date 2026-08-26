const PI = require('../models/PI');
const Dealer = require('../models/Dealer');
const Product = require('../models/Product');
const Alias = require('../models/Alias');
const Inventory = require('../models/Inventory');
const Notification = require('../models/Notification');
const { parseOrderText } = require('../utils/orderParser');

// POST /api/pi/parse  { text }
async function parseOrder(req, res) {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: 'text required' });
    const result = await parseOrderText(text, { Dealer, Product, Alias });
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// Shared line-builder: takes raw input lines + returns computed PI line objects.
// Supports outer/inner cartons OR a direct "pcs" override (e.g. loose pieces not matching a full carton).
async function buildLines(inputLines) {
  // First merge any duplicate product codes into one entry — summing pcs/outers/inners.
  // Two separate lines of the same SKU on one PI break dispatch carton-mapping (which is
  // keyed by product code), so they're combined here regardless of how they were entered.
  const merged = [];
  const indexByCode = {};
  for (const il of inputLines) {
    const code = String(il.code).toUpperCase();
    if (indexByCode[code] != null) {
      const existing = merged[indexByCode[code]];
      existing.outers = (+existing.outers || 0) + (+il.outers || 0);
      existing.inners = (+existing.inners || 0) + (+il.inners || 0);
      if (il.pcs != null || existing.pcs != null) {
        existing.pcs = (existing.pcs != null ? +existing.pcs : 0) + (il.pcs != null ? +il.pcs : 0);
      }
      // Keep the edited rate if either occurrence had one explicitly set.
      if (il.rate != null) existing.rate = il.rate;
    } else {
      indexByCode[code] = merged.length;
      merged.push({ ...il, code });
    }
  }

  const lines = [];
  for (let i = 0; i < merged.length; i++) {
    const il = merged[i];
    const product = await Product.findOne({ code: il.code.toUpperCase() });
    if (!product) throw new Error(`Product ${il.code} not found`);

    const rate = il.rate != null ? +il.rate : product.rate;
    const gstPct = product.gst_pct || 5;
    const tax = +((rate * gstPct) / 100).toFixed(2);
    const gross = +(rate + tax).toFixed(2);

    // If a direct pcs override is given (not derived purely from outer/inner), use it as-is.
    const pcs = il.pcs != null ? +il.pcs : (+il.outers || 0) * product.cartonOuter + (+il.inners || 0) * product.cartonInner;
    const total = +(gross * pcs).toFixed(2);

    lines.push({
      no: i + 1,
      code: product.code,
      name: product.name,
      photo: product.photo || '',
      outers: il.outers || 0,
      inners: il.inners || 0,
      pcs,
      pending: pcs,
      rate,
      listRate: product.rate,
      rateEdited: rate !== product.rate,
      gstPct,
      tax,
      gross,
      total,
    });
  }
  return lines;
}

async function notifyRateEdits(lines, pi, editorName) {
  const edited = lines.filter((l) => l.rateEdited);
  for (const l of edited) {
    await Notification.create({
      type: 'rate_edit',
      message: `${editorName} edited the rate on ${l.name} (${l.code}) in ${pi.no} — list ₹${l.listRate} → ₹${l.rate}`,
      relatedNo: pi.no,
      byUser: editorName,
      forRole: 'founder',
    });
  }
}

// POST /api/pi  { dealerCode, lines: [{code, pcs?, outers?, inners?, rate?}], remark?, transport?, freightTerm? }
async function create(req, res) {
  try {
    const { dealerCode, lines: inputLines, remark, transport, freightTerm } = req.body;
    const dealer = await Dealer.findOne({ code: dealerCode });
    if (!dealer) return res.status(400).json({ message: 'Dealer not found' });
    if (!Array.isArray(inputLines) || !inputLines.length) return res.status(400).json({ message: 'At least one line required' });

    const lines = await buildLines(inputLines);
    const subtotal = lines.reduce((s, l) => s + l.total, 0);
    const transportAmt = +transport || 0;
    const count = await PI.countDocuments();
    const no = 'PI-' + new Date().toISOString().slice(2, 7).replace('-', '') + '-' + String(count + 1).padStart(4, '0');

    const pi = await PI.create({
      no,
      dealer: dealer.code,
      dealerName: dealer.name,
      lines,
      subtotal,
      transport: transportAmt,
      freightTerm: ['To Pay', 'Paid'].includes(freightTerm) ? freightTerm : 'To Pay',
      total: subtotal + transportAmt,
      status: 'Draft',
      by: dealer.assignedTo || req.user.name,
      createdBy: req.user._id,
      remark: remark || '',
    });

    await notifyRateEdits(lines, pi, req.user.name);

    res.status(201).json(pi);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

async function list(req, res) {
  const { q, status, by, dealer, from, to } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (dealer) filter.dealer = dealer;
  if (by) filter.by = by;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(new Date(to).getTime() + 86399999); // include the whole "to" day
  }
  if (q) filter.$or = [{ no: new RegExp(q, 'i') }, { dealerName: new RegExp(q, 'i') }];
  if (['field', 'mhead'].includes(req.user.role)) {
    const myDealers = await Dealer.find({ assignedTo: req.user.name }).select('code');
    filter.dealer = { $in: myDealers.map((d) => d.code) };
  }
  const pis = await PI.find(filter).sort({ createdAt: -1 });

  const dealerCodes = [...new Set(pis.map((p) => p.dealer))];
  const dealers = await Dealer.find({ code: { $in: dealerCodes } }).select('code assignedTo');
  const assignedByCode = Object.fromEntries(dealers.map((d) => [d.code, d.assignedTo || '']));

  const withAssigned = pis.map((p) => ({ ...p.toObject(), dealerAssignedTo: assignedByCode[p.dealer] || '' }));
  res.json(withAssigned);
}

async function getOne(req, res) {
  const pi = await PI.findOne({ no: req.params.no });
  if (!pi) return res.status(404).json({ message: 'PI not found' });
  res.json(pi);
}

// PUT /api/pi/:no  — edit an existing PI (only allowed while Draft or Sent, before confirm/dispatch)
async function update(req, res) {
  try {
    const pi = await PI.findOne({ no: req.params.no });
    if (!pi) return res.status(404).json({ message: 'PI not found' });
    if (!['Draft', 'Sent'].includes(pi.status)) {
      return res.status(400).json({ message: 'Only Draft or Sent PIs can be edited — this one is already confirmed/dispatched.' });
    }

    const { lines: inputLines, remark, transport, freightTerm } = req.body;
    if (Array.isArray(inputLines) && inputLines.length) {
      const lines = await buildLines(inputLines);
      pi.lines = lines;
      pi.subtotal = lines.reduce((s, l) => s + l.total, 0);
      await notifyRateEdits(lines, pi, req.user.name);
    }
    if (transport != null) pi.transport = +transport || 0;
    if (['To Pay', 'Paid'].includes(freightTerm)) pi.freightTerm = freightTerm;
    pi.total = pi.subtotal + (pi.transport || 0);
    if (remark != null) pi.remark = remark;

    await pi.save();
    res.json(pi);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// PATCH /api/pi/:no/status  { status: 'Sent' | 'Draft' }
async function setStatus(req, res) {
  const pi = await PI.findOne({ no: req.params.no });
  if (!pi) return res.status(404).json({ message: 'PI not found' });
  if (!['Draft', 'Sent'].includes(req.body.status)) return res.status(400).json({ message: 'Invalid status transition' });
  pi.status = req.body.status;
  await pi.save();
  res.json(pi);
}

// POST /api/pi/:no/confirm  -> reserves stock
async function confirm(req, res) {
  const pi = await PI.findOne({ no: req.params.no });
  if (!pi) return res.status(404).json({ message: 'PI not found' });
  if (pi.status === 'Cancelled') return res.status(400).json({ message: 'PI is cancelled' });

  for (const l of pi.lines) {
    await Inventory.findOneAndUpdate({ code: l.code }, { $inc: { reserved: l.pcs } }, { upsert: true });
  }
  pi.status = 'Confirmed';
  await pi.save();
  res.json(pi);
}

// POST /api/pi/:no/cancel -> releases reserved stock if was confirmed
async function cancel(req, res) {
  const pi = await PI.findOne({ no: req.params.no });
  if (!pi) return res.status(404).json({ message: 'PI not found' });

  if (pi.status === 'Confirmed') {
    for (const l of pi.lines) {
      await Inventory.findOneAndUpdate({ code: l.code }, { $inc: { reserved: -l.pcs } });
    }
  }
  pi.status = 'Cancelled';
  await pi.save();
  res.json(pi);
}

// DELETE /api/pi/:no — founder only, permanent delete
async function remove(req, res) {
  const pi = await PI.findOne({ no: req.params.no });
  if (!pi) return res.status(404).json({ message: 'PI not found' });

  if (['Partial Dispatched', 'Fully Dispatched'].includes(pi.status)) {
    return res.status(400).json({ message: 'This PI already has dispatches against it and cannot be deleted — cancel it instead.' });
  }

  if (pi.status === 'Confirmed') {
    for (const l of pi.lines) {
      await Inventory.findOneAndUpdate({ code: l.code }, { $inc: { reserved: -l.pcs } });
    }
  }

  await PI.deleteOne({ no: req.params.no });
  res.json({ message: 'Deleted' });
}

module.exports = { parseOrder, create, update, list, getOne, setStatus, confirm, cancel, remove };
