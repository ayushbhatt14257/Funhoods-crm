const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, ref: 'Product' },
    physical: { type: Number, default: 0 },
    // Legacy field — no longer read or written anywhere. Reserved demand
    // (confirmed-order pcs not yet dispatched) is now computed LIVE from
    // open PI lines on every read (see getLiveReservedMap in
    // inventory/controller.js) instead of being maintained here as a
    // stored counter, which used to drift out of sync with reality whenever
    // any code path adjusted PI demand without perfectly mirroring it here.
    // Left in the schema only so old documents that still carry a value
    // don't error; never rely on it.
    reserved: { type: Number, default: 0 },
    // "Free to sell" = physical - live reserved. Always computed on read, never stored.
  },
  { timestamps: true }
);

module.exports = mongoose.model('Inventory', inventorySchema);
