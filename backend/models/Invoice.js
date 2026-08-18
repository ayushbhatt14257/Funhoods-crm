const mongoose = require('mongoose');

const lineSchema = new mongoose.Schema(
  {
    no: Number,
    code: String,
    name: String,
    photo: String,
    pcs: Number,
    rate: Number,
    gstPct: Number,
    tax: Number,
    gross: Number,
    total: Number,
  },
  { _id: false }
);

const packingItemSchema = new mongoose.Schema(
  { code: String, name: String, pcs: Number, photo: String },
  { _id: false }
);

const packingCartonSchema = new mongoose.Schema(
  { no: Number, mixed: Boolean, items: [packingItemSchema] },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    no: { type: String, required: true, unique: true },
    date: { type: Date, default: Date.now },
    dealer: { type: String, required: true, ref: 'Dealer' },
    dealerName: String,
    piRef: { type: String, default: '' }, // blank when manual (no-PI) dispatch
    manual: { type: Boolean, default: false },
    lines: [lineSchema],
    subtotal: { type: Number, default: 0 },
    transport: { type: Number, default: 0 }, // = freight
    total: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['Dispatched', 'Delivered', 'Cancelled'],
      default: 'Dispatched',
    },
    by: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Simplified transport: single mode/via field. Advanced fields optional.
    transporter: { type: String, default: '' }, // mode/via, e.g. "Railway", "Safe Express"
    vehicle: { type: String, default: '' },
    lr: { type: String, default: '' },
    eway: { type: String, default: '' },
    driver: { type: String, default: '' },
    cartons: { type: Number, default: 0 },
    freight: { type: Number, default: 0 },
    freightTerm: { type: String, enum: ['To Pay', 'Paid'], default: 'To Pay' },
    packing: [packingCartonSchema],
    dispatchDate: Date,
    deliveredDate: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invoice', invoiceSchema);
