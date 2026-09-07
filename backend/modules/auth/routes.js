const express = require('express');
const router = express.Router();
const { login, otpLogin, me } = require('./controller');
const { protect } = require('../../middleware/auth');

router.post('/login', login);
router.post('/otp-login', otpLogin);
router.get('/me', protect, me);

module.exports = router;
