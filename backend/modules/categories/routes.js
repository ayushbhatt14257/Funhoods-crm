const express = require('express');
const router = express.Router();
const ctrl = require('./controller');
const { protect } = require('../../middleware/auth');
const { allow } = require('../../middleware/role');

router.use(protect);

router.get('/', ctrl.list);
router.post('/', allow('mhead', 'accounts', 'founder'), ctrl.create);
router.delete('/:id', allow('mhead', 'accounts', 'founder'), ctrl.remove);

module.exports = router;
