const mongoose = require('mongoose');
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
        // Only count OUTER cartons here — inner children born from a split
        // share the same batchId as their parent (see splitCarton), but
        // they were never separately printed/generated as part of this
        // batch's own run: they're a downstream consequence of ONE of this
        // batch's outers, not additional cartons. Without this filter, a
        // batch that generated 1 outer and later split it into 2 inners
        // showed "Cartons: 3" / inflated "Scanned" — triple-counting the
        // same 120 pcs as if 3 separate cartons had been printed, when only
        // 1 ever was. $ne (not $ifNull) is deliberate: every carton has
        // `kind` set going forward (schema default 'outer'), and only a
        // split's children are ever 'inner' — nothing legacy needs a fallback.
        total: { $sum: { $cond: [{ $ne: ['$kind', 'inner'] }, 1, 0] } },
        used: { $sum: { $cond: [{ $and: [{ $ne: ['$kind', 'inner'] }, { $in: ['$status', EVER_STOCKED] }] }, 1, 0] } },
        dispatched: { $sum: { $cond: [{ $and: [{ $ne: ['$kind', 'inner'] }, { $eq: ['$status', 'dispatched'] }] }, 1, 0] } },
        // Inner children counted SEPARATELY, never merged into the outer
        // figures above — outer and inner cartons are never the same unit
        // (different pcs each) and are never combined into one number
        // anywhere in this response; every count here has its own inner
        // twin, always kept side by side.
        innerTotal: { $sum: { $cond: [{ $eq: ['$kind', 'inner'] }, 1, 0] } },
        innerUsed: { $sum: { $cond: [{ $and: [{ $eq: ['$kind', 'inner'] }, { $in: ['$status', EVER_STOCKED] }] }, 1, 0] } },
        innerDispatched: { $sum: { $cond: [{ $and: [{ $eq: ['$kind', 'inner'] }, { $eq: ['$status', 'dispatched'] }] }, 1, 0] } },
      },
    },
    { $sort: { createdAt: -1 } },
  ]);

  const summary = rows.reduce(
    (s, r) => ({
      total: s.total + r.total, used: s.used + r.used, dispatched: s.dispatched + r.dispatched,
      innerTotal: s.innerTotal + r.innerTotal, innerUsed: s.innerUsed + r.innerUsed, innerDispatched: s.innerDispatched + r.innerDispatched,
    }),
    { total: 0, used: 0, dispatched: 0, innerTotal: 0, innerUsed: 0, innerDispatched: 0 }
  );

  // Reconciliation check: how much stock the QR tracking currently thinks
  // is in the warehouse (sum of every 'in_stock' carton's pcs — not
  // 'dispatched', that's already left; not 'pending', that never arrived)
  // versus what Inventory.physical actually shows right now. These should
  // always match going forward (confirmCarton now updates both atomically
  // in one transaction), but any batch scanned in before that fix shipped
  // could have desynced if the stock-in half of that old two-step write
  // ever failed silently — this surfaces that mismatch instead of leaving
  // it invisible, so it can be corrected deliberately via Adjust rather
  // than guessed at.
  const expectedPhysical = await CartonBarcode.aggregate([
    { $match: { product: code, status: 'in_stock' } },
    { $group: { _id: null, pcs: { $sum: '$qty' } } },
  ]).then((r) => r[0]?.pcs || 0);
  const inv = await Inventory.findOne({ code });
  const actualPhysical = inv?.physical || 0;

  res.json({
    product: { code: product.code, name: product.name, photo: product.photo || '' },
    summary: { ...summary, unused: summary.total - summary.used, innerUnused: summary.innerTotal - summary.innerUsed },
    reconcile: { expectedPhysical, actualPhysical, diff: actualPhysical - expectedPhysical },
    batches: rows.map((r) => ({
      batchId: r._id, qty: r.qty, createdAt: r.createdAt, createdBy: r.createdBy || '',
      total: r.total, used: r.used, unused: r.total - r.used,
      innerTotal: r.innerTotal, innerUsed: r.innerUsed, innerUnused: r.innerTotal - r.innerUsed,
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
        // Same reasoning as getByProduct above — exclude a split's inner
        // children from this batch's own Cartons/Scanned counts; they were
        // never independently generated as part of this batch's run.
        total: { $sum: { $cond: [{ $ne: ['$kind', 'inner'] }, 1, 0] } },
        used: { $sum: { $cond: [{ $and: [{ $ne: ['$kind', 'inner'] }, { $in: ['$status', EVER_STOCKED] }] }, 1, 0] } },
        // Kept separate from the outer figures above, never merged — see
        // getByProduct for the full reasoning.
        innerTotal: { $sum: { $cond: [{ $eq: ['$kind', 'inner'] }, 1, 0] } },
        innerUsed: { $sum: { $cond: [{ $and: [{ $eq: ['$kind', 'inner'] }, { $in: ['$status', EVER_STOCKED] }] }, 1, 0] } },
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
      innerTotal: r.innerTotal, innerUsed: r.innerUsed, innerUnused: r.innerTotal - r.innerUsed,
      createdBy: r.createdBy || '', createdAt: r.createdAt,
    }))
  );
}

