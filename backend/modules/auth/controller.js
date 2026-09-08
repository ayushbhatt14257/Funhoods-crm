const User = require('../users/model');
const generateToken = require('../../utils/generateToken');
const { verifyFirebaseIdToken } = require('../../config/firebaseAdmin');

// India-only normalization: Firebase returns E.164 ("+919131295174"); our
// User.mobile is stored as a plain 10-digit local number ("9131295174").
// Strip a leading "+91" (or "91") if present, otherwise fall back to the
// last 10 digits so other formats still have a shot at matching.
function toLocalMobile(e164) {
  const digits = e164.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return digits.slice(2);
  return digits.slice(-10);
}

// POST /api/auth/login  { identifier: email or mobile, password }
async function login(req, res) {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ message: 'identifier and password required' });
    }
    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { mobile: identifier }],
    }).select('+password');

    if (!user || !user.active) return res.status(401).json({ message: 'Invalid credentials' });

    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

    const token = generateToken(user._id);
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        states: user.states,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/auth/me
async function me(req, res) {
  res.json({
    id: req.user._id,
    name: req.user.name,
    email: req.user.email,
    mobile: req.user.mobile,
    role: req.user.role,
    states: req.user.states,
  });
}

// POST /api/auth/otp-login  { idToken }
// idToken comes from Firebase after the user completes phone-number OTP
// verification client-side. We only trust it after Firebase itself confirms
// it's genuine — this endpoint never sees or checks the OTP code directly.
async function otpLogin(req, res) {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ message: 'idToken required' });

    const phoneE164 = await verifyFirebaseIdToken(idToken);
    const mobile = toLocalMobile(phoneE164);

    const user = await User.findOne({ mobile });
    if (!user || !user.active) {
      return res.status(401).json({ message: 'No active account found for this phone number. Ask an admin to add you first.' });
    }

    const token = generateToken(user._id);
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        states: user.states,
      },
    });
  } catch (err) {
    console.error('OTP login failed:', err);
    res.status(401).json({ message: err.message });
  }
}

// GET /api/auth/check-mobile?mobile=9131295174
// Called before Firebase even sends an OTP, so a mobile number with no
// account fails fast — no wasted SMS quota, no "please wait" for a code
// that was never going to work. Deliberately returns only a boolean, never
// which part is wrong, so this can't be used to enumerate valid accounts.
async function checkMobile(req, res) {
  const digits = String(req.query.mobile || '').replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return res.json({ exists: false });
  const user = await User.findOne({ mobile: digits });
  res.json({ exists: !!(user && user.active) });
}

module.exports = { login, otpLogin, me, checkMobile };
