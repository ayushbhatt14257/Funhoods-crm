const XLSX = require('xlsx');
const Product = require('../models/Product');
const Dealer = require('../models/Dealer');
const Alias = require('../models/Alias');
const Inventory = require('../models/Inventory');

// Expected header keys per import type — used to auto-locate the header row,
// so the file works whether or not it has a legend/note row above the headers.
const EXPECTED_HEADERS = {
  products: ['product_code', 'product_name', 'carton_outer_pcs', 'rate_rs'],
  dealers: ['dealer_code', 'dealer_name'],
  aliases: ['nickname_text', 'maps_to_product_code'],
  inventory: ['product_code', 'physical_stock_pcs'],
};

function normCell(v) {
  return String(v ?? '').trim().toLowerCase();
}

function readSheet(buffer, sheetName, type) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return { error: `Sheet "${sheetName}" not found in file` };

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const expected = EXPECTED_HEADERS[type] || [];

  // Scan the first 10 rows for whichever one contains the most expected header names —
  // that's the real header row, regardless of whether a legend/note row sits above it.
  let headerRowIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const normalized = rows[i].map(normCell);
    const score = expected.filter((h) => normalized.includes(h)).length;
    if (score > bestScore) {
      bestScore = score;
      headerRowIdx = i;
    }
  }

  if (headerRowIdx === -1 || bestScore < Math.min(2, expected.length)) {
    return { error: `Could not find the expected header row (looking for columns like "${expected[0]}"). Make sure the column headers match the template exactly.` };
  }

  const headers = rows[headerRowIdx].map((h) => String(h ?? '').trim());
  const dataRows = rows.slice(headerRowIdx + 1);

  const parsed = dataRows
    .filter((r) => r.some((c) => c !== undefined && c !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));

  return { rows: parsed };
}

const SHEET_NAMES = { products: 'Products', dealers: 'Dealers', aliases: 'Aliases', inventory: 'Opening_Inventory' };

async function preview(req, res) {
  const type = req.params.type;
  const sheetName = SHEET_NAMES[type];
  if (!sheetName) return res.status(400).json({ message: 'Unknown import type' });
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const result = readSheet(req.file.buffer, sheetName, type);
  if (result.error) return res.status(400).json({ message: result.error });
  if (!result.rows.length) return res.status(400).json({ message: 'No data rows found below the header row' });

  res.json({ type, rows: result.rows });
}

async function saveProductRow(r) {
  const code = String(r.product_code || '').toUpperCase().trim();
  if (!code) throw new Error('product_code is required');
  const outer = +r.carton_outer_pcs || 0;
  const doc = {
    code,
    name: r.product_name || '',
    size: r.size || '',
    category: r.category || '',
    cartonOuter: outer,
    cartonInner: r.carton_inner_pcs ? +r.carton_inner_pcs : Math.round(outer / 2),
    rate: +r.rate_rs || 0,
    gst_pct: [5, 12, 18].includes(+r.gst_pct) ? +r.gst_pct : 5,
    photo: r.photo_url || '',
    active: String(r.active_Y_N || 'Y').toUpperCase() !== 'N',
  };
  const saved = await Product.findOneAndUpdate({ code }, doc, { upsert: true, new: true });
  await Inventory.findOneAndUpdate({ code }, {}, { upsert: true });
  return { key: code, ok: true, _id: saved._id };
}

async function saveDealerRow(r) {
  const code = String(r.dealer_code || '').toUpperCase().trim();
  if (!code) throw new Error('dealer_code is required');
  const doc = {
    code,
    name: r.dealer_name || '',
    city: r.city || '',
    state: r.state || '',
    payment: r.payment_terms || 'Advance',
    gstin: r.gstin || '',
    contact: r.contact_person || '',
    mobile: r.mobile || '',
    addr: r.address || '',
  };
  const saved = await Dealer.findOneAndUpdate({ code }, doc, { upsert: true, new: true });
  return { key: code, ok: true, _id: saved._id };
}

async function saveAliasRow(r) {
  const alias = String(r.nickname_text || '').toLowerCase().trim();
  const code = String(r.maps_to_product_code || '').toUpperCase().trim();
  if (!alias || !code) throw new Error('nickname_text and maps_to_product_code are required');
  const product = await Product.findOne({ code });
  if (!product) throw new Error(`Product ${code} not found`);
  await Alias.findOneAndUpdate({ alias }, { alias, code }, { upsert: true });
  return { key: alias, ok: true };
}

async function saveInventoryRow(r) {
  const code = String(r.product_code || '').toUpperCase().trim();
  if (!code) throw new Error('product_code is required');
  const product = await Product.findOne({ code });
  if (!product) throw new Error('Product not found — import Products sheet first');
  await Inventory.findOneAndUpdate({ code }, { physical: +r.physical_stock_pcs || 0 }, { upsert: true });
  return { key: code, ok: true };
}

const SAVERS = { products: saveProductRow, dealers: saveDealerRow, aliases: saveAliasRow, inventory: saveInventoryRow };
const KEY_FIELD = { products: 'product_code', dealers: 'dealer_code', aliases: 'nickname_text', inventory: 'product_code' };

// POST /api/import/:type/confirm  { rows: [...] } — saves rows the user reviewed/edited in the preview step
async function confirm(req, res) {
  const type = req.params.type;
  const saveRow = SAVERS[type];
  if (!saveRow) return res.status(400).json({ message: 'Unknown import type' });

  const { rows } = req.body;
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ message: 'No rows to import' });

  const results = [];
  for (const r of rows) {
    try {
      results.push(await saveRow(r));
    } catch (err) {
      results.push({ key: r[KEY_FIELD[type]] || '?', ok: false, error: err.message });
    }
  }
  res.json({ imported: results.filter((r) => r.ok).length, results });
}

module.exports = { preview, confirm };
