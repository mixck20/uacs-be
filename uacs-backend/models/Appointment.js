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
    enum: ['Pending', 'Confirmed', 'Completed', 'Cancelled'],
    default: 'Pending'
  },
  reason: {
    type: String,
    required: true
  },
  notes: String,
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