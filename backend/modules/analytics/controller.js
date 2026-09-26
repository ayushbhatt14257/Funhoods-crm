const jwt = require('jsonwebtoken');
const PI = require('../pi/model');
const Invoice = require('../invoices/model');
const Dealer = require('../dealers/model');
const Product = require('../products/model');
const CartonBarcode = require('../inventory/cartonBarcodeModel');
const { verifyFirebaseIdToken } = require('../../config/firebaseAdmin');

// Same India-only normalization used in auth/controller.js (kept identical
// on purpose — a mismatch here would make an otherwise-valid OTP fail).
function toLocalMobile(e164) {
  const digits = e164.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return digits.slice(2);
  return digits.slice(-10);
}

// POST /api/analytics/verify-otp  { idToken }
// Runs behind the normal protect + allow('masterAdmin') chain — this only
// ever issues a session for whichever account is ALREADY logged in via the
// regular JWT, never for an arbitrary phone number someone happens to
// control. The Firebase idToken must verify to THIS SAME account's own
// registered mobile — otherwise a different, unrelated phone number's OTP
// could be used to unlock analytics access for someone else's account.
async function verifyOtp(req, res) {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ message: 'idToken required' });
    if (!req.user.analyticsAccess) {
      return res.status(403).json({ message: 'This account does not have Analysis access. Ask a masterAdmin to enable it on the Users page.' });
    }

    const phoneE164 = await verifyFirebaseIdToken(idToken);
    const mobile = toLocalMobile(phoneE164);
    if (mobile !== req.user.mobile) {
      return res.status(401).json({ message: "The verified phone number doesn't match this account's registered mobile." });
    }

    const token = jwt.sign({ id: req.user._id, analytics: true }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, expiresInHours: 24 });
  } catch (err) {
    res.status(401).json({ message: err.message || 'OTP verification failed' });
  }
}

// ---- shared helpers ----

function monthKey(d) { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; }
function daysBetween(a, b) { return Math.floor((new Date(a) - new Date(b)) / (1000 * 60 * 60 * 24)); }
function monthsBack(n) { const x = new Date(); x.setDate(1); x.setHours(0, 0, 0, 0); x.setMonth(x.getMonth() - n); return x; }

