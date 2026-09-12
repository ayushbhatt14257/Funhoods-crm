const mongoose = require('mongoose');

// One document per physical carton. `code` is what's printed as the
// barcode and scanned at stock-in time — globally unique, indexed for fast
// lookup (this table will hold millions of rows over the years, and every
// scan does a lookup by `code`, so this index is the one thing that has to
// stay fast no matter how large the collection gets).
const cartonBarcodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    batchId: { type: String, required: true }, // groups cartons generated together, for reprinting/reference
    product: { type: String, required: true }, // product code
    productName: { type: String, required: true }, // denormalized — survives a product rename/delete
    qty: { type: Number, required: true }, // carton size at the moment this batch was generated
    status: { type: String, enum: ['unused', 'used'], default: 'unused' },
    usedBy: { type: String, default: '' },
    usedAt: { type: Date, default: null },
    createdBy: { type: String, default: '' },
  },
  { timestamps: true }
);

cartonBarcodeSchema.index({ code: 1 }, { unique: true });
cartonBarcodeSchema.index({ batchId: 1 });
cartonBarcodeSchema.index({ product: 1, createdAt: -1 });

module.exports = mongoose.model('CartonBarcode', cartonBarcodeSchema);
