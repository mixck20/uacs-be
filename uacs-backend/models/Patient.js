const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  // Basic Information
  surname: {
    type: String,
    required: false
  },
  firstName: {
    type: String,
    required: false
  },
  middleName: {
    type: String,
    required: false
  },
  fullName: {
    type: String,
    required: true
  },
  studentId: {
    type: String,
    required: false,
    unique: true,
    sparse: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  contactNumber: {
    type: String,
    required: false
  },
  cellNumber: {
    type: String,
    required: false
  },
  dateOfBirth: {
    type: Date,
    required: false
  },
  birthplace: {
    type: String,
    required: false
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: false
  },
  religion: {
    type: String,
    required: false
  },
  address: {
    type: String,
    required: false
  },
  
  // Family Information
  fatherName: {
    type: String,
    required: false
  },
  motherName: {
    type: String,
    required: false
  },
  spouseName: {
    type: String,
    required: false
  },
  bloodType: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'],
    default: 'Unknown'
  },
  medicalHistory: [{
    condition: String,
    diagnosis: String,
    date: Date,
    notes: String
  }],
  allergies: [String],
  medications: [{
    name: String,
    dosage: String,
    frequency: String,
    startDate: Date,
    endDate: Date
  }],
  
  // Emergency Contact
  emergencyContact: {
    name: String,
    relationship: String,
    address: String,
    phone: String,
    cellNumber: String
  },
  
  // Academic Information
  courseYearSection: {
    type: String,
    required: false
  },
  visits: [{
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment'
    },
    date: Date,
    age: Number,
    physician: String,
    nurse: String,
    courseYearSection: String,
    
    // PE Findings
    height: String,
    weight: String,
    bloodPressure: String,
    lmp: String, // Last Menstrual Period for females
    
    // Diagnosis & Treatment
    diagnosis: String,
    treatment: String,
    
    prescriptions: [{
      medication: String,
      dosage: String,
      instructions: String,
      frequency: String
    }],
    vitalSigns: {
      bloodPressure: String,
      temperature: String,
      heartRate: String,
      weight: String,
      height: String
    },
    notes: String,
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  isRegisteredUser: {
    type: Boolean,
    default: false
  },
  
  // Archive Management
  isArchived: {
    type: Boolean,
    default: false,
    index: true
  },
  archivedAt: {
    type: Date,
    default: null
  },
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  archiveReason: {
    type: String,
    enum: ['graduated', 'duplicate', 'inactive', 'entry_error', 'other'],
    default: null
  },
  archiveNotes: {
    type: String,
    default: null
  },
  
  // Edit History Tracking
  editHistory: [{
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    editedAt: {
      type: Date,
      default: Date.now
    },
    changes: {
      type: Object,
      required: true
    },
    reason: {
      type: String,
      default: ''
    }
  }],
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

patientSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  this.isRegisteredUser = !!this.userId;
  
  // Normalize email to lowercase
  if (this.email) {
    this.email = this.email.toLowerCase().trim();
  }
  
  // CRITICAL: Convert empty string studentId to null for sparse unique index
  if (this.studentId === '' || this.studentId === undefined) {
    this.studentId = null;
  }
  
  next();
});

// Create case-insensitive index for email lookups
patientSchema.index({ email: 1 });

// Auto-fix the studentId index on app startup
const Patient = mongoose.model('Patient', patientSchema);

// Fix studentId index to be sparse (allows multiple null values)
Patient.collection.dropIndex('studentId_1').then(() => {
  console.log('✅ Dropped old studentId index');
  return Patient.collection.createIndex(
    { studentId: 1 },
    { unique: true, sparse: true, background: true }
  );
}).then(() => {
  console.log('✅ Created new sparse unique index for studentId');
}).catch((err) => {
  // If index doesn't exist or already sparse, that's fine
  if (err.code === 27 || err.codeName === 'IndexNotFound') {
    console.log('ℹ️  studentId index already correct or doesn\'t exist');
  } else {
    console.log('ℹ️  studentId index check:', err.message);
  }
});

module.exports = Patient;