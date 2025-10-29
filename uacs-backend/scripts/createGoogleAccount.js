require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function createGoogleAccount() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if user already exists
    const existingUser = await User.findOne({ email: 'uaclinicsystem@gmail.com' });
    
    if (existingUser) {
      console.log('✅ User already exists with role:', existingUser.role);
      console.log('Email:', existingUser.email);
      console.log('Name:', existingUser.name);
      console.log('Verified:', existingUser.isVerified);
      
      if (existingUser.role !== 'clinic_staff') {
        existingUser.role = 'clinic_staff';
        await existingUser.save();
        console.log('✅ Updated role to clinic_staff');
      }
      
      process.exit(0);
    }

    // Create new clinic staff account
    const hashedPassword = await bcrypt.hash('clinic123', 10);
    
    const newUser = new User({
      email: 'uaclinicsystem@gmail.com',
      password: hashedPassword,
      name: 'UA Clinic System',
      idNumber: 'CLINIC-SYS-001', // System ID for clinic account
      role: 'clinic_staff',
      isVerified: true // Auto-verify for system account
    });

    await newUser.save();

    console.log('✅ Clinic staff account created successfully!');
    console.log('📧 Email: uaclinicsystem@gmail.com');
    console.log('🔑 Password: clinic123');
    console.log('👤 Role: clinic_staff');
    console.log('✓ Email verified: Yes');
    console.log('\n🔗 You can now use this account to authorize Google Calendar');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating account:', error.message);
    process.exit(1);
  }
}

createGoogleAccount();
