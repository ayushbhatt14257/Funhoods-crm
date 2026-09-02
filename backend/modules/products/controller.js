const Product = require('./model');
const Inventory = require('../inventory/model');
const PI = require('../pi/model');

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
  res.json({ message: 'Deleted', wasUsedInPastPI: !!usedInPI });
}

module.exports = { list, getOne, create, update, uploadPhoto, remove };
