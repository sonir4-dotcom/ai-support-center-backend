const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected Route (Example)
const authMiddleware = require('../middleware/authMiddleware');
router.get('/me', authMiddleware, (req, res) => {
    // This logic usually goes in controller, but kept simple for test
    res.json({ message: 'This is a protected route', userId: req.user.id });
});

module.exports = router;
