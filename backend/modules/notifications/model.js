const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['rate_edit', 'dispatch_overdue', 'dispatched', 'delivered', 'payment_due', 'other'], default: 'other' },
    message: { type: String, required: true },
    relatedNo: { type: String, default: '' }, // e.g. PI number or Invoice number
    relatedKind: { type: String, enum: ['pi', 'invoice', ''], default: '' }, // which /pis or /invoices link relatedNo points to
    byUser: { type: String, default: '' }, // name of the person who triggered it
    forRole: { type: String, default: '' }, // who should see it, by role (blank if targeted by user instead)
    forUserName: { type: String, default: '' }, // who should see it, by name (blank if targeted by role instead)
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
