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
  email: {
    type: String,
    required: false, // Optional for visitors/walk-ins
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
  
  // Guardian/Parent Contact (for notification purposes)
  guardianContact: {
    name: String,
    relationship: String,
    email: String,
    phone: String,
    notifyOnVisit: { type: Boolean, default: false } // Enable/disable visit notifications
  },
  
  // Patient Type Classification
  patientType: {
    type: String,
    enum: ['student', 'faculty', 'staff', 'visitor'],
    default: 'student',
    required: false
  },
  
  // Academic Information (Structured - snapshot from user account)
  department: { type: String }, // Department code
  course: { type: String }, // Course code
  yearLevel: { type: Number }, // 1-5
  section: { type: String }, // Optional section
  // Legacy field for backwards compatibility
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
  
  // Auto-populate department from course (PERMANENT FIX)
  if (this.course && !this.department) {
    const { COURSE_TO_DEPARTMENT } = require('../utils/courseDepartmentMap');
    const autoDepartment = COURSE_TO_DEPARTMENT[this.course];
    if (autoDepartment) {
      this.department = autoDepartment;
      console.log(`🔧 Auto-populated patient department: ${autoDepartment}`);
    }
  }
  
  next();
});

// Create case-insensitive index for email lookups
patientSchema.index({ email: 1 });

// Auto-fix: Drop old studentId index on app startup
const Patient = mongoose.model('Patient', patientSchema);

// Drop old studentId index (field no longer exists)
Patient.collection.dropIndex('studentId_1').then(() => {
  console.log('✅ Dropped old studentId index');
}).catch((err) => {
  // If index doesn't exist, that's fine
  if (err.code === 27 || err.codeName === 'IndexNotFound') {
    console.log('ℹ️  studentId index already dropped or doesn\'t exist');
  } else {
    console.log('⚠️  studentId index drop error:', err.message);
  }
});

module.exports = Patient;