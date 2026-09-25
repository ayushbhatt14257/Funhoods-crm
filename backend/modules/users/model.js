const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ROLES = ['field', 'mhead', 'accounts', 'dispatch', 'delivery', 'inward', 'admin', 'masterAdmin'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    mobile: { type: String, trim: true, unique: true, sparse: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    states: [{ type: String }], // territory scope for 'field' role, empty = all
    active: { type: Boolean, default: true },
    // Only ever meaningful for role==='masterAdmin' — a per-user toggle,
    // set on the Users page, deciding whether THIS specific masterAdmin
    // account is even allowed to attempt opening the Analysis page at all.
    // Being masterAdmin alone is not enough; this must also be true.
    analyticsAccess: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
