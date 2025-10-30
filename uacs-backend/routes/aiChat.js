const express = require('express');
const router = express.Router();
const aiChatController = require('../controllers/aiChatController');
const auth = require('../middleware/auth');

// All routes require authentication
router.post('/chat', auth, aiChatController.chat);
router.get('/faqs', auth, aiChatController.getFAQs);
router.get('/available-slots', auth, aiChatController.getAvailableSlots);

module.exports = router;
