/**
 * Migration Script: Create Patient Records for Existing Users
 * 
 * This script creates patient records for all users who don't have one yet.
 * Run this once to link existing users to the patient/EHR system.
 * 
 * Usage: node scripts/createPatientsForExistingUsers.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Patient = require('../models/Patient');

async function createPatientsForExistingUsers() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all users (excluding admin/staff who don't need patient records)
    const users = await User.find({ role: 'patient' });
    console.log(`📊 Found ${users.length} users with role 'patient'\n`);

    let created = 0;
    let existing = 0;
    let errors = 0;

    for (const user of users) {
      try {
        // Check if patient record already exists for this user
        const existingPatient = await Patient.findOne({ userId: user._id });
        
        if (existingPatient) {
          existing++;
          console.log(`⏭️  User ${user.name} (${user.email}) already has patient record`);
          continue;
        }

        // Create new patient record
        const patient = new Patient({
          userId: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone || '',
          dateOfBirth: user.dateOfBirth || null,
          gender: user.gender || '',
          address: user.address || '',
          bloodType: '',
          allergies: [],
          currentMedications: [],
          emergencyContact: {
            name: '',
            relationship: '',
            phone: ''
          },
          visits: []
        });

        await patient.save();
        created++;
        console.log(`✅ Created patient record for ${user.name} (${user.email})`);

      } catch (error) {
        errors++;
        console.error(`❌ Error creating patient for ${user.email}:`, error.message);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📈 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ New patient records created: ${created}`);
    console.log(`⏭️  Existing patient records: ${existing}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`📊 Total users processed: ${users.length}`);
    console.log('='.repeat(60) + '\n');

    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
createPatientsForExistingUsers();
