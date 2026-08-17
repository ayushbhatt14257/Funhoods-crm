const XLSX = require('xlsx');
const Product = require('../models/Product');
const Dealer = require('../models/Dealer');
const Alias = require('../models/Alias');
const Inventory = require('../models/Inventory');

function readSheet(buffer, sheetName) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return null;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 1 });
  const headers = rows[0];
  const dataRows = rows.slice(2);
  return dataRows
    .filter((r) => r.some((c) => c !== undefined && c !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

const SHEET_NAMES = { products: 'Products', dealers: 'Dealers', aliases: 'Aliases', inventory: 'Opening_Inventory' };

async function preview(req, res) {
  const type = req.params.type;
  const sheetName = SHEET_NAMES[type];
  if (!sheetName) return res.status(400).json({ message: 'Unknown import type' });
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const rows = readSheet(req.file.buffer, sheetName);
  if (!rows) return res.status(400).json({ message: `Sheet "${sheetName}" not found in file` });
  if (!rows.length) return res.status(400).json({ message: 'No data rows found (check row 4 onwards is filled in)' });

  res.json({ type, rows });
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
