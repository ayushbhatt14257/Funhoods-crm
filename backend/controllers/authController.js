const User = require('../models/User');
const generateToken = require('../utils/generateToken');

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

module.exports = { login, me };
