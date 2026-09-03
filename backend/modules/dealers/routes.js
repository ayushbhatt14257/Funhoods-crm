const express = require('express');
const router = express.Router();
const ctrl = require('./controller');
const { protect } = require('../../middleware/auth');
const { allow } = require('../../middleware/role');
const { uploadDealerDoc } = require('../../config/cloudinary');

router.use(protect);

router.get('/', ctrl.list);
router.get('/:code', ctrl.getOne);
router.post('/', allow('field', 'mhead', 'accounts', 'founder'), ctrl.create);
router.put('/:code', allow('field', 'mhead', 'accounts', 'founder'), ctrl.update);
router.put('/:code/gst-cert', allow('field', 'mhead', 'accounts', 'founder'), uploadDealerDoc.single('file'), ctrl.uploadGstCert);
router.put('/:code/aadhar', allow('field', 'mhead', 'accounts', 'founder'), uploadDealerDoc.single('file'), ctrl.uploadAadhar);
router.put('/:code/business-card', allow('field', 'mhead', 'accounts', 'founder'), uploadDealerDoc.single('file'), ctrl.uploadBusinessCard);
router.delete('/:code', allow('founder'), ctrl.remove);

module.exports = router;
