const Patient = require('../models/Patient');
const User = require('../models/User');
const Notification = require('../models/Notification');

// Get all patients with optional filtering
exports.getAllPatients = async (req, res) => {
  try {
    const { filter, search, showArchived } = req.query;
    console.log('Fetching patients with filter:', filter, 'search:', search, 'showArchived:', showArchived);
    
    let query = {};
    
    // Archive filter - default to showing only non-archived
    if (showArchived === 'true') {
      query.isArchived = true;
    } else {
      query.isArchived = { $ne: true }; // Show non-archived by default
    }
    
    // Filter by type
    if (filter === 'registered') {
      query.isRegisteredUser = true;
    } else if (filter === 'walkins') {
      query.isRegisteredUser = false;
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { studentId: { $regex: search, $options: 'i' } }
      ];
    }
    
    const patients = await Patient.find(query)
      .populate('userId', 'name email role courseYear')
      .populate('archivedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();
      
    console.log(`Found ${patients.length} patients`);
    res.json(patients || []);
  } catch (error) {
    console.error('Error fetching patients:', error);
    res.status(500).json({ 
      message: 'Failed to fetch patients',
      error: error.message 
    });
  }
};

exports.createPatient = async (req, res) => {
  try {
    const patientData = { ...req.body };
    
    // Check if linking to existing user by userId
    if (req.body.userId) {
      const user = await User.findById(req.body.userId);
      if (user) {
        patientData.isRegisteredUser = true;
      }
    } else if (req.body.email) {
      // Auto-link if user with this email already exists
      const existingUser = await User.findOne({ email: req.body.email.toLowerCase() });
      if (existingUser) {
        patientData.userId = existingUser._id;
        patientData.isRegisteredUser = true;
        console.log(`Auto-linked patient to existing user: ${req.body.email}`);
      }
    }
    
    const patient = new Patient(patientData);
    const newPatient = await patient.save();
    
    await newPatient.populate('userId', 'name email role courseYear');
    
    res.status(201).json(newPatient);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getPatient = async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id)
      .populate('userId', 'name email role courseYear')
      .populate('visits.appointmentId')
      .populate('visits.addedBy', 'name');
      
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }
    res.json(patient);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get patient by userId (for user portal)
exports.getPatientByUserId = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    console.log('📋 Fetching patient record for userId:', userId);
    console.log('   User email:', req.user.email);
    
    const patient = await Patient.findOne({ userId })
      .populate('visits.appointmentId')
      .populate('visits.addedBy', 'name');
    
    console.log('   Patient found:', patient ? `Yes - ${patient.fullName} with ${patient.visits?.length || 0} visits` : 'No');
      
    if (!patient) {
      return res.status(404).json({ message: 'No patient record found' });
    }
    
    res.json(patient);
  } catch (error) {
    console.error('Error in getPatientByUserId:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.updatePatient = async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }
    
    // Track changes for edit history
    const changes = {};
    const fieldsToTrack = ['fullName', 'surname', 'firstName', 'middleName', 'email', 'studentId', 
                           'contactNumber', 'cellNumber', 'dateOfBirth', 'gender', 'address', 
                           'bloodType', 'courseYearSection', 'emergencyContact'];
    
    fieldsToTrack.forEach(field => {
      if (req.body[field] !== undefined && JSON.stringify(patient[field]) !== JSON.stringify(req.body[field])) {
        changes[field] = {
          old: patient[field],
          new: req.body[field]
        };
      }
    });
    
    // Add to edit history if there are changes
    if (Object.keys(changes).length > 0) {
      patient.editHistory.push({
        editedBy: req.user.id,
        editedAt: new Date(),
        changes: changes,
        reason: req.body.editReason || 'Updated patient information'
      });
    }
    
    Object.assign(patient, req.body);
    const updatedPatient = await patient.save();
    
    await updatedPatient.populate('userId', 'name email role courseYear');
    
    res.json(updatedPatient);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Add visit/health record to patient
exports.addVisitRecord = async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id).populate('userId');
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }
    
    const visitData = {
      ...req.body,
      date: new Date(),
      addedBy: req.user.id
    };
    
    patient.visits.push(visitData);
    await patient.save();
    
    // Send notification to user if patient is linked to a user account
    if (patient.userId) {
      try {
        await Notification.create({
          userId: patient.userId._id,
          type: 'health_record_added',
          title: 'New Health Record Added',
          message: `A new health record has been added to your medical history${visitData.diagnosis ? ': ' + visitData.diagnosis : ''}.`,
          data: {
            patientId: patient._id,
            visitDate: visitData.date
          }
        });
        console.log(`✅ Notification sent to user ${patient.userId.email} for new health record`);
      } catch (notifError) {
        console.error('❌ Failed to send notification:', notifError.message);
        // Don't fail the request if notification fails
      }
    }
    
    res.json({ message: 'Visit record added successfully', patient });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deletePatient = async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }
    await patient.deleteOne();
    res.json({ message: 'Patient deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Link existing patient to user account
exports.linkPatientToUser = async (req, res) => {
  try {
    const { patientId, userId } = req.body;
    
    if (!patientId || !userId) {
      return res.status(400).json({ message: 'Patient ID and User ID are required' });
    }
    
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if patient is already linked to another user
    if (patient.userId && patient.userId.toString() !== userId) {
      return res.status(400).json({ 
        message: 'This patient is already linked to another user account' 
      });
    }
    
    // Link patient to user
    patient.userId = userId;
    patient.isRegisteredUser = true;
    await patient.save();
    
    await patient.populate('userId', 'name email role courseYear');
    
    res.json({ 
      message: 'Patient successfully linked to user account',
      patient 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Search for unlinked patients by email (for manual linking)
exports.searchUnlinkedPatients = async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    const patients = await Patient.find({
      email: { $regex: email, $options: 'i' },
      userId: null
    }).select('fullName email studentId dateOfBirth createdAt visits');
    
    res.json(patients);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Archive patient (soft delete)
exports.archivePatient = async (req, res) => {
  try {
    const { reason, notes } = req.body;
    const patient = await Patient.findById(req.params.id);
    
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }
    
    if (patient.isArchived) {
      return res.status(400).json({ message: 'Patient is already archived' });
    }
    
    // Validate reason
    const validReasons = ['graduated', 'duplicate', 'inactive', 'entry_error', 'other'];
    if (!reason || !validReasons.includes(reason)) {
      return res.status(400).json({ 
        message: 'Valid archive reason is required',
        validReasons 
      });
    }
    
    patient.isArchived = true;
    patient.archivedAt = new Date();
    patient.archivedBy = req.user.id;
    patient.archiveReason = reason;
    patient.archiveNotes = notes || '';
    
    await patient.save();
    await patient.populate('archivedBy', 'name email');
    
    console.log(`Patient ${patient.fullName} archived by ${req.user.email} - Reason: ${reason}`);
    
    res.json({ 
      message: 'Patient archived successfully',
      patient 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Restore archived patient
exports.restorePatient = async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }
    
    if (!patient.isArchived) {
      return res.status(400).json({ message: 'Patient is not archived' });
    }
    
    patient.isArchived = false;
    patient.archivedAt = null;
    patient.archivedBy = null;
    patient.archiveReason = null;
    patient.archiveNotes = null;
    
    await patient.save();
    await patient.populate('userId', 'name email role courseYear');
    
    console.log(`Patient ${patient.fullName} restored by ${req.user.email}`);
    
    res.json({ 
      message: 'Patient restored successfully',
      patient 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
