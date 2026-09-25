const express = require('express');
const router = express.Router();
const ctrl = require('./controller');
const { protect } = require('../../middleware/auth');
const { allow } = require('../../middleware/role');
const { requireAnalyticsSession } = require('../../middleware/analyticsSession');

router.use(protect, allow('masterAdmin'));

// OTP verification only needs the normal login + masterAdmin gate — it's
// what ISSUES the analytics session in the first place.
router.post('/verify-otp', ctrl.verifyOtp);

// Every actual data endpoint additionally requires that session.
router.use(requireAnalyticsSession);
router.get('/sales', ctrl.sales);
router.get('/dealers', ctrl.dealerIntel);
router.get('/inventory', ctrl.inventoryAnalytics);
router.get('/financial', ctrl.financial);
router.get('/ops', ctrl.ops);

module.exports = router;
