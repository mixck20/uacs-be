const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');
const auth = require('../middleware/auth');

// User routes
router.post('/submit', auth, feedbackController.submitFeedback);
router.get('/my-feedback', auth, feedbackController.getUserFeedback);

// Clinic staff routes
router.get('/all', auth, feedbackController.getAllFeedback);
router.get('/stats', auth, feedbackController.getFeedbackStats);
router.put('/:id/status', auth, feedbackController.updateFeedbackStatus);
router.post('/:id/respond', auth, feedbackController.respondToFeedback);
router.delete('/:id', auth, feedbackController.deleteFeedback);

module.exports = router;
