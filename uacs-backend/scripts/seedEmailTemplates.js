const mongoose = require('mongoose');
const EmailTemplate = require('../models/EmailTemplate');
const User = require('../models/User');
require('dotenv').config();

const defaultTemplates = [
  {
    name: 'Appointment Reminder',
    subject: 'Appointment Reminder - UA Clinic',
    body: `Dear {{patientName}},

This is a friendly reminder about your upcoming appointment at UA Clinic.

📅 Date: {{appointmentDate}}
⏰ Time: {{appointmentTime}}
📍 Location: UA Clinic Office

Please arrive 10 minutes early for check-in. If you need to reschedule or cancel, please contact us at least 24 hours in advance.

For any questions, feel free to reach out to us.

Best regards,
UA Clinic Team`,
    type: 'appointment',
    category: 'reminder',
    variables: [
      { name: 'patientName', description: 'Patient full name' },
      { name: 'appointmentDate', description: 'Appointment date' },
      { name: 'appointmentTime', description: 'Appointment time' }
    ]
  },
  {
    name: 'Appointment Confirmation',
    subject: 'Your Appointment is Confirmed',
    body: `Hello {{patientName}},

Your appointment has been successfully scheduled!

📅 Date: {{appointmentDate}}
⏰ Time: {{appointmentTime}}
👨‍⚕️ Type: {{appointmentType}}

We look forward to seeing you. Please bring any relevant medical documents or records with you.

If you have any questions, don't hesitate to contact us.

Best regards,
UA Clinic Team`,
    type: 'appointment',
    category: 'confirmation',
    variables: [
      { name: 'patientName', description: 'Patient full name' },
      { name: 'appointmentDate', description: 'Appointment date' },
      { name: 'appointmentTime', description: 'Appointment time' },
      { name: 'appointmentType', description: 'Type of appointment' }
    ]
  },
  {
    name: 'Welcome New Patient',
    subject: 'Welcome to UA Clinic System!',
    body: `Dear {{patientName}},

Welcome to UA Clinic! We're delighted to have you as a patient.

Your account has been successfully created, and you now have access to:
✓ Online appointment scheduling
✓ Medical records access
✓ Medical certificate requests
✓ Health updates and announcements

You can log in to your account at any time to manage your healthcare needs.

If you have any questions or need assistance, please don't hesitate to reach out to our staff.

Best regards,
UA Clinic Team`,
    type: 'registration',
    category: 'welcome',
    variables: [
      { name: 'patientName', description: 'Patient full name' }
    ]
  },
  {
    name: 'Medicine Low Stock Alert',
    subject: 'Alert: Medicine Stock Running Low',
    body: `Attention Clinic Staff,

This is an automated alert regarding low medicine stock levels:

⚠️ Medicine: {{medicineName}}
📦 Current Stock: {{currentQuantity}} units
🔴 Reorder Level: {{reorderLevel}} units

Please reorder this medicine as soon as possible to avoid stock shortages.

To view full inventory details, please check the Inventory management system.

UA Clinic Inventory System`,
    type: 'inventory',
    category: 'alert',
    variables: [
      { name: 'medicineName', description: 'Name of medicine' },
      { name: 'currentQuantity', description: 'Current quantity in stock' },
      { name: 'reorderLevel', description: 'Reorder threshold level' }
    ]
  },
  {
    name: 'Medical Certificate Ready',
    subject: 'Your Medical Certificate is Ready',
    body: `Dear {{patientName}},

Your medical certificate request has been processed and is now ready for collection.

📋 Certificate Purpose: {{certificatePurpose}}
✅ Status: Approved
📅 Valid From: {{validFrom}}
📅 Valid Until: {{validUntil}}

You can collect your certificate from the clinic during office hours, or download it from your patient portal.

If you have any questions, please contact us.

Best regards,
UA Clinic Team`,
    type: 'general',
    category: 'notification',
    variables: [
      { name: 'patientName', description: 'Patient full name' },
      { name: 'certificatePurpose', description: 'Purpose of certificate' },
      { name: 'validFrom', description: 'Certificate valid from date' },
      { name: 'validUntil', description: 'Certificate valid until date' }
    ]
  },
  {
    name: 'Health Checkup Reminder',
    subject: 'Time for Your Regular Health Checkup',
    body: `Dear {{patientName}},

It's been a while since your last health checkup. We recommend scheduling a routine health screening to ensure your continued well-being.

Regular checkups help:
✓ Detect potential health issues early
✓ Monitor existing conditions
✓ Maintain optimal health

Please schedule an appointment at your earliest convenience.

We're here to help you stay healthy!

Best regards,
UA Clinic Team`,
    type: 'followup',
    category: 'reminder',
    variables: [
      { name: 'patientName', description: 'Patient full name' }
    ]
  },
  {
    name: 'Clinic Announcement',
    subject: 'Important Announcement from UA Clinic',
    body: `Dear Students and Faculty,

{{announcementTitle}}

{{announcementContent}}

For more information, please visit our clinic or contact us during office hours.

Thank you for your attention.

Best regards,
UA Clinic Team`,
    type: 'general',
    category: 'notification',
    variables: [
      { name: 'announcementTitle', description: 'Announcement title' },
      { name: 'announcementContent', description: 'Main announcement content' }
    ]
  }
];

async function seedTemplates() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find an admin user to assign as creator
    const adminUser = await User.findOne({ role: 'Admin' });
    
    if (!adminUser) {
      console.error('No admin user found. Please create an admin user first.');
      process.exit(1);
    }

    console.log('Using admin user:', adminUser.email);

    // Check existing templates
    const existingCount = await EmailTemplate.countDocuments();
    console.log(`Found ${existingCount} existing templates`);

    if (existingCount > 0) {
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise(resolve => {
        readline.question('Templates already exist. Delete all and reseed? (yes/no): ', resolve);
      });
      readline.close();

      if (answer.toLowerCase() !== 'yes') {
        console.log('Operation cancelled');
        process.exit(0);
      }

      // Delete existing templates
      await EmailTemplate.deleteMany({});
      console.log('Deleted all existing templates');
    }

    // Insert default templates
    const templatesWithCreator = defaultTemplates.map(template => ({
      ...template,
      createdBy: adminUser._id,
      isActive: true,
      usageCount: 0
    }));

    const result = await EmailTemplate.insertMany(templatesWithCreator);
    console.log(`Successfully created ${result.length} email templates:`);
    
    result.forEach((template, index) => {
      console.log(`${index + 1}. ${template.name} (${template.type}/${template.category})`);
    });

    console.log('\n✅ Email templates seeded successfully!');
    
  } catch (error) {
    console.error('Error seeding templates:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  seedTemplates();
}

module.exports = seedTemplates;
