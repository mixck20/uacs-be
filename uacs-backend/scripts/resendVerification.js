require('dotenv').config();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendVerificationEmail } = require('../utils/emailService');

const email = 'jmsdeloria.student@ua.edu.ph';

(async () => {
  try {
    // Create a new verification token
    const verificationToken = jwt.sign(
      { email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Update user with new token
    const user = await User.findOne({ email });
    if (!user) {
      console.error('User not found:', email);
      process.exit(1);
    }

    user.verificationToken = verificationToken;
    user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    user.isVerified = false;
    await user.save();

    // Send verification email
    await sendVerificationEmail(email, verificationToken);
    console.log('New verification email sent to:', email);
    console.log('Token for debugging:', verificationToken);
    process.exit(0);
  } catch (err) {
    console.error('Failed to send verification:', err);
    process.exit(1);
  }
})();