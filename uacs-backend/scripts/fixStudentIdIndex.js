require('dotenv').config();
const mongoose = require('mongoose');
const Patient = require('../models/Patient');

/**
 * Fix the studentId unique index issue
 * Problem: MongoDB unique index doesn't allow multiple null values unless sparse:true
 * Solution: Drop old index and create new sparse unique index
 */

async function fixStudentIdIndex() {
  try {
    console.log('🔧 Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database');

    const collection = mongoose.connection.db.collection('patients');

    console.log('\n📊 Checking current indexes...');
    const indexes = await collection.indexes();
    console.log('Current indexes:', JSON.stringify(indexes, null, 2));

    // Check if there's a studentId index
    const studentIdIndex = indexes.find(idx => idx.key && idx.key.studentId);
    
    if (studentIdIndex) {
      console.log('\n🔍 Found studentId index:', studentIdIndex.name);
      console.log('   Sparse:', studentIdIndex.sparse);
      console.log('   Unique:', studentIdIndex.unique);

      // Drop the old index if it's not sparse
      if (!studentIdIndex.sparse) {
        console.log('\n🗑️  Dropping non-sparse studentId index...');
        await collection.dropIndex(studentIdIndex.name);
        console.log('✅ Old index dropped');
      } else {
        console.log('\n✅ Index is already sparse - no need to drop');
        
        // Check for duplicate null studentIds
        const nullCount = await Patient.countDocuments({ studentId: null });
        console.log(`\n📋 Found ${nullCount} patients with null studentId`);
        
        if (nullCount > 1) {
          console.log('⚠️  Multiple null studentIds exist - this should be fine with sparse index');
        }
        
        process.exit(0);
      }
    } else {
      console.log('\n⚠️  No studentId index found');
    }

    // Check for duplicate null studentIds
    console.log('\n📋 Checking for duplicate null studentIds...');
    const patientsWithNullStudentId = await Patient.find({ studentId: null });
    console.log(`   Found ${patientsWithNullStudentId.length} patients with null studentId`);
    
    if (patientsWithNullStudentId.length > 0) {
      console.log('   Sample patients:');
      patientsWithNullStudentId.slice(0, 5).forEach(p => {
        console.log(`   - ${p.fullName} (${p.email})`);
      });
    }

    // Create new sparse unique index
    console.log('\n🔨 Creating new sparse unique index for studentId...');
    await collection.createIndex(
      { studentId: 1 },
      { 
        unique: true, 
        sparse: true,
        name: 'studentId_1'
      }
    );
    console.log('✅ New sparse unique index created');

    // Verify the new index
    console.log('\n✅ Verifying new index...');
    const newIndexes = await collection.indexes();
    const newStudentIdIndex = newIndexes.find(idx => idx.key && idx.key.studentId);
    console.log('New studentId index:', JSON.stringify(newStudentIdIndex, null, 2));

    console.log('\n✅ Fix completed successfully!');
    console.log('\n📝 Summary:');
    console.log(`   - Sparse index: ${newStudentIdIndex.sparse ? 'YES ✅' : 'NO ❌'}`);
    console.log(`   - Unique constraint: ${newStudentIdIndex.unique ? 'YES ✅' : 'NO ❌'}`);
    console.log(`   - Patients with null studentId: ${patientsWithNullStudentId.length}`);
    console.log('\n💡 Multiple patients can now have null studentId without errors');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing studentId index:', error);
    process.exit(1);
  }
}

fixStudentIdIndex();
