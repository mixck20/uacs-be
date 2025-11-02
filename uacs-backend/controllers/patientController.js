const Patient = require('../models/Patient');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Appointment = require('../models/Appointment');
const MedicalCertificate = require('../models/MedicalCertificate');
const { createAuditLog } = require('../middleware/auditLogger');

// Get all patients with optional filtering
exports.getAllPatients = async (req, res) => {
  try {
    const { filter, search, showArchived } = req.query;
    
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
      const searchQuery = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { department: { $regex: search, $options: 'i' } },
        { course: { $regex: search, $options: 'i' } }
      ];
      
      // Handle yearLevel numeric search (yearLevel is a Number type)
      const yearLevelNum = parseInt(search);
      if (!isNaN(yearLevelNum)) {
        searchQuery.push({ yearLevel: yearLevelNum });
      }
      
      query.$or = searchQuery;
    }
    
    const patients = await Patient.find(query)
      .populate('userId', 'name email role department course yearLevel section courseYear')
      .populate('archivedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();
      
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
    
    // Check if a patient record with the same email already exists (preserve health records)
    if (req.body.email) {
      const existingPatient = await Patient.findOne({ 
        email: req.body.email.toLowerCase() 
      });
      
      if (existingPatient) {
        // Patient record exists - update it instead of creating new one
        console.log(`Found existing patient record for ${req.body.email} - preserving health records`);
        
        // Check if linking to user account
        const existingUser = await User.findOne({ email: req.body.email.toLowerCase() });
        if (existingUser) {
          existingPatient.userId = existingUser._id;
          existingPatient.isRegisteredUser = true;
          // Copy academic info from User to Patient (sync data)
          if (existingUser.department) existingPatient.department = existingUser.department;
          if (existingUser.course) existingPatient.course = existingUser.course;
          if (existingUser.yearLevel) existingPatient.yearLevel = existingUser.yearLevel;
          if (existingUser.section) existingPatient.section = existingUser.section;
          console.log(`Re-linked patient to user account: ${req.body.email}`);
        }
        
        // Update patient info but preserve visits/history
        existingPatient.fullName = patientData.fullName || existingPatient.fullName;
        existingPatient.firstName = patientData.firstName || existingPatient.firstName;
        existingPatient.middleName = patientData.middleName || existingPatient.middleName;
        existingPatient.surname = patientData.surname || existingPatient.surname;
        existingPatient.contactNumber = patientData.contactNumber || existingPatient.contactNumber;
        existingPatient.dateOfBirth = patientData.dateOfBirth || existingPatient.dateOfBirth;
        existingPatient.gender = patientData.gender || existingPatient.gender;
        existingPatient.address = patientData.address || existingPatient.address;
        existingPatient.bloodType = patientData.bloodType || existingPatient.bloodType;
        existingPatient.courseYearSection = patientData.courseYearSection || existingPatient.courseYearSection;
        // Academic info (for walk-ins)
        if (patientData.course) existingPatient.course = patientData.course;
        if (patientData.yearLevel) existingPatient.yearLevel = patientData.yearLevel;
        if (patientData.section) existingPatient.section = patientData.section;
        if (patientData.department) existingPatient.department = patientData.department;
        existingPatient.emergencyContact = patientData.emergencyContact || existingPatient.emergencyContact;
        
        // Restore from archive if it was archived
        if (existingPatient.isArchived) {
          existingPatient.isArchived = false;
          existingPatient.archivedAt = null;
          existingPatient.archivedBy = null;
          existingPatient.archiveReason = null;
          existingPatient.archiveNotes = null;
          console.log(`Restored archived patient record for ${req.body.email}`);
        }
        
        await existingPatient.save();
        await existingPatient.populate('userId', 'name email role department course yearLevel section courseYear');
        
        return res.status(200).json(existingPatient);
      }
    }
    
    // No existing patient - create new one
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
        // Copy academic info from User to Patient (use registered user data)
        if (existingUser.department) patientData.department = existingUser.department;
        if (existingUser.course) patientData.course = existingUser.course;
        if (existingUser.yearLevel) patientData.yearLevel = existingUser.yearLevel;
        if (existingUser.section) patientData.section = existingUser.section;
        console.log(`Auto-linked patient to existing user: ${req.body.email}`);
      }
    }
    
    const patient = new Patient(patientData);
    const newPatient = await patient.save();
    
    await newPatient.populate('userId', 'name email role department course yearLevel section courseYear');
    
    // Log patient creation
    await createAuditLog({
      user: req.user,
      action: 'CREATE',
      resource: 'Patient',
      resourceId: newPatient._id.toString(),
      description: `Created patient record: ${newPatient.fullName || newPatient.email}`,
      req,
      status: 'SUCCESS'
    });
    
    res.status(201).json(newPatient);
  } catch (error) {
    // Handle duplicate key error specifically
    if (error.code === 11000 || error.name === 'MongoServerError') {
      if (error.message.includes('email')) {
        return res.status(400).json({ 
          message: 'A patient with this email already exists.',
          error: 'DUPLICATE_EMAIL'
        });
      }
      return res.status(400).json({ 
        message: 'Duplicate record detected. Please check your input.',
        error: 'DUPLICATE_KEY'
      });
    }
    
    console.error('Create patient error:', error);
    res.status(400).json({ message: error.message || 'Failed to create patient' });
  }
};

