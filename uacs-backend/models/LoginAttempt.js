const mongoose = require('mongoose');

const loginAttemptSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    index: true
  },
  ipAddress: {
    type: String,
    required: true
  },
  attempts: {
    type: Number,
    default: 0
  },
  lockedUntil: {
    type: Date,
    default: null
  },
  lastAttempt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Auto-delete records after 24 hours of inactivity
loginAttemptSchema.index({ lastAttempt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('LoginAttempt', loginAttemptSchema);
