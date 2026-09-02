const express = require('express');
const router = express.Router();
const ctrl = require('./controller');
const { protect } = require('../../middleware/auth');
const { allow } = require('../../middleware/role');

router.use(protect);

router.get('/balances', ctrl.allBalances);
router.get('/:code', ctrl.forDealer);
router.post('/payment', allow('accounts', 'founder'), ctrl.recordPayment);

module.exports = router;
