const express = require('express');
const router = express.Router();
const ctrl = require('./controller');
const { protect } = require('../../middleware/auth');
const { allow } = require('../../middleware/role');

router.use(protect);

router.post('/', allow('dispatch', 'accounts', 'admin', 'masterAdmin'), ctrl.create);
router.get('/pending', allow('masterAdmin'), ctrl.listPending);
router.post('/:id/approve', allow('masterAdmin'), ctrl.approve);

module.exports = router;
