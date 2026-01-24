const Patient = require('../models/Patient');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const Inventory = require('../models/Inventory');
const MedicalCertificate = require('../models/MedicalCertificate');
const Email = require('../models/Email');
const Chat = require('../models/Chat');
const Feedback = require('../models/Feedback');
const Schedule = require('../models/Schedule');
const Notification = require('../models/Notification');
const { createAuditLog } = require('../middleware/auditLogger');

// Backup all system data
exports.backupSystemData = async (req, res) => {
  try {
    const backupUser = req.user;
    
    // Only admin and clinic staff can backup
    if (!['admin', 'clinic_staff'].includes(backupUser.role)) {
      return res.status(403).json({ message: 'Unauthorized. Only admin and clinic staff can backup data.' });
    }

    console.log('📦 Starting system-wide data backup...');

    // Fetch all data collections in parallel
    const [
      patients,
      users,
      appointments,
      inventory,
      certificates,
      emails,
      chats,
      feedback,
      schedules,
      notifications
    ] = await Promise.all([
      Patient.find({ isArchived: false }).lean(),
      User.find().select('-password -loginAttempts -lastLogin').lean(),
      Appointment.find().populate('patientId userId', '-password').lean(),
      Inventory.find().lean(),
      MedicalCertificate.find().lean(),
      Email.find().lean(),
      Chat.find().lean(),
      Feedback.find().lean(),
      Schedule.find().lean(),
      Notification.find().lean()
    ]);

    console.log(`✅ Fetched all data:
      - Patients: ${patients.length}
      - Users: ${users.length}
      - Appointments: ${appointments.length}
      - Inventory: ${inventory.length}
      - Certificates: ${certificates.length}
      - Emails: ${emails.length}
      - Chats: ${chats.length}
      - Feedback: ${feedback.length}
      - Schedules: ${schedules.length}
      - Notifications: ${notifications.length}`);

    // Create comprehensive backup object
    const backup = {
      version: '2.0',
      type: 'system',
      exportDate: new Date().toISOString(),
      exportedBy: `${backupUser.firstName} ${backupUser.lastName} (${backupUser.email})`,
      collections: {
        patients: {
          count: patients.length,
          data: patients
        },
        users: {
          count: users.length,
          data: users
        },
        appointments: {
          count: appointments.length,
          data: appointments
        },
        inventory: {
          count: inventory.length,
          data: inventory
        },
        medicalCertificates: {
          count: certificates.length,
          data: certificates
        },
        emails: {
          count: emails.length,
          data: emails
        },
        chats: {
          count: chats.length,
          data: chats
        },
        feedback: {
          count: feedback.length,
          data: feedback
        },
        schedules: {
          count: schedules.length,
          data: schedules
        },
        notifications: {
          count: notifications.length,
          data: notifications
        }
      },
      totalRecords: patients.length + users.length + appointments.length + inventory.length + 
                   certificates.length + emails.length + chats.length + feedback.length + 
                   schedules.length + notifications.length
    };

    // Set response headers for download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="system-backup-${new Date().toISOString().split('T')[0]}.json"`);

    // Log backup action
    await createAuditLog({
      user: backupUser,
      action: 'SYSTEM_BACKUP',
      resource: 'System',
      description: `Full system backup created with ${backup.totalRecords} total records across 10 collections`,
      req,
      status: 'SUCCESS'
    });

    res.status(200).json(backup);
  } catch (error) {
    console.error('Error in system backup:', error);
    res.status(500).json({
      message: error.message || 'Failed to backup system data',
      error: error.message
    });
  }
};

// Restore system data from backup
exports.restoreSystemData = async (req, res) => {
  try {
    const restoreUser = req.user;

    // Only admin can restore full system data
    if (restoreUser.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized. Only admin can restore system data.' });
    }

    const { backup } = req.body;

    if (!backup || !backup.collections) {
      return res.status(400).json({
        message: 'Invalid backup format. Expected backup object with "collections".'
      });
    }

    console.log(`📦 Starting system data restore from backup version ${backup.version}...`);

    const results = {
      collections: {},
      totalRestored: 0,
      totalUpdated: 0,
      totalSkipped: 0,
      errors: []
    };

    // Helper function to process collection data
    const processCollection = async (collectionName, model, data) => {
      const collectionResults = {
        restored: 0,
        updated: 0,
        skipped: 0,
        errors: []
      };

      if (!Array.isArray(data)) {
        collectionResults.skipped = data.length || 0;
        return collectionResults;
      }

      for (let i = 0; i < data.length; i++) {
        try {
          const record = data[i];
          const { _id, ...recordData } = record;

          if (_id) {
            // Try to update existing
            const existing = await model.findById(_id);
            if (existing) {
              await model.findByIdAndUpdate(_id, recordData, { new: true });
              collectionResults.updated++;
            } else {
              // Create new with same _id
              await model.create({ _id, ...recordData });
              collectionResults.restored++;
            }
          } else {
            // Create new without _id
            await model.create(recordData);
            collectionResults.restored++;
          }
        } catch (error) {
          collectionResults.skipped++;
          collectionResults.errors.push({
            index: i,
            reason: error.message
          });
        }
      }

      return collectionResults;
    };

    // Process each collection
    if (backup.collections.patients?.data) {
      results.collections.patients = await processCollection('patients', Patient, backup.collections.patients.data);
    }

    if (backup.collections.users?.data) {
      results.collections.users = await processCollection('users', User, backup.collections.users.data);
    }

    if (backup.collections.appointments?.data) {
      results.collections.appointments = await processCollection('appointments', Appointment, backup.collections.appointments.data);
    }

    if (backup.collections.inventory?.data) {
      results.collections.inventory = await processCollection('inventory', Inventory, backup.collections.inventory.data);
    }

    if (backup.collections.medicalCertificates?.data) {
      results.collections.medicalCertificates = await processCollection('medicalCertificates', MedicalCertificate, backup.collections.medicalCertificates.data);
    }

    if (backup.collections.emails?.data) {
      results.collections.emails = await processCollection('emails', Email, backup.collections.emails.data);
    }

    if (backup.collections.chats?.data) {
      results.collections.chats = await processCollection('chats', Chat, backup.collections.chats.data);
    }

    if (backup.collections.feedback?.data) {
      results.collections.feedback = await processCollection('feedback', Feedback, backup.collections.feedback.data);
    }

    if (backup.collections.schedules?.data) {
      results.collections.schedules = await processCollection('schedules', Schedule, backup.collections.schedules.data);
    }

    if (backup.collections.notifications?.data) {
      results.collections.notifications = await processCollection('notifications', Notification, backup.collections.notifications.data);
    }

    // Calculate totals
    Object.values(results.collections).forEach(col => {
      results.totalRestored += col.restored || 0;
      results.totalUpdated += col.updated || 0;
      results.totalSkipped += col.skipped || 0;
    });

    // Log restore action
    await createAuditLog({
      user: restoreUser,
      action: 'SYSTEM_RESTORE',
      resource: 'System',
      description: `Full system data restored: ${results.totalRestored} created, ${results.totalUpdated} updated, ${results.totalSkipped} skipped across 10 collections`,
      req,
      status: 'SUCCESS'
    });

    console.log(`✅ System restore completed: ${results.totalRestored} created, ${results.totalUpdated} updated, ${results.totalSkipped} skipped`);

    res.status(200).json({
      message: 'System data restored successfully',
      results
    });
  } catch (error) {
    console.error('Error in system restore:', error);
    res.status(500).json({
      message: error.message || 'Failed to restore system data',
      error: error.message
    });
  }
};
