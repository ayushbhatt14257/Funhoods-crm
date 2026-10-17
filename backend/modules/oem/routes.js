const express = require('express');
const router = express.Router();
const ctrl = require('./controller');
const { protect } = require('../../middleware/auth');
const { allow } = require('../../middleware/role');

const WRITERS = ['accounts', 'admin', 'masterAdmin'];
const VIEWERS = ['mhead', 'accounts', 'admin', 'masterAdmin'];

router.use(protect);

router.get('/', allow(...VIEWERS), ctrl.list);
router.get('/counts', allow(...VIEWERS), ctrl.counts);
router.get('/export.xlsx', allow(...VIEWERS), ctrl.exportExcel);
router.post('/', allow(...WRITERS), ctrl.create);
router.get('/:no', allow(...VIEWERS), ctrl.getOne);
router.put('/:no', allow(...WRITERS), ctrl.update);
router.post('/:no/status', allow(...WRITERS), ctrl.setStatus);
router.delete('/:no', allow('admin', 'masterAdmin'), ctrl.remove);

module.exports = router;
