const PI = require('../pi/model');
const Invoice = require('../invoices/model');
const Dealer = require('../dealers/model');

const OPEN_PI_STATUSES = ['Sent', 'Confirmed', 'Partial Dispatched']; // matches the existing "Open PIs" stat definition exactly (Draft doesn't count as "open" here, even though it still gets its own kanban column)

// field/mhead only ever see their own dealers' data elsewhere in the app —
// the dashboard numbers need to match that scoping, not show company-wide totals.
async function dealerScope(user) {
  if (!['field', 'mhead'].includes(user.role)) return null; // null = no scoping (everyone else sees everything)
  const myDealers = await Dealer.find({ assignedTo: user.name }).select('code');
  return myDealers.map((d) => d.code);
}

// GET /api/dashboard/summary
//
// The dashboard used to fetch every PI and every Invoice ever created just
// to add up a handful of numbers client-side. That's fine at a few hundred
// records; it stops being fine once there are lakhs of them. This computes
// the same numbers with MongoDB aggregation/count — the database does the
// counting and summing, and only five numbers cross the network.
async function summary(req, res) {
  const scopedCodes = await dealerScope(req.user);
  const dealerFilter = scopedCodes ? { dealer: { $in: scopedCodes } } : {};

  const [openPIs, pipelineAgg, openInvoices, invoicedAgg] = await Promise.all([
    PI.countDocuments({ ...dealerFilter, status: { $in: OPEN_PI_STATUSES } }),
    PI.aggregate([
      { $match: { ...dealerFilter, status: { $in: OPEN_PI_STATUSES } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    Invoice.countDocuments({ ...dealerFilter, status: { $nin: ['Delivered', 'Cancelled'] } }),
    Invoice.aggregate([
      { $match: { ...dealerFilter, status: { $ne: 'Cancelled' } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
  ]);

  res.json({
    openPIs,
    pipeline: pipelineAgg[0]?.total || 0,
    openInvoices,
    invoicedTotal: invoicedAgg[0]?.total || 0,
  });
}

module.exports = { summary };
