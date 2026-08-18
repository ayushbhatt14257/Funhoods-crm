const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['rate_edit', 'dispatch_overdue', 'other'], default: 'other' },
    message: { type: String, required: true },
    relatedNo: { type: String, default: '' }, // e.g. PI number or Invoice number
    byUser: { type: String, default: '' }, // name of the person who triggered it
    forRole: { type: String, default: 'founder' }, // who should see it
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
