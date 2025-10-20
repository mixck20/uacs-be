require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function checkUserStatus() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const user = await User.findOne({ email: 'jmsdeloria.student@ua.edu.ph' });
    if (user) {
      console.log('User status:', {
        email: user.email,
        isVerified: user.isVerified,
        hasVerificationToken: !!user.verificationToken,
        tokenExpires: user.verificationTokenExpires
      });
    } else {
      console.log('User not found');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkUserStatus();