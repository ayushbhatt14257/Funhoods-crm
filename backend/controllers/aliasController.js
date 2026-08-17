const Alias = require('../models/Alias');
const Product = require('../models/Product');

async function list(req, res) {
  const aliases = await Alias.find().sort({ createdAt: -1 });
  res.json(aliases);
}

async function create(req, res) {
  try {
    const alias = String(req.body.alias || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!alias || !code) return res.status(400).json({ message: 'alias and code required' });

    const product = await Product.findOne({ code });
    if (!product) return res.status(400).json({ message: 'Product code does not exist' });

    const doc = await Alias.findOneAndUpdate(
      { alias },
      { alias, code, note: req.body.note || '' },
      { upsert: true, new: true }
    );
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

async function remove(req, res) {
  const doc = await Alias.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Alias not found' });
  res.json({ message: 'Deleted' });
}

module.exports = { list, create, remove };
