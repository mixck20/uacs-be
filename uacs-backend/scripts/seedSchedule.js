const mongoose = require('mongoose');
const Schedule = require('../models/Schedule');
require('dotenv').config();

const seedSchedule = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing schedule
    await Schedule.deleteMany({});

    // Create sample schedule
    const sampleSchedule = new Schedule({
      title: 'Medical and Dental Clinic Schedule',
      doctorSchedules: [
        {
          name: 'Dr. Maria Santos',
          type: 'physician',
          regularSchedule: 'Monday - Friday\n8:00 AM - 12:00 PM',
          medicalExaminationSchedule: 'Monday (walk-in)\n9:00 AM - 12:00 PM\n\nWednesday (walk-in)\n9:00 AM - 12:00 PM'
        },
        {
          name: 'Dr. Juan Cruz',
          type: 'physician',
          regularSchedule: 'Monday - Friday\n1:00 PM - 5:00 PM',
          medicalExaminationSchedule: 'Tuesday (walk-in)\n9:00 AM - 12:00 PM\n\nThursday (walk-in)\n9:00 AM - 12:00 PM'
        },
        {
          name: 'Dr. Ana Reyes',
          type: 'dentist',
          regularSchedule: 'Monday, Wednesday, Friday\n8:00 AM - 12:00 PM',
          medicalExaminationSchedule: 'Tuesday (walk-in)\n10:00 AM - 2:00 PM\n\nThursday (walk-in)\n10:00 AM - 2:00 PM'
        },
        {
          name: 'Dr. Luis Garcia',
          type: 'dentist',
          regularSchedule: 'Tuesday, Thursday, Saturday\n1:00 PM - 5:00 PM',
          medicalExaminationSchedule: 'Wednesday (walk-in)\n9:00 AM - 1:00 PM\n\nFriday (walk-in)\n2:00 PM - 5:00 PM'
        }
      ],
      staffSchedules: [
        {
          name: 'Nurse Rosa Fernandez',
          role: 'nurse',
          designation: 'Senior Nurse',
          dayOfDuty: 'Monday - Friday',
          time: '8:00 AM - 5:00 PM',
          schedule: 'Monday - Friday: 8:00 AM - 5:00 PM'
        },
        {
          name: 'Nurse Miguel Flores',
          role: 'nurse',
          designation: 'Nurse',
          dayOfDuty: 'Monday - Wednesday',
          time: '8:00 AM - 4:00 PM',
          schedule: 'Monday - Wednesday: 8:00 AM - 4:00 PM'
        },
        {
          name: 'Nurse Jennifer Lopez',
          role: 'nurse',
          designation: 'Nurse',
          dayOfDuty: 'Thursday - Saturday',
          time: '8:00 AM - 4:00 PM',
          schedule: 'Thursday - Saturday: 8:00 AM - 4:00 PM'
        },
        {
          name: 'Nurse Carlos Mendoza',
          role: 'physician',
          designation: 'Medical Assistant',
          dayOfDuty: 'Tuesday - Friday',
          time: '9:00 AM - 5:00 PM',
          schedule: 'Tuesday - Friday: 9:00 AM - 5:00 PM'
        }
      ],
      lastUpdated: new Date()
    });

    await sampleSchedule.save();
    console.log('✓ Schedule seeded successfully!');
    console.log('Sample data includes:');
    console.log('- 2 Physicians');
    console.log('- 2 Dentists');
    console.log('- 4 Nurses/Staff');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding schedule:', error);
    process.exit(1);
  }
};

seedSchedule();
