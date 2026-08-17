// Usage: router.get('/x', protect, allow('founder','accounts'), handler)
function allow(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: `Role '${req.user.role}' not permitted for this action` });
    }
    next();
  };
}

module.exports = { allow };
