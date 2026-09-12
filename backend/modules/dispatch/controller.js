const PI = require('../pi/model');
const Dealer = require('../dealers/model');
const Product = require('../products/model');
const Invoice = require('../invoices/model');
const Inventory = require('../inventory/model');
const Ledger = require('../ledger/model');
const Notification = require('../notifications/model');

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

function notifyDispatched(invoice) {
  if (!invoice.by) return Promise.resolve();
  return Notification.create({
    type: 'dispatched',
    message: `${invoice.no} for ${invoice.dealerName} has been dispatched — ₹${Math.round(invoice.total).toLocaleString('en-IN')}, ${invoice.cartons} carton(s).`,
    relatedNo: invoice.no,
    relatedKind: 'invoice',
    forUserName: invoice.by,
  });
}

// Warns (doesn't block) when a dispatch would take physical stock negative —
// i.e. shipping more of something than is actually sitting in the godown
// right now. This is deliberately soft: orders can be confirmed beyond
// current stock (you manufacture more), so this only matters at the moment
// stock is physically about to leave. Pass `force: true` in the request body
// to dispatch anyway once the dispatcher has seen the warning.
async function checkPhysicalShortages(dispatchLines) {
  const codes = dispatchLines.map((l) => l.code);
  const invDocs = await Inventory.find({ code: { $in: codes } });
  const invByCode = Object.fromEntries(invDocs.map((d) => [d.code, d]));
  const shortages = [];
  for (const l of dispatchLines) {
    const physical = invByCode[l.code]?.physical || 0;
    if (l.pcs > physical) shortages.push({ code: l.code, name: l.name, requested: l.pcs, physical });
  }
  return shortages;
}

