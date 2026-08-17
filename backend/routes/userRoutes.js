const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const { allow } = require('../middleware/role');

router.use(protect);

// Every role can change their own password
router.patch('/me/password', ctrl.changeMyPassword);

// Founder-only user management
router.get('/', allow('founder'), ctrl.list);
router.post('/', allow('founder'), ctrl.create);
router.patch('/:id/role', allow('founder'), ctrl.setRole);
router.patch('/:id/active', allow('founder'), ctrl.setActive);
router.patch('/:id/reset-password', allow('founder'), ctrl.resetPassword);
router.delete('/:id', allow('founder'), ctrl.remove);

module.exports = router;
