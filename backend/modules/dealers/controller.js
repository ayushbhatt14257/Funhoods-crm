const Dealer = require('./model');
const Ledger = require('../ledger/model');
const PI = require('../pi/model');

async function list(req, res) {
  const { q, state, assignedTo } = req.query;
  const filter = {};
  if (q) filter.$or = [{ name: new RegExp(q, 'i') }, { code: new RegExp(q, 'i') }, { city: new RegExp(q, 'i') }];
  if (state) filter.state = state;
  if (assignedTo) filter.assignedTo = assignedTo;
  // Field-sales users only see the parties assigned to them, unless they explicitly asked for someone else's (not allowed).
  if (['field', 'mhead'].includes(req.user.role)) filter.assignedTo = req.user.name;
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
    const gstinTrimmed = body.gstin.trim().toUpperCase();
    const gstinMatch = await Dealer.findOne({ gstin: new RegExp(`^${gstinTrimmed}$`, 'i') });
    if (gstinMatch) {
      return res.status(409).json({
        message: `A dealer with this GSTIN already exists — "${gstinMatch.name}" (${gstinMatch.code})`,
        existingDealer: gstinMatch,
      });
    }
    if (!body.code) {
      const count = await Dealer.countDocuments();
      body.code = 'DLR' + String(count + 1).padStart(4, '0');
    }
    body.code = body.code.toUpperCase();
    const exists = await Dealer.findOne({ code: body.code });
    if (exists) return res.status(400).json({ message: 'Dealer code already exists' });
    body.createdByName = req.user.name;
    if (!body.assignedTo || !body.assignedTo.trim()) body.assignedTo = req.user.name;
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

// PUT /api/dealers/:code/business-card  (multipart, field "file")
async function uploadBusinessCard(req, res) {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const code = req.params.code.toUpperCase();
  const dealer = await Dealer.findOneAndUpdate({ code }, { businessCardUrl: req.file.path }, { new: true });
  if (!dealer) return res.status(404).json({ message: 'Dealer not found' });
  res.json(dealer);
}

// GET /api/dealers/utils/pincode-lookup?city=Indore&state=Madhya%20Pradesh
// Auto-fills the PIN code field once city (+ state, to disambiguate) is
// typed — uses India Post's free public directory. A city can have several
// post offices/pincodes, so this returns the best match rather than forcing
// one; the frontend still leaves the field editable either way.
async function pincodeLookup(req, res) {
  const city = String(req.query.city || '').trim();
  if (!city) return res.status(400).json({ message: 'city required' });
  const state = String(req.query.state || '').trim().toLowerCase();

  try {
    const resp = await fetch(`https://api.postalpincode.in/postoffice/${encodeURIComponent(city)}`);
    const data = await resp.json();
    const offices = data?.[0]?.Status === 'Success' ? data[0].PostOffice || [] : [];
    if (!offices.length) return res.json({ pincode: '', matches: [] });

    // Prefer an office in the selected state, and prefer one whose name is
    // an exact match for the city typed (postoffice search matches substrings too).
    const scored = offices.map((o) => ({
      pincode: o.Pincode, district: o.District, state: o.State, name: o.Name,
      score: (o.State.toLowerCase() === state ? 2 : 0) + (o.Name.toLowerCase() === city.toLowerCase() ? 1 : 0),
    }));
    scored.sort((a, b) => b.score - a.score);
    res.json({ pincode: scored[0].pincode, matches: scored.slice(0, 5) });
  } catch (err) {
    res.json({ pincode: '', matches: [] }); // best-effort — never block the form over a lookup failure
  }
}

module.exports = { list, getOne, create, update, remove, uploadGstCert, uploadAadhar, uploadBusinessCard, pincodeLookup };
