const Inventory = require('./model');
const Product = require('../products/model');
const PI = require('../pi/model');
const XLSX = require('xlsx');

// Live-computed reserved demand, per product code — the sum of "pending"
// pcs across every currently open PI (Confirmed or Partial Dispatched),
// recalculated fresh on every read. This replaces reading Inventory.reserved
// as a stored, incrementally-maintained counter: that counter had to be
// perfectly adjusted by every single PI confirm, PI cancel, and dispatch
// commit to ever stay correct, and any one code path that changed a PI's
// demand without exactly mirroring that change here let it drift out of
// sync — permanently, since nothing ever corrected it back. Computing it
// fresh here, the same way the "Pending — <product>" popup already does,
// makes that drift structurally impossible: there's no counter to fall out
// of sync with reality, because this always IS reality.
async function getLiveReservedMap() {
  const pis = await PI.find({ status: { $in: ['Confirmed', 'Partial Dispatched'] } }).select('lines').lean();
  const reserved = {};
  pis.forEach((pi) => {
    pi.lines.forEach((l) => {
      const pending = l.pending != null ? l.pending : l.pcs;
      if (pending > 0) reserved[l.code] = (reserved[l.code] || 0) + pending;
    });
  });
  return reserved;
}

// Shared by both the on-screen table and the Excel export, so the two can
// never drift apart. "Need to produce" = confirmed-order demand (Reserved)
// beyond what's physically on hand — the same number that shows as a
// negative free-to-sell elsewhere, just flipped to a positive "make this many".
async function buildProductionPlan() {
  const items = await Inventory.find();
  const products = await Product.find();
  const productMap = Object.fromEntries(products.map((p) => [p.code, p]));
  const reservedMap = await getLiveReservedMap();

  return items
    .map((i) => {
      const p = productMap[i.code] || {};
      const reserved = reservedMap[i.code] || 0;
      const needed = Math.max(0, reserved - i.physical);
      return { code: i.code, name: p.name || i.code, physical: i.physical, reserved, needed };
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
  const reservedMap = await getLiveReservedMap();

  const rows = items.map((i) => {
    const p = productMap[i.code] || {};
    const reserved = reservedMap[i.code] || 0;
    return {
      code: i.code,
      name: p.name || '',
      cartonOuter: p.cartonOuter || 0,
      cartonInner: p.cartonInner || 0,
      rate: p.rate || 0,
      physical: i.physical,
      reserved,
      free: i.physical - reserved, // always computed live, never stored
      value: (i.physical - reserved) * (p.rate || 0),
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
