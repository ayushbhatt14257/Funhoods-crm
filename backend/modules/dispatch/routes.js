const express = require('express');
const router = express.Router();
const ctrl = require('./controller');
const { protect } = require('../../middleware/auth');
const { allow } = require('../../middleware/role');

router.use(protect);
router.use(allow('dispatch', 'accounts', 'admin', 'masterAdmin'));

router.get('/pending-pi/:dealerCode', ctrl.pendingPIForDealer);
router.get('/pending-overview', ctrl.getPendingOverview);
router.get('/customer-pool/:dealerCode', ctrl.getCustomerPool);
router.post('/from-customer-pool', ctrl.dispatchFromPool);
router.post('/manual', ctrl.dispatchManual);
router.post('/hold/:dealerCode', ctrl.holdDealer);
router.post('/unhold/:dealerCode', ctrl.unholdDealer);

module.exports = router;
