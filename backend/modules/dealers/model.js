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
    businessCardUrl: { type: String, default: '' },
    type: { type: String, enum: ['Retailer', 'Wholesaler', 'Distributor', 'Retail+Wholesale'], default: 'Retailer' },
    payment: { type: String, enum: ['Advance', 'Credit-15d', 'Credit-30d'], default: 'Advance' },
    creditLimit: { type: Number, default: 0 },
    slab: { type: String, enum: ['A', 'B', 'C'], default: 'C' },
    notes: { type: String, default: '' },
    referenceName: { type: String, default: '' }, // who referred/introduced this dealer, if anyone
    active: { type: Boolean, default: true },
    createdByName: { type: String, default: '' },
    assignedTo: { type: String, default: '' }, // name of the field/sales user this party belongs to
    // A real dispatch block — usually requested by the marketing/sales
    // person for a specific reason (payment issue etc.), not just a label.
    // While active, this party's confirmed items can't be dispatched at
    // all (checked server-side, not just hidden in the UI) until someone
    // explicitly releases it.
    dispatchHold: {
      active: { type: Boolean, default: false },
      reason: { type: String, default: '' },
      heldBy: { type: String, default: '' },
      heldAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

dealerSchema.index({ assignedTo: 1 }); // every field/mhead scoped PI or Invoice list runs this lookup

module.exports = mongoose.model('Dealer', dealerSchema);
