const crypto = require('crypto');
const CartonBarcode = require('./cartonBarcodeModel');
const Inventory = require('./model');
const Product = require('../products/model');

// 12 hex chars (48 bits) of randomness per carton, namespaced under the
// product code — astronomically collision-safe even at millions of cartons
// over many years, while staying short enough to print and scan reliably.
function randomSuffix() {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
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

module.exports = { generateBatch, getBatch, lookupCarton, confirmCarton };
