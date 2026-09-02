const mongoose = require('mongoose');

const aliasSchema = new mongoose.Schema(
  {
    alias: { type: String, required: true, unique: true, trim: true, lowercase: true },
    code: { type: String, required: true, ref: 'Product' }, // Product.code
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Alias', aliasSchema);
