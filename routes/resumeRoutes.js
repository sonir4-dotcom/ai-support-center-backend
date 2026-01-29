const express = require('express');
const router = express.Router();
const resumeController = require('../controllers/resumeController');
const authMiddleware = require('../middleware/authMiddleware');

// Protect all routes
router.use(authMiddleware);

router.post('/', resumeController.saveResume);
router.get('/', resumeController.getResume);

module.exports = router;
