/**
 * Migration Script: Parse legacy courseYear into structured academic fields
 * 
 * This script migrates existing User records that have courseYear but not
 * the new structured fields (department, course, yearLevel, section)
 * 
 * Run with: node scripts/migrateAcademicFields.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const { COURSE_TO_DEPARTMENT } = require('../utils/courseDepartmentMap');

// Parse courseYear string like "BSIT 3A" or "BSCS-2B" or "BSN 4"
function parseCourseYear(courseYear) {
  if (!courseYear || typeof courseYear !== 'string') {
    return null;
  }

  // Remove extra spaces and normalize
  const normalized = courseYear.trim().replace(/\s+/g, ' ');
  
  // Try to match patterns like:
  // "BSIT 3A", "BSIT 3", "BSIT-3A", "BSIT-3", etc.
  const regex = /^([A-Z]+)[\s\-]*(\d)([A-Z0-9])?$/i;
  const match = normalized.match(regex);
  
  if (!match) {
    console.log(`  ⚠️  Could not parse courseYear: "${courseYear}"`);
    return null;
  }

  const course = match[1].toUpperCase();
  const yearLevel = parseInt(match[2]);
  const section = match[3] ? match[3].toUpperCase() : null;
  const department = COURSE_TO_DEPARTMENT[course] || null;

  return {
    course,
    yearLevel,
    section,
    department
  };
}

async function migrateAcademicFields() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find users with courseYear but missing structured fields
    const usersToMigrate = await User.find({
      courseYear: { $exists: true, $ne: null, $ne: '' },
      $or: [
        { course: { $exists: false } },
        { course: null },
        { course: '' }
      ]
    });

    console.log(`📊 Found ${usersToMigrate.length} users to migrate\n`);

    if (usersToMigrate.length === 0) {
      console.log('✅ No users need migration. All done!');
      process.exit(0);
    }

    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;

    for (const user of usersToMigrate) {
      console.log(`\n👤 Processing: ${user.name} (${user.email})`);
      console.log(`   Current courseYear: "${user.courseYear}"`);

      const parsed = parseCourseYear(user.courseYear);
      
      if (!parsed) {
        console.log(`   ❌ Failed to parse`);
        failCount++;
        continue;
      }

      // Check if department is valid
      if (!parsed.department) {
        console.log(`   ⚠️  Warning: Could not determine department for course "${parsed.course}"`);
        console.log(`   Will set course and yearLevel, but department will remain empty`);
      }

      // Update user
      user.course = parsed.course;
      user.yearLevel = parsed.yearLevel;
      user.section = parsed.section;
      if (parsed.department) {
        user.department = parsed.department;
      }

      try {
        await user.save();
        console.log(`   ✅ Migrated successfully:`);
        console.log(`      Department: ${parsed.department || 'N/A'}`);
        console.log(`      Course: ${parsed.course}`);
        console.log(`      Year Level: ${parsed.yearLevel}`);
        console.log(`      Section: ${parsed.section || 'N/A'}`);
        successCount++;
      } catch (error) {
        console.log(`   ❌ Error saving: ${error.message}`);
        failCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📈 Migration Summary:');
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log(`   ⏭️  Skipped: ${skipCount}`);
    console.log('='.repeat(60) + '\n');

    console.log('✅ Migration complete!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateAcademicFields();
