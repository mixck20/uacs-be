require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const createClinicStaff = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/uacs');
    console.log('Connected to MongoDB');

    // Clinic Staff data
    const staffData = {
      firstName: 'Clinic',
      lastName: 'Staff',
      name: 'Clinic Staff',
      email: 'clinic@ua.edu.ph',
      password: 'clinic123',  // This will be hashed
      role: 'clinic_staff',
      gender: 'Female',
      idNumber: 'CLINIC001',  // Unique ID for clinic staff
      isVerified: true,  // Automatically verified
      emailUpdates: true
    };

    // Check if clinic staff already exists
    const existingStaff = await User.findOne({ email: staffData.email });
    if (existingStaff) {
      console.log('Clinic staff account already exists');
      process.exit(0);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(staffData.password, 12);

    // Create clinic staff user
    const staff = new User({
      ...staffData,
      password: hashedPassword
    });

    await staff.save();
    console.log('Clinic staff account created successfully!');
    console.log('Email:', staffData.email);
    console.log('Password:', staffData.password);
    console.log('Please change the password after first login.');

  } catch (error) {
    console.error('Error creating clinic staff:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

createClinicStaff();