require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const createAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/uacs');
    console.log('Connected to MongoDB');

    // Admin data
    const adminData = {
      firstName: 'Admin',
      lastName: 'User',
      name: 'Admin User',
      email: 'admin@ua.edu.ph',
      password: 'admin123',  // This will be hashed
      role: 'admin',
      gender: 'Male',
      idNumber: 'ADMIN001',  // Added ID number
      isVerified: true,  // Admin is automatically verified
      emailUpdates: true
    };

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminData.email });
    if (existingAdmin) {
      console.log('Admin account already exists');
      process.exit(0);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(adminData.password, 12);

    // Create admin user
    const admin = new User({
      ...adminData,
      password: hashedPassword
    });

    await admin.save();
    console.log('Admin account created successfully!');
    console.log('Email:', adminData.email);
    console.log('Password:', adminData.password);
    console.log('Please change the password after first login.');

  } catch (error) {
    console.error('Error creating admin:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

createAdmin();