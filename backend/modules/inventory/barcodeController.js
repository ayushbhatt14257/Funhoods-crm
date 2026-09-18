const crypto = require('crypto');
const CartonBarcode = require('./cartonBarcodeModel');
const Inventory = require('./model');
const Product = require('../products/model');

// 6 hex chars (24 bits, ~16.7M combos) of randomness per carton, namespaced
// under the product code. Shortened from 12 hex chars specifically so the
// printed barcode fits a small 50x25mm thermal label — CODE128 width scales
// directly with string length. Still comfortably collision-safe at this
// business's volume (generateBatch caps a single batch at 2000, and
// insertMany runs ordered:false so the one-in-millions duplicate just gets
// skipped rather than aborting the batch — see generateBatch below).
function randomSuffix() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// POST /api/inventory/stock-in-batches  { code, cartonCount, qtyOverride? }
// admin/masterAdmin only. Generates `cartonCount` unique, individually
// trackable barcodes in one bulk insert (not a loop of single creates —
// this needs to stay fast even generating hundreds of labels at once).
async function generateBatch(req, res) {
  const { code, cartonCount, qtyOverride } = req.body;
  const product = await Product.findOne({ code: String(code || '').toUpperCase() });
  if (!product) return res.status(404).json({ message: 'Product not found' });

  const count = Math.max(1, Math.min(2000, +cartonCount || 0)); // sane ceiling per batch — reprint again for more
  if (!count) return res.status(400).json({ message: 'cartonCount must be at least 1' });

  const qty = qtyOverride ? +qtyOverride : product.cartonOuter;
  if (!qty || qty <= 0) return res.status(400).json({ message: `${product.name} has no carton size set — set it on the product first, or pass qtyOverride.` });

  const batchId = `B${Date.now().toString(36).toUpperCase()}${randomSuffix().slice(0, 4)}`;
  const docs = Array.from({ length: count }, () => ({
    code: `${product.code}-${randomSuffix()}`,
    batchId,
    product: product.code,
    productName: product.name,
    qty,
    createdBy: req.user.name,
  }));

  // ordered:false so one unlikely duplicate-key collision (essentially
  // never happens at this entropy level) doesn't abort the whole batch.
  const inserted = await CartonBarcode.insertMany(docs, { ordered: false });
  res.status(201).json({ batchId, product: { code: product.code, name: product.name, photo: product.photo || '' }, qty, cartons: inserted });
}

// GET /api/inventory/stock-in-batches/:batchId — reprint an existing batch's labels
async function getBatch(req, res) {
  const cartons = await CartonBarcode.find({ batchId: req.params.batchId }).sort({ createdAt: 1 });
  if (!cartons.length) return res.status(404).json({ message: 'Batch not found' });
  res.json({ batchId: req.params.batchId, product: { code: cartons[0].product, name: cartons[0].productName }, qty: cartons[0].qty, cartons });
}

// GET /api/inventory/carton/by-product/:code — admin/masterAdmin only.
// Every batch ever generated for this product, newest first, with a
// used/unused count per batch (not the individual cartons — that's what
// getBatch is for when someone drills into one batch). Powers the "Track"
// tab so someone can see at a glance which batches still have unscanned
// cartons out on the floor.
async function getByProduct(req, res) {
  const code = String(req.params.code || '').toUpperCase();
  const product = await Product.findOne({ code });
  if (!product) return res.status(404).json({ message: 'Product not found' });

  const rows = await CartonBarcode.aggregate([
    { $match: { product: code } },
    {
      $group: {
        _id: '$batchId',
        qty: { $first: '$qty' },
        createdAt: { $min: '$createdAt' },
        createdBy: { $first: '$createdBy' },
        total: { $sum: 1 },
        used: { $sum: { $cond: [{ $eq: ['$status', 'used'] }, 1, 0] } },
      },
    },
    { $sort: { createdAt: -1 } },
  ]);

  const summary = rows.reduce(
    (s, r) => ({ total: s.total + r.total, used: s.used + r.used }),
    { total: 0, used: 0 }
  );

  res.json({
    product: { code: product.code, name: product.name, photo: product.photo || '' },
    summary: { ...summary, unused: summary.total - summary.used },
    batches: rows.map((r) => ({
      batchId: r._id, qty: r.qty, createdAt: r.createdAt, createdBy: r.createdBy || '',
      total: r.total, used: r.used, unused: r.total - r.used,
    })),
  });
}

