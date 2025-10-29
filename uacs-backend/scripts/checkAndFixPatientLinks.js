require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Patient = require('../models/Patient');

async function checkAndFixPatientLinks() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Find all patients
    const patients = await Patient.find({});
    console.log(`Found ${patients.length} total patients\n`);

    // Find patients with userId
    const linkedPatients = await Patient.find({ userId: { $ne: null } }).populate('userId', 'name email');
    console.log(`✅ ${linkedPatients.length} patients are linked to users\n`);

    // Find patients without userId
    const unlinkedPatients = await Patient.find({ userId: null });
    console.log(`⚠️  ${unlinkedPatients.length} patients are NOT linked to users\n`);

    // Try to link unlinked patients
    let autoLinked = 0;
    let cannotLink = 0;

    console.log('Attempting to auto-link unlinked patients...\n');
    
    for (const patient of unlinkedPatients) {
      const user = await User.findOne({ email: patient.email.toLowerCase() });
      
      if (user) {
        // Check if this user already has a different patient record
        const existingPatient = await Patient.findOne({ 
          userId: user._id,
          _id: { $ne: patient._id }
        });

        if (existingPatient) {
          console.log(`❌ Cannot link patient "${patient.fullName}" (${patient.email})`);
          console.log(`   User already has a different patient record: "${existingPatient.fullName}"`);
          console.log(`   Patient ID: ${patient._id}`);
          console.log(`   Existing Patient ID: ${existingPatient._id}\n`);
          cannotLink++;
        } else {
          // Link the patient to the user
          patient.userId = user._id;
          patient.isRegisteredUser = true;
          await patient.save();
          
          console.log(`✅ Linked patient "${patient.fullName}" to user "${user.name}" (${user.email})`);
          console.log(`   Patient ID: ${patient._id}`);
          console.log(`   User ID: ${user._id}`);
          console.log(`   Visits: ${patient.visits?.length || 0}\n`);
          autoLinked++;
        }
      } else {
        console.log(`ℹ️  No user account found for patient "${patient.fullName}" (${patient.email})`);
        console.log(`   Patient ID: ${patient._id}\n`);
        cannotLink++;
      }
    }

    console.log('\n═══════════════════════════════════════════');
    console.log('SUMMARY:');
    console.log(`Total Patients: ${patients.length}`);
    console.log(`Already Linked: ${linkedPatients.length}`);
    console.log(`Auto-linked: ${autoLinked}`);
    console.log(`Cannot Link: ${cannotLink}`);
    console.log('═══════════════════════════════════════════\n');

    // Show all linked patients with visit counts
    console.log('\n📊 LINKED PATIENTS WITH HEALTH RECORDS:\n');
    const allLinkedPatients = await Patient.find({ userId: { $ne: null } })
      .populate('userId', 'name email role')
      .sort({ 'visits.length': -1 });

    for (const patient of allLinkedPatients) {
      console.log(`👤 ${patient.fullName} (${patient.email})`);
      console.log(`   User: ${patient.userId?.name} (${patient.userId?.email})`);
      console.log(`   Visits: ${patient.visits?.length || 0}`);
      console.log(`   Patient ID: ${patient._id}`);
      console.log(`   User ID: ${patient.userId?._id}\n`);
    }

    await mongoose.connection.close();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAndFixPatientLinks();
