require('dotenv').config();
const mongoose = require('mongoose');
const LoginAttempt = require('../models/LoginAttempt');

const email = 'jmsdeloria.student@ua.edu.ph';

async function clearLoginPenalty() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Delete all login attempts for this email
    const result = await LoginAttempt.deleteMany({ email: email.toLowerCase() });
    
    console.log(`✅ Cleared login penalty for: ${email}`);
    console.log(`   Deleted ${result.deletedCount} login attempt record(s)`);
    
    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

clearLoginPenalty();
