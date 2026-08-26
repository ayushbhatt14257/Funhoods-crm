const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/piController');
const { protect } = require('../middleware/auth');
const { allow } = require('../middleware/role');

router.use(protect);

router.post('/parse', allow('field', 'mhead', 'accounts', 'founder'), ctrl.parseOrder);
router.post('/', allow('field', 'mhead', 'accounts', 'founder'), ctrl.create);
router.put('/:no', allow('field', 'mhead', 'accounts', 'founder'), ctrl.update);
router.get('/', ctrl.list);
router.get('/:no', ctrl.getOne);
router.patch('/:no/status', allow('field', 'mhead', 'accounts', 'founder'), ctrl.setStatus);
router.post('/:no/confirm', allow('mhead', 'accounts', 'founder'), ctrl.confirm);
router.post('/:no/cancel', allow('mhead', 'accounts', 'founder'), ctrl.cancel);
router.delete('/:no', allow('founder'), ctrl.remove);

module.exports = router;
