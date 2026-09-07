const express = require('express');
const router = express.Router();
const ctrl = require('./controller');
const { protect } = require('../../middleware/auth');
const { allow } = require('../../middleware/role');

router.use(protect);

router.get('/', ctrl.list);
router.patch('/:code', allow('mhead', 'accounts', 'dispatch', 'admin', 'masterAdmin'), ctrl.adjust);
router.post('/bulk-set', allow('mhead', 'accounts', 'admin', 'masterAdmin'), ctrl.bulkSet);

module.exports = router;
