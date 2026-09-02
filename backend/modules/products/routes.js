const express = require('express');
const router = express.Router();
const ctrl = require('./controller');
const { protect } = require('../../middleware/auth');
const { allow } = require('../../middleware/role');
const { upload } = require('../../config/cloudinary');

router.use(protect);

router.get('/', ctrl.list);
router.get('/:code', ctrl.getOne);
router.post('/', allow('mhead', 'accounts', 'founder'), ctrl.create);
router.put('/:code', allow('mhead', 'accounts', 'founder'), ctrl.update);
router.put('/:code/photo', allow('mhead', 'accounts', 'founder'), upload.single('photo'), ctrl.uploadPhoto);
router.delete('/:code', allow('founder'), ctrl.remove);

module.exports = router;
