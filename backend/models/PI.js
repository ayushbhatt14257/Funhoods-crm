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
    total: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['Draft', 'Sent', 'Confirmed', 'Partial Dispatched', 'Fully Dispatched', 'Cancelled'],
      default: 'Draft',
    },
    by: String, // user name who created it
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PI', piSchema);
