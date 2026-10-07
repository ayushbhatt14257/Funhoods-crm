// Thin wrapper over the `india-pincode` package (165,000+ post offices,
// ~750 districts) — turns a 6-digit pincode into a district/state, used to
// auto-fill Dealer.district (see model.js) whenever a dealer's pincode is
// set or changed, and by the one-off backfill endpoint for dealers that
// already had a pincode before this feature existed.
let pin = null;
function getPin() {
  if (!pin) pin = require('india-pincode').getIndiaPincode();
  return pin;
}

// Returns { district, state } (Title Case) or null if the pincode is
// missing/malformed or not found in the dataset. Several post offices can
// share one pincode but they always agree on district/state, so the first
// match is enough.
function lookupDistrict(rawPin) {
  const code = String(rawPin || '').trim();
  if (!/^\d{6}$/.test(code)) return null;
  try {
    const res = getPin().getByPincode(code);
    const entry = res?.success ? res.data?.data?.[0] : null;
    if (!entry) return null;
    return { district: entry.district, state: entry.state };
  } catch {
    return null; // never let a bad lookup block a dealer save
  }
}

module.exports = { lookupDistrict };
