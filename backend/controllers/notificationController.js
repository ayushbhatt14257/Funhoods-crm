const Notification = require('../models/Notification');

// GET /api/notifications — founder only for now
async function list(req, res) {
  const items = await Notification.find({ forRole: req.user.role }).sort({ createdAt: -1 }).limit(50);
  res.json(items);
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

module.exports = { list, markRead, markAllRead };
