const express = require('express');
const router = express.Router();
const ctrl = require('./controller');
const { protect } = require('../../middleware/auth');
const { allow } = require('../../middleware/role');

router.use(protect);

router.get('/', ctrl.get);
router.put('/', allow('founder'), ctrl.update);

module.exports = router;
