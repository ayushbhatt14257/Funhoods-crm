const express = require('express');
const router = express.Router();
const ctrl = require('./controller');
const { protect } = require('../../middleware/auth');

router.use(protect);

router.get('/summary', ctrl.summary);

module.exports = router;
