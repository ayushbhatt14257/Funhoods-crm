const mongoose = require('mongoose');

const lineSchema = new mongoose.Schema(
  {
    no: Number,
    code: String,
    name: String,
    photo: String,
    outers: { type: Number, default: 0 },
    inners: { type: Number, default: 0 },
    pcs: { type: Number, required: true },
    pending: { type: Number, default: null }, // null = full pcs still pending, else explicit remaining
    rate: { type: Number, required: true },
    listRate: { type: Number, default: null }, // original master price, set if rate was edited
    rateEdited: { type: Boolean, default: false },
    gstPct: { type: Number, default: 5 },
    tax: Number,
    gross: Number,
    total: Number,
  },
  { _id: false }
);

const piSchema = new mongoose.Schema(
  {
    no: { type: String, required: true, unique: true },
    date: { type: Date, default: Date.now },
    dealer: { type: String, required: true, ref: 'Dealer' }, // Dealer.code
    dealerName: String,
    lines: [lineSchema],
    subtotal: { type: Number, default: 0 },
    transport: { type: Number, default: 0 },
    freightTerm: { type: String, enum: ['To Pay', 'Paid'], default: 'To Pay' },
    total: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['Draft', 'Sent', 'Confirmed', 'Partial Dispatched', 'Fully Dispatched', 'Closed', 'Cancelled'],
      default: 'Draft',
    },
    // Set when a Partial Dispatched PI's remaining pending qty is written off
    // instead of ever being dispatched (wrong carton size, customer cancelled
    // part of the order, etc). Distinct from 'Fully Dispatched' so reports
    // stay honest about what actually went out.
    closeNote: { type: String, default: '' },
    closedBy: { type: String, default: '' },
    closedAt: { type: Date, default: null },
    // Set exactly once, the moment a PI is confirmed ("Mark confirmed by
    // customer") — distinct from `updatedAt`, which changes on every save
    // (dispatch, cancel, edits, price approval...). This is specifically
    // "when did the customer confirm this," nothing else.
    confirmedAt: { type: Date, default: null },
    // Set when the admin prices a line below the product's base rate — needs
    // Master Admin sign-off before the PI can be dispatched, but auto-approves
    // after 1 hour if nobody acts (so a single missed notification doesn't
    // permanently stall an order).
    priceApproval: {
      status: { type: String, enum: ['pending', 'approved'], default: undefined },
      deadline: { type: Date, default: null },
      decidedBy: { type: String, default: '' },
      decidedAt: { type: Date, default: null },
    },
    by: String, // user name who created it
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    remark: { type: String, default: '' },
  },
  { timestamps: true }
);

// Indexes: `no` and `code`-type unique fields already get one automatically.
// These cover the query patterns every list/filter screen actually uses —
// status tabs, dealer-scoped views, and default newest-first sorting —
// so they keep paying off as PI volume grows into the lakhs.
piSchema.index({ status: 1, createdAt: -1 });
piSchema.index({ dealer: 1, createdAt: -1 });
piSchema.index({ createdAt: -1 });
piSchema.index({ 'priceApproval.status': 1 });

module.exports = mongoose.model('PI', piSchema);
