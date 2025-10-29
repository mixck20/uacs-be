const mongoose = require('mongoose');

const timeSlotSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    index: true
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['Online', 'Clinic'],
    required: true
  },
  maxCapacity: {
    type: Number,
    default: 1
  },
  bookedCount: {
    type: Number,
    default: 0
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  appointments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment'
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
timeSlotSchema.index({ date: 1, startTime: 1, type: 1 });

// Check if slot is fully booked
timeSlotSchema.methods.isFullyBooked = function() {
  return this.bookedCount >= this.maxCapacity;
};

// Book a slot
timeSlotSchema.methods.book = function(appointmentId) {
  if (this.isFullyBooked()) {
    throw new Error('Time slot is fully booked');
  }
  this.bookedCount += 1;
  this.appointments.push(appointmentId);
  if (this.bookedCount >= this.maxCapacity) {
    this.isAvailable = false;
  }
};

// Release a slot
timeSlotSchema.methods.release = function(appointmentId) {
  this.bookedCount = Math.max(0, this.bookedCount - 1);
  this.appointments = this.appointments.filter(id => id.toString() !== appointmentId.toString());
  if (this.bookedCount < this.maxCapacity) {
    this.isAvailable = true;
  }
};

module.exports = mongoose.model('TimeSlot', timeSlotSchema);