// GET /api/dispatch/customer-pool/:dealerCode
//
// The new dispatch model: instead of opening one PI at a time, this
// aggregates every still-pending line across ALL of a dealer's Confirmed /
// Partial Dispatched PIs into one pool, grouped by product+rate (a
// different negotiated rate for the same product shows as its own row,
// since it'll need its own invoice line later). This is what replaced the
// old PI-by-PI dispatch queue entirely.
async function getCustomerPool(req, res) {
  const dealer = await Dealer.findOne({ code: req.params.dealerCode });
  if (!dealer) return res.status(404).json({ message: 'Dealer not found' });

  const pis = await PI.find({ dealer: dealer.code, status: { $in: ['Confirmed', 'Partial Dispatched'] } })
    .sort({ confirmedAt: 1, createdAt: 1 });
  const eligible = pis.filter((p) => p.priceApproval?.status !== 'pending'); // same rule the old queue used — a discount awaiting sign-off can't be dispatched yet

  const groups = {}; // key = code|rate — a different rate for the same product is a different line
  for (const pi of eligible) {
    const confirmedDate = pi.confirmedAt || pi.createdAt;
    for (const line of pi.lines) {
      const pending = line.pending != null ? line.pending : line.pcs;
      if (pending <= 0) continue;
      const key = `${line.code}|${line.rate}`;
      if (!groups[key]) {
        groups[key] = { code: line.code, name: line.name, photo: line.photo, rate: line.rate, gstPct: line.gstPct, pendingPcs: 0, lastConfirmedAt: confirmedDate };
      }
      groups[key].pendingPcs += pending;
      if (confirmedDate > groups[key].lastConfirmedAt) groups[key].lastConfirmedAt = confirmedDate;
    }
  }

  const codes = [...new Set(Object.values(groups).map((g) => g.code))];
  const products = await Product.find({ code: { $in: codes } });
  const productMap = Object.fromEntries(products.map((p) => [p.code, p]));

  const items = Object.values(groups)
    .map((g) => ({ ...g, cartonOuter: productMap[g.code]?.cartonOuter || 0, cartonInner: productMap[g.code]?.cartonInner || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json({
    dealer: { code: dealer.code, name: dealer.name, assignedTo: dealer.assignedTo, dispatchHold: dealer.dispatchHold },
    items,
  });
}

// GET /api/dispatch/pending-overview?from=&to=
//
// The Dispatch page's default landing view: every party with something
// confirmed and still undispatched, grouped exactly like getCustomerPool
// but rolled up across ALL parties at once, so a dispatcher can see
// everything waiting without searching one customer at a time. `from`/`to`
// filter by when each PI was CONFIRMED (not created) — this is a discovery
// tool for "what got confirmed recently and needs picking up," so only PIs
// confirmed inside the window contribute to the totals shown.
async function getPendingOverview(req, res) {
  const { from, to } = req.query;
  const filter = { status: { $in: ['Confirmed', 'Partial Dispatched'] } };
  if (from || to) {
    filter.confirmedAt = {};
    if (from) filter.confirmedAt.$gte = new Date(from);
    if (to) filter.confirmedAt.$lte = new Date(new Date(to).getTime() + 86399999);
  }

  const pis = await PI.find(filter).sort({ confirmedAt: 1, createdAt: 1 });
  const eligible = pis.filter((p) => p.priceApproval?.status !== 'pending');

  const byDealer = {}; // dealer code -> { dealerName, items: {key: {...}}, lastConfirmedAt }
  for (const pi of eligible) {
    const confirmedDate = pi.confirmedAt || pi.createdAt;
    // If a date range was given, only count lines from PIs confirmed inside it —
    // a PI confirmed outside the window contributes nothing here, even if the
    // party has other, in-window PIs too.
    if ((from || to) && !pi.confirmedAt) continue;

    let hasPending = false;
    const lineTotals = {};
    for (const line of pi.lines) {
      const pending = line.pending != null ? line.pending : line.pcs;
      if (pending <= 0) continue;
      hasPending = true;
      const key = `${line.code}|${line.rate}`;
      lineTotals[key] = lineTotals[key] || { code: line.code, name: line.name, rate: line.rate, pendingPcs: 0 };
      lineTotals[key].pendingPcs += pending;
    }
    if (!hasPending) continue;

    if (!byDealer[pi.dealer]) byDealer[pi.dealer] = { dealer: pi.dealer, dealerName: pi.dealerName, items: {}, lastConfirmedAt: confirmedDate };
    const g = byDealer[pi.dealer];
    if (confirmedDate > g.lastConfirmedAt) g.lastConfirmedAt = confirmedDate;
    for (const [key, line] of Object.entries(lineTotals)) {
      if (!g.items[key]) g.items[key] = { ...line, pendingPcs: 0 };
      g.items[key].pendingPcs += line.pendingPcs;
    }
  }

  const dealerCodes = Object.keys(byDealer);
  const dealers = await Dealer.find({ code: { $in: dealerCodes } });
  const dealerMap = Object.fromEntries(dealers.map((d) => [d.code, d]));

  const parties = Object.values(byDealer)
    .map((g) => ({
      dealer: g.dealer,
      dealerName: g.dealerName,
      lastConfirmedAt: g.lastConfirmedAt,
      onHold: !!dealerMap[g.dealer]?.dispatchHold?.active,
      holdReason: dealerMap[g.dealer]?.dispatchHold?.reason || '',
      heldBy: dealerMap[g.dealer]?.dispatchHold?.heldBy || '',
      items: Object.values(g.items).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => new Date(b.lastConfirmedAt) - new Date(a.lastConfirmedAt));

  res.json(parties);
}

// POST /api/dispatch/hold/:dealerCode  { reason }
async function holdDealer(req, res) {
  const reason = String(req.body.reason || '').trim();
  if (!reason) return res.status(400).json({ message: 'A reason is required to put a customer on hold.' });
  const dealer = await Dealer.findOne({ code: req.params.dealerCode });
  if (!dealer) return res.status(404).json({ message: 'Dealer not found' });
  dealer.dispatchHold = { active: true, reason, heldBy: req.user.name, heldAt: new Date() };
  await dealer.save();
  res.json({ message: `${dealer.name} put on hold — won't be dispatchable until released.` });
}

// POST /api/dispatch/unhold/:dealerCode
async function unholdDealer(req, res) {
  const dealer = await Dealer.findOne({ code: req.params.dealerCode });
  if (!dealer) return res.status(404).json({ message: 'Dealer not found' });
  dealer.dispatchHold = { active: false, reason: '', heldBy: '', heldAt: null };
  await dealer.save();
  res.json({ message: `${dealer.name} released — can be dispatched again.` });
}

// Carton mapping is entirely optional for the customer-pool dispatch flow —
// deliberately separate from validateCartonMap() above (which stays
// mandatory and untouched, since Manual Dispatch still relies on that exact
// behavior). If a map IS provided, it still has to actually add up right;
// it's the "must provide one at all" requirement that's gone. Sums by
// product code first, since the same code can legitimately appear as two
// separate dispatch lines here (once per contributing rate).
function validateOptionalCartonMap(dispatchLines, cartonMap) {
  if (!Array.isArray(cartonMap) || !cartonMap.length) return null;
  const mappedByCode = {};
  cartonMap.forEach((c) => (c.items || []).forEach((it) => { mappedByCode[it.code] = (mappedByCode[it.code] || 0) + it.pcs; }));
  const neededByCode = {};
  dispatchLines.forEach((l) => { neededByCode[l.code] = (neededByCode[l.code] || 0) + l.pcs; });
  const mismatches = Object.entries(neededByCode).filter(([code, pcs]) => (mappedByCode[code] || 0) !== pcs);
  if (mismatches.length) {
    const names = mismatches.map(([code]) => dispatchLines.find((l) => l.code === code)?.name || code).join(', ');
    return `Carton mapping doesn't match dispatched qty for: ${names}`;
  }
  return null;
}

// POST /api/dispatch/from-customer-pool
// body: { dealerCode, lines: [{code, rate, outers, inners}], transporter,
//         vehicle?, lr?, eway?, driver?, freight?, freightTerm?, cartonMap?, force? }
//
// Quantity always arrives as whole outer/inner cartons (never raw pieces —
// the frontend only ever offers whole-carton amounts), converted to pcs
// here using the product's actual carton size. Consumes pending quantity
// FIFO across whichever PIs contributed it (oldest confirmed first) — a
// single dispatch here can and normally will clear pending off more than
// one PI at once. No `piRef` on the resulting invoice: this dispatch isn't
// "against" any one PI, it's against the dealer's whole confirmed pool.
async function dispatchFromPool(req, res) {
  try {
    const { dealerCode, lines: requestedLines, transporter, vehicle, lr, eway, driver, freight, freightTerm, cartonMap } = req.body;
    const dealer = await Dealer.findOne({ code: dealerCode });
    if (!dealer) return res.status(400).json({ message: 'Dealer not found' });
    if (dealer.dispatchHold?.active) {
      return res.status(400).json({ message: `${dealer.name} is on hold — "${dealer.dispatchHold.reason}" (by ${dealer.dispatchHold.heldBy}). Release the hold before dispatching.` });
    }
    if (!transporter) return res.status(400).json({ message: 'Mode of transport is required' });
    if (!Array.isArray(requestedLines) || !requestedLines.length) return res.status(400).json({ message: 'Select at least one item' });

    const pis = await PI.find({ dealer: dealerCode, status: { $in: ['Confirmed', 'Partial Dispatched'] } }).sort({ confirmedAt: 1, createdAt: 1 });
    const eligiblePIs = pis.filter((p) => p.priceApproval?.status !== 'pending');

    const dispatchLines = [];
    const touchedPIs = new Map(); // no -> PI doc

    for (const reqLine of requestedLines) {
      const product = await Product.findOne({ code: String(reqLine.code).toUpperCase() });
      if (!product) return res.status(400).json({ message: `Product ${reqLine.code} not found` });

      const outers = +reqLine.outers || 0;
      const inners = +reqLine.inners || 0;
      const needed = outers * (product.cartonOuter || 0) + inners * (product.cartonInner || 0);
      if (needed <= 0) continue;

      const rate = +reqLine.rate;
      let remaining = needed;
      for (const pi of eligiblePIs) {
        if (remaining <= 0) break;
        for (const line of pi.lines) {
          if (remaining <= 0) break;
          if (line.code !== product.code || line.rate !== rate) continue;
          const pending = line.pending != null ? line.pending : line.pcs;
          if (pending <= 0) continue;
          const take = Math.min(pending, remaining);
          line.pending = pending - take;
          remaining -= take;
          touchedPIs.set(pi.no, pi);
        }
      }
      if (remaining > 0) {
        return res.status(400).json({ message: `Not enough confirmed pending stock for ${product.name} at ₹${rate} — short by ${remaining} pcs. Someone may have just dispatched it — refresh and try again.` });
      }

      const gstPct = reqLine.gstPct || product.gst_pct || 5;
      const tax = +((rate * gstPct) / 100).toFixed(2);
      const gross = +(rate + tax).toFixed(2);
      dispatchLines.push({
        no: dispatchLines.length + 1, code: product.code, name: product.name, photo: product.photo || '',
        pcs: needed, rate, gstPct, tax, gross, total: +(gross * needed).toFixed(2),
      });
    }
    if (!dispatchLines.length) return res.status(400).json({ message: 'Select at least one item with a whole-carton quantity' });

    const cartonError = validateOptionalCartonMap(dispatchLines, cartonMap);
    if (cartonError) return res.status(400).json({ message: cartonError });

    if (!req.body.force) {
      // Same product can appear as two lines here (two rates) — combine by
      // code first, since physical stock doesn't know about invoice rates.
      const byCode = {};
      dispatchLines.forEach((l) => { byCode[l.code] = { code: l.code, name: l.name, pcs: (byCode[l.code]?.pcs || 0) + l.pcs }; });
      const shortages = await checkPhysicalShortages(Object.values(byCode));
      if (shortages.length) {
        const detail = shortages.map((s) => `${s.name} — dispatching ${s.requested}, only ${s.physical} physically in stock`).join('; ');
        return res.status(409).json({ message: `Physical stock shortfall: ${detail}. Confirm to dispatch anyway.`, shortages });
      }
    }

    const subtotal = dispatchLines.reduce((s, l) => s + l.total, 0);
    const frt = +freight || 0;
    const grand = subtotal + frt;
    const packing = await buildPackingFromCartonMap(cartonMap || []);

    const invoice = await Invoice.create({
      no: await nextInvoiceNo(),
      date: todayISODate(),
      dealer: dealer.code,
      dealerName: dealer.name,
      piRef: '', // not tied to any single PI — this is a pool dispatch, possibly clearing several PIs at once
      manual: false,
      lines: dispatchLines,
      subtotal, transport: frt, total: grand,
      status: 'Dispatched',
      by: dealer.assignedTo || req.user.name,
      createdBy: req.user._id,
      transporter, vehicle: vehicle || '', lr: lr || '', eway: eway || '', driver: driver || '',
      cartons: (cartonMap || []).length,
      freight: frt,
      freightTerm: ['To Pay', 'Paid'].includes(freightTerm) ? freightTerm : 'To Pay',
      packing,
      dispatchDate: todayISODate(),
    });

    for (const pi of touchedPIs.values()) {
      const allDone = pi.lines.every((l) => (l.pending != null ? l.pending : l.pcs) === 0);
      pi.status = allDone ? 'Fully Dispatched' : 'Partial Dispatched';
      await pi.save();
    }

    const invByCode = {};
    dispatchLines.forEach((l) => { invByCode[l.code] = (invByCode[l.code] || 0) + l.pcs; });
    for (const [code, pcs] of Object.entries(invByCode)) {
      await Inventory.findOneAndUpdate({ code }, { $inc: { physical: -pcs, reserved: -pcs } });
    }

    await Ledger.create({
      date: todayISODate(), dealer: dealer.code, type: 'Invoice', ref: invoice.no,
      debit: grand, credit: 0, note: `Dispatched from confirmed order pool (cleared ${[...touchedPIs.keys()].join(', ')})`,
    });
    await notifyDispatched(invoice);

    res.status(201).json({ invoice });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// POST /api/dispatch/manual
// body: { dealerCode, lines: [{code, pcs}], transporter, freight?, cartonMap: [...] }
// Dispatches without any PI. Tax Invoice generated the same way; piRef left blank.
async function dispatchManual(req, res) {
  try {
    const { dealerCode, lines: inputLines, transporter, vehicle, lr, eway, driver, freight, freightTerm, cartonMap } = req.body;
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

    if (!req.body.force) {
      const shortages = await checkPhysicalShortages(dispatchLines);
      if (shortages.length) {
        const detail = shortages.map((s) => `${s.name} — dispatching ${s.requested}, only ${s.physical} physically in stock`).join('; ');
        return res.status(409).json({ message: `Physical stock shortfall: ${detail}. Confirm to dispatch anyway.`, shortages });
      }
    }

    const subtotal = dispatchLines.reduce((s, l) => s + l.total, 0);
    const frt = +freight || 0;
    const grand = subtotal + frt;
    const packing = await buildPackingFromCartonMap(cartonMap);

    // A manual dispatch used to leave no paper trail beyond the invoice — now
    // it also creates a matching PI (already fully dispatched, since every
    // line here is dispatched in this same action), so every dispatch has a
    // proper order record behind it, same as one that started from the Dispatch queue.
    const piCount = await PI.countDocuments();
    const piNo = 'PI-' + new Date().toISOString().slice(2, 7).replace('-', '') + '-' + String(piCount + 1).padStart(4, '0');
    const autoPI = await PI.create({
      no: piNo,
      dealer: dealer.code,
      dealerName: dealer.name,
      lines: dispatchLines.map((l) => ({ ...l, pending: 0 })), // fully dispatched immediately — nothing left pending
      subtotal,
      transport: frt,
      freightTerm: ['To Pay', 'Paid'].includes(freightTerm) ? freightTerm : 'To Pay',
      total: grand,
      status: 'Fully Dispatched',
      by: dealer.assignedTo || req.user.name,
      createdBy: req.user._id,
      remark: 'Auto-created from a manual dispatch (booked without an existing PI).',
    });

    const invoice = await Invoice.create({
      no: await nextInvoiceNo(),
      date: todayISODate(),
      dealer: dealer.code,
      dealerName: dealer.name,
      piRef: autoPI.no,
      manual: true,
      lines: dispatchLines,
      subtotal, transport: frt, total: grand,
      status: 'Dispatched',
      by: dealer.assignedTo || req.user.name,
      createdBy: req.user._id,
      transporter, vehicle: vehicle || '', lr: lr || '', eway: eway || '', driver: driver || '',
      cartons: cartonMap.length,
      freight: frt,
    freightTerm: ['To Pay', 'Paid'].includes(freightTerm) ? freightTerm : 'To Pay',
      packing,
      dispatchDate: todayISODate(),
    });

    for (const dl of dispatchLines) {
      await Inventory.findOneAndUpdate({ code: dl.code }, { $inc: { physical: -dl.pcs } }, { upsert: true });
    }

    await Ledger.create({
      date: todayISODate(), dealer: dealer.code, type: 'Invoice', ref: invoice.no,
      debit: grand, credit: 0, note: `Manual dispatch — auto-created ${autoPI.no}`,
    });
    await notifyDispatched(invoice);

    res.status(201).json({ invoice, pi: autoPI });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// GET /api/dispatch/pending-pis  - dealer's pending PI suggestion for manual dispatch screen
async function pendingPIForDealer(req, res) {
  const pi = await PI.findOne({ dealer: req.params.dealerCode, status: { $in: ['Confirmed', 'Partial Dispatched'] } });
  res.json(pi || null);
}

module.exports = { dispatchManual, pendingPIForDealer, getCustomerPool, dispatchFromPool, getPendingOverview, holdDealer, unholdDealer };
