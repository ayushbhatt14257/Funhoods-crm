const Product = require('./model');
const Inventory = require('../inventory/model');
const PI = require('../pi/model');
const { uploadBuffer, destroyAsset } = require('../../config/cloudinary');

async function list(req, res) {
  const { q } = req.query;
  const filter = {};
  if (q) {
    filter.$or = [
      { name: new RegExp(q, 'i') },
      { code: new RegExp(q, 'i') },
    ];
  }
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
    delete updates.code; // code is immutable once created
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

module.exports = {
  list, getOne, create, update, uploadPhoto, remove,
  uploadImages, removeImage, setFeaturedImage, uploadVideo, removeVideo,
};
