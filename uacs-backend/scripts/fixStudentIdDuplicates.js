/**
 * Fix duplicate studentId null values in Patient collection
 * 
 * The studentId field has a unique sparse index, but somehow multiple
 * documents have explicit null values instead of undefined.
 * This script removes the studentId field from documents where it's null,
 * allowing the sparse index to work correctly.
 * 
 * Run with: node scripts/fixStudentIdDuplicates.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Patient = require('../models/Patient');

async function fixStudentIdDuplicates() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all patients with null studentId
    const patientsWithNullStudentId = await Patient.find({ 
      studentId: null 
    });

    console.log(`📊 Found ${patientsWithNullStudentId.length} patients with null studentId\n`);

    if (patientsWithNullStudentId.length === 0) {
      console.log('✅ No patients with null studentId. All good!');
      process.exit(0);
    }

    let fixedCount = 0;
    let errorCount = 0;

    for (const patient of patientsWithNullStudentId) {
      try {
        console.log(`Processing: ${patient.fullName} (${patient.email})`);
        
        // Remove the studentId field entirely (set to undefined)
        patient.studentId = undefined;
        await patient.save();
        
        console.log(`  ✅ Fixed - studentId removed\n`);
        fixedCount++;
      } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        errorCount++;
      }
    }

    console.log('='.repeat(60));
    console.log('📈 Fix Summary:');
    console.log(`   ✅ Fixed: ${fixedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log('='.repeat(60) + '\n');

    console.log('✅ Done! The studentId sparse unique index should work now.');
    process.exit(0);

  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

// Run the fix
fixStudentIdDuplicates();
