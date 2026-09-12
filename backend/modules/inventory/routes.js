const express = require('express');
const router = express.Router();
const ctrl = require('./controller');
const barcodeCtrl = require('./barcodeController');
const { protect } = require('../../middleware/auth');
const { allow } = require('../../middleware/role');

router.use(protect);

router.get('/', ctrl.list);
router.get('/production-planning', allow('admin', 'masterAdmin'), ctrl.productionPlanning);
router.get('/production-planning/export', allow('admin', 'masterAdmin'), ctrl.exportProductionPlanning);
router.patch('/:code', allow('mhead', 'accounts', 'dispatch', 'admin', 'masterAdmin'), ctrl.adjust);
router.post('/bulk-set', allow('mhead', 'accounts', 'admin', 'masterAdmin'), ctrl.bulkSet);

// Barcode stock-in — generating batches is an admin/masterAdmin call
// (that's the "master sets the carton size and prints labels" part); the
// actual warehouse scan-and-confirm is open to whoever handles physical
// stock day to day, same role set as manually adjusting inventory.
router.post('/stock-in-batches', allow('admin', 'masterAdmin'), barcodeCtrl.generateBatch);
router.get('/stock-in-batches/:batchId', allow('admin', 'masterAdmin'), barcodeCtrl.getBatch);
router.get('/carton/:code', allow('mhead', 'accounts', 'dispatch', 'admin', 'masterAdmin'), barcodeCtrl.lookupCarton);
router.post('/carton/:code/confirm', allow('mhead', 'accounts', 'dispatch', 'admin', 'masterAdmin'), barcodeCtrl.confirmCarton);

module.exports = router;
