const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function updateUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find the user by email
    const email = process.argv[2];
    const courseYear = process.argv[3];

    if (!email || !courseYear) {
      console.log('Usage: node updateUserCourse.js <email> <courseYear>');
      console.log('Example: node updateUserCourse.js student@ua.edu.ph "BSIT-4A"');
      process.exit(1);
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log('User not found with email:', email);
      process.exit(1);
    }

    user.courseYear = courseYear;
    await user.save();

    console.log('✅ User updated successfully!');
    console.log('Name:', user.name);
    console.log('Email:', user.email);
    console.log('Role:', user.role);
    console.log('Course/Year:', user.courseYear);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

updateUser();
