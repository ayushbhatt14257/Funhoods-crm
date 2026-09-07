const express = require('express');
const router = express.Router();
const ctrl = require('./controller');
const { protect } = require('../../middleware/auth');
const { allow } = require('../../middleware/role');

router.use(protect);

// Every role can change their own password
router.patch('/me/password', ctrl.changeMyPassword);

// Every role can see basic names for filter dropdowns
router.get('/names', ctrl.names);

// masterAdmin-only user management — admin no longer manages team access
router.get('/', allow('masterAdmin'), ctrl.list);
router.post('/', allow('masterAdmin'), ctrl.create);
router.patch('/:id/role', allow('masterAdmin'), ctrl.setRole);
router.patch('/:id/active', allow('masterAdmin'), ctrl.setActive);
router.patch('/:id/reset-password', allow('masterAdmin'), ctrl.resetPassword);
router.delete('/:id', allow('masterAdmin'), ctrl.remove);

module.exports = router;
