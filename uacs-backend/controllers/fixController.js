const Patient = require('../models/Patient');

/**
 * One-time fix endpoint to remove explicit null studentId values
 * This fixes the duplicate key error for sparse unique index
 * 
 * Call once: GET /api/patients/fix-student-ids (admin/clinic only)
 */
exports.fixStudentIdNulls = async (req, res) => {
  try {
    console.log('🔧 Starting studentId null fix...');
    
    // Find all patients with explicit null studentId
    const patientsWithNull = await Patient.find({ studentId: null });
    
    console.log(`Found ${patientsWithNull.length} patients with null studentId`);
    
    if (patientsWithNull.length === 0) {
      return res.json({
        message: 'No patients with null studentId found. Database is clean!',
        fixed: 0
      });
    }
    
    let fixedCount = 0;
    const errors = [];
    
    for (const patient of patientsWithNull) {
      try {
        // Remove the studentId field entirely (set to undefined)
        patient.studentId = undefined;
        await patient.save();
        fixedCount++;
        console.log(`✅ Fixed: ${patient.fullName}`);
      } catch (error) {
        console.error(`❌ Error fixing ${patient.fullName}:`, error.message);
        errors.push({
          patientId: patient._id,
          name: patient.fullName,
          error: error.message
        });
      }
    }
    
    console.log(`✅ Fixed ${fixedCount} out of ${patientsWithNull.length} patients`);
    
    res.json({
      message: 'StudentId null values fixed successfully',
      total: patientsWithNull.length,
      fixed: fixedCount,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('❌ Fix failed:', error);
    res.status(500).json({
      message: 'Failed to fix studentId nulls',
      error: error.message
    });
  }
};