exports.getPatient = async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id)
      .populate('userId', 'name email role department course yearLevel section courseYear')
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
    console.log('   User name:', req.user.name);
    
    // Also check if there's a patient with this email but different userId (not linked properly)
    const patientByEmail = await Patient.findOne({ email: req.user.email });
    if (patientByEmail && patientByEmail.userId?.toString() !== userId.toString()) {
      console.log('⚠️  Found patient by email but userId mismatch!');
      console.log('   Patient userId:', patientByEmail.userId);
      console.log('   Current userId:', userId);
      console.log('   Fixing link now...');
      
      // Fix the link
      patientByEmail.userId = userId;
      patientByEmail.isRegisteredUser = true;
      await patientByEmail.save();
      
      console.log('✅ Fixed patient-user link');
      return res.json(patientByEmail);
    }
    
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
    const fieldsToTrack = ['fullName', 'surname', 'firstName', 'middleName', 'email', 
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
    
    await updatedPatient.populate('userId', 'name email role department course yearLevel section courseYear');
    
    // Log patient update
    await createAuditLog({
      user: req.user,
      action: 'UPDATE',
      resource: 'Patient',
      resourceId: updatedPatient._id.toString(),
      description: `Updated patient record: ${updatedPatient.fullName || updatedPatient.email}`,
      changes: Object.keys(changes).length > 0 ? { updates: changes } : null,
      req,
      status: 'SUCCESS'
    });
    
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
    
    const { dispenseMedications, ...visitInfo } = req.body;
    
    const visitData = {
      ...visitInfo,
      date: new Date(),
      addedBy: req.user.id
    };
    
    patient.visits.push(visitData);
    await patient.save();
    
    // Auto-dispense medications if requested
    const Inventory = require('../models/Inventory');
    const { sendLowStockAlert } = require('../utils/emailService');
    const User = require('../models/User');
    
    let dispensingResults = [];
    if (dispenseMedications && Array.isArray(dispenseMedications) && dispenseMedications.length > 0) {
      for (const med of dispenseMedications) {
        try {
          const item = await Inventory.findById(med.itemId);
          if (!item) {
            dispensingResults.push({ 
              medication: med.medication, 
              success: false, 
              message: 'Item not found in inventory' 
            });
            continue;
          }
          
          if (item.quantity < med.quantity) {
            dispensingResults.push({ 
              medication: med.medication, 
              success: false, 
              message: `Insufficient stock. Available: ${item.quantity}` 
            });
            continue;
          }
          
          // Deduct from inventory
          item.quantity -= med.quantity;
          const stockAfterDispensing = item.quantity;
          
          // Add to dispensing history (kept for backward compatibility)
          item.dispensingHistory.push({
            patientId: patient._id,
            patientName: patient.fullName,
            quantity: med.quantity,
            dispensedBy: req.user.id,
            reason: visitData.diagnosis || 'Walk-in visit',
            notes: `Prescribed during visit on ${visitData.date.toLocaleDateString()}`
          });
          
          await item.save();
          
          // Create permanent dispensing record in separate collection
          const DispensingRecord = require('../models/DispensingRecord');
          const dispensingRecord = new DispensingRecord({
            itemId: item._id,
            itemName: item.name,
            itemCategory: item.category,
            patientName: patient.fullName,
            patientId: patient._id,
            quantity: med.quantity,
            dispensedBy: req.user.id,
            reason: visitData.diagnosis || 'Walk-in visit',
            notes: `Prescribed during visit on ${visitData.date.toLocaleDateString()}`,
            stockAfterDispensing,
            dispensedAt: new Date()
          });
          await dispensingRecord.save();
          
          dispensingResults.push({ 
            medication: med.medication, 
            success: true, 
            newQuantity: item.quantity 
          });
          
          // Send low stock alert if needed
          if (item.quantity <= item.minQuantity) {
            try {
              const clinicStaff = await User.find({
                role: { $in: ['admin', 'clinic', 'clinic_staff'] },
                isVerified: true
              });
              
              if (clinicStaff.length > 0) {
                await sendLowStockAlert(item, clinicStaff);
                console.log(`📧 Low stock alert sent for ${item.name}`);
              }
            } catch (emailError) {
              console.error('❌ Failed to send low stock email:', emailError.message);
            }
          }
        } catch (dispenseError) {
          console.error('❌ Error dispensing medication:', dispenseError);
          dispensingResults.push({ 
            medication: med.medication, 
            success: false, 
            message: dispenseError.message 
          });
        }
      }
    }
    
    // Send notification to user if patient is linked to a user account
    if (patient.userId && patient.userId._id) {
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
        console.log(`✅ Notification sent to user ${patient.userId.email || 'unknown'} for new health record`);
      } catch (notifError) {
        console.error('❌ Failed to send notification:', notifError.message);
        // Don't fail the request if notification fails
      }
    }
    
    res.json({ 
      message: 'Visit record added successfully', 
      patient,
      dispensingResults: dispensingResults.length > 0 ? dispensingResults : undefined
    });
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
    
    const patientInfo = { 
      name: patient.fullName || patient.email, 
      email: patient.email,
      id: patient._id.toString()
    };
    
    await patient.deleteOne();
    
    // Log patient deletion
    await createAuditLog({
      user: req.user,
      action: 'DELETE',
      resource: 'Patient',
      resourceId: patientInfo.id,
      description: `Deleted patient record: ${patientInfo.name} (${patientInfo.email})`,
      req,
      status: 'SUCCESS'
    });
    
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
    }).select('fullName email dateOfBirth createdAt visits');
    
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

