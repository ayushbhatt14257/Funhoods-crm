const Dealer = require('./model');
const Ledger = require('../ledger/model');
const PI = require('../pi/model');
const { lookupDistrict } = require('./districtLookup');

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
    const found = lookupDistrict(body.pin);
    body.district = found?.district || '';
    body.pincodeState = found?.state || '';
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
    // Re-derive district whenever the pincode is part of this edit, same
    // as on create — district is never typed in directly.
    if ('pin' in updates) {
      const found = lookupDistrict(updates.pin);
      updates.district = found?.district || '';
      updates.pincodeState = found?.state || '';
    }
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

// POST /api/dealers/backfill-districts — masterAdmin only, one-off (but
// safe to re-run any time). Fills `district` for every dealer that has a
// pincode on file but no district yet — covers every dealer that existed
// before this feature shipped. Dealers with no pincode, or a pincode not
// found in the dataset, are reported separately so they can be fixed by
// hand (correcting the pincode) rather than silently staying "Unknown".
async function backfillDistricts(req, res) {
  const dealers = await Dealer.find({ pin: { $ne: '' } }).select('code name pin district pincodeState');
  let updated = 0;
  const notFound = [];
  for (const d of dealers) {
    const found = lookupDistrict(d.pin);
    if (!found) { notFound.push({ code: d.code, name: d.name, pin: d.pin }); continue; }
    if (found.district !== d.district || found.state !== d.pincodeState) {
      await Dealer.updateOne({ _id: d._id }, { district: found.district, pincodeState: found.state });
      updated++;
    }
  }
  const noPinCount = await Dealer.countDocuments({ $or: [{ pin: '' }, { pin: { $exists: false } }] });
  res.json({
    message: `${updated} dealer(s) updated. ${notFound.length} had a pincode not found in the dataset. ${noPinCount} have no pincode on file at all.`,
    updated, notFound, noPinCount,
  });
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

module.exports = { list, getOne, create, update, remove, uploadGstCert, uploadAadhar, uploadBusinessCard, pincodeLookup, backfillDistricts };
