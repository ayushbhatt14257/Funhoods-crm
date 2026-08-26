const Dealer = require('../models/Dealer');
const Ledger = require('../models/Ledger');
const PI = require('../models/PI');

async function list(req, res) {
  const { q, state } = req.query;
  const filter = {};
  if (q) filter.$or = [{ name: new RegExp(q, 'i') }, { code: new RegExp(q, 'i') }, { city: new RegExp(q, 'i') }];
  if (state) filter.state = state;
  const dealers = await Dealer.find(filter).sort({ createdAt: -1 });
  res.json(dealers);
}

async function getOne(req, res) {
  const d = await Dealer.findOne({ code: req.params.code.toUpperCase() });
  if (!d) return res.status(404).json({ message: 'Dealer not found' });
  const ledger = await Ledger.find({ dealer: d.code }).sort({ date: -1 });
  const balance = ledger.reduce((s, l) => s + l.debit - l.credit, 0);
  res.json({ ...d.toObject(), balance });
}

async function create(req, res) {
  try {
    const body = req.body;
    if (!body.contact || !body.mobile || !body.addr) {
      return res.status(400).json({ message: 'Contact person, mobile, and address are required' });
    }
    if (!body.gstin || !body.gstin.trim()) {
      return res.status(400).json({ message: 'GSTIN is required' });
    }
    if (!body.code) {
      const count = await Dealer.countDocuments();
      body.code = 'DLR' + String(count + 1).padStart(4, '0');
    }
    body.code = body.code.toUpperCase();
    const exists = await Dealer.findOne({ code: body.code });
    if (exists) return res.status(400).json({ message: 'Dealer code already exists' });
    body.createdByName = req.user.name;
    const dealer = await Dealer.create(body);
    res.status(201).json(dealer);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

async function update(req, res) {
  try {
    const code = req.params.code.toUpperCase();
    const updates = { ...req.body };
    delete updates.code;
    const dealer = await Dealer.findOneAndUpdate({ code }, updates, { new: true });
    if (!dealer) return res.status(404).json({ message: 'Dealer not found' });
    res.json(dealer);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

async function remove(req, res) {
  const code = req.params.code.toUpperCase();
  const usedInPI = await PI.exists({ dealer: code });
  const dealer = await Dealer.findOneAndDelete({ code });
  if (!dealer) return res.status(404).json({ message: 'Dealer not found' });
  res.json({ message: 'Deleted', wasUsedInPastPI: !!usedInPI });
}

// PUT /api/dealers/:code/gst-cert  (multipart, field "file")
async function uploadGstCert(req, res) {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const code = req.params.code.toUpperCase();
  const dealer = await Dealer.findOneAndUpdate({ code }, { gstCertUrl: req.file.path }, { new: true });
  if (!dealer) return res.status(404).json({ message: 'Dealer not found' });
  res.json(dealer);
}

// PUT /api/dealers/:code/aadhar  (multipart, field "file")
async function uploadAadhar(req, res) {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const code = req.params.code.toUpperCase();
  const dealer = await Dealer.findOneAndUpdate({ code }, { aadharUrl: req.file.path }, { new: true });
  if (!dealer) return res.status(404).json({ message: 'Dealer not found' });
  res.json(dealer);
}

module.exports = { list, getOne, create, update, remove, uploadGstCert, uploadAadhar };
