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

// Barcode stock-in — generating batches is an admin/masterAdmin/inward call
// (that's the "master sets the carton size and prints labels" part, plus
// the new inward role that ONLY does this and the scan-in below); the
// actual warehouse scan-and-confirm is open to whoever handles physical
// stock day to day, same role set as manually adjusting inventory, plus inward.
router.post('/stock-in-batches', allow('admin', 'masterAdmin', 'inward'), barcodeCtrl.generateBatch);
router.get('/stock-in-batches/:batchId', allow('admin', 'masterAdmin', 'inward'), barcodeCtrl.getBatch);
router.delete('/stock-in-batches/:batchId', allow('masterAdmin'), barcodeCtrl.deleteBatch);
// Must come before '/carton/:code' below — otherwise Express matches
// "by-product"/"all"/"recent-batches" as the :code param and these routes never fire.
router.get('/carton/by-product/:code', allow('admin', 'masterAdmin', 'inward'), barcodeCtrl.getByProduct);
router.get('/carton/recent-batches', allow('admin', 'masterAdmin', 'inward'), barcodeCtrl.getRecentBatches);
router.get('/carton/search', allow('mhead', 'accounts', 'dispatch', 'admin', 'masterAdmin', 'inward'), barcodeCtrl.searchCartons);
router.get('/carton/available-counts', allow('mhead', 'accounts', 'dispatch', 'admin', 'masterAdmin'), barcodeCtrl.availableCounts);
router.delete('/carton/all', allow('masterAdmin'), barcodeCtrl.clearAll);
router.post('/carton/migrate-outward', allow('masterAdmin'), barcodeCtrl.migrateOutward);
router.get('/carton/:code', allow('mhead', 'accounts', 'dispatch', 'admin', 'masterAdmin', 'inward'), barcodeCtrl.lookupCarton);
router.post('/carton/:code/confirm', allow('mhead', 'accounts', 'dispatch', 'admin', 'masterAdmin', 'inward'), barcodeCtrl.confirmCarton);
router.post('/carton/:code/split', allow('admin', 'masterAdmin', 'inward'), barcodeCtrl.splitCarton);
router.get('/carton/:code/for-dispatch', allow('mhead', 'accounts', 'dispatch', 'admin', 'masterAdmin'), barcodeCtrl.forDispatchScan);
router.post('/carton/:code/manual-dispatch', allow('admin', 'masterAdmin'), barcodeCtrl.manualDispatchCarton);

module.exports = router;
