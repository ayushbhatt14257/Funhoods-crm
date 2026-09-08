const PI = require('../pi/model');
const Invoice = require('../invoices/model');
const Dealer = require('../dealers/model');
const Ledger = require('../ledger/model');

const OPEN_PI_STATUSES = ['Sent', 'Confirmed', 'Partial Dispatched']; // matches the existing "Open PIs" stat definition exactly (Draft doesn't count as "open" here, even though it still gets its own kanban column)

// Master Admin sees the whole company; every other role sees only their own
// assigned dealers' numbers on the dashboard.
async function dealerScope(user) {
  if (user.role === 'masterAdmin') return null; // null = no scoping
  const myDealers = await Dealer.find({ assignedTo: user.name }).select('code');
  return myDealers.map((d) => d.code);
}

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function startOfMonth(d) { const x = new Date(d); x.setDate(1); x.setHours(0, 0, 0, 0); return x; }

// GET /api/dashboard/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&all=1
//
// The dashboard used to fetch every PI and every Invoice ever created just
// to add up a handful of numbers client-side. That's fine at a few hundred
// records; it stops being fine once there are lakhs of them. This computes
// the same numbers with MongoDB aggregation/count — the database does the
// counting and summing, and only the final numbers cross the network.
//
// `from`/`to` scope the period-based numbers (Open PIs, Pipeline ₹, Open
// Invoices, Invoiced ₹) — defaults to the current month if not given.
// `all=1` drops the date filter entirely (all-time totals, no range).
// Today's Orders/Dispatch are always literally today, regardless of the
// selected range — they're a real-time pulse, not a period figure.
// Outstanding ₹ is always the live running balance (a balance is always
// "as of now", not something a date range narrows).
async function summary(req, res) {
  const scopedCodes = await dealerScope(req.user);
  const dealerFilter = scopedCodes ? { dealer: { $in: scopedCodes } } : {};

  const now = new Date();
  const showAll = req.query.all === '1';
  const from = req.query.from ? startOfDay(req.query.from) : startOfMonth(now);
  const to = req.query.to ? endOfDay(req.query.to) : endOfDay(now);
  const rangeFilter = showAll ? {} : { createdAt: { $gte: from, $lte: to } };

  const todayFilter = { createdAt: { $gte: startOfDay(now), $lte: endOfDay(now) } };

  const [
    openPIs, pipelineAgg, openInvoices, invoicedAgg,
    todayOrdersCount, todayOrdersAgg,
    todayDispatchCount, todayDispatchAgg,
    scopedDealers,
  ] = await Promise.all([
    PI.countDocuments({ ...dealerFilter, ...rangeFilter, status: { $in: OPEN_PI_STATUSES } }),
    PI.aggregate([
      { $match: { ...dealerFilter, ...rangeFilter, status: { $in: OPEN_PI_STATUSES } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    Invoice.countDocuments({ ...dealerFilter, ...rangeFilter, status: { $nin: ['Delivered', 'Cancelled'] } }),
    Invoice.aggregate([
      { $match: { ...dealerFilter, ...rangeFilter, status: { $ne: 'Cancelled' } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    PI.countDocuments({ ...dealerFilter, ...todayFilter }),
    PI.aggregate([{ $match: { ...dealerFilter, ...todayFilter } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
    Invoice.countDocuments({ ...dealerFilter, ...todayFilter, status: { $ne: 'Cancelled' } }),
    Invoice.aggregate([{ $match: { ...dealerFilter, ...todayFilter, status: { $ne: 'Cancelled' } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
    scopedCodes ? Dealer.find({ code: { $in: scopedCodes } }).select('code') : Dealer.find().select('code'),
  ]);

  // Outstanding — sum of each (scoped) dealer's running ledger balance, live as of now.
  const dealerCodes = scopedDealers.map((d) => d.code);
  const ledgerRows = await Ledger.aggregate([
    { $match: { dealer: { $in: dealerCodes } } },
    { $group: { _id: '$dealer', balance: { $sum: { $subtract: ['$debit', '$credit'] } } } },
  ]);
  const outstanding = ledgerRows.reduce((s, r) => s + r.balance, 0);

  res.json({
    openPIs,
    pipeline: pipelineAgg[0]?.total || 0,
    openInvoices,
    invoicedTotal: invoicedAgg[0]?.total || 0,
    outstanding,
    todayOrders: { count: todayOrdersCount, amount: todayOrdersAgg[0]?.total || 0 },
    todayDispatch: { count: todayDispatchCount, amount: todayDispatchAgg[0]?.total || 0 },
    range: showAll ? { all: true } : { from: from.toISOString(), to: to.toISOString() },
  });
}

module.exports = { summary };
