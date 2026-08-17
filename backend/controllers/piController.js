const PI = require('../models/PI');
const Dealer = require('../models/Dealer');
const Product = require('../models/Product');
const Alias = require('../models/Alias');
const Inventory = require('../models/Inventory');
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

// POST /api/pi  { dealerCode, lines: [{code, pcs, outers, inners}], rateOverrides?: {code: rate} }
// Builds and saves a PI directly (frontend calls /parse first, lets user review/edit, then posts final lines here).
async function create(req, res) {
  try {
    const { dealerCode, lines: inputLines } = req.body;
    const dealer = await Dealer.findOne({ code: dealerCode });
    if (!dealer) return res.status(400).json({ message: 'Dealer not found' });
    if (!Array.isArray(inputLines) || !inputLines.length) return res.status(400).json({ message: 'At least one line required' });

    const lines = [];
    for (let i = 0; i < inputLines.length; i++) {
      const il = inputLines[i];
      const product = await Product.findOne({ code: il.code.toUpperCase() });
      if (!product) return res.status(400).json({ message: `Product ${il.code} not found` });

      const rate = il.rate != null ? +il.rate : product.rate;
      const gstPct = product.gst_pct || 5;
      const tax = +((rate * gstPct) / 100).toFixed(2);
      const gross = +(rate + tax).toFixed(2);
      const pcs = +il.pcs;
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

    const subtotal = lines.reduce((s, l) => s + l.total, 0);
    const count = await PI.countDocuments();
    const no = 'PI-' + new Date().toISOString().slice(2, 7).replace('-', '') + '-' + String(count + 1).padStart(4, '0');

    const pi = await PI.create({
      no,
      dealer: dealer.code,
      dealerName: dealer.name,
      lines,
      subtotal,
      transport: 0,
      total: subtotal,
      status: 'Draft',
      by: req.user.name,
      createdBy: req.user._id,
    });

    res.status(201).json(pi);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

async function list(req, res) {
  const { q, status } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (q) filter.$or = [{ no: new RegExp(q, 'i') }, { dealerName: new RegExp(q, 'i') }];
  const pis = await PI.find(filter).sort({ createdAt: -1 });
  res.json(pis);
}

async function getOne(req, res) {
  const pi = await PI.findOne({ no: req.params.no });
  if (!pi) return res.status(404).json({ message: 'PI not found' });
  res.json(pi);
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

module.exports = { parseOrder, create, list, getOne, setStatus, confirm, cancel };
