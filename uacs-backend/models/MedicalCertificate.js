const mongoose = require('mongoose');

const medicalCertificateSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  purpose: {
    type: String,
    required: true,
    enum: ['Sick Leave', 'School Excuse', 'Work Clearance', 'Insurance', 'Other']
  },
  requestNotes: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'issued'],
    default: 'pending',
    index: true
  },
  // Certificate Details (filled by clinic staff)
  diagnosis: {
    type: String
  },
  dateIssued: {
    type: Date
  },
  validFrom: {
    type: Date
  },
  validUntil: {
    type: Date
  },
  recommendations: {
    type: String
  },
  certificateNumber: {
    type: String,
    unique: true,
    sparse: true
  },
  issuedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectionReason: {
    type: String
  },
  pdfUrl: {
    type: String
  }
}, {
  timestamps: true
});

// Generate certificate number before saving
medicalCertificateSchema.pre('save', async function(next) {
  if (this.isNew && this.status === 'issued' && !this.certificateNumber) {
    const year = new Date().getFullYear();
    const count = await this.constructor.countDocuments();
    this.certificateNumber = `MC-${year}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

module.exports = mongoose.model('MedicalCertificate', medicalCertificateSchema);