// GET /api/analytics/sales?months=12
// Section A — Order & Sales Patterns. All computed from real Invoices
// (actual dispatched sales), not PIs (orders placed but not necessarily
// fulfilled) — "repeat item"/"order size"/"seasonality" are all about what
// actually shipped, not what was merely requested.
async function sales(req, res) {
  const months = Math.min(36, Math.max(1, +req.query.months || 12));
  const since = monthsBack(months);
  const invoices = await Invoice.find({ status: { $ne: 'Cancelled' }, createdAt: { $gte: since } })
    .select('dealer dealerName lines cartons total createdAt').lean();

  // Repeat item count — distinct invoices each SKU appears on, most-ordered first.
  const skuInvoiceCount = {};
  const skuName = {};
  invoices.forEach((inv) => {
    const seen = new Set();
    inv.lines.forEach((l) => {
      if (seen.has(l.code)) return;
      seen.add(l.code);
      skuInvoiceCount[l.code] = (skuInvoiceCount[l.code] || 0) + 1;
      skuName[l.code] = l.name;
    });
  });
  const repeatItems = Object.entries(skuInvoiceCount)
    .map(([code, count]) => ({ code, name: skuName[code], invoiceCount: count }))
    .sort((a, b) => b.invoiceCount - a.invoiceCount)
    .slice(0, 20);

  // All-time total pcs dispatched per SKU — the SAME "Dispatched (all-time)"
  // figure already shown on the Products page (products/controller.js
  // dispatchedTotals), deliberately unbounded by the months filter above:
  // this is a lifetime figure, not a windowed one, so it stays the same
  // number whether you're looking at the 3mo or 24mo view.
  const allTimeTotals = await Invoice.aggregate([
    { $match: { status: { $ne: 'Cancelled' }, 'lines.code': { $in: repeatItems.map((r) => r.code) } } },
    { $unwind: '$lines' },
    { $match: { 'lines.code': { $in: repeatItems.map((r) => r.code) } } },
    { $group: { _id: '$lines.code', total: { $sum: '$lines.pcs' } } },
  ]);
  const allTimePcsByCode = Object.fromEntries(allTimeTotals.map((r) => [r._id, r.total]));
  // Same preCrmDispatched baseline as the Products page's "Dispatched
  // (all-time)" figure (see products/controller.js dispatchedTotals) —
  // REPLACES the CRM-computed figure rather than adding to it, since the
  // imported number (e.g. from a Tally export) is treated as the already-
  // complete, correct all-time total, not an addition on top of what this
  // CRM separately tracked for an overlapping period.
  const baselineByCode = Object.fromEntries(
    (await Product.find({ code: { $in: repeatItems.map((r) => r.code) }, preCrmDispatched: { $gt: 0 } }).select('code preCrmDispatched').lean())
      .map((p) => [p.code, p.preCrmDispatched])
  );
  repeatItems.forEach((r) => { r.pcsAllTime = baselineByCode[r.code] ?? (allTimePcsByCode[r.code] || 0); });

  // Dealer order frequency per month — how many invoices per dealer per month, averaged.
  const dealerMonthCounts = {}; // dealer -> Set of month keys they ordered in
  const dealerTotalOrders = {};
  invoices.forEach((inv) => {
    dealerMonthCounts[inv.dealer] = dealerMonthCounts[inv.dealer] || new Set();
    dealerMonthCounts[inv.dealer].add(monthKey(inv.createdAt));
    dealerTotalOrders[inv.dealer] = (dealerTotalOrders[inv.dealer] || 0) + 1;
  });
  const activeMonthsInWindow = Math.max(1, months);
  const dealerFrequency = Object.keys(dealerTotalOrders)
    .map((code) => ({
      dealer: code,
      totalOrders: dealerTotalOrders[code],
      ordersPerMonth: +(dealerTotalOrders[code] / activeMonthsInWindow).toFixed(2),
      monthsActive: dealerMonthCounts[code].size,
    }))
    .sort((a, b) => b.ordersPerMonth - a.ordersPerMonth)
    .slice(0, 30);

  // City/state-wise order volume — join dealer.city/state onto invoice revenue.
  const dealerCodes = [...new Set(invoices.map((i) => i.dealer))];
  const dealerLoc = Object.fromEntries(
    (await Dealer.find({ code: { $in: dealerCodes } }).select('code city state')).map((d) => [d.code, { city: d.city || 'Unknown', state: d.state || 'Unknown' }])
  );
  const byLocation = {};
  invoices.forEach((inv) => {
    const loc = dealerLoc[inv.dealer] || { city: 'Unknown', state: 'Unknown' };
    const key = `${loc.city}, ${loc.state}`;
    byLocation[key] = byLocation[key] || { city: loc.city, state: loc.state, orders: 0, revenue: 0 };
    byLocation[key].orders += 1;
    byLocation[key].revenue += inv.total;
  });
  const locationVolume = Object.values(byLocation).sort((a, b) => b.revenue - a.revenue);

  // New vs. repeat dealer split — % of each month's revenue from a dealer
  // whose FIRST EVER invoice (all-time, not just within this window) falls
  // in that same month, vs. a dealer who'd already ordered before.
  const firstInvoiceDate = {};
  const allInvoicesForFirstOrder = await Invoice.find({ status: { $ne: 'Cancelled' } }).select('dealer createdAt').sort({ createdAt: 1 }).lean();
  allInvoicesForFirstOrder.forEach((inv) => {
    if (!firstInvoiceDate[inv.dealer]) firstInvoiceDate[inv.dealer] = inv.createdAt;
  });
  const newVsRepeatByMonth = {};
  invoices.forEach((inv) => {
    const mk = monthKey(inv.createdAt);
    newVsRepeatByMonth[mk] = newVsRepeatByMonth[mk] || { month: mk, newRevenue: 0, repeatRevenue: 0 };
    const isFirstMonth = monthKey(firstInvoiceDate[inv.dealer]) === mk;
    if (isFirstMonth) newVsRepeatByMonth[mk].newRevenue += inv.total;
    else newVsRepeatByMonth[mk].repeatRevenue += inv.total;
  });
  const newVsRepeat = Object.values(newVsRepeatByMonth).sort((a, b) => a.month.localeCompare(b.month));

  // Order size trend — avg cartons and avg pcs per invoice, by month.
  const sizeByMonth = {};
  invoices.forEach((inv) => {
    const mk = monthKey(inv.createdAt);
    sizeByMonth[mk] = sizeByMonth[mk] || { month: mk, orders: 0, totalCartons: 0, totalPcs: 0 };
    sizeByMonth[mk].orders += 1;
    sizeByMonth[mk].totalCartons += inv.cartons || 0;
    sizeByMonth[mk].totalPcs += inv.lines.reduce((s, l) => s + (l.pcs || 0), 0);
  });
  const orderSizeTrend = Object.values(sizeByMonth)
    .map((r) => ({ month: r.month, avgCartons: +(r.totalCartons / r.orders).toFixed(1), avgPcs: +(r.totalPcs / r.orders).toFixed(1), orders: r.orders }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Seasonality — pcs sold per product per month (top 8 products by total volume, to keep this readable).
  const productMonthPcs = {}; // code -> month -> pcs
  const productTotal = {};
  invoices.forEach((inv) => {
    const mk = monthKey(inv.createdAt);
    inv.lines.forEach((l) => {
      productMonthPcs[l.code] = productMonthPcs[l.code] || {};
      productMonthPcs[l.code][mk] = (productMonthPcs[l.code][mk] || 0) + (l.pcs || 0);
      productTotal[l.code] = (productTotal[l.code] || 0) + (l.pcs || 0);
    });
  });
  const topProducts = Object.entries(productTotal).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([code]) => code);
  const seasonality = topProducts.map((code) => ({
    code, name: skuName[code] || code,
    byMonth: productMonthPcs[code],
  }));

  res.json({ repeatItems, dealerFrequency, locationVolume, newVsRepeat, orderSizeTrend, seasonality });
}

// GET /api/analytics/dealers?dormantDays=60&dealer=CODE
// Section B — Dealer Intelligence.
async function dealerIntel(req, res) {
  const dormantDays = Math.max(1, +req.query.dormantDays || 60);
  const invoices = await Invoice.find({ status: { $ne: 'Cancelled' } }).select('dealer dealerName total lines createdAt').lean();
  const dealers = await Dealer.find({ active: true }).select('code name city state assignedTo').lean();
  const dealerByCode = Object.fromEntries(dealers.map((d) => [d.code, d]));

  const revenueByDealer = {};
  const lastOrderByDealer = {};
  const productsByDealer = {}; // dealer -> Set of product codes
  invoices.forEach((inv) => {
    revenueByDealer[inv.dealer] = (revenueByDealer[inv.dealer] || 0) + inv.total;
    if (!lastOrderByDealer[inv.dealer] || inv.createdAt > lastOrderByDealer[inv.dealer]) lastOrderByDealer[inv.dealer] = inv.createdAt;
    productsByDealer[inv.dealer] = productsByDealer[inv.dealer] || new Set();
    inv.lines.forEach((l) => productsByDealer[inv.dealer].add(l.code));
  });

  const totalRevenue = Object.values(revenueByDealer).reduce((s, v) => s + v, 0) || 1;
  const ranking = Object.entries(revenueByDealer)
    .map(([code, revenue]) => ({
      code, name: dealerByCode[code]?.name || revenue.dealerName || code,
      revenue, pctOfTotal: +((revenue / totalRevenue) * 100).toFixed(1),
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const top10Pct = +(ranking.slice(0, 10).reduce((s, r) => s + r.revenue, 0) / totalRevenue * 100).toFixed(1);

  const now = new Date();
  const dormant = Object.entries(lastOrderByDealer)
    .filter(([, lastDate]) => daysBetween(now, lastDate) >= dormantDays)
    .map(([code, lastDate]) => ({ code, name: dealerByCode[code]?.name || code, lastOrderAt: lastDate, daysSince: daysBetween(now, lastDate) }))
    .sort((a, b) => b.daysSince - a.daysSince);

  // Dealer-wise product mix (cross-sell gap) — only computed for one dealer
  // at a time, via ?dealer=CODE, since "full catalog minus what they bought"
  // for every dealer at once would be a huge, mostly-unread response.
  let productMix = null;
  if (req.query.dealer) {
    const code = req.query.dealer.toUpperCase();
    const bought = productsByDealer[code] || new Set();
    const allProducts = await Product.find({ active: { $ne: false } }).select('code name').lean();
    productMix = {
      dealer: code,
      bought: allProducts.filter((p) => bought.has(p.code)),
      notBought: allProducts.filter((p) => !bought.has(p.code)),
    };
  }

  res.json({ ranking: ranking.slice(0, 50), top10ConcentrationPct: top10Pct, dormant, productMix });
}

// GET /api/analytics/inventory
// Section C — Inventory & Batch. All grouped by product AND kept
// outer/inner SEPARATE throughout — never blended into one merged number,
// same rule as everywhere else in the barcode system.
async function inventoryAnalytics(req, res) {
  const products = await Product.find({ active: { $ne: false } }).select('code name rate').lean();
  const productByCode = Object.fromEntries(products.map((p) => [p.code, p]));

  const cartons = await CartonBarcode.find().select('product kind status qty batchId createdAt usedAt dispatchedAt').lean();

  // Batch sell-through & stock age by batch — grouped by product + calendar
  // month of the batch's own creation (batches are already effectively
  // month-tagged by when they were generated).
  const byProductMonth = {}; // `${product}|${month}` -> { outerTotal, outerDispatched, innerTotal, innerDispatched, oldestInStock }
  cartons.forEach((c) => {
    const mk = monthKey(c.createdAt);
    const key = `${c.product}|${mk}`;
    byProductMonth[key] = byProductMonth[key] || {
      product: c.product, month: mk,
      outerTotal: 0, outerDispatched: 0, innerTotal: 0, innerDispatched: 0,
    };
    const bucket = byProductMonth[key];
    const isInner = c.kind === 'inner';
    if (isInner) {
      bucket.innerTotal += 1;
      if (c.status === 'dispatched') bucket.innerDispatched += 1;
    } else {
      bucket.outerTotal += 1;
      if (c.status === 'dispatched') bucket.outerDispatched += 1;
    }
  });
  const batchSellThrough = Object.values(byProductMonth)
    .map((b) => ({
      ...b, name: productByCode[b.product]?.name || b.product,
      outerSellThroughPct: b.outerTotal ? +((b.outerDispatched / b.outerTotal) * 100).toFixed(1) : null,
      innerSellThroughPct: b.innerTotal ? +((b.innerDispatched / b.innerTotal) * 100).toFixed(1) : null,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Stock age — oldest still in-stock carton per product, separately for outer/inner.
  const oldestByProduct = {};
  cartons.filter((c) => ['in_stock', 'used'].includes(c.status)).forEach((c) => {
    oldestByProduct[c.product] = oldestByProduct[c.product] || { outer: null, inner: null };
    const kindKey = c.kind === 'inner' ? 'inner' : 'outer';
    if (!oldestByProduct[c.product][kindKey] || c.createdAt < oldestByProduct[c.product][kindKey]) {
      oldestByProduct[c.product][kindKey] = c.createdAt;
    }
  });
  const now = new Date();
  const stockAge = Object.entries(oldestByProduct)
    .map(([code, ages]) => ({
      code, name: productByCode[code]?.name || code,
      oldestOuterDays: ages.outer ? daysBetween(now, ages.outer) : null,
      oldestInnerDays: ages.inner ? daysBetween(now, ages.inner) : null,
    }))
    .sort((a, b) => (b.oldestOuterDays || 0) - (a.oldestOuterDays || 0));

  // Split/loose stock visibility — live in-stock inner cartons by SKU (this
  // is exactly what dispatch should check before splitting a fresh outer).
  const looseStock = {};
  cartons.filter((c) => c.kind === 'inner' && ['in_stock', 'used'].includes(c.status)).forEach((c) => {
    looseStock[c.product] = looseStock[c.product] || { count: 0, totalPcs: 0 };
    looseStock[c.product].count += 1;
    looseStock[c.product].totalPcs += c.qty;
  });
  const looseStockList = Object.entries(looseStock)
    .map(([code, v]) => ({ code, name: productByCode[code]?.name || code, innerCartons: v.count, pcs: v.totalPcs }))
    .sort((a, b) => b.pcs - a.pcs);

  // Stockout frequency & duration — reconstructed from actual carton
  // events (stock-in and dispatch timestamps), replayed in chronological
  // order per product, tracking a running physical-pcs total. This is a
  // best-effort reconstruction, not an exact log — its accuracy depends on
  // every carton's own scan having actually happened when it should have.
  const eventsByProduct = {};
  cartons.forEach((c) => {
    eventsByProduct[c.product] = eventsByProduct[c.product] || [];
    if (c.usedAt) eventsByProduct[c.product].push({ at: c.usedAt, delta: +c.qty });
    if (c.dispatchedAt) eventsByProduct[c.product].push({ at: c.dispatchedAt, delta: -c.qty });
  });
  const stockouts = [];
  Object.entries(eventsByProduct).forEach(([code, events]) => {
    events.sort((a, b) => new Date(a.at) - new Date(b.at));
    let running = 0, outSince = null, count = 0, totalDays = 0;
    events.forEach((e) => {
      running += e.delta;
      if (running <= 0 && outSince === null) outSince = e.at;
      if (running > 0 && outSince !== null) {
        count += 1;
        totalDays += Math.max(0, daysBetween(e.at, outSince));
        outSince = null;
      }
    });
    if (outSince !== null) { count += 1; totalDays += Math.max(0, daysBetween(now, outSince)); } // still out right now
    if (count > 0) {
      const rate = productByCode[code]?.rate || 0;
      // Revenue-lost estimate: this SKU's historical avg daily pcs sold
      // (from dispatched cartons overall) × days out of stock × rate —
      // an ESTIMATE of demand that couldn't be met, not an exact figure.
      const dispatchedEvents = events.filter((e) => e.delta < 0);
      const spanDays = dispatchedEvents.length ? Math.max(1, daysBetween(now, dispatchedEvents[0].at)) : 1;
      const totalDispatchedPcs = dispatchedEvents.reduce((s, e) => s - e.delta, 0);
      const avgDailyPcs = totalDispatchedPcs / spanDays;
      const estimatedRevenueLost = Math.round(avgDailyPcs * totalDays * rate);
      stockouts.push({ code, name: productByCode[code]?.name || code, timesOutOfStock: count, totalDaysOut: totalDays, currentlyOut: running <= 0, estimatedRevenueLost });
    }
  });
  stockouts.sort((a, b) => b.estimatedRevenueLost - a.estimatedRevenueLost);

  res.json({ batchSellThrough, stockAge, looseStockList, stockouts });
}

// GET /api/analytics/financial
// Section D — Financial/Collections. CAVEAT (surfaced in the response, not
// just this comment): Invoice.paymentReceived is a plain true/false, no
// partial-payment amount — a dealer who's paid HALF of an invoice still
// shows as fully "unpaid" here. So "Outstanding" below is an UPPER BOUND
// (the full invoice total counts as outstanding until the whole thing is
// marked paid), and ageing/DSO inherit the same caveat.
async function financial(req, res) {
  const unpaid = await Invoice.find({ paymentReceived: false, status: { $ne: 'Cancelled' } })
    .select('dealer dealerName total dispatchDate createdAt').lean();
  const now = new Date();

  const buckets = { '0-30': 0, '30-60': 0, '60+': 0 };
  const byDealer = {};
  unpaid.forEach((inv) => {
    const days = daysBetween(now, inv.dispatchDate || inv.createdAt);
    if (days <= 30) buckets['0-30'] += inv.total;
    else if (days <= 60) buckets['30-60'] += inv.total;
    else buckets['60+'] += inv.total;

    byDealer[inv.dealer] = byDealer[inv.dealer] || { dealer: inv.dealer, name: inv.dealerName, outstanding: 0, oldestDays: 0, invoiceCount: 0 };
    byDealer[inv.dealer].outstanding += inv.total;
    byDealer[inv.dealer].invoiceCount += 1;
    byDealer[inv.dealer].oldestDays = Math.max(byDealer[inv.dealer].oldestDays, days);
  });
  const outstandingByDealer = Object.values(byDealer).sort((a, b) => b.outstanding - a.outstanding);

  // DSO trend, standard formula per month: (Accounts Receivable at month end
  // / that month's total dispatched revenue) × days in that month.
  const months = 6;
  const since = monthsBack(months);
  const allInvoices = await Invoice.find({ status: { $ne: 'Cancelled' }, createdAt: { $gte: since } })
    .select('total paymentReceived dispatchDate createdAt').lean();
  const dsoTrend = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = monthsBack(i);
    const end = monthsBack(i - 1);
    const daysInMonth = daysBetween(end, start);
    const monthInvoices = allInvoices.filter((inv) => inv.createdAt >= start && inv.createdAt < end);
    const monthRevenue = monthInvoices.reduce((s, inv) => s + inv.total, 0);
    const arAtMonthEnd = allInvoices
      .filter((inv) => !inv.paymentReceived && inv.createdAt < end)
      .reduce((s, inv) => s + inv.total, 0);
    const dso = monthRevenue > 0 ? +((arAtMonthEnd / monthRevenue) * daysInMonth).toFixed(1) : null;
    dsoTrend.push({ month: monthKey(start), dso, revenue: monthRevenue, receivables: arAtMonthEnd });
  }

  res.json({
    caveat: "Invoice payment is tracked as paid/unpaid only (no partial-payment amount) — figures below are an upper bound wherever a partial payment has been made against an invoice still marked unpaid.",
    ageingBuckets: buckets, outstandingByDealer, dsoTrend,
  });
}

// GET /api/analytics/ops
// Section E — Ops/Dispatch.
async function ops(req, res) {
  const months = 6;
  const since = monthsBack(months);
  const invoices = await Invoice.find({ status: { $ne: 'Cancelled' }, createdAt: { $gte: since } })
    .select('by total piRef dispatchDate createdAt').lean();

  // mhead-wise performance — revenue + invoice count grouped by the
  // dealer's assigned salesperson (`by`), same field used on the documents.
  const byRep = {};
  invoices.forEach((inv) => {
    const rep = inv.by || 'Unassigned';
    byRep[rep] = byRep[rep] || { rep, invoices: 0, revenue: 0 };
    byRep[rep].invoices += 1;
    byRep[rep].revenue += inv.total;
  });
  const repPerformance = Object.values(byRep).sort((a, b) => b.revenue - a.revenue);

  // Dispatch turnaround: invoice.createdAt - invoice.dispatchDate. Since
  // Invoice is created automatically the instant a dispatch is committed,
  // this should come out at (or very near) zero — that's the expected,
  // correct result now, confirming the auto-invoice step isn't a
  // bottleneck, not a sign something's broken.
  const turnaroundHours = invoices
    .filter((inv) => inv.dispatchDate)
    .map((inv) => (new Date(inv.createdAt) - new Date(inv.dispatchDate)) / 3600000);
  const avgTurnaroundHours = turnaroundHours.length ? +(turnaroundHours.reduce((s, h) => s + h, 0) / turnaroundHours.length).toFixed(2) : null;

  // Order-to-dispatch lag: PI confirmedAt -> Invoice dispatchDate, for every
  // invoice that actually references a PI (manual/no-PI dispatches have no lag to measure).
  const piRefs = [...new Set(invoices.map((i) => i.piRef).filter(Boolean))];
  const pis = await PI.find({ no: { $in: piRefs } }).select('no confirmedAt').lean();
  const confirmedAtByPi = Object.fromEntries(pis.map((p) => [p.no, p.confirmedAt]));
  const lagDaysList = invoices
    .filter((inv) => inv.piRef && confirmedAtByPi[inv.piRef] && inv.dispatchDate)
    .map((inv) => daysBetween(inv.dispatchDate, confirmedAtByPi[inv.piRef]));
  const avgOrderToDispatchDays = lagDaysList.length ? +(lagDaysList.reduce((s, d) => s + d, 0) / lagDaysList.length).toFixed(1) : null;

  res.json({ repPerformance, avgTurnaroundHours, avgOrderToDispatchDays, sampleSize: lagDaysList.length });
}

module.exports = { verifyOtp, sales, dealerIntel, inventoryAnalytics, financial, ops };
