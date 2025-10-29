const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: false
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  date: {
    type: Date,
    required: true
  },
  time: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['Checkup', 'Follow-up', 'Emergency', 'Consultation', 'Online Consultation', 'Clinic Visit', 'Medical Certificate']
  },
  status: {
    type: String,
    required: true,
    enum: ['Pending', 'Confirmed', 'Completed', 'Cancelled', 'Declined', 'Rescheduled'],
    default: 'Pending'
  },
  reason: {
    type: String,
    required: true
  },
  notes: String,
  
  // Cancellation details
  cancelReason: String,
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancelledAt: Date,
  
  // Reschedule history
  rescheduleRequests: [{
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    requestedAt: {
      type: Date,
      default: Date.now
    },
    oldDate: Date,
    oldTime: String,
    newDate: Date,
    newTime: String,
    reason: String,
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending'
    },
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    respondedAt: Date,
    responseNote: String
  }],
  
  // Consultation notes and prescriptions
  consultationNotes: {
    diagnosis: String,
    symptoms: String,
    vitalSigns: {
      bloodPressure: String,
      temperature: String,
      heartRate: String,
      weight: String,
      height: String
    },
    assessment: String,
    treatment: String,
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    addedAt: Date
  },
  
  prescriptions: [{
    medication: String,
    dosage: String,
    frequency: String,
    duration: String,
    instructions: String,
    prescribedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  followUpRecommendations: {
    required: {
      type: Boolean,
      default: false
    },
    suggestedDate: Date,
    instructions: String,
    notes: String
  },
  
  // Queue management
  queueNumber: Number,
  estimatedWaitTime: Number, // in minutes
  queueStatus: {
    type: String,
    enum: ['Waiting', 'Called', 'In-Progress', 'Completed'],
    default: 'Waiting'
  },
  calledAt: Date,
  
  isOnline: {
    type: Boolean,
    default: false
  },
  consultationDetails: {
    meetLink: String,
    chatEnabled: {
      type: Boolean,
      default: false
    },
    duration: {
      type: Number,
      default: 30
    }
  },
  certificateType: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

appointmentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Appointment', appointmentSchema);