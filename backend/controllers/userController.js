const User = require('../models/User');
const { ROLES } = require('../models/User');

// GET /api/users — founder only
async function list(req, res) {
  const users = await User.find().sort({ createdAt: -1 });
  res.json(users);
}

// POST /api/users — founder only. Creates a user with a temporary password (returned once).
async function create(req, res) {
  try {
    const { name, mobile, email, role } = req.body;
    if (!name || !mobile || !role) return res.status(400).json({ message: 'name, mobile, and role are required' });
    if (!ROLES.includes(role)) return res.status(400).json({ message: `role must be one of: ${ROLES.join(', ')}` });

    const existing = await User.findOne({ mobile });
    if (existing) return res.status(400).json({ message: 'A user with this mobile already exists' });

    const tempPassword = Math.random().toString(36).slice(-4).toUpperCase() + Math.random().toString(36).slice(-4).toUpperCase();
    const user = await User.create({ name, mobile, email: email || undefined, role, password: tempPassword });
    res.status(201).json({
      id: user._id, name: user.name, mobile: user.mobile, role: user.role,
      tempPassword, // shown once — frontend must display this and tell the founder to copy it
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// PATCH /api/users/:id/role — founder only
async function setRole(req, res) {
  const { role } = req.body;
  if (!ROLES.includes(role)) return res.status(400).json({ message: `role must be one of: ${ROLES.join(', ')}` });
  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
}

// PATCH /api/users/:id/active — founder only, toggle active/inactive (soft alternative to delete)
async function setActive(req, res) {
  const user = await User.findByIdAndUpdate(req.params.id, { active: !!req.body.active }, { new: true });
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
}

// DELETE /api/users/:id — founder only
async function remove(req, res) {
  if (String(req.user._id) === req.params.id) {
    return res.status(400).json({ message: "You can't delete your own account while logged in as it" });
  }
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ message: 'Deleted' });
}

// PATCH /api/users/me/password — any logged-in user, changes their own password
async function changeMyPassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Current and new password required' });
  if (newPassword.length < 6) return res.status(400).json({ message: 'New password must be at least 6 characters' });

  const user = await User.findById(req.user._id).select('+password');
  const ok = await user.comparePassword(currentPassword);
  if (!ok) return res.status(401).json({ message: 'Current password is incorrect' });

  user.password = newPassword; // re-hashed by the pre-save hook
  await user.save();
  res.json({ message: 'Password changed' });
}

// PATCH /api/users/:id/reset-password — founder only, forces a new temp password for someone who's locked out
async function resetPassword(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const tempPassword = Math.random().toString(36).slice(-4).toUpperCase() + Math.random().toString(36).slice(-4).toUpperCase();
  user.password = tempPassword;
  await user.save();
  res.json({ message: 'Password reset', tempPassword });
}

module.exports = { list, create, setRole, setActive, remove, changeMyPassword, resetPassword };
