const express = require('express');
const router = express.Router();
const ctrl = require('./controller');
const { protect } = require('../../middleware/auth');
const { allow } = require('../../middleware/role');
const { upload, uploadMemory } = require('../../config/cloudinary');

const canEdit = allow('mhead', 'accounts', 'founder');

router.use(protect);

router.get('/', ctrl.list);
router.get('/:code', ctrl.getOne);
router.post('/', canEdit, ctrl.create);
router.put('/:code', canEdit, ctrl.update);
router.put('/:code/photo', canEdit, upload.single('photo'), ctrl.uploadPhoto); // legacy, kept for back-compat
router.post('/:code/images', canEdit, uploadMemory.array('images', 10), ctrl.uploadImages);
router.delete('/:code/images', canEdit, ctrl.removeImage);
router.put('/:code/featured-image', canEdit, ctrl.setFeaturedImage);
router.put('/:code/video', canEdit, uploadMemory.single('video'), ctrl.uploadVideo);
router.delete('/:code/video', canEdit, ctrl.removeVideo);
router.delete('/:code', allow('founder'), ctrl.remove);

module.exports = router;
