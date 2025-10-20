require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function checkAndVerifyUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const user = await User.findOne({ email: 'jmsdeloria.student@ua.edu.ph' });
    if (user) {
      console.log('Current user status:', {
        email: user.email,
        isVerified: user.isVerified,
        hasVerificationToken: !!user.verificationToken,
        tokenExpires: user.verificationTokenExpires
      });

      // Force verify if needed
      if (!user.isVerified) {
        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpires = undefined;
        await user.save();
        console.log('User has been verified:', user.email);
      }
    } else {
      console.log('User not found');
    }
    
    await mongoose.connection.close();
  } catch (err) {
    console.error('Error:', err);
  }
  process.exit(0);
}

checkAndVerifyUser();