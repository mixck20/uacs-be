const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const auth = require('../middleware/auth');

// Get chat messages for an appointment
router.get('/appointment/:appointmentId', auth, chatController.getAppointmentChat);

// Send a message in appointment chat
router.post('/appointment/:appointmentId/message', auth, chatController.sendMessage);

// Mark messages as read
router.post('/appointment/:appointmentId/mark-read', auth, chatController.markMessagesAsRead);

// Get unread message count
router.get('/unread-count', auth, chatController.getUnreadCount);

module.exports = router;
