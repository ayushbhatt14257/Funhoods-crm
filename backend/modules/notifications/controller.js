const Notification = require('./model');
const Invoice = require('../invoices/model');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// There's no cron/scheduler in this stack, so both of these "overdue" checks
// run lazily every time the notification list/count is requested (cheap at
// this dispatch volume), deduped by (type, relatedNo) so each event notifies once.

// "Dispatched 7+ days, still not marked delivered" — founder-only.
async function generateDispatchOverdueNotifications() {
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
  const overdue = await Invoice.find({ status: 'Dispatched', dispatchDate: { $lte: cutoff } });
  for (const inv of overdue) {
    const exists = await Notification.findOne({ type: 'dispatch_overdue', relatedNo: inv.no });
    if (exists) continue;
    await Notification.create({
      type: 'dispatch_overdue',
      message: `${inv.no} (${inv.dealerName}) was dispatched ${Math.floor((Date.now() - new Date(inv.dispatchDate)) / 86400000)} days ago by ${inv.by || 'unknown'} and still isn't marked delivered.`,
      relatedNo: inv.no,
      relatedKind: 'invoice',
      byUser: inv.by || '',
      forRole: 'founder',
    });
  }
}

// "Invoiced 30+ days ago, payment not marked received" — accounts + founder.
async function generatePaymentDueNotifications() {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
  const overdue = await Invoice.find({
    status: { $ne: 'Cancelled' },
    paymentReceived: false,
    dispatchDate: { $lte: cutoff },
  });
  for (const inv of overdue) {
    const exists = await Notification.findOne({ type: 'payment_due', relatedNo: inv.no });
    if (exists) continue;
    const days = Math.floor((Date.now() - new Date(inv.dispatchDate)) / 86400000);
    await Notification.create({
      type: 'payment_due',
      message: `Payment pending for ${inv.no} (${inv.dealerName}) — ${days} days since dispatch, ₹${Math.round(inv.total).toLocaleString('en-IN')} due.`,
      relatedNo: inv.no,
      relatedKind: 'invoice',
      forRole: 'accounts',
    });
    await Notification.create({
      type: 'payment_due',
      message: `Payment pending for ${inv.no} (${inv.dealerName}) — ${days} days since dispatch, ₹${Math.round(inv.total).toLocaleString('en-IN')} due.`,
      relatedNo: inv.no,
      relatedKind: 'invoice',
      forRole: 'founder',
    });
  }
}

async function generateAll(role) {
  if (role === 'founder') {
    await generateDispatchOverdueNotifications();
    await generatePaymentDueNotifications();
  } else if (role === 'accounts') {
    await generatePaymentDueNotifications();
  }
}

// A notification reaches a user if it's targeted at their role, OR at their
// name specifically (dispatched/delivered notifications go to the one person
// who owns that invoice, not the whole role).
function visibilityFilter(user) {
  return { $or: [{ forRole: user.role }, { forUserName: user.name }] };
}

// GET /api/notifications
async function list(req, res) {
  await generateAll(req.user.role);
  const items = await Notification.find(visibilityFilter(req.user)).sort({ createdAt: -1 }).limit(80);
  res.json(items);
}

// GET /api/notifications/unread-count
async function unreadCount(req, res) {
  await generateAll(req.user.role);
  const count = await Notification.countDocuments({ ...visibilityFilter(req.user), read: false });
  res.json({ count });
}

async function markRead(req, res) {
  const item = await Notification.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
  if (!item) return res.status(404).json({ message: 'Not found' });
  res.json(item);
}

async function markAllRead(req, res) {
  await Notification.updateMany({ ...visibilityFilter(req.user), read: false }, { read: true });
  res.json({ message: 'All marked read' });
}

module.exports = { list, unreadCount, markRead, markAllRead };
