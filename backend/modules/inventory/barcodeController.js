const crypto = require('crypto');
const CartonBarcode = require('./cartonBarcodeModel');
const Inventory = require('./model');
const Product = require('../products/model');
const PI = require('../pi/model');

// Status groupings used throughout this file. 'unused'/'used' are the old
// two-state names, kept alive for any record that hasn't gone through the
// one-time migrateOutward migration yet — treat them exactly like their
// new equivalents everywhere.
const NOT_STOCKED = ['pending', 'unused']; // QR printed, not yet on a real carton in the warehouse
const EVER_STOCKED = ['in_stock', 'used', 'dispatched', 'split']; // has been scanned in at some point, regardless of what happened since
const AVAILABLE_FOR_DISPATCH = ['in_stock', 'used']; // physically in the warehouse right now, not yet gone

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
// admin/masterAdmin/inward only. Generates `cartonCount` unique, individually
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
    kind: 'outer',
    status: 'pending',
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
// cartons out on the floor. "used" here means "has been stocked in at some
// point" — it does NOT distinguish in_stock vs already-dispatched, that
// distinction lives on each carton's own status when you drill in.
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
        used: { $sum: { $cond: [{ $in: ['$status', EVER_STOCKED] }, 1, 0] } },
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
  const limit = Math.min(200, Math.max(1, +req.query.limit || 10));
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
        used: { $sum: { $cond: [{ $in: ['$status', EVER_STOCKED] }, 1, 0] } },
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
      qty: r.qty, cartons: r.total, used: r.used, unused: r.total - r.used,
      createdBy: r.createdBy || '', createdAt: r.createdAt,
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
    dispatchedTo: carton.dispatchedTo, dispatchedAt: carton.dispatchedAt, dispatchedInvoice: carton.dispatchedInvoice,
  });
}

