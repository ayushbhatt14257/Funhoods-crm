const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/dealerController');
const { protect } = require('../middleware/auth');
const { allow } = require('../middleware/role');

router.use(protect);

router.get('/', ctrl.list);
router.get('/:code', ctrl.getOne);
router.post('/', allow('field', 'mhead', 'accounts', 'founder'), ctrl.create);
router.put('/:code', allow('field', 'mhead', 'accounts', 'founder'), ctrl.update);
router.delete('/:code', allow('founder'), ctrl.remove);

module.exports = router;