// GET /api/inventory/carton/recent-batches?limit=10 — admin/masterAdmin only.
// Every batch ever generated, across ALL products (not filtered to one, like
// getByProduct above), newest first, capped at `limit`. Powers a quick
// "what did we just generate" glance on the Generate tab, separate from the
// Track tab's per-product deep-dive.
async function getRecentBatches(req, res) {
  const limit = Math.min(50, Math.max(1, +req.query.limit || 10));
  const rows = await CartonBarcode.aggregate([
    {
      $group: {
        _id: '$batchId',
        product: { $first: '$product' },
        productName: { $first: '$productName' },
        qty: { $first: '$qty' },
        createdAt: { $min: '$createdAt' },
        createdBy: { $first: '$createdBy' },
        total: { $sum: 1 },
      },
    },
    { $sort: { createdAt: -1 } },
    { $limit: limit },
  ]);

  const codes = [...new Set(rows.map((r) => r.product))];
  const products = await Product.find({ code: { $in: codes } });
  const photoByCode = Object.fromEntries(products.map((p) => [p.code, p.photo || '']));

  res.json(
    rows.map((r) => ({
      batchId: r._id, product: r.product, productName: r.productName, photo: photoByCode[r.product] || '',
      qty: r.qty, cartons: r.total, createdBy: r.createdBy || '', createdAt: r.createdAt,
    }))
  );
}

// GET /api/inventory/carton/:code — look up a scanned barcode. Read-only —
// scanning to preview doesn't consume the carton; only /confirm does.
async function lookupCarton(req, res) {
  const carton = await CartonBarcode.findOne({ code: req.params.code });
  if (!carton) return res.status(404).json({ message: 'Barcode not recognised — not one of ours, or mistyped.' });
  const product = await Product.findOne({ code: carton.product });
  res.json({
    code: carton.code, status: carton.status, qty: carton.qty,
    product: carton.product, productName: carton.productName, photo: product?.photo || '',
    usedBy: carton.usedBy, usedAt: carton.usedAt,
  });
}

// POST /api/inventory/carton/:code/confirm — the actual stock-in. Marks the
// carton used (so it can never be scanned in again) and adds its fixed
// quantity to physical stock. Whoever can adjust inventory can do this.
async function confirmCarton(req, res) {
  const carton = await CartonBarcode.findOne({ code: req.params.code });
  if (!carton) return res.status(404).json({ message: 'Barcode not recognised — not one of ours, or mistyped.' });
  if (carton.status === 'used') {
    return res.status(409).json({
      message: `Already scanned on ${new Date(carton.usedAt).toLocaleString('en-IN')} by ${carton.usedBy} — not adding again.`,
    });
  }

  carton.status = 'used';
  carton.usedBy = req.user.name;
  carton.usedAt = new Date();
  await carton.save();

  await Inventory.findOneAndUpdate(
    { code: carton.product },
    { $inc: { physical: carton.qty } },
    { upsert: true }
  );

  res.json({ message: `${carton.qty} pcs of ${carton.productName} added to stock.`, qty: carton.qty, productName: carton.productName });
}

// DELETE /api/inventory/carton/all — admin/masterAdmin only. Wipes every
// generated carton QR/barcode record (used, unused, and split alike) so a
// batch of test/practice codes can be cleared out before switching to real
// production codes. Deliberately does NOT touch Inventory.physical stock —
// whatever pieces were actually scanned in during testing already added to
// stock separately, and this is purely clearing the label/tracking history,
// not reversing real stock counts (that's a different, separate decision).
async function clearAll(req, res) {
  const result = await CartonBarcode.deleteMany({});
  res.json({ message: `Cleared ${result.deletedCount} generated code(s).`, deletedCount: result.deletedCount });
}

module.exports = { generateBatch, getBatch, getByProduct, getRecentBatches, lookupCarton, confirmCarton, clearAll };
