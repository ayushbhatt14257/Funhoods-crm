const mongoose = require('mongoose');

// Freeform line — OEM/private-label orders have no shared catalog, so each
// order carries its own product description, qty, unit and rate.
const lineSchema = new mongoose.Schema(
  {
    no: Number,
    name: { type: String, required: true },
    spec: { type: String, default: '' },
    qty: { type: Number, required: true },
    unit: { type: String, default: 'pcs' },
    rate: { type: Number, required: true }, // ex-GST
    gstPct: { type: Number, default: 18 },
    amount: Number, // qty * rate (ex-GST)
    tax: Number,
    total: Number, // amount + tax
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  { status: String, note: { type: String, default: '' }, by: String, at: { type: Date, default: Date.now } },
  { _id: false }
);

const STATUSES = ['Draft', 'Confirmed', 'In Production', 'Ready', 'Delivered', 'Cancelled'];

// Completely standalone from PI / Invoice / Ledger / Inventory — nothing
// here reserves stock or touches Outstanding.
const oemOrderSchema = new mongoose.Schema(
  {
    no: { type: String, required: true, unique: true },
    date: { type: Date, default: Date.now },
    dealer: { type: String, required: true }, // Dealer.code (must be isOEM)
    dealerName: String,
    lines: [lineSchema],
    subtotal: { type: Number, default: 0 },
    taxTotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    deliveryDate: { type: Date, default: null },
    advance: { type: Number, default: 0 }, // informational only, never posted to ledger
    remark: { type: String, default: '' },
    status: { type: String, enum: STATUSES, default: 'Draft' },
    history: [historySchema],
    by: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

oemOrderSchema.index({ status: 1, createdAt: -1 });
oemOrderSchema.index({ dealer: 1, createdAt: -1 });

module.exports = mongoose.model('OemOrder', oemOrderSchema);
module.exports.STATUSES = STATUSES;
