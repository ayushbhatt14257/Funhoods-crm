const mongoose = require('mongoose');

const ledgerSchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now },
    dealer: { type: String, required: true, ref: 'Dealer' },
    type: { type: String, enum: ['Invoice', 'Payment', 'CreditNote', 'DebitNote'], required: true },
    ref: String,
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Ledger', ledgerSchema);
