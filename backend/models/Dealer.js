const mongoose = require('mongoose');

const dealerSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    contact: { type: String, default: '' },
    mobile: { type: String, default: '' },
    addr: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pin: { type: String, default: '' },
    gstin: { type: String, default: '' },
    gstCertUrl: { type: String, default: '' },
    aadharUrl: { type: String, default: '' },
    type: { type: String, enum: ['Retailer', 'Wholesaler', 'Distributor', 'Retail+Wholesale'], default: 'Retailer' },
    payment: { type: String, enum: ['Advance', 'Credit-15d', 'Credit-30d'], default: 'Advance' },
    creditLimit: { type: Number, default: 0 },
    slab: { type: String, enum: ['A', 'B', 'C'], default: 'C' },
    notes: { type: String, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Dealer', dealerSchema);
