const jwt = require('jsonwebtoken');

// Verifies the short-lived (24h) analytics-session token issued after OTP
// verification (see analytics/controller.js verifyOtp). Deliberately
// SEPARATE from the regular login JWT (middleware/auth.js) — this gates one
// page, expires in a day regardless of how long the person stays logged
// into the rest of the app, and is required IN ADDITION to, never instead
// of, the normal protect + allow('masterAdmin') chain. Route order matters:
// this must run after protect (it reads req.user).
function requireAnalyticsSession(req, res, next) {
  try {
    const token = req.headers['x-analytics-token'];
    if (!token) return res.status(401).json({ message: 'Analysis session required — please verify with OTP first.' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.analytics || String(decoded.id) !== String(req.user._id)) {
      return res.status(401).json({ message: 'Invalid analysis session.' });
    }

    // Defense in depth: re-checked on every request, not just at OTP time —
    // if access is revoked mid-session (Users page toggle switched off),
    // this closes it out immediately instead of waiting for the 24h token
    // to expire on its own.
    if (req.user.role !== 'masterAdmin' || !req.user.analyticsAccess) {
      return res.status(403).json({ message: 'Analysis access has been revoked for this account.' });
    }

    next();
  } catch (err) {
    return res.status(401).json({ message: 'Analysis session expired — please verify with OTP again.' });
  }
}

module.exports = { requireAnalyticsSession };
