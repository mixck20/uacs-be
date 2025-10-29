const mongoose = require('mongoose');

const emailTemplateSchema = new mongoose.Schema({
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  subject: {
    type: String,
    required: true
  },
  body: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['general', 'appointment', 'inventory', 'registration', 'followup', 'reminder', 'welcome', 'alert']
  },
  category: {
    type: String,
    required: true,
    enum: ['notification', 'confirmation', 'reminder', 'alert', 'welcome']
  },
  variables: [{
    name: String,
    description: String
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  usageCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for efficient queries
emailTemplateSchema.index({ createdBy: 1, isActive: 1 });
emailTemplateSchema.index({ type: 1, category: 1 });

module.exports = mongoose.model('EmailTemplate', emailTemplateSchema);
