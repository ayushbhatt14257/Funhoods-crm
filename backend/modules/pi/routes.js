const express = require('express');
const router = express.Router();
const ctrl = require('./controller');
const { protect } = require('../../middleware/auth');
const { allow } = require('../../middleware/role');

router.use(protect);

router.post('/parse', allow('field', 'mhead', 'accounts', 'admin', 'masterAdmin'), ctrl.parseOrder);
router.post('/', allow('field', 'mhead', 'accounts', 'admin', 'masterAdmin'), ctrl.create);
router.put('/:no', allow('field', 'mhead', 'accounts', 'admin', 'masterAdmin'), ctrl.update);
router.get('/', ctrl.list);
router.get('/approvals/pending', allow('masterAdmin'), ctrl.listPendingApprovals);
router.post('/:no/approve-price', allow('masterAdmin'), ctrl.approvePrice);
router.get('/:no', ctrl.getOne);
router.patch('/:no/status', allow('field', 'mhead', 'accounts', 'admin', 'masterAdmin'), ctrl.setStatus);
router.post('/:no/confirm', allow('mhead', 'accounts', 'admin', 'masterAdmin'), ctrl.confirm);
router.post('/:no/cancel', allow('mhead', 'accounts', 'admin', 'masterAdmin'), ctrl.cancel);
router.post('/:no/close-remaining', allow('dispatch', 'accounts', 'admin', 'masterAdmin'), ctrl.closeRemaining);
router.delete('/:no', allow('admin', 'masterAdmin'), ctrl.remove);

module.exports = router;
