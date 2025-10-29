const Feedback = require('../models/Feedback');
const User = require('../models/User');
const { createNotification } = require('./notificationController');

// Submit feedback (User)
exports.submitFeedback = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, subject, feedback, rating, serviceDate } = req.body;

    // Validation
    if (!subject || !feedback) {
      return res.status(400).json({ message: 'Subject and feedback are required' });
    }

    if (type === 'service' && !rating) {
      return res.status(400).json({ message: 'Rating is required for service feedback' });
    }

    const newFeedback = new Feedback({
      userId,
      type,
      subject,
      feedback,
      rating: type === 'service' ? rating : null,
      serviceDate: type === 'service' && serviceDate ? new Date(serviceDate) : null
    });

    await newFeedback.save();

    // Get user info for notification
    const user = await User.findById(userId);

    // Create notification for clinic staff (we'll send to all clinic staff)
    const clinicStaff = await User.find({ role: { $in: ['clinic_staff', 'admin'] } });
    
    for (const staff of clinicStaff) {
      await createNotification(
        staff._id,
        'feedback',
        'New Feedback Received',
        `${user.firstName} ${user.lastName} submitted ${type} feedback: ${subject}`,
        { feedbackId: newFeedback._id }
      );
    }

    res.status(201).json({
      message: 'Feedback submitted successfully',
      feedback: newFeedback
    });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get user's own feedback
exports.getUserFeedback = async (req, res) => {
  try {
    const userId = req.user.id;

    const feedback = await Feedback.find({ userId })
      .sort({ createdAt: -1 })
      .populate('respondedBy', 'firstName lastName');

    res.json(feedback);
  } catch (error) {
    console.error('Get user feedback error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get all feedback (Clinic staff only)
exports.getAllFeedback = async (req, res) => {
  try {
    const { status, type } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;

    const feedback = await Feedback.find(filter)
      .sort({ createdAt: -1 })
      .populate('userId', 'firstName lastName email role idNumber')
      .populate('respondedBy', 'firstName lastName');

    res.json(feedback);
  } catch (error) {
    console.error('Get all feedback error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get feedback statistics (Clinic staff only)
exports.getFeedbackStats = async (req, res) => {
  try {
    const total = await Feedback.countDocuments();
    const pending = await Feedback.countDocuments({ status: 'pending' });
    const reviewed = await Feedback.countDocuments({ status: 'reviewed' });
    const responded = await Feedback.countDocuments({ status: 'responded' });
    const resolved = await Feedback.countDocuments({ status: 'resolved' });

    // Average rating for service feedback
    const ratingStats = await Feedback.aggregate([
      { $match: { type: 'service', rating: { $ne: null } } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalRatings: { $sum: 1 }
        }
      }
    ]);

    const averageRating = ratingStats.length > 0 ? ratingStats[0].averageRating : 0;
    const totalRatings = ratingStats.length > 0 ? ratingStats[0].totalRatings : 0;

    res.json({
      total,
      pending,
      reviewed,
      responded,
      resolved,
      averageRating: parseFloat(averageRating.toFixed(1)),
      totalRatings
    });
  } catch (error) {
    console.error('Get feedback stats error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Update feedback status (Clinic staff only)
exports.updateFeedbackStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'reviewed', 'responded', 'resolved'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const feedback = await Feedback.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).populate('userId', 'firstName lastName email');

    if (!feedback) {
      return res.status(404).json({ message: 'Feedback not found' });
    }

    res.json({
      message: 'Feedback status updated',
      feedback
    });
  } catch (error) {
    console.error('Update feedback status error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Respond to feedback (Clinic staff only)
exports.respondToFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { response } = req.body;
    const respondedBy = req.user.id;

    if (!response || response.trim() === '') {
      return res.status(400).json({ message: 'Response is required' });
    }

    const feedback = await Feedback.findByIdAndUpdate(
      id,
      {
        response,
        respondedBy,
        respondedAt: new Date(),
        status: 'responded'
      },
      { new: true }
    ).populate('userId', 'firstName lastName email')
     .populate('respondedBy', 'firstName lastName');

    if (!feedback) {
      return res.status(404).json({ message: 'Feedback not found' });
    }

    // Create notification for user
    await createNotification(
      feedback.userId._id,
      'feedback_response',
      'Feedback Response Received',
      `The clinic has responded to your feedback: "${feedback.subject}"`,
      { feedbackId: feedback._id }
    );

    res.json({
      message: 'Response submitted successfully',
      feedback
    });
  } catch (error) {
    console.error('Respond to feedback error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Delete feedback (User can delete their own, clinic can delete any)
exports.deleteFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // If user is not clinic staff, they can only delete their own feedback
    const filter = { _id: id };
    if (!['clinic_staff', 'admin'].includes(userRole)) {
      filter.userId = userId;
    }

    const feedback = await Feedback.findOneAndDelete(filter);

    if (!feedback) {
      return res.status(404).json({ message: 'Feedback not found or unauthorized' });
    }

    res.json({ message: 'Feedback deleted successfully' });
  } catch (error) {
    console.error('Delete feedback error:', error);
    res.status(500).json({ message: error.message });
  }
};
