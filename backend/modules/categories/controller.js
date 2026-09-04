const Category = require('./model');
const Product = require('../products/model');

const DEFAULT_CATEGORIES = ['Wooden', 'Friction', 'Gyro', 'Rattle', 'Other'];

async function list(req, res) {
  if ((await Category.countDocuments()) === 0) {
    await Category.insertMany(DEFAULT_CATEGORIES.map((name) => ({ name })));
  }
  const categories = await Category.find().sort({ name: 1 });
  res.json(categories);
}

async function create(req, res) {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Category name required' });
    const doc = await Category.findOneAndUpdate({ name }, { name }, { upsert: true, new: true });
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

async function remove(req, res) {
  const doc = await Category.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Category not found' });
  const inUse = await Product.countDocuments({ category: doc.name });
  if (inUse > 0) {
    return res.status(400).json({ message: `${inUse} product(s) still use "${doc.name}" — change their category first.` });
  }
  await doc.deleteOne();
  res.json({ message: 'Deleted' });
}

module.exports = { list, create, remove };
