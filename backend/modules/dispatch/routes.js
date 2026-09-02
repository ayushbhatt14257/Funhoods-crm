const express = require('express');
const router = express.Router();
const ctrl = require('./controller');
const { protect } = require('../../middleware/auth');
const { allow } = require('../../middleware/role');

router.use(protect);
router.use(allow('dispatch', 'accounts', 'founder'));

router.get('/ready-pis', ctrl.readyPIs);
router.get('/pending-pi/:dealerCode', ctrl.pendingPIForDealer);
router.post('/from-pi/:piNo', ctrl.dispatchFromPI);
router.post('/manual', ctrl.dispatchManual);

module.exports = router;
