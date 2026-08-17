const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/inventoryController');
const { protect } = require('../middleware/auth');
const { allow } = require('../middleware/role');

router.use(protect);

router.get('/', ctrl.list);
router.patch('/:code', allow('mhead', 'accounts', 'dispatch', 'founder'), ctrl.adjust);
router.post('/bulk-set', allow('mhead', 'accounts', 'founder'), ctrl.bulkSet);

module.exports = router;
