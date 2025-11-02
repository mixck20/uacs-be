const mongoose = require('mongoose');

const dispensingRecordSchema = new mongoose.Schema({
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Inventory',
    required: true
  },
  itemName: {
    type: String,
    required: true
  },
  itemCategory: {
    type: String,
    enum: ['Medicine', 'Supply', 'Equipment'],
    default: 'Medicine'
  },
  patientName: {
    type: String,
    required: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient'
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  dispensedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment'
  },
  reason: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  },
  dispensedAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  // Keep track of stock level at time of dispensing
  stockAfterDispensing: {
    type: Number
  }
}, {
  timestamps: true
});

// Index for faster queries
dispensingRecordSchema.index({ dispensedAt: -1 });
dispensingRecordSchema.index({ itemId: 1, dispensedAt: -1 });
dispensingRecordSchema.index({ patientId: 1 });
dispensingRecordSchema.index({ dispensedBy: 1 });

module.exports = mongoose.model('DispensingRecord', dispensingRecordSchema);
