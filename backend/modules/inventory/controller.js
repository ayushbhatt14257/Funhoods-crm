const Inventory = require('./model');
const Product = require('../products/model');

async function list(req, res) {
  const items = await Inventory.find();
  const products = await Product.find();
  const productMap = Object.fromEntries(products.map((p) => [p.code, p]));

  const rows = items.map((i) => {
    const p = productMap[i.code] || {};
    return {
      code: i.code,
      name: p.name || '',
      cartonOuter: p.cartonOuter || 0,
      cartonInner: p.cartonInner || 0,
      rate: p.rate || 0,
      physical: i.physical,
      reserved: i.reserved,
      free: i.physical - i.reserved, // always computed live, never stored
      value: (i.physical - i.reserved) * (p.rate || 0),
    };
  });
  res.json(rows);
}

// PATCH /api/inventory/:code  { physical } — manual stock correction (e.g. after physical count)
async function adjust(req, res) {
  const code = req.params.code.toUpperCase();
  const item = await Inventory.findOneAndUpdate(
    { code },
    { physical: +req.body.physical },
    { new: true, upsert: true }
  );
  res.json(item);
}

// POST /api/inventory/bulk-set  { rows: [{code, physical}] } — for the opening-stock Excel import
async function bulkSet(req, res) {
  const { rows } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ message: 'rows array required' });

  const results = [];
  for (const r of rows) {
    const code = String(r.code || '').toUpperCase();
    if (!code) continue;
    const product = await Product.findOne({ code });
    if (!product) { results.push({ code, error: 'Product not found — add it first' }); continue; }
    const doc = await Inventory.findOneAndUpdate(
      { code },
      { physical: +r.physical || 0 },
      { upsert: true, new: true }
    );
    results.push({ code, ok: true, physical: doc.physical });
  }
  res.json({ results });
}

module.exports = { list, adjust, bulkSet };
