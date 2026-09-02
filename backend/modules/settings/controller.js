const Settings = require('./model');

async function get(req, res) {
  let s = await Settings.findOne({ singleton: 'main' });
  if (!s) s = await Settings.create({ singleton: 'main' });
  res.json(s);
}

async function update(req, res) {
  const updates = { ...req.body };
  delete updates.singleton;
  const s = await Settings.findOneAndUpdate({ singleton: 'main' }, updates, { new: true, upsert: true });
  res.json(s);
}

module.exports = { get, update };