// GET /api/inventory/carton/search?q=<partial>&product=<code>&limit=20
// admin/masterAdmin/inward only. Partial/substring match on the carton code
// — the "OR find one exact carton code" box used to require the FULL code
// (an exact findOne), which is useless for what it's actually used for:
// someone reading a worn/partial label, or pasting just the last few
// characters they can still make out (e.g. "D510F9" from a split child's
// suffix) had no way to find it. This does a case-insensitive substring
// search instead and returns up to `limit` matches, newest first, so the
// caller can pick the right one when more than one contains the fragment.
// `product`, when given (the Generate/Track tab's already-selected product),
// narrows the search to just that product's cartons — both because it's
// what the person almost always wants, and because a short fragment like
// "0F1A" is far more likely to collide across products than within one.
async function searchCartons(req, res) {
  const q = String(req.query.q || '').trim().toUpperCase();
  if (!q) return res.json([]);
  if (q.length < 3) return res.status(400).json({ message: 'Type at least 3 characters to search.' });

  const limit = Math.min(50, Math.max(1, +req.query.limit || 20));
  const filter = { code: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } };
  if (req.query.product) filter.product = String(req.query.product).toUpperCase();

  const cartons = await CartonBarcode.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  res.json(cartons.map((c) => ({
    code: c.code, status: c.status, qty: c.qty, kind: c.kind || 'outer', parentCode: c.parentCode || '',
    product: c.product, productName: c.productName, batchId: c.batchId, createdAt: c.createdAt,
    usedBy: c.usedBy, usedAt: c.usedAt,
    dispatchedTo: c.dispatchedTo, dispatchedAt: c.dispatchedAt, dispatchedInvoice: c.dispatchedInvoice,
  })));
}

// GET /api/inventory/carton/:code — look up a scanned barcode. Read-only —
// scanning to preview doesn't consume the carton; only /confirm does.
async function lookupCarton(req, res) {
  const carton = await CartonBarcode.findOne({ code: req.params.code });
  if (!carton) return res.status(404).json({ message: 'Barcode not recognised — not one of ours, or mistyped.' });
  const product = await Product.findOne({ code: carton.product });
  res.json({
    code: carton.code, status: carton.status, qty: carton.qty, createdAt: carton.createdAt,
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

  // Both writes below have to succeed together or not at all — this used
  // to be two separate, sequential writes (save the carton, then increment
  // Inventory), which meant a failure in the second one left the carton
  // marked as stocked in while physical stock was never actually
  // incremented: a carton showing "Scanned" with no matching stock. A
  // transaction is what makes that structurally impossible instead of just
  // hoping the second write never fails.
  carton.status = 'in_stock';
  carton.usedBy = req.user.name;
  carton.usedAt = new Date();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await carton.save({ session });
      await Inventory.findOneAndUpdate(
        { code: carton.product },
        { $inc: { physical: carton.qty } },
        { upsert: true, session }
      );
    });
  } catch (err) {
    return res.status(500).json({ message: `Stock-in failed, nothing was changed: ${err.message}` });
  } finally {
    session.endSession();
  }

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
  const splitAt = new Date();

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
    splitAt,
    splitBy: req.user.name,
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
  carton.splitAt = splitAt;
  carton.splitBy = req.user.name;
  await carton.save();

  const fresh = await CartonBarcode.find({ _id: { $in: inserted.map((d) => d._id) } });
  res.json({ message: `Split into ${innerCount} inner carton(s).`, parentCode: carton.code, children: fresh });
}

// DELETE /api/inventory/carton/:code — masterAdmin only. Deletes ONE
// individual carton record. Two different cases, handled differently:
//  - status 'pending' (printed but never scanned in): pure cleanup — this
//    carton was never counted toward Inventory.physical, so nothing needs
//    reversing. This is for a QR that got generated/printed by mistake, or
//    a label that was lost/damaged before it ever made it onto a real box.
//  - status 'in_stock'/'used': reverses this carton's own qty from
//    Inventory.physical too. This is the "phantom split sibling" case —
//    splitCarton's inner count is Math.round(carton.qty /
//    product.cartonInner), and when that division isn't exact, rounding can
//    produce one more discrete QR label than the pcs actually justify —
//    e.g. 210 pcs / 60 per inner rounds 3.5 up to 4 labels of 60 each (240
//    pcs total), overcounting the real 210 by 30. That extra label is
//    scannable but has no matching physical box, and its qty was never
//    really there.
// Never allowed on 'dispatched' (completed, invoiced transaction history —
// same rule as batch delete) or 'split' (no stock of its own; its children
// hold whatever stock survived the split, and are deleted individually).
async function deleteCarton(req, res) {
  const carton = await CartonBarcode.findOne({ code: req.params.code });
  if (!carton) return res.status(404).json({ message: 'Carton not found' });
  const deletable = ['pending', ...AVAILABLE_FOR_DISPATCH];
  if (!deletable.includes(carton.status)) {
    return res.status(409).json({ message: `Can't delete — this carton is ${carton.status}. A dispatched or split carton can't be removed this way.` });
  }

  const hadStock = AVAILABLE_FOR_DISPATCH.includes(carton.status);
  if (hadStock) {
    await Inventory.findOneAndUpdate({ code: carton.product }, { $inc: { physical: -carton.qty } });
  }
  await carton.deleteOne();
  res.json({
    message: hadStock
      ? `Deleted ${carton.code} and reversed ${carton.qty} pcs from stock.`
      : `Deleted ${carton.code} — it was never scanned in, so no stock needed reversing.`,
  });
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
  // everTracked answers a DIFFERENT question from the counts above: "has
  // this product EVER had any carton record at all, in any status" — not
  // "is anything in stock right now". A product with QR batches that have
  // all since been dispatched (0 in stock right now) is still everTracked;
  // a product that has simply never gone through barcode generation at all
  // is not. This distinction is what lets the dispatch UI offer a manual
  // fallback ONLY for products genuinely outside the QR system, while a
  // QR-tracked product sitting at 0 stock stays correctly un-dispatchable —
  // no override — since that 0 is real, not just "we never asked".
  const everTrackedCodes = new Set(await CartonBarcode.distinct('product', { product: { $in: codes } }));
  const result = Object.fromEntries(codes.map((c) => [c, { outer: 0, inner: 0, everTracked: everTrackedCodes.has(c) }]));
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

// Note: a split carton's INNER CHILDREN share the SAME batchId as their
// outer parent (see splitCarton), so deleting "this batch" naturally
// includes them too — if any child was dispatched, the block below catches
// it correctly (unless force=1); if a child is merely in_stock, its pcs
// reverse the same as any other carton (the pcs were only ever counted
// once, at the original stock-in, never a second time at split).
//
// DELETE /api/inventory/stock-in-batches/:batchId?force=1 — masterAdmin only.
// force=1 (a separate, explicit action in the UI — never the default) skips
// the dispatched-carton block below and deletes the QR/tracking records
// regardless of status. It still does NOT touch the Invoice/dispatch record
// that carton was dispatched against, and does NOT reverse any physical
// stock for an already-dispatched carton — that stock was correctly
// deducted at the actual dispatch time using the product's own
// cartonOuter/cartonInner (see dispatch/controller.js), never this carton's
// own qty field, so there is nothing to reverse here. What's actually lost
// with force is narrower than it sounds: only the ability to trace "which
// physical QR fulfilled this specific past dispatch" — the dispatch, the
// customer, the pcs, and the invoice all stay exactly as they are.
async function deleteBatch(req, res) {
  const force = req.query.force === '1' || req.query.force === 'true';
  const cartons = await CartonBarcode.find({ batchId: req.params.batchId });
  if (!cartons.length) return res.status(404).json({ message: 'Batch not found' });

  const dispatched = cartons.filter((c) => c.status === 'dispatched');
  if (dispatched.length && !force) {
    return res.status(409).json({
      message: `Can't delete — ${dispatched.length} of ${cartons.length} carton(s) in this batch have already been dispatched to a customer. That's real transaction history and can't be removed this way — use "Clear all" only if you understand it wipes everything regardless, or contact support.`,
    });
  }

  // Reverse the stock any already-scanned-in (but not dispatched) carton
  // added, grouped by product since a batch could in principle span more
  // than one via a split's children. A dispatched carton's stock is
  // deliberately NEVER reversed here, force or not — see the comment above.
  const stockedIn = cartons.filter((c) => c.status === 'in_stock' || c.status === 'used');
  const pcsByProduct = {};
  stockedIn.forEach((c) => { pcsByProduct[c.product] = (pcsByProduct[c.product] || 0) + c.qty; });
  for (const [code, pcs] of Object.entries(pcsByProduct)) {
    await Inventory.findOneAndUpdate({ code }, { $inc: { physical: -pcs } });
  }

  const result = await CartonBarcode.deleteMany({ batchId: req.params.batchId });
  const reversedPcs = stockedIn.reduce((sum, c) => sum + c.qty, 0);
  res.json({
    message: dispatched.length
      ? `Force-deleted the batch — ${result.deletedCount} QR code(s) removed (${dispatched.length} had been dispatched — their invoices/dispatch history are untouched)${reversedPcs ? `, and ${reversedPcs} pcs reversed from stock for the rest` : ''}.`
      : `Deleted the batch — ${result.deletedCount} QR code(s) removed${reversedPcs ? `, and ${reversedPcs} pcs reversed from stock` : ''}.`,
    deletedCount: result.deletedCount,
    reversedPcs,
  });
}

module.exports = {
  generateBatch, getBatch, getByProduct, getRecentBatches, lookupCarton, searchCartons, confirmCarton,
  splitCarton, deleteCarton, forDispatchScan, availableCounts, manualDispatchCarton, migrateOutward, clearAll, deleteBatch,
};
