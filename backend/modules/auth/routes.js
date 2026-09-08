const express = require('express');
const router = express.Router();
const { login, otpLogin, me, checkMobile } = require('./controller');
const { protect } = require('../../middleware/auth');

router.post('/login', login);
router.get('/check-mobile', checkMobile);
router.post('/otp-login', otpLogin);
router.get('/me', protect, me);

module.exports = router;
