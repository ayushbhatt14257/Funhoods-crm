const express = require('express');
const router = express.Router();
const ctrl = require('./controller');
const { protect } = require('../../middleware/auth');
const { allow } = require('../../middleware/role');

router.use(protect);

router.get('/', ctrl.list);
router.get('/production-planning', allow('admin', 'masterAdmin'), ctrl.productionPlanning);
router.get('/production-planning/export', allow('admin', 'masterAdmin'), ctrl.exportProductionPlanning);
router.patch('/:code', allow('mhead', 'accounts', 'dispatch', 'admin', 'masterAdmin'), ctrl.adjust);
router.post('/bulk-set', allow('mhead', 'accounts', 'admin', 'masterAdmin'), ctrl.bulkSet);

module.exports = router;
