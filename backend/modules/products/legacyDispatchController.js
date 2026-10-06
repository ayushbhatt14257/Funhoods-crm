const XLSX = require('xlsx');
const Product = require('./model');
const Invoice = require('../invoices/model');

// Tally's export header carries its own date range as plain text, e.g.
// "1-Apr-26 to 6-Oct-26" — found as a cell value near the top of the sheet.
// Scanning every cell for this pattern (rather than assuming a fixed
// row/col) is more robust to Tally's export layout shifting slightly
// between versions or report configurations.
function findDateRange(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const re = /(\d{1,2})-([A-Za-z]{3})-(\d{2,4})\s+to\s+(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/i;
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  // Parses Tally's own "D-Mon-YY" format explicitly rather than relying on
  // the JS Date constructor's string parsing, which is inconsistent across
  // locales/Node versions for ambiguous two-digit-year formats like this.
  function tallyDate(d, mon, y) {
    const year = y.length === 2 ? 2000 + (+y) : +y;
    const month = MONTHS[mon.toLowerCase()];
    if (month === undefined) return null;
    return new Date(year, month, +d);
  }
  for (const row of rows) {
    for (const cell of row) {
      const m = String(cell || '').match(re);
      if (m) {
        const start = tallyDate(m[1], m[2], m[3]);
        const end = tallyDate(m[4], m[5], m[6]);
        if (start && end) {
          end.setHours(23, 59, 59, 999);
          return { start, end, text: `${m[1]}-${m[2]}-${m[3]} to ${m[4]}-${m[5]}-${m[6]}` };
        }
      }
    }
  }
  return null;
}

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

  // The Tally export's own date range (e.g. "1-Apr-26 to 6-Oct-26") usually
  // spans part or all of the period this CRM has ALSO been invoicing in —
  // so the raw Tally quantity is NOT a safe "pre-CRM" baseline by itself
  // (confirmed: adding it on top of live invoices double-counted real
  // dispatches). What's actually missing from this CRM is only the GAP —
  // Tally's total for that period minus what this CRM already has as real
  // invoices for that SAME period, for that SAME product. That gap is what
  // gets suggested as the pre-CRM baseline below; it's never negative
  // (clamped to 0) since a gap can't meaningfully be negative — a CRM total
  // higher than Tally's for the same period just means the gap is 0, not
  // that this CRM "over-counted".
  const dateRange = findDateRange(req.file.buffer);
  let crmTotalByCode = {};
  if (dateRange) {
    const crmRows = await Invoice.aggregate([
      { $match: { status: { $ne: 'Cancelled' }, dispatchDate: { $gte: dateRange.start, $lte: dateRange.end } } },
      { $unwind: '$lines' },
      { $group: { _id: '$lines.code', total: { $sum: '$lines.pcs' } } },
    ]);
    crmTotalByCode = Object.fromEntries(crmRows.map((r) => [r._id, r.total]));
  }

  const preview = dataRows.map((r) => {
    const match = sortedProducts.find((p) => codeMatchesRowStart(r.text, p.code));
    const crmPeriodTotal = match ? (crmTotalByCode[match.code] || 0) : 0;
    const gap = match ? Math.max(0, r.qty - crmPeriodTotal) : null;
    return {
      text: r.text,
      qty: r.qty,
      matchedCode: match?.code || '',
      matchedName: match?.name || '',
      currentPreCrmDispatched: match ? (match.preCrmDispatched || 0) : null,
      crmPeriodTotal: match ? crmPeriodTotal : null,
      gap,
    };
  });

  res.json({
    rows: preview,
    matchedCount: preview.filter((r) => r.matchedCode).length,
    totalCount: preview.length,
    dateRangeText: dateRange ? dateRange.text : null,
    dateRangeFound: !!dateRange,
  });
}

// POST /api/products/legacy-dispatch/confirm  { rows: [{ code, qty }] }
// masterAdmin only. Only ever touches the specific rows the person
// reviewed and approved on the preview screen — sets preCrmDispatched to
// exactly the given qty (a plain overwrite of the stored baseline itself,
// not additive, since re-running this with a corrected number should
// replace the old baseline, not stack on top of it). The qty approved here
// is expected to be the GAP the preview screen calculated (or the person's
// own corrected version of it) — productsController.dispatchedTotals then
// ADDS this stored baseline on top of the live invoice total every time
// it's displayed, which is safe only because this value is the
// non-overlapping gap, not Tally's raw period total.
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
