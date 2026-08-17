const express = require('express');
const multer = require('multer');
const router = express.Router();
const ctrl = require('../controllers/importController');
const { protect } = require('../middleware/auth');
const { allow } = require('../middleware/role');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(protect);
router.use(allow('mhead', 'accounts', 'founder'));

router.post('/:type/preview', upload.single('file'), ctrl.preview);
router.post('/:type/confirm', ctrl.confirm);

module.exports = router;
