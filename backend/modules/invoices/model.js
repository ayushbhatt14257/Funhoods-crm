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

// Free gifts riding along on a dispatch — deliberately a SEPARATE array from
// `lines`, never touched by subtotal/total/GST math. `code`/`pcs`/`qtyLabel`
// are set for a catalog-product gift (e.g. "1 carton" of a real SKU);
// `custom: true` gifts (a tiffin, a bottle — nothing in the catalog) only
// ever have `name` and `worth`, no code/pcs. `worth` is informational only —
// what the item would have cost had it been billed — and never adds to the
// invoice total.
const giftSchema = new mongoose.Schema(
  { code: String, name: String, photo: String, pcs: Number, qtyLabel: String, worth: { type: Number, default: 0 }, custom: { type: Boolean, default: false } },
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
    bookedBy: { type: String, default: '' }, // who actually performed the dispatch action — distinct from `by`, which is the dealer's assigned salesperson (used for notifications/filtering)
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Simplified transport: single mode/via field. Advanced fields optional.
    transporter: { type: String, default: '' }, // mode/via, e.g. "Railway", "Safe Express"
    vehicle: { type: String, default: '' },
    lr: { type: String, default: '' },
    eway: { type: String, default: '' },
    driver: { type: String, default: '' },
    cartons: { type: Number, default: 0 },
    freight: { type: Number, default: 0 },
    freightGst: { type: Number, default: 0 }, // 5% GST on transport/freight charges — only present on invoices created after this was added
    freightTerm: { type: String, enum: ['To Pay', 'Paid'], default: 'To Pay' },
    packing: [packingCartonSchema],
    gifts: [giftSchema],
    dispatchDate: Date,
    deliveredDate: Date,
    builty: { url: { type: String, default: '' }, publicId: { type: String, default: '' } }, // LR/builty receipt for this dispatch
    paymentReceived: { type: Boolean, default: false },
    paymentReceivedAt: { type: Date, default: null },
    paymentReceivedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

invoiceSchema.index({ status: 1, createdAt: -1 });
invoiceSchema.index({ dealer: 1, createdAt: -1 });
invoiceSchema.index({ piRef: 1 });
invoiceSchema.index({ createdAt: -1 });
invoiceSchema.index({ paymentReceived: 1, dispatchDate: 1 }); // powers the 30-day payment-due scan

module.exports = mongoose.model('Invoice', invoiceSchema);
