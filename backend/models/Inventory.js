const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, ref: 'Product' },
    physical: { type: Number, default: 0 },
    reserved: { type: Number, default: 0 }, // held against Confirmed PIs
    // "Free to sell" = physical - reserved. Always computed on read, never stored.
  },
  { timestamps: true }
);

module.exports = mongoose.model('Inventory', inventorySchema);
