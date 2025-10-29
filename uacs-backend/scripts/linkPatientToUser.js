require('dotenv').config();
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const User = require('../models/User');

async function linkPatientToUser(email) {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const emailLower = email.toLowerCase().trim();
    console.log(`\nSearching for email: ${emailLower}`);
    
    // Find user
    const user = await User.findOne({ email: emailLower });
    if (!user) {
      console.log('❌ User not found with this email');
      process.exit(1);
    }
    console.log(`✅ Found user: ${user.name} (${user._id})`);
    
    // Find patient
    const patient = await Patient.findOne({ email: emailLower });
    if (!patient) {
      console.log('❌ Patient not found with this email');
      process.exit(1);
    }
    console.log(`✅ Found patient: ${patient.fullName} (${patient._id})`);
    
    // Check if already linked
    if (patient.userId && patient.userId.toString() === user._id.toString()) {
      console.log('✅ Patient is already linked to this user');
      process.exit(0);
    }
    
    // Link them
    patient.userId = user._id;
    patient.isRegisteredUser = true;
    await patient.save();
    
    console.log('\n✅ Successfully linked patient to user!');
    console.log(`   Patient: ${patient.fullName}`);
    console.log(`   User: ${user.name}`);
    console.log(`   Email: ${emailLower}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.log('Usage: node linkPatientToUser.js <email>');
  console.log('Example: node linkPatientToUser.js jmsdeloria.student@ua.edu.ph');
  process.exit(1);
}

linkPatientToUser(email);
