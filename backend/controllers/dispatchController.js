const PI = require('../models/PI');
const Dealer = require('../models/Dealer');
const Product = require('../models/Product');
const Invoice = require('../models/Invoice');
const Inventory = require('../models/Inventory');
const Ledger = require('../models/Ledger');

function todayISODate() {
  return new Date();
}

async function nextInvoiceNo() {
  const count = await Invoice.countDocuments();
  return 'INV-' + new Date().toISOString().slice(2, 7).replace('-', '') + '-' + String(count + 1001);
}

function validateCartonMap(dispatchLines, cartonMap) {
  if (!Array.isArray(cartonMap) || !cartonMap.length) {
    return 'Map at least one carton before dispatching (or use auto-fill on the frontend).';
  }
  const mappedByCode = {};
  cartonMap.forEach((c) => (c.items || []).forEach((it) => {
    mappedByCode[it.code] = (mappedByCode[it.code] || 0) + it.pcs;
  }));
  const shortfalls = dispatchLines.filter((l) => (mappedByCode[l.code] || 0) !== l.pcs);
  if (shortfalls.length) {
    return `Carton mapping doesn't match dispatched qty for: ${shortfalls.map((l) => l.name).join(', ')}`;
  }
  return null;
}

async function buildPackingFromCartonMap(cartonMap) {
  const packing = [];
  for (const c of cartonMap) {
    const items = [];
    for (const it of c.items) {
      const product = await Product.findOne({ code: it.code });
      items.push({ code: it.code, name: it.name, pcs: it.pcs, photo: product?.photo || '' });
    }
    packing.push({ no: c.no, mixed: c.items.length > 1, items });
  }
  return packing;
}

