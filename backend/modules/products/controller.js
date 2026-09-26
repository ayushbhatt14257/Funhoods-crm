const mongoose = require('mongoose');
const Product = require('./model');
const Inventory = require('../inventory/model');
const CartonBarcode = require('../inventory/cartonBarcodeModel');
const Alias = require('../aliases/model');
const PI = require('../pi/model');
const Invoice = require('../invoices/model');
const { uploadBuffer, destroyAsset } = require('../../config/cloudinary');

async function list(req, res) {
  const { q, includeInactive } = req.query;
  const filter = {};
  if (q) {
    filter.$or = [
      { name: new RegExp(q, 'i') },
      { code: new RegExp(q, 'i') },
    ];
  }
  // Disabled products stay out of every picker (New Order, PI, Dispatch
  // gifting, Generate Barcodes, SKU nicknames...) by default, since they all
  // just call this same endpoint — only the Products management page itself
  // passes includeInactive so it can still find and re-enable one.
  if (!includeInactive) filter.active = { $ne: false };
  const products = await Product.find(filter).sort({ createdAt: -1 });
  res.json(products);
}

async function getOne(req, res) {
  const p = await Product.findOne({ code: req.params.code.toUpperCase() });
  if (!p) return res.status(404).json({ message: 'Product not found' });
  res.json(p);
}

async function create(req, res) {
  try {
    const body = req.body;
    body.code = body.code.toUpperCase();
    if (!body.cartonInner && body.cartonOuter) {
      body.cartonInner = Math.round(body.cartonOuter / 2);
    }
    const exists = await Product.findOne({ code: body.code });
    if (exists) return res.status(400).json({ message: 'Product code already exists' });

    const product = await Product.create(body);
    await Inventory.create({ code: product.code, physical: 0, reserved: 0 });
    res.status(201).json(product);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

async function update(req, res) {
  try {
    const code = req.params.code.toUpperCase();
    const updates = { ...req.body };
    delete updates.code; // code changes only ever go through renameCode below — never a plain field update
    if (updates.cartonOuter && !updates.cartonInner) {
      updates.cartonInner = Math.round(updates.cartonOuter / 2);
    }
    const product = await Product.findOneAndUpdate({ code }, updates, { new: true });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// Applies a single old-code -> new-code replacement across every collection
// that denormalizes a product code, inside the given transaction session.
// Used both for a plain rename (newCode is unused) and as one leg of the
// three-step shuffle a swap needs (see renameCode below).
async function applyCodeChange(from, to, session) {
  await Product.updateOne({ code: from }, { code: to }, { session });
  await Inventory.updateOne({ code: from }, { code: to }, { session });
  await CartonBarcode.updateMany({ product: from }, { product: to }, { session });
  await Alias.updateMany({ code: from }, { code: to }, { session });
  await PI.updateMany(
    { 'lines.code': from },
    { $set: { 'lines.$[el].code': to } },
    { arrayFilters: [{ 'el.code': from }], session }
  );
  await Invoice.updateMany(
    { 'lines.code': from },
    { $set: { 'lines.$[el].code': to } },
    { arrayFilters: [{ 'el.code': from }], session }
  );
  await Invoice.updateMany(
    { 'gifts.code': from },
    { $set: { 'gifts.$[el].code': to } },
    { arrayFilters: [{ 'el.code': from }], session }
  );
}

// POST /api/products/:code/rename-code — masterAdmin only. This is the ONLY
// way a product's code can change; the plain update() above always strips
// it. Renaming a code isn't a single-field edit — the code is denormalized
// into Inventory, every PI/Invoice line that's ever referenced this product,
// carton QR records, and SKU aliases (see applyCodeChange above), so all of
// those have to move together or history quietly breaks.
//
// If newCode is free, this is a plain rename. If newCode already belongs to
// a DIFFERENT existing product, this is treated as a SWAP — both products
// trade codes — done as a three-step shuffle through a throwaway temp code
// so neither update ever collides with the other's current code. Either way
// this runs inside one transaction: if anything fails partway, everything
// rolls back rather than leaving codes half-migrated.
//
// This does NOT and cannot fix a barcode/QR label that's already been
// physically printed — the old code is permanently baked into that paper.
async function renameCode(req, res) {
  const oldCode = req.params.code.toUpperCase();
  const newCode = String(req.body.newCode || '').trim().toUpperCase();
  if (!newCode) return res.status(400).json({ message: 'New code is required' });
  if (newCode === oldCode) return res.status(400).json({ message: 'New code is the same as the current one' });

  const product = await Product.findOne({ code: oldCode });
  if (!product) return res.status(404).json({ message: 'Product not found' });
  const other = await Product.findOne({ code: newCode });

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (!other) {
        await applyCodeChange(oldCode, newCode, session);
      } else {
        const temp = `__TMP_${Date.now()}__`;
        await applyCodeChange(oldCode, temp, session);
        await applyCodeChange(newCode, oldCode, session);
        await applyCodeChange(temp, newCode, session);
      }
    });
  } catch (err) {
    return res.status(500).json({ message: `Rename failed, nothing was changed: ${err.message}` });
  } finally {
    session.endSession();
  }

  const updated = await Product.findOne({ code: newCode });
  res.json({
    message: other
      ? `Swapped codes: this product is now ${newCode}, and ${other.name} is now ${oldCode}.`
      : `Renamed ${oldCode} to ${newCode}.`,
    swapped: !!other,
    otherProductName: other?.name || null,
    product: updated,
  });
}

// PUT /api/products/:code/photo  (multipart form, field name "photo")
async function uploadPhoto(req, res) {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const code = req.params.code.toUpperCase();
  const product = await Product.findOneAndUpdate(
    { code },
    { photo: req.file.path }, // Cloudinary URL from multer-storage-cloudinary
    { new: true }
  );
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
}

async function remove(req, res) {
  const code = req.params.code.toUpperCase();
  const usedInPI = await PI.exists({ 'lines.code': code });
  const product = await Product.findOneAndDelete({ code });
  if (!product) return res.status(404).json({ message: 'Product not found' });
  await Inventory.findOneAndDelete({ code });
  // Best-effort cleanup of everything this product had in Cloudinary.
  await Promise.all([
    ...(product.images || []).map((im) => destroyAsset(im.publicId, 'image')),
    destroyAsset(product.video?.publicId, 'video'),
  ]);
  res.json({ message: 'Deleted', wasUsedInPastPI: !!usedInPI });
}

// --- Gallery (multiple images) ---

// POST /api/products/:code/images  (multipart, field "images", multiple files)
async function uploadImages(req, res) {
  if (!req.files?.length) return res.status(400).json({ message: 'No files uploaded' });
  const code = req.params.code.toUpperCase();
  const product = await Product.findOne({ code });
  if (!product) return res.status(404).json({ message: 'Product not found' });

  const uploaded = await Promise.all(
    req.files.map((f) => uploadBuffer(f.buffer, { folder: `funhoods-crm/products/${code}/images`, resourceType: 'image' }))
  );
  const newImages = uploaded.map((r) => ({ url: r.secure_url, publicId: r.public_id }));
  product.images.push(...newImages);
  if (!product.featuredImage?.url) {
    product.featuredImage = newImages[0];
    product.photo = newImages[0].url;
  }
  await product.save();
  res.json(product);
}

// DELETE /api/products/:code/images  body: { publicId }
async function removeImage(req, res) {
  const code = req.params.code.toUpperCase();
  const { publicId } = req.body;
  if (!publicId) return res.status(400).json({ message: 'publicId required' });
  const product = await Product.findOne({ code });
  if (!product) return res.status(404).json({ message: 'Product not found' });

  await destroyAsset(publicId, 'image');
  product.images = product.images.filter((im) => im.publicId !== publicId);
  if (product.featuredImage?.publicId === publicId) {
    product.featuredImage = product.images[0] || { url: '', publicId: '' };
    product.photo = product.featuredImage.url;
  }
  await product.save();
  res.json(product);
}

// PUT /api/products/:code/featured-image  body: { publicId }
async function setFeaturedImage(req, res) {
  const code = req.params.code.toUpperCase();
  const { publicId } = req.body;
  const product = await Product.findOne({ code });
  if (!product) return res.status(404).json({ message: 'Product not found' });
  const match = product.images.find((im) => im.publicId === publicId);
  if (!match) return res.status(400).json({ message: 'That image is not in this product\'s gallery' });
  product.featuredImage = match;
  product.photo = match.url;
  await product.save();
  res.json(product);
}

// --- Video (single) ---

// PUT /api/products/:code/video  (multipart, field "video")
async function uploadVideo(req, res) {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const code = req.params.code.toUpperCase();
  const product = await Product.findOne({ code });
  if (!product) return res.status(404).json({ message: 'Product not found' });

  if (product.video?.publicId) await destroyAsset(product.video.publicId, 'video'); // replacing — clear the old one
  const result = await uploadBuffer(req.file.buffer, { folder: `funhoods-crm/products/${code}/video`, resourceType: 'video' });
  product.video = { url: result.secure_url, publicId: result.public_id };
  await product.save();
  res.json(product);
}

// DELETE /api/products/:code/video
async function removeVideo(req, res) {
  const code = req.params.code.toUpperCase();
  const product = await Product.findOne({ code });
  if (!product) return res.status(404).json({ message: 'Product not found' });
  await destroyAsset(product.video?.publicId, 'video');
  product.video = { url: '', publicId: '' };
  await product.save();
  res.json(product);
}

// GET /api/products/dispatched-totals — masterAdmin only. Total pieces ever
// actually dispatched per product, all-time, across every invoice (excluding
// Cancelled ones, since those reverse the dispatch). Aggregated in the DB so
// this stays cheap even with a large invoice history. Also returns, per
// product, the most recent date it was ever dispatched at all — a plain
// history fact from real Invoice records, unrelated to current stock
// (a product can show a recent last-sale date while sitting at 0 physical
// stock, or vice versa).
//
// `total` includes preCrmDispatched — the manually-entered baseline for
// pcs dispatched before this product was ever tracked in this CRM (see
// legacyDispatchController.js) — added on top of what this CRM itself has
// computed from real Invoice history. lastDispatchedAt is NOT adjusted by
// it, since the legacy baseline is a single lifetime number with no date
// attached, not an event this CRM ever witnessed.
async function dispatchedTotals(req, res) {
  const rows = await Invoice.aggregate([
    { $match: { status: { $ne: 'Cancelled' } } },
    { $unwind: '$lines' },
    { $group: { _id: '$lines.code', total: { $sum: '$lines.pcs' }, lastDispatchedAt: { $max: '$dispatchDate' } } },
  ]);
  const baselineByCode = Object.fromEntries(
    (await Product.find({ preCrmDispatched: { $gt: 0 } }).select('code preCrmDispatched').lean())
      .map((p) => [p.code, p.preCrmDispatched])
  );
  const result = Object.fromEntries(rows.map((r) => [r._id, { total: r.total + (baselineByCode[r._id] || 0), lastDispatchedAt: r.lastDispatchedAt }]));
  // A product with a legacy baseline but NO invoices at all in this CRM yet
  // (e.g. discontinued before this software went live) wouldn't otherwise
  // appear here at all — this adds it in with just the baseline.
  Object.entries(baselineByCode).forEach(([code, baseline]) => {
    if (!result[code]) result[code] = { total: baseline, lastDispatchedAt: null };
  });
  res.json(result);
}

// GET /api/products/:code/dispatch-breakdown?date=YYYY-MM-DD | ?month=YYYY-MM
// masterAdmin only. Which parties got this product, how many pieces, all-time
// or narrowed to one exact day or one calendar month. Aggregated in the DB —
// unwinds every invoice's lines, keeps only the ones for this product, and
// sums per dealer.
async function dispatchBreakdown(req, res) {
  const code = req.params.code.toUpperCase();
  const { date, month } = req.query;
  const filter = { status: { $ne: 'Cancelled' }, 'lines.code': code };

  if (date) {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end = new Date(date); end.setHours(23, 59, 59, 999);
    filter.createdAt = { $gte: start, $lte: end };
  } else if (month) {
    const [y, m] = month.split('-').map(Number);
    if (y && m) filter.createdAt = { $gte: new Date(y, m - 1, 1), $lte: new Date(y, m, 0, 23, 59, 59, 999) };
  }

  const rows = await Invoice.aggregate([
    { $match: filter },
    { $unwind: '$lines' },
    { $match: { 'lines.code': code } },
    { $group: { _id: '$dealer', dealerName: { $first: '$dealerName' }, total: { $sum: '$lines.pcs' }, invoices: { $addToSet: '$no' } } },
    { $sort: { total: -1 } },
  ]);
  res.json(rows.map((r) => ({ dealer: r._id, dealerName: r.dealerName, total: r.total, invoiceCount: r.invoices.length })));
}

// GET /api/products/export — every product as a downloadable .xlsx, with the
// actual product photo embedded in each row (not just a link), plus a
// "Total Products" count at the top. Images are fetched concurrently so
// this stays reasonably fast even with a few hundred products; any single
// image that fails to fetch is skipped without failing the whole export.
async function exportProducts(req, res) {
  const ExcelJS = require('exceljs');
  const products = await Product.find().sort({ name: 1 });

  const imageBuffers = await Promise.all(
    products.map(async (p) => {
      if (!p.photo) return null;
      try {
        const resp = await fetch(p.photo);
        if (!resp.ok) return null;
        return Buffer.from(await resp.arrayBuffer());
      } catch {
        return null; // best-effort — a broken/slow image link shouldn't block the whole export
      }
    })
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Products');
  sheet.columns = [
    { width: 14 }, { width: 34 }, { width: 14 }, { width: 14 }, { width: 14 },
  ];

  sheet.mergeCells('A1:E1');
  const totalCell = sheet.getCell('A1');
  totalCell.value = `Total Products: ${products.length}`;
  totalCell.font = { bold: true, size: 14 };
  sheet.getRow(1).height = 24;

  const headerRow = sheet.getRow(2);
  headerRow.values = ['Image', 'Name', 'Code', 'Outer Qty (pcs/carton)', 'Inner Qty (pcs/carton)'];
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }; });

  products.forEach((p, i) => {
    const rowNum = i + 3; // rows 1-2 are the total + header
    const row = sheet.getRow(rowNum);
    row.height = 60;
    row.getCell(2).value = p.name;
    row.getCell(3).value = p.code;
    row.getCell(4).value = p.cartonOuter || 0;
    row.getCell(5).value = p.cartonInner || 0;

    const buf = imageBuffers[i];
    if (buf) {
      const ext = p.photo.toLowerCase().includes('.png') ? 'png' : 'jpeg';
      const imgId = workbook.addImage({ buffer: buf, extension: ext });
      sheet.addImage(imgId, { tl: { col: 0, row: rowNum - 1 }, ext: { width: 55, height: 55 } });
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `products-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

module.exports = {
  list, getOne, create, update, renameCode, uploadPhoto, remove,
  uploadImages, removeImage, setFeaturedImage, uploadVideo, removeVideo,
  dispatchedTotals, dispatchBreakdown, exportProducts,
};
