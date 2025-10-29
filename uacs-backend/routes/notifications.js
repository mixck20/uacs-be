const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const auth = require('../middleware/auth');

// Get all notifications for logged-in user
router.get('/user', auth, notificationController.getUserNotifications);

// Get unread notification count
router.get('/unread-count', auth, notificationController.getUnreadCount);

// Mark notification as read
router.post('/mark-read/:id', auth, notificationController.markAsRead);

// Mark all notifications as read
router.post('/mark-all-read', auth, notificationController.markAllAsRead);

// Delete a notification
router.delete('/:id', auth, notificationController.deleteNotification);

// Delete all notifications
router.delete('/', auth, notificationController.deleteAllNotifications);

module.exports = router;
