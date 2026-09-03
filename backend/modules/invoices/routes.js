const express = require('express');
const router = express.Router();
const ctrl = require('./controller');
const { protect } = require('../../middleware/auth');
const { allow } = require('../../middleware/role');
const { uploadMemory } = require('../../config/cloudinary'); // builty needs the dealer code looked up inside the controller, so it uses memory-buffer upload rather than the static-folder multer middleware

router.use(protect);

router.get('/', ctrl.list);
router.get('/:no', ctrl.getOne);
router.get('/:no/packing-list.xlsx', ctrl.packingListExcel);
router.patch('/:no/delivered', allow('dispatch', 'delivery', 'accounts', 'founder'), ctrl.markDelivered);
router.put('/:no/builty', allow('dispatch', 'delivery', 'accounts', 'founder'), uploadMemory.single('file'), ctrl.uploadBuilty);
router.patch('/:no/mark-paid', allow('accounts', 'founder'), ctrl.markPaid);

module.exports = router;
