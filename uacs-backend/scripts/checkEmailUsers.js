const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function checkEmailUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const studentsWithEmail = await User.countDocuments({ role: 'student', emailUpdates: true });
    const facultyWithEmail = await User.countDocuments({ role: 'faculty', emailUpdates: true });
    const totalWithEmail = studentsWithEmail + facultyWithEmail;

    console.log('\n📧 Email Recipients Status:');
    console.log(`Students with email updates: ${studentsWithEmail}`);
    console.log(`Faculty with email updates: ${facultyWithEmail}`);
    console.log(`Total users with email updates: ${totalWithEmail}`);

    if (totalWithEmail === 0) {
      console.log('\n⚠️  No users have email updates enabled!');
      console.log('To enable email updates for users:');
      console.log('1. Login as a user');
      console.log('2. Go to Settings');
      console.log('3. Enable "Email Notifications" in the Notifications tab');
    } else {
      console.log('\n✅ Users are ready to receive emails!');
      
      // Show sample users
      const sampleUsers = await User.find({ emailUpdates: true })
        .select('email firstName lastName role')
        .limit(5);
      
      console.log('\nSample users with email updates:');
      sampleUsers.forEach((user, index) => {
        console.log(`${index + 1}. ${user.email} (${user.role})`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkEmailUsers();
