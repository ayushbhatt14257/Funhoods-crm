const XLSX = require('xlsx');
const Product = require('../models/Product');
const Dealer = require('../models/Dealer');
const Alias = require('../models/Alias');
const Inventory = require('../models/Inventory');

function readSheet(buffer, sheetName) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return null;
  // Row 1 = legend, Row 2 = headers, Row 3 = sample (skipped), data from row 4
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 1 }); // start at row 2 (0-indexed 1)
  const headers = rows[0];
  const dataRows = rows.slice(2); // skip header row + sample row
  return dataRows
    .filter((r) => r.some((c) => c !== undefined && c !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

// POST /api/import/products  (multipart, field "file")
async function importProducts(req, res) {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const rows = readSheet(req.file.buffer, 'Products');
  if (!rows) return res.status(400).json({ message: 'Sheet "Products" not found in file' });

  const results = [];
  for (const r of rows) {
    try {
      const code = String(r.product_code || '').toUpperCase().trim();
      if (!code) continue;
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
      results.push({ code, ok: true, _id: saved._id });
    } catch (err) {
      results.push({ code: r.product_code, ok: false, error: err.message });
    }
  }
  res.json({ imported: results.filter((r) => r.ok).length, results });
}

// POST /api/import/dealers
async function importDealers(req, res) {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const rows = readSheet(req.file.buffer, 'Dealers');
  if (!rows) return res.status(400).json({ message: 'Sheet "Dealers" not found in file' });

  const results = [];
  for (const r of rows) {
    try {
      const code = String(r.dealer_code || '').toUpperCase().trim();
      if (!code) continue;
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
      results.push({ code, ok: true, _id: saved._id });
    } catch (err) {
      results.push({ code: r.dealer_code, ok: false, error: err.message });
    }
  }
  res.json({ imported: results.filter((r) => r.ok).length, results });
}

// POST /api/import/aliases
async function importAliases(req, res) {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const rows = readSheet(req.file.buffer, 'Aliases');
  if (!rows) return res.status(400).json({ message: 'Sheet "Aliases" not found in file' });

  const results = [];
  for (const r of rows) {
    try {
      const alias = String(r.nickname_text || '').toLowerCase().trim();
      const code = String(r.maps_to_product_code || '').toUpperCase().trim();
      if (!alias || !code) continue;
      const product = await Product.findOne({ code });
      if (!product) { results.push({ alias, ok: false, error: `Product ${code} not found` }); continue; }
      await Alias.findOneAndUpdate({ alias }, { alias, code }, { upsert: true });
      results.push({ alias, ok: true });
    } catch (err) {
      results.push({ alias: r.nickname_text, ok: false, error: err.message });
    }
  }
  res.json({ imported: results.filter((r) => r.ok).length, results });
}

// POST /api/import/inventory
async function importInventory(req, res) {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const rows = readSheet(req.file.buffer, 'Opening_Inventory');
  if (!rows) return res.status(400).json({ message: 'Sheet "Opening_Inventory" not found in file' });

  const results = [];
  for (const r of rows) {
    try {
      const code = String(r.product_code || '').toUpperCase().trim();
      if (!code) continue;
      const product = await Product.findOne({ code });
      if (!product) { results.push({ code, ok: false, error: 'Product not found — import Products sheet first' }); continue; }
      await Inventory.findOneAndUpdate({ code }, { physical: +r.physical_stock_pcs || 0 }, { upsert: true });
      results.push({ code, ok: true });
    } catch (err) {
      results.push({ code: r.product_code, ok: false, error: err.message });
    }
  }
  res.json({ imported: results.filter((r) => r.ok).length, results });
}

module.exports = { importProducts, importDealers, importAliases, importInventory };
