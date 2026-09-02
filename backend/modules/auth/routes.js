const express = require('express');
const router = express.Router();
const { login, me } = require('./controller');
const { protect } = require('../../middleware/auth');

router.post('/login', login);
router.get('/me', protect, me);

module.exports = router;
