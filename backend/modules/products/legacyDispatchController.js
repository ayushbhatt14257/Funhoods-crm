const XLSX = require('xlsx');
const Product = require('./model');

// Tally's "Stock Group Summary" export is a plain 2-column dump — no real
// header row to key off of (unlike the generic import module's
// EXPECTED_HEADERS approach), just "Particulars" / "Outwards Quantity"
// labels above a run of data rows, ending in a "Grand Total" row. Each data
// row's own product code sits as a literal, case-sensitive prefix at the
// very start of column A (e.g. "SP-01 Spinner Ball", "DC-9004-Metal
// Fighter jet 9.7" — sometimes separated by a space, sometimes by a
// hyphen straight into the name, so no single delimiter rule works; the
// code is just however many of that string's own characters match the
// start of a real product's code).
function extractRows(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const dataRows = [];
  rows.forEach((row) => {
    const text = String(row[0] || '').trim();
    const qty = +row[1];
    if (!text || !Number.isFinite(qty) || qty <= 0) return; // skips header/blank/note rows
    if (/^grand total$/i.test(text)) return;
    dataRows.push({ text, qty });
  });
  return dataRows;
}

// A code is a match only if it's followed immediately by a non-alphanumeric
// character (space, hyphen) or the end of the string — otherwise a short
// code like "M-1" would wrongly match a row that's actually "M-101 ...".
function codeMatchesRowStart(rowText, code) {
  const upperRow = rowText.toUpperCase();
  const upperCode = code.toUpperCase();
  if (!upperRow.startsWith(upperCode)) return false;
  const nextChar = upperRow[upperCode.length];
  return nextChar === undefined || !/[A-Z0-9]/.test(nextChar);
}

// POST /api/products/legacy-dispatch/preview — masterAdmin only, multipart
// file upload. Returns every data row matched against a real product code
// (or unmatched, for the person to skip or investigate) — nothing is saved
// here, this is purely a preview for the confirm step below.
async function previewLegacyDispatch(req, res) {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  let dataRows;
  try {
    dataRows = extractRows(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ message: `Could not read this file — ${err.message}` });
  }
  if (!dataRows.length) return res.status(400).json({ message: "Found no usable rows — expected a 2-column 'Particulars' / 'Outwards Quantity' sheet." });

  const products = await Product.find().select('code name preCrmDispatched').lean();
  // Longest-code-first so a more specific code (e.g. "PVC-3301") is checked
  // before a shorter one that might also technically prefix-match.
  const sortedProducts = [...products].sort((a, b) => b.code.length - a.code.length);

  const preview = dataRows.map((r) => {
    const match = sortedProducts.find((p) => codeMatchesRowStart(r.text, p.code));
    return {
      text: r.text,
      qty: r.qty,
      matchedCode: match?.code || '',
      matchedName: match?.name || '',
      currentPreCrmDispatched: match ? (match.preCrmDispatched || 0) : null,
    };
  });

  res.json({ rows: preview, matchedCount: preview.filter((r) => r.matchedCode).length, totalCount: preview.length });
}

// POST /api/products/legacy-dispatch/confirm  { rows: [{ code, qty }] }
// masterAdmin only. Only ever touches the specific rows the person
// reviewed and approved on the preview screen — sets preCrmDispatched to
// exactly the given qty (a plain overwrite, not additive, since re-running
// this with a corrected number should replace the old baseline, not stack
// on top of it).
async function applyLegacyDispatch(req, res) {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ message: 'No rows to apply' });

  let updated = 0;
  const notFound = [];
  for (const r of rows) {
    const code = String(r.code || '').trim().toUpperCase();
    const qty = +r.qty;
    if (!code || !Number.isFinite(qty) || qty < 0) continue;
    const result = await Product.findOneAndUpdate({ code }, { preCrmDispatched: qty });
    if (result) updated++; else notFound.push(code);
  }

  res.json({
    message: `Updated pre-CRM dispatch baseline for ${updated} product(s)${notFound.length ? ` — ${notFound.length} code(s) not found: ${notFound.join(', ')}` : ''}.`,
    updated, notFound,
  });
}

module.exports = { previewLegacyDispatch, applyLegacyDispatch };