// POST /api/inventory/carton/:code/confirm — the actual stock-in. Marks the
// carton in_stock (so it can never be scanned in again) and adds its fixed
// quantity to physical stock. Whoever can adjust inventory can do this.
async function confirmCarton(req, res) {
  const carton = await CartonBarcode.findOne({ code: req.params.code });
  if (!carton) return res.status(404).json({ message: 'Barcode not recognised — not one of ours, or mistyped.' });
  if (!NOT_STOCKED.includes(carton.status)) {
    return res.status(409).json({
      message: `Already scanned on ${new Date(carton.usedAt).toLocaleString('en-IN')} by ${carton.usedBy} — not adding again.`,
    });
  }

  carton.status = 'in_stock';
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

// POST /api/inventory/carton/:code/split — admin/masterAdmin/inward only.
// Splits an in-stock OUTER carton into however many INNER cartons actually
// fit inside it (product.cartonOuter / product.cartonInner — not hardcoded
// to 2), each with its own unique code and its own QR, so a partial/inner
// order can be scanned out independently while the sibling inner(s) stay in
// stock with their own working codes. Permanent and one-way: the outer is
// retired (status 'split') and can never be dispatched or scanned again.
// Inner children inherit the outer's ORIGINAL createdAt so FIFO ordering
// treats them as exactly as old as the stock always was — splitting a
// carton doesn't make old stock look new.
async function splitCarton(req, res) {
  const carton = await CartonBarcode.findOne({ code: req.params.code });
  if (!carton) return res.status(404).json({ message: 'Barcode not recognised — not one of ours, or mistyped.' });
  // Old cartons (before this feature shipped) have no `kind` stored at all —
  // Mongoose defaults only apply to new documents, not retroactively — so
  // treat a missing kind as 'outer', same as everywhere else this matters.
  const kind = carton.kind || 'outer';
  if (kind !== 'outer') return res.status(400).json({ message: 'Only an outer carton can be split.' });
  if (!AVAILABLE_FOR_DISPATCH.includes(carton.status)) {
    return res.status(409).json({ message: `Can't split — this carton is ${carton.status}, not in stock.` });
  }

  const product = await Product.findOne({ code: carton.product });
  if (!product || !product.cartonInner) {
    return res.status(400).json({ message: `${carton.productName} has no inner carton size set — can't split.` });
  }
  const innerCount = Math.max(1, Math.round(carton.qty / product.cartonInner));

  const children = Array.from({ length: innerCount }, () => ({
    code: `${carton.code}-${randomSuffix().slice(0, 2)}`,
    batchId: carton.batchId,
    product: carton.product,
    productName: carton.productName,
    qty: product.cartonInner,
    kind: 'inner',
    parentCode: carton.code,
    status: 'in_stock',
    usedBy: carton.usedBy,
    usedAt: carton.usedAt,
    createdBy: carton.createdBy,
  }));
  // createdAt has to be set explicitly and after insert (insertMany respects
  // an explicit createdAt if given, but only via a raw update — simplest is
  // to insert, then force it back to the parent's original date).
  const inserted = await CartonBarcode.insertMany(children, { ordered: false });
  await CartonBarcode.updateMany(
    { _id: { $in: inserted.map((d) => d._id) } },
    { $set: { createdAt: carton.createdAt } }
  );

  carton.status = 'split';
  await carton.save();

  const fresh = await CartonBarcode.find({ _id: { $in: inserted.map((d) => d._id) } });
  res.json({ message: `Split into ${innerCount} inner carton(s).`, parentCode: carton.code, children: fresh });
}

// GET /api/inventory/carton/:code/for-dispatch?dealer=<code>&product=<code>
// — validates a scanned code is actually usable for THIS dealer's dispatch,
// and returns FIFO guidance (never blocking — see fifoNote). Called as each
// carton is scanned on the Dispatch screen, before it's staged locally;
// nothing here writes anything, the actual dispatch commit is what locks it in.
// `product`, when given (the per-row scan button always sends it), makes
// this reject a carton scanned into the WRONG row with a precise message,
// instead of silently letting a mismatched product through.
async function forDispatchScan(req, res) {
  const dealerCode = String(req.query.dealer || '').toUpperCase();
  if (!dealerCode) return res.status(400).json({ message: 'dealer is required' });
  const expectedProduct = req.query.product ? String(req.query.product).toUpperCase() : null;

  // .lean() everywhere in this function — it's entirely read-only (nothing
  // here ever calls .save()), so skipping Mongoose's document hydration
  // (getters, virtuals, change-tracking) is a real, safe speed win on every
  // one of these queries, not just a micro-optimization.
  const carton = await CartonBarcode.findOne({ code: req.params.code }).lean();
  if (!carton) return res.status(404).json({ message: 'Barcode not recognised — not one of ours, or mistyped.' });

  if (carton.status === 'dispatched') {
    return res.status(409).json({ message: `Already dispatched to ${carton.dispatchedTo} on ${new Date(carton.dispatchedAt).toLocaleDateString('en-IN')} — can't dispatch again.` });
  }
  if (carton.status === 'split') {
    return res.status(409).json({ message: 'This carton was split into inner cartons — scan one of its inner labels instead.' });
  }
  if (NOT_STOCKED.includes(carton.status)) {
    return res.status(409).json({ message: `This QR hasn't been scanned IN yet (still ${carton.status}) — do a Stock In scan first, then it can be scanned for dispatch OUT.` });
  }
  if (expectedProduct && carton.product !== expectedProduct) {
    return res.status(409).json({ message: `This carton is ${carton.productName} (${carton.product}) — scan it in that row instead.` });
  }

  // Must actually be part of this dealer's confirmed, undispatched order —
  // same "pick dealer first" rule that collapses the ambiguity of which
  // order a scan belongs to (a scan alone can't tell you the customer).
  // pending===null means "full pcs still pending" — same interpretation
  // dispatch/controller.js uses everywhere else for this exact field.
  // Skipped entirely for a gift scan (?gift=1) — a gift is never tied to
  // any PI line by definition, so this check would always wrongly reject it.
  // Narrowed with 'lines.code' in the query itself (not just filtered in JS
  // afterward) and .select('lines') so MongoDB only sends back the one
  // field this actually needs, instead of every PI's full document.
  if (!req.query.gift) {
    const openPIs = await PI.find(
      { dealer: dealerCode, status: { $in: ['Confirmed', 'Partial Dispatched'] }, 'lines.code': carton.product }
    ).select('lines').lean();
    const pendingForProduct = openPIs.some((pi) =>
      pi.lines.some((l) => l.code === carton.product && (l.pending != null ? l.pending : l.pcs) > 0)
    );
    if (!pendingForProduct) {
      return res.status(409).json({ message: `${carton.productName} isn't part of ${dealerCode}'s confirmed pending order.` });
    }
  }

  // FIFO guidance only — find the oldest available carton of the same kind
  // for this product. Never blocks; just tells the caller if they scanned
  // something other than the oldest, so the UI can show a friendly note.
  // Same missing-kind-on-old-records fix as splitCarton above.
  const kind = carton.kind || 'outer';
  const oldest = await CartonBarcode.findOne({ product: carton.product, kind, status: { $in: AVAILABLE_FOR_DISPATCH } }).sort({ createdAt: 1 }).select('code createdAt').lean();
  const fifoNote = oldest && oldest.code !== carton.code
    ? `There's an older carton still in stock (${oldest.code}, generated ${new Date(oldest.createdAt).toLocaleDateString('en-IN')}) — consider using that one first.`
    : null;

  res.json({
    code: carton.code, product: carton.product, productName: carton.productName, qty: carton.qty, kind,
    fifoNote,
  });
}

// GET /api/inventory/carton/available-counts?codes=A,B,C — how many in_stock
// outer/inner cartons currently exist for each product code, in one batch
// call. Powers the per-row scan button on the Dispatch screen: a row with
// zero available cartons of either kind gets its scan button disabled
// rather than letting someone try to scan for stock that was never tracked
// (or has all already been dispatched).
async function availableCounts(req, res) {
  const codes = String(req.query.codes || '').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
  if (!codes.length) return res.json({});
  const rows = await CartonBarcode.aggregate([
    { $match: { product: { $in: codes }, status: { $in: AVAILABLE_FOR_DISPATCH } } },
    // $ifNull: every carton generated before this feature shipped has no
    // `kind` field stored in the DB at all (Mongoose only applies schema
    // defaults to NEW documents, never retroactively to old ones) — without
    // this, they'd group under a blank kind and never count as available.
    // migrateOutward also backfills this properly, but this keeps the
    // endpoint correct even before that's been run.
    { $group: { _id: { product: '$product', kind: { $ifNull: ['$kind', 'outer'] } }, count: { $sum: 1 } } },
  ]);
  const result = Object.fromEntries(codes.map((c) => [c, { outer: 0, inner: 0 }]));
  rows.forEach((r) => { result[r._id.product][r._id.kind] = r.count; });
  res.json(result);
}

// POST /api/inventory/carton/:code/manual-dispatch — admin/masterAdmin only.
// For a damaged/unreadable label on an old carton: marks that SPECIFIC
// carton dispatched without going through a scan, so FIFO history still
// records the truth (this carton, not a random one, went out). Same
// validation as a real scan, same fields recorded, just flagged as an
// override for the audit trail.
async function manualDispatchCarton(req, res) {
  const { dealerCode } = req.body;
  const carton = await CartonBarcode.findOne({ code: req.params.code });
  if (!carton) return res.status(404).json({ message: 'Barcode not recognised — not one of ours, or mistyped.' });
  if (!AVAILABLE_FOR_DISPATCH.includes(carton.status)) {
    return res.status(409).json({ message: `Can't dispatch — this carton is ${carton.status}.` });
  }
  carton.status = 'dispatched';
  carton.dispatchedTo = String(dealerCode || '').toUpperCase();
  carton.dispatchedBy = req.user.name;
  carton.dispatchedAt = new Date();
  carton.dispatchOverride = true;
  await carton.save();
  res.json({ message: `${carton.code} manually marked dispatched to ${carton.dispatchedTo} (no scan — flagged as override).`, carton });
}

// POST /api/inventory/carton/migrate-outward — masterAdmin only, one-time.
// Reinterprets every pre-existing 'unused'/'used' carton as 'pending'/
// 'in_stock' under the new 3-state lifecycle (outward scanning didn't exist
// before, so every 'used' record really just means "in stock", never
// "dispatched"). Also backfills kind:'outer' on every old record that
// predates this feature entirely — Mongoose schema defaults only apply to
// NEW documents, so an old carton has no `kind` field in the database at
// all, not even the default; several queries (availableCounts, splitCarton,
// FIFO lookup) already defend against that with $ifNull/fallback logic, but
// this fixes the actual data once so nothing has to work around it forever.
// Safe to run more than once — a no-op the second time.
async function migrateOutward(req, res) {
  const a = await CartonBarcode.updateMany({ status: 'unused' }, { $set: { status: 'pending' } });
  const b = await CartonBarcode.updateMany({ status: 'used' }, { $set: { status: 'in_stock' } });
  const c = await CartonBarcode.updateMany({ kind: { $exists: false } }, { $set: { kind: 'outer', parentCode: '' } });
  res.json({
    message: `Migrated ${a.modifiedCount} pending + ${b.modifiedCount} in_stock + ${c.modifiedCount} kind-backfilled record(s).`,
    pending: a.modifiedCount, inStock: b.modifiedCount, kindBackfilled: c.modifiedCount,
  });
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

// DELETE /api/inventory/stock-in-batches/:batchId — masterAdmin only.
// Deletes one whole batch's carton records (a "generate a batch of QRs"
// mistake — wrong product, wrong quantity, duplicate click). Only allowed
// while every carton in that batch is still 'pending' (never scanned in) —
// once any of them have been stocked in, they represent real, already-
// counted physical inventory (added to Inventory.physical), and deleting
// the barcode record wouldn't reverse that count or the dispatch history;
// it would just quietly break the traceability this whole feature exists
// to provide. clearAll above is the deliberately blunt, all-batches,
// admin-knows-what-they're-doing tool for a full reset — this is the safe,
// everyday, per-batch equivalent for a QR batch that was flat-out a mistake.
async function deleteBatch(req, res) {
  const cartons = await CartonBarcode.find({ batchId: req.params.batchId });
  if (!cartons.length) return res.status(404).json({ message: 'Batch not found' });
  const touched = cartons.filter((c) => c.status !== 'pending' && c.status !== 'unused');
  if (touched.length) {
    return res.status(409).json({
      message: `Can't delete — ${touched.length} of ${cartons.length} carton(s) in this batch have already been scanned in or dispatched. Use "Clear all" if you really need to wipe everything, or contact support.`,
    });
  }
  const result = await CartonBarcode.deleteMany({ batchId: req.params.batchId });
  res.json({ message: `Deleted the batch — ${result.deletedCount} unused QR code(s) removed.`, deletedCount: result.deletedCount });
}

module.exports = {
  generateBatch, getBatch, getByProduct, getRecentBatches, lookupCarton, confirmCarton,
  splitCarton, forDispatchScan, availableCounts, manualDispatchCarton, migrateOutward, clearAll, deleteBatch,
};
