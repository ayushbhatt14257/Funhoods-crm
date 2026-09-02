const express = require('express');
const router = express.Router();
const ctrl = require('./controller');
const { protect } = require('../../middleware/auth');
const { allow } = require('../../middleware/role');

router.use(protect);

router.get('/', ctrl.list);
router.get('/:no', ctrl.getOne);
router.get('/:no/packing-list.xlsx', ctrl.packingListExcel);
router.patch('/:no/delivered', allow('dispatch', 'accounts', 'founder'), ctrl.markDelivered);

module.exports = router;
