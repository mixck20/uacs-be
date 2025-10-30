const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['Medicine', 'Supply', 'Equipment']
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    required: true
  },
  minQuantity: {
    type: Number,
    required: true,
    default: 10
  },
  expiryDate: {
    type: Date
  },
  supplier: {
    name: String,
    contact: String
  },
  location: String,
  description: String,
  dispensingHistory: [{
    patientName: String,
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient'
    },
    studentId: String,
    quantity: {
      type: Number,
      required: true
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
    reason: String,
    notes: String,
    dispensedAt: {
      type: Date,
      default: Date.now
    }
  }],
  lastRestocked: {
    quantity: Number,
    date: Date,
    by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

inventorySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Inventory', inventorySchema);