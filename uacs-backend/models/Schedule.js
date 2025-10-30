const mongoose = require('mongoose');

const staffScheduleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  role: {
    type: String,
    required: true,
    enum: ['physician', 'nurse']
  },
  designation: {
    type: String,
    default: ''
  },
  dayOfDuty: {
    type: String,
    default: ''
  },
  time: {
    type: String,
    default: ''
  },
  schedule: {
    type: String,
    default: ''
  }
});

const doctorScheduleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['physician', 'dentist']
  },
  regularSchedule: {
    type: String,
    default: ''
  },
  medicalExaminationSchedule: {
    type: String,
    default: ''
  }
});

const scheduleSchema = new mongoose.Schema({
  title: {
    type: String,
    default: 'Medical and Dental Clinic Schedule'
  },
  staffSchedules: [staffScheduleSchema],
  doctorSchedules: [doctorScheduleSchema],
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Schedule', scheduleSchema);
