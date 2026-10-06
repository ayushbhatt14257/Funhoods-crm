const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({ url: { type: String, default: '' }, publicId: { type: String, default: '' } }, { _id: false });

const productSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    size: { type: String, default: '' },
    category: { type: String, default: '' },
    cartonOuter: { type: Number, default: 0 },
    cartonInner: { type: Number, default: 0 }, // defaults to outer/2 in controller if omitted
    // Explicit ON/OFF for "this product even comes in inner cartons at
    // all" — some products (e.g. a 240pc outer with no smaller inner
    // packaging) only ever ship as the outer carton. Defaults true so
    // every existing product keeps behaving exactly as before. When this
    // is false, the controller forces cartonInner to 0 regardless of
    // whatever number is submitted alongside it — that 0 is what every
    // inner-related check elsewhere in the app (New Order, Dispatch,
    // Generate Barcodes, Stock In) already keys off of, so turning this
    // off is enough to hide/disable inner handling everywhere at once,
    // with no other file needing its own hasInner check.
    hasInner: { type: Boolean, default: true },
    rate: { type: Number, required: true, default: 0 },
    gst_pct: { type: Number, enum: [5, 12, 18], default: 5 },
    photo: { type: String, default: '' }, // legacy single thumbnail — kept in sync with featuredImage.url so every existing screen that reads `product.photo` keeps working unchanged
    images: [{ url: { type: String, default: '' }, publicId: { type: String, default: '' } }], // full gallery
    featuredImage: { type: mediaSchema, default: () => ({}) }, // which gallery image is the "main" one
    video: { type: mediaSchema, default: () => ({}) },
    active: { type: Boolean, default: true },
    // Manually entered, one-time-per-product baseline — pcs dispatched
    // BEFORE this product was ever tracked in this CRM (from the
    // business's prior Tally records), added on top of whatever this CRM
    // has itself computed from real Invoice history everywhere "Dispatched
    // (all-time)" is shown. Set via the legacy-dispatch import review
    // screen (see legacyDispatchController.js) — never auto-computed,
    // since it represents history this software has no record of.
    preCrmDispatched: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
