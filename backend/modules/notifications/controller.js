const Notification = require('./model');
const Invoice = require('../invoices/model');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Lazily generates "dispatched 7+ days, not delivered" notifications — there's no
// cron/scheduler in this stack, so we check for overdue dispatches every time the
// notification list is requested, and create one record per invoice (deduped by
// relatedNo) the first time it's seen. Cheap enough to run on every list() call
// since dispatch volume is small.
async function generateDispatchOverdueNotifications() {
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
  const overdue = await Invoice.find({
    status: 'Dispatched',
    dispatchDate: { $lte: cutoff },
  });

  for (const inv of overdue) {
    const exists = await Notification.findOne({ type: 'dispatch_overdue', relatedNo: inv.no });
    if (exists) continue;
    await Notification.create({
      type: 'dispatch_overdue',
      message: `${inv.no} (${inv.dealerName}) was dispatched ${Math.floor((Date.now() - new Date(inv.dispatchDate)) / 86400000)} days ago by ${inv.by || 'unknown'} and still isn't marked delivered.`,
      relatedNo: inv.no,
      byUser: inv.by || '',
      forRole: 'founder',
    });
  }
}

// GET /api/notifications
async function list(req, res) {
  if (req.user.role === 'founder') {
    await generateDispatchOverdueNotifications();
  }
  const items = await Notification.find({ forRole: req.user.role }).sort({ createdAt: -1 }).limit(50);
  res.json(items);
}

// GET /api/notifications/unread-count
async function unreadCount(req, res) {
  if (req.user.role === 'founder') {
    await generateDispatchOverdueNotifications();
  }
  const count = await Notification.countDocuments({ forRole: req.user.role, read: false });
  res.json({ count });
}

async function markRead(req, res) {
  const item = await Notification.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
  if (!item) return res.status(404).json({ message: 'Not found' });
  res.json(item);
}

async function markAllRead(req, res) {
  await Notification.updateMany({ forRole: req.user.role, read: false }, { read: true });
  res.json({ message: 'All marked read' });
}

module.exports = { list, unreadCount, markRead, markAllRead };
