/**
 * MongoDB Shell Script to Fix Duplicate studentId null Values
 * 
 * Copy and paste this into MongoDB Compass or mongo shell
 * 
 * This removes the studentId field from all documents where it's explicitly null,
 * allowing the sparse unique index to work correctly.
 */

// Switch to your database
use uacs_db

// Count patients with null studentId
const countBefore = db.patients.countDocuments({ studentId: null });
console.log(`Found ${countBefore} patients with null studentId`);

// Remove studentId field where it's null (sets to undefined)
const result = db.patients.updateMany(
  { studentId: null },
  { $unset: { studentId: "" } }
);

console.log(`\nFixed ${result.modifiedCount} patient records`);
console.log(`Matched: ${result.matchedCount}`);
console.log(`Modified: ${result.modifiedCount}`);

// Verify the fix
const countAfter = db.patients.countDocuments({ studentId: null });
console.log(`\nRemaining patients with null studentId: ${countAfter}`);
console.log(countAfter === 0 ? '✅ All fixed!' : '⚠️ Some records still have issues');
