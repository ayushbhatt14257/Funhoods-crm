const Inventory = require('./model');
const Product = require('../products/model');
const XLSX = require('xlsx');

// Shared by both the on-screen table and the Excel export, so the two can
// never drift apart. "Need to produce" = confirmed-order demand (Reserved)
// beyond what's physically on hand — the same number that shows as a
// negative free-to-sell elsewhere, just flipped to a positive "make this many".
async function buildProductionPlan() {
  const items = await Inventory.find();
  const products = await Product.find();
  const productMap = Object.fromEntries(products.map((p) => [p.code, p]));

  return items
    .map((i) => {
      const p = productMap[i.code] || {};
      const needed = Math.max(0, i.reserved - i.physical);
      return { code: i.code, name: p.name || i.code, physical: i.physical, reserved: i.reserved, needed };
    })
    .filter((r) => r.needed > 0)
    .sort((a, b) => b.needed - a.needed);
}

// GET /api/inventory/production-planning — admin/masterAdmin only
async function productionPlanning(req, res) {
  res.json(await buildProductionPlan());
}

// GET /api/inventory/production-planning/export — same data, as a .xlsx download
async function exportProductionPlanning(req, res) {
  const rows = await buildProductionPlan();
  const sheetData = [
    ['Code', 'Item', 'Physical stock', 'Reserved (demand)', 'Need to produce'],
    ...rows.map((r) => [r.code, r.name, r.physical, r.reserved, r.needed]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(sheetData);
  sheet['!cols'] = [{ wch: 10 }, { wch: 30 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Production Planning');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  const filename = `production-planning-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

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

module.exports = { list, adjust, bulkSet, productionPlanning, exportProductionPlanning };