// POST /api/dispatch/from-pi/:piNo
// body: { lines: [{code, dispatchNow}], transporter, vehicle?, lr?, eway?, driver?, freight?, cartonMap: [{no, items:[{code,pcs}]}] }
async function dispatchFromPI(req, res) {
  try {
    const pi = await PI.findOne({ no: req.params.piNo });
    if (!pi) return res.status(404).json({ message: 'PI not found' });
    if (!['Confirmed', 'Partial Dispatched'].includes(pi.status)) {
      return res.status(400).json({ message: 'PI must be Confirmed before dispatch' });
    }

    const { lines: dispatchInput, transporter, vehicle, lr, eway, driver, freight, cartonMap } = req.body;
    if (!transporter) return res.status(400).json({ message: 'Mode of transport is required' });

    const dispatchLines = [];
    for (const di of dispatchInput.filter((l) => +l.dispatchNow > 0)) {
      const orig = pi.lines.find((l) => l.code === di.code);
      if (!orig) continue;
      const pcs = +di.dispatchNow;
      const total = +(orig.gross * pcs).toFixed(2);
      dispatchLines.push({
        no: orig.no, code: orig.code, name: orig.name, photo: orig.photo, pcs,
        rate: orig.rate, gstPct: orig.gstPct, tax: orig.tax, gross: orig.gross, total,
      });
    }
    if (!dispatchLines.length) return res.status(400).json({ message: 'Enter dispatched quantity on at least one line' });

    const cartonError = validateCartonMap(dispatchLines, cartonMap);
    if (cartonError) return res.status(400).json({ message: cartonError });

    const subtotal = dispatchLines.reduce((s, l) => s + l.total, 0);
    const frt = +freight || 0;
    const grand = subtotal + frt;
    const packing = await buildPackingFromCartonMap(cartonMap);
    const dealer = await Dealer.findOne({ code: pi.dealer });

    const invoice = await Invoice.create({
      no: await nextInvoiceNo(),
      date: todayISODate(),
      dealer: pi.dealer,
      dealerName: pi.dealerName,
      piRef: pi.no,
      manual: false,
      lines: dispatchLines,
      subtotal,
      transport: frt,
      total: grand,
      status: 'Dispatched',
      by: req.user.name,
      createdBy: req.user._id,
      transporter, vehicle: vehicle || '', lr: lr || '', eway: eway || '', driver: driver || '',
      cartons: cartonMap.length,
      freight: frt,
      packing,
      dispatchDate: todayISODate(),
    });

    // Update PI pending quantities
    for (const dl of dispatchLines) {
      const line = pi.lines.find((l) => l.code === dl.code && l.no === dl.no);
      if (line) {
        const currentPending = line.pending != null ? line.pending : line.pcs;
        line.pending = Math.max(0, currentPending - dl.pcs);
      }
    }
    const allDone = pi.lines.every((l) => (l.pending != null ? l.pending : l.pcs) === 0);
    pi.status = allDone ? 'Fully Dispatched' : 'Partial Dispatched';
    await pi.save();

    // Inventory: physical and reserved both drop (goods have left, reservation is released)
    for (const dl of dispatchLines) {
      await Inventory.findOneAndUpdate(
        { code: dl.code },
        { $inc: { physical: -dl.pcs, reserved: -dl.pcs } }
      );
    }

    await Ledger.create({
      date: todayISODate(), dealer: pi.dealer, type: 'Invoice', ref: invoice.no,
      debit: grand, credit: 0, note: `From PI ${pi.no}`,
    });

    res.status(201).json({ invoice, piStatus: pi.status });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// POST /api/dispatch/manual
// body: { dealerCode, lines: [{code, pcs}], transporter, freight?, cartonMap: [...] }
// Dispatches without any PI. Tax Invoice generated the same way; piRef left blank.
async function dispatchManual(req, res) {
  try {
    const { dealerCode, lines: inputLines, transporter, vehicle, lr, eway, driver, freight, cartonMap } = req.body;
    const dealer = await Dealer.findOne({ code: dealerCode });
    if (!dealer) return res.status(400).json({ message: 'Dealer not found' });
    if (!transporter) return res.status(400).json({ message: 'Mode of transport is required' });
    if (!Array.isArray(inputLines) || !inputLines.length) return res.status(400).json({ message: 'At least one item required' });

    const dispatchLines = [];
    for (let i = 0; i < inputLines.length; i++) {
      const il = inputLines[i];
      const product = await Product.findOne({ code: il.code.toUpperCase() });
      if (!product) return res.status(400).json({ message: `Product ${il.code} not found` });
      const pcs = +il.pcs;
      const rate = product.rate;
      const gstPct = product.gst_pct || 5;
      const tax = +((rate * gstPct) / 100).toFixed(2);
      const gross = +(rate + tax).toFixed(2);
      dispatchLines.push({
        no: i + 1, code: product.code, name: product.name, photo: product.photo || '',
        pcs, rate, gstPct, tax, gross, total: +(gross * pcs).toFixed(2),
      });
    }

    const cartonError = validateCartonMap(dispatchLines, cartonMap);
    if (cartonError) return res.status(400).json({ message: cartonError });

    const subtotal = dispatchLines.reduce((s, l) => s + l.total, 0);
    const frt = +freight || 0;
    const grand = subtotal + frt;
    const packing = await buildPackingFromCartonMap(cartonMap);

    const invoice = await Invoice.create({
      no: await nextInvoiceNo(),
      date: todayISODate(),
      dealer: dealer.code,
      dealerName: dealer.name,
      piRef: '',
      manual: true,
      lines: dispatchLines,
      subtotal, transport: frt, total: grand,
      status: 'Dispatched',
      by: req.user.name,
      createdBy: req.user._id,
      transporter, vehicle: vehicle || '', lr: lr || '', eway: eway || '', driver: driver || '',
      cartons: cartonMap.length,
      freight: frt,
      packing,
      dispatchDate: todayISODate(),
    });

    for (const dl of dispatchLines) {
      await Inventory.findOneAndUpdate({ code: dl.code }, { $inc: { physical: -dl.pcs } }, { upsert: true });
    }

    await Ledger.create({
      date: todayISODate(), dealer: dealer.code, type: 'Invoice', ref: invoice.no,
      debit: grand, credit: 0, note: 'Manual dispatch (no PI)',
    });

    res.status(201).json({ invoice });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// GET /api/dispatch/pending-pis  - dealer's pending PI suggestion for manual dispatch screen
async function pendingPIForDealer(req, res) {
  const pi = await PI.findOne({ dealer: req.params.dealerCode, status: { $in: ['Confirmed', 'Partial Dispatched'] } });
  res.json(pi || null);
}

async function readyPIs(req, res) {
  const pis = await PI.find({ status: { $in: ['Confirmed', 'Partial Dispatched'] } }).sort({ createdAt: -1 });
  res.json(pis);
}

module.exports = { dispatchFromPI, dispatchManual, pendingPIForDealer, readyPIs };