// Get user dashboard data
exports.getUserDashboard = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    console.log('📊 Fetching dashboard data for userId:', userId);

    // Fetch patient record
    const patient = await Patient.findOne({ userId })
      .select('fullName email visits bloodType allergies')
      .lean();

    if (!patient) {
      return res.status(404).json({ message: 'Patient record not found' });
    }

    // Fetch appointments (upcoming and recent past)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const appointments = await Appointment.find({ 
      userId,
      date: { $gte: thirtyDaysAgo }
    })
      .select('date time type status notes meetLink consultationNotes')
      .sort({ date: -1 })
      .limit(10)
      .lean();

    // Fetch medical certificates
    const certificates = await MedicalCertificate.find({ userId })
      .select('purpose status createdAt certificateNumber dateIssued')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // Fetch notifications
    const notifications = await Notification.find({ userId })
      .select('type title message read createdAt data')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Calculate stats
    const stats = {
      totalVisits: patient.visits?.length || 0,
      upcomingAppointments: appointments.filter(apt => 
        new Date(apt.date) >= now && apt.status !== 'Completed' && apt.status !== 'Cancelled'
      ).length,
      pendingCertificates: certificates.filter(cert => cert.status === 'pending').length,
      unreadNotifications: notifications.filter(n => !n.read).length
    };

    // Get recent visits (last 3)
    const recentVisits = patient.visits
      ?.sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 3)
      .map(visit => ({
        date: visit.date,
        diagnosis: visit.diagnosis,
        physician: visit.physician,
        prescriptions: visit.prescriptions
      })) || [];

    // Prepare response
    const dashboardData = {
      user: {
        fullName: patient.fullName,
        email: patient.email,
        bloodType: patient.bloodType,
        allergies: patient.allergies
      },
      stats,
      appointments: appointments.map(apt => ({
        _id: apt._id,
        date: apt.date,
        time: apt.time,
        type: apt.type,
        status: apt.status,
        meetLink: apt.meetLink
      })),
      recentVisits,
      certificates: certificates.map(cert => ({
        _id: cert._id,
        purpose: cert.purpose,
        status: cert.status,
        requestedAt: cert.createdAt,
        certificateNumber: cert.certificateNumber,
        dateIssued: cert.dateIssued
      })),
      notifications: notifications.map(notif => ({
        _id: notif._id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        read: notif.read,
        createdAt: notif.createdAt
      }))
    };

    console.log(`✅ Dashboard data fetched: ${stats.totalVisits} visits, ${stats.upcomingAppointments} upcoming appointments`);
    res.json(dashboardData);

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ message: error.message });
  }
};
