const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  userEmail: {
    type: String,
    required: true
  },
  userRole: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'CREATE', 'READ', 'UPDATE', 'DELETE',
      'LOGIN', 'LOGOUT', 'LOGIN_FAILED',
      'EXPORT', 'IMPORT', 'DOWNLOAD'
    ]
  },
  resource: {
    type: String,
    required: true,
    // e.g., 'Patient', 'Appointment', 'Inventory', 'User'
  },
  resourceId: {
    type: String,
    // ID of the affected resource
  },
  description: {
    type: String,
    required: true
  },
  changes: {
    type: mongoose.Schema.Types.Mixed,
    // Before and after values for updates
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  status: {
    type: String,
    enum: ['SUCCESS', 'FAILURE'],
    default: 'SUCCESS'
  },
  errorMessage: {
    type: String
  }
}, {
  timestamps: true,
  // Make logs immutable - cannot be edited or deleted
  strict: true
});

// Index for faster queries
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

// Prevent modification of audit logs
auditLogSchema.pre('findOneAndUpdate', function(next) {
  next(new Error('Audit logs cannot be modified'));
});

auditLogSchema.pre('findOneAndDelete', function(next) {
  next(new Error('Audit logs cannot be deleted'));
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
