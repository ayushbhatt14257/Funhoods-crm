const mongoose = require('mongoose');

// One document per physical carton. `code` is what's printed as the
// barcode and scanned at stock-in/dispatch time — globally unique, indexed
// for fast lookup (this table will hold millions of rows over the years,
// and every scan does a lookup by `code`, so this index is the one thing
// that has to stay fast no matter how large the collection gets).
//
// Lifecycle: pending (QR printed, not yet on a real carton) -> in_stock
// (scanned in at the warehouse) -> dispatched (scanned/marked out to a
// customer). "split" is a dead end for an OUTER only — once split into
// inner QRs (see parentCode/kind), the outer itself can never be
// dispatched again, only its inner children can.
//
// `status: 'used'` used to be the final state, back when only inward
// scanning existed. It's kept in the enum for old records that predate the
// outward flow (migrated to mean the same thing as 'in_stock' — see the
// one-time migration run when this shipped) but nothing should ever set
// 'used' going forward.
const cartonBarcodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    batchId: { type: String, required: true }, // groups cartons generated together, for reprinting/reference
    product: { type: String, required: true }, // product code
    productName: { type: String, required: true }, // denormalized — survives a product rename/delete
    qty: { type: Number, required: true }, // pcs this carton/inner holds
    status: { type: String, enum: ['pending', 'unused', 'used', 'in_stock', 'dispatched', 'split'], default: 'pending' },

    // kind/parentCode: an 'inner' carton only exists after its 'outer'
    // parent was split — it has its own code, its own status, and is
    // dispatched independently. parentCode is blank for a normal outer.
    kind: { type: String, enum: ['outer', 'inner'], default: 'outer' },
    parentCode: { type: String, default: '' },

    // IN event (stock-in scan)
    usedBy: { type: String, default: '' },
    usedAt: { type: Date, default: null },

    // OUT event (dispatch — scanned or manually overridden)
    dispatchedTo: { type: String, default: '' }, // dealer code
    dispatchedInvoice: { type: String, default: '' },
    dispatchedBy: { type: String, default: '' },
    dispatchedAt: { type: Date, default: null },
    dispatchOverride: { type: Boolean, default: false }, // true if admin/masterAdmin marked it out without a scan (damaged/unreadable label)

    // SPLIT event — only ever set on an outer once it's split (status
    // becomes 'split'). Its inner children get the SAME splitAt/splitBy
    // (see splitCarton) since they were all created in that one action —
    // this is separate from usedAt, which stays the outer's ORIGINAL
    // stock-in time and is never touched by a split.
    splitAt: { type: Date, default: null },
    splitBy: { type: String, default: '' },

    createdBy: { type: String, default: '' },
  },
  { timestamps: true }
);

cartonBarcodeSchema.index({ code: 1 }, { unique: true });
cartonBarcodeSchema.index({ batchId: 1 });
cartonBarcodeSchema.index({ product: 1, createdAt: -1 });
// FIFO lookups: "oldest in_stock carton for this product" — same shape as
// the existing product+createdAt index but scoped to status so it stays
// fast once a product has both in_stock and dispatched cartons mixed together.
cartonBarcodeSchema.index({ product: 1, status: 1, createdAt: 1 });

module.exports = mongoose.model('CartonBarcode', cartonBarcodeSchema);
