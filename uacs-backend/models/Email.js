const mongoose = require('mongoose');

const emailSchema = new mongoose.Schema({
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipientType: {
    type: String,
    required: true,
    enum: ['all', 'individual', 'custom', 'group']
  },
  recipientGroup: {
    type: String,
    enum: ['students', 'employees', 'both', null]
  },
  recipients: [{
    email: String,
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'failed', 'opened'],
      default: 'sent'
    },
    sentAt: Date,
    openedAt: Date
  }],
  subject: {
    type: String,
    required: true
  },
  body: {
    type: String,
    required: true
  },
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EmailTemplate'
  },
  type: {
    type: String,
    enum: ['manual', 'automated', 'scheduled'],
    default: 'manual'
  },
  category: {
    type: String,
    enum: ['appointment', 'notification', 'reminder', 'alert', 'welcome', 'general'],
    default: 'general'
  },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'sending', 'sent', 'failed'],
    default: 'sent'
  },
  scheduledFor: Date,
  totalRecipients: {
    type: Number,
    default: 0
  },
  sentCount: {
    type: Number,
    default: 0
  },
  deliveredCount: {
    type: Number,
    default: 0
  },
  openedCount: {
    type: Number,
    default: 0
  },
  failedCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for efficient queries
emailSchema.index({ sentBy: 1, createdAt: -1 });
emailSchema.index({ recipientType: 1, status: 1 });
emailSchema.index({ 'recipients.email': 1 });

module.exports = mongoose.model('Email', emailSchema);
