/**
 * Migration script to populate missing department fields for existing users
 * Uses course-to-department mapping to auto-populate department
 * 
 * Run with: node scripts/fixMissingDepartments.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Patient = require('../models/Patient');
const { COURSE_TO_DEPARTMENT } = require('../utils/courseDepartmentMap');

async function fixMissingDepartments() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find users with course but no department
    const usersWithoutDepartment = await User.find({ 
      course: { $exists: true, $ne: null, $ne: '' },
      $or: [
        { department: { $exists: false } },
        { department: null },
        { department: '' }
      ]
    });

    console.log(`📊 Found ${usersWithoutDepartment.length} users with missing departments\n`);

    if (usersWithoutDepartment.length === 0) {
      console.log('✅ All users already have departments. Nothing to fix!');
      process.exit(0);
    }

    let fixedCount = 0;
    let skippedCount = 0;

    for (const user of usersWithoutDepartment) {
      const department = COURSE_TO_DEPARTMENT[user.course];
      
      if (department) {
        console.log(`👤 ${user.email}`);
        console.log(`   Course: ${user.course}`);
        console.log(`   Setting department: ${department}`);
        
        // Update user
        user.department = department;
        await user.save();
        
        // Also update their patient record if it exists
        const patient = await Patient.findOne({ userId: user._id });
        if (patient) {
          patient.department = department;
          await patient.save();
          console.log(`   ✅ Updated User + Patient record`);
        } else {
          console.log(`   ✅ Updated User record`);
        }
        
        fixedCount++;
        console.log('');
      } else {
        console.log(`⚠️  ${user.email} - Course "${user.course}" not in mapping (skipped)\n`);
        skippedCount++;
      }
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`   Fixed: ${fixedCount} users`);
    console.log(`   Skipped: ${skippedCount} users (course not in mapping)`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixMissingDepartments();
