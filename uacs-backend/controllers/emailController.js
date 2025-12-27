const Email = require('../models/Email');
const EmailTemplate = require('../models/EmailTemplate');
const User = require('../models/User');
const Patient = require('../models/Patient');
const nodemailer = require('nodemailer');

// Get email configuration
const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER || process.env.EMAIL || process.env.APP_EMAIL;
let SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.APP_PASSWORD || process.env.EMAIL_PASSWORD || '';
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;

SMTP_PASS = SMTP_PASS.toString().replace(/\s+/g, '');

// Create transporter
const transportOptions = {
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  debug: !!process.env.SMTP_DEBUG
};

if (SMTP_HOST && SMTP_HOST.includes('gmail')) {
  transportOptions.service = 'gmail';
} else {
  transportOptions.host = SMTP_HOST;
  transportOptions.port = SMTP_PORT;
  transportOptions.secure = SMTP_PORT === 465;
}

const transporter = nodemailer.createTransport(transportOptions);

// Replace template variables with actual values
const replaceVariables = (text, data) => {
  let result = text;
  Object.keys(data).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, data[key] || '');
  });
  return result;
};

// Send Email
exports.sendEmail = async (req, res) => {
  try {
    console.log('📧 Email send request received');
    console.log('User:', req.user ? { id: req.user._id, email: req.user.email, role: req.user.role } : 'No user');
    
    const { 
      recipientType, 
      recipientGroup, 
      individualEmail, 
      customEmails, 
      subject, 
      body, 
      templateId,
      scheduledDate,
      scheduledTime 
    } = req.body;

    const sentBy = req.user._id;

    // Validate required fields
    if (!subject || !body) {
      return res.status(400).json({ message: 'Subject and body are required' });
    }

    let recipients = [];
    let recipientEmails = [];

    // Get recipients based on type
    if (recipientType === 'all') {
      console.log('🔍 Fetching users with emailUpdates enabled, group:', recipientGroup);
      // Get users with emailUpdates enabled
      let users = [];
      
      if (recipientGroup === 'students') {
        users = await User.find({ emailUpdates: true, role: 'student' }).select('email firstName lastName role');
      } else if (recipientGroup === 'employees') {
        users = await User.find({ emailUpdates: true, role: 'employee' }).select('email firstName lastName role');
      } else {
        users = await User.find({ 
          emailUpdates: true, 
          role: { $in: ['student', 'employee'] }
        }).select('email firstName lastName role');
      }
      
      console.log('✅ Found users:', users.length);
      console.log('Users:', users.map(u => ({ email: u.email, role: u.role })));
      
      recipientEmails = users
        .filter(u => u.email)
        .map(u => ({
          email: u.email,
          userId: u._id,
          status: 'sent',
          sentAt: new Date()
        }));
    } else if (recipientType === 'individual') {
      if (!individualEmail) {
        return res.status(400).json({ message: 'Individual email is required' });
      }
      recipientEmails.push({
        email: individualEmail,
        status: 'sent',
        sentAt: new Date()
      });
    } else if (recipientType === 'custom') {
      if (!customEmails) {
        return res.status(400).json({ message: 'Custom emails are required' });
      }
      const emailList = customEmails.split(',').map(email => email.trim()).filter(email => email);
      recipientEmails = emailList.map(email => ({
        email,
        status: 'sent',
        sentAt: new Date()
      }));
    }

    if (recipientEmails.length === 0) {
      return res.status(400).json({ message: 'No valid recipients found' });
    }

    // Create email record
    const email = new Email({
      sentBy,
      recipientType,
      recipientGroup,
      recipients: recipientEmails,
      subject,
      body,
      templateId: templateId || undefined,
      totalRecipients: recipientEmails.length,
      sentCount: 0,
      deliveredCount: 0,
      openedCount: 0,
      failedCount: 0,
      status: (scheduledDate && scheduledTime) ? 'scheduled' : 'sending',
      scheduledFor: (scheduledDate && scheduledTime) ? new Date(`${scheduledDate}T${scheduledTime}`) : undefined
    });

    // If scheduled, save and return
    if (scheduledDate && scheduledTime) {
      await email.save();
      return res.json({ 
        message: 'Email scheduled successfully', 
        email,
        scheduledFor: email.scheduledFor 
      });
    }

    // Check if SMTP is configured
    if (!SMTP_USER || !SMTP_PASS) {
      // Save as sent in database but don't actually send
      email.status = 'sent';
      email.sentCount = recipientEmails.length;
      await email.save();
      
      return res.json({ 
        message: 'Email saved (SMTP not configured - emails not actually sent)', 
        email,
        warning: 'SMTP credentials not configured. Set SMTP_USER and SMTP_PASS in .env to send real emails.'
      });
    }

    // Send emails
    let sentCount = 0;
    let failedCount = 0;

    const mailOptions = {
      from: `"UA Clinic System" <${SMTP_USER}>`,
      subject
    };

    for (const recipient of recipientEmails) {
      try {
        await transporter.sendMail({
          ...mailOptions,
          to: recipient.email,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>UA Clinic System</title>
            </head>
            <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5; padding: 40px 0;">
                <tr>
                  <td align="center">
                    <!-- Main Container -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                      
                      <!-- Header with gradient -->
                      <tr>
                        <td style="background: linear-gradient(135deg, #e51d5e 0%, #ca1852 100%); padding: 40px 30px; text-align: center;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                            <tr>
                              <td align="center">
                                <div style="background-color: rgba(255, 255, 255, 0.2); width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; padding: 15px;">
                                  <span style="font-size: 40px; color: white;">🏥</span>
                                </div>
                                <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600; letter-spacing: -0.5px;">UA Clinic System</h1>
                                <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0; font-size: 14px;">University of the Assumption</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      
                      <!-- Content -->
                      <tr>
                        <td style="padding: 40px 30px; background-color: #ffffff;">
                          <div style="color: #333333; font-size: 16px; line-height: 1.8;">
                            ${body.replace(/\n/g, '<br>')}
                          </div>
                        </td>
                      </tr>
                      
                      <!-- Divider -->
                      <tr>
                        <td style="padding: 0 30px;">
                          <div style="border-top: 2px solid #f0f0f0;"></div>
                        </td>
                      </tr>
                      
                      <!-- Footer -->
                      <tr>
                        <td style="padding: 30px; background-color: #fafafa; text-align: center;">
                          <p style="margin: 0 0 10px; color: #666666; font-size: 14px; font-weight: 500;">
                            📧 UA Clinic System
                          </p>
                          <p style="margin: 0 0 15px; color: #999999; font-size: 13px; line-height: 1.6;">
                            This is an automated message from UA Clinic System.<br>
                            Please do not reply to this email.
                          </p>
                          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
                            <p style="margin: 0; color: #999999; font-size: 12px;">
                              © ${new Date().getFullYear()} University of the Assumption. All rights reserved.
                            </p>
                          </div>
                        </td>
                      </tr>
                      
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
          `
        });
        recipient.status = 'delivered';
        sentCount++;
      } catch (error) {
        console.error(`Failed to send email to ${recipient.email}:`, error.message);
        recipient.status = 'failed';
        failedCount++;
      }
    }

    // Update email record
    email.sentCount = sentCount;
    email.failedCount = failedCount;
    email.deliveredCount = sentCount;
    email.status = failedCount === recipientEmails.length ? 'failed' : 'sent';
    await email.save();

    // Update template usage count if template was used
    if (templateId) {
      await EmailTemplate.findByIdAndUpdate(templateId, { $inc: { usageCount: 1 } });
    }

    res.json({ 
      message: `Email sent successfully to ${sentCount} recipients`, 
      email,
      stats: {
        total: recipientEmails.length,
        sent: sentCount,
        failed: failedCount
      }
    });
  } catch (error) {
    console.error('❌ Error sending email:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Error sending email', error: error.message });
  }
};

// Get Email History
exports.getEmailHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status } = req.query;
    
    const query = {};
    if (type) query.recipientType = type;
    if (status) query.status = status;

    const emails = await Email.find(query)
      .populate('sentBy', 'firstName lastName email')
      .populate('templateId', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Email.countDocuments(query);

    res.json({
      emails,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalEmails: count
    });
  } catch (error) {
    console.error('Error getting email history:', error);
    res.status(500).json({ message: 'Error getting email history', error: error.message });
  }
};

// Get Email Statistics
exports.getEmailStats = async (req, res) => {
  try {
    const totalEmails = await Email.countDocuments();
    const sentEmails = await Email.countDocuments({ status: 'sent' });
    const failedEmails = await Email.countDocuments({ status: 'failed' });
    const scheduledEmails = await Email.countDocuments({ status: 'scheduled' });

    const allEmails = await Email.find();
    const totalRecipients = allEmails.reduce((sum, email) => sum + email.totalRecipients, 0);
    const totalOpened = allEmails.reduce((sum, email) => sum + email.openedCount, 0);
    const openRate = totalRecipients > 0 ? ((totalOpened / totalRecipients) * 100).toFixed(1) : 0;

    // Get recipients with email updates enabled
    const studentsWithEmail = await Patient.countDocuments({ 
      emailUpdates: true,
      userId: { $exists: true }
    }).populate('userId', 'role');
    
    const allPatients = await Patient.find({ emailUpdates: true }).populate('userId', 'role');
    const students = allPatients.filter(p => p.userId && p.userId.role === 'student').length;
    const employees = allPatients.filter(p => p.userId && p.userId.role === 'employee').length;

    res.json({
      totalEmails,
      sentEmails,
      failedEmails,
      scheduledEmails,
      totalRecipients,
      totalOpened,
      openRate,
      studentsWithEmail: students,
      employeesWithEmail: employees
    });
  } catch (error) {
    console.error('Error getting email stats:', error);
    res.status(500).json({ message: 'Error getting email stats', error: error.message });
  }
};

// Delete Email Record
exports.deleteEmail = async (req, res) => {
  try {
    const { id } = req.params;

    const email = await Email.findByIdAndDelete(id);
    if (!email) {
      return res.status(404).json({ message: 'Email not found' });
    }

    res.json({ message: 'Email deleted successfully' });
  } catch (error) {
    console.error('Error deleting email:', error);
    res.status(500).json({ message: 'Error deleting email', error: error.message });
  }
};

// Create Email Template
exports.createTemplate = async (req, res) => {
  try {
    const { name, subject, body, type, category } = req.body;
    const createdBy = req.user.userId;

    if (!name || !subject || !body || !type || !category) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Extract variables from body ({{variableName}})
    const variableMatches = body.match(/{{(\w+)}}/g) || [];
    const variables = variableMatches.map(match => ({
      name: match.replace(/{{|}}/g, ''),
      description: `Variable: ${match}`
    }));

    const template = new EmailTemplate({
      createdBy,
      name,
      subject,
      body,
      type,
      category,
      variables
    });

    await template.save();
    res.status(201).json({ message: 'Template created successfully', template });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ message: 'Error creating template', error: error.message });
  }
};

// Get All Templates
exports.getTemplates = async (req, res) => {
  try {
    const { type, category, active } = req.query;
    
    const query = {};
    if (type) query.type = type;
    if (category) query.category = category;
    if (active !== undefined) query.isActive = active === 'true';

    const templates = await EmailTemplate.find(query)
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json({ templates });
  } catch (error) {
    console.error('Error getting templates:', error);
    res.status(500).json({ message: 'Error getting templates', error: error.message });
  }
};

// Update Template
exports.updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, subject, body, type, category, isActive } = req.body;

    const template = await EmailTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    if (name) template.name = name;
    if (subject) template.subject = subject;
    if (body) {
      template.body = body;
      // Update variables
      const variableMatches = body.match(/{{(\w+)}}/g) || [];
      template.variables = variableMatches.map(match => ({
        name: match.replace(/{{|}}/g, ''),
        description: `Variable: ${match}`
      }));
    }
    if (type) template.type = type;
    if (category) template.category = category;
    if (isActive !== undefined) template.isActive = isActive;

    await template.save();
    res.json({ message: 'Template updated successfully', template });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ message: 'Error updating template', error: error.message });
  }
};

// Delete Template
exports.deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    const template = await EmailTemplate.findByIdAndDelete(id);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ message: 'Error deleting template', error: error.message });
  }
};

// Check SMTP Configuration
exports.checkSMTPConfig = async (req, res) => {
  try {
    const configured = !!(SMTP_USER && SMTP_PASS);
    
    if (!configured) {
      return res.json({
        configured: false,
        message: 'SMTP not configured. Set SMTP_USER and SMTP_PASS in .env file.'
      });
    }

    // Try to verify connection
    try {
      await transporter.verify();
      res.json({
        configured: true,
        verified: true,
        message: 'SMTP configured and connection verified',
        config: {
          host: SMTP_HOST,
          port: SMTP_PORT,
          user: SMTP_USER
        }
      });
    } catch (error) {
      res.json({
        configured: true,
        verified: false,
        message: 'SMTP configured but connection failed',
        error: error.message,
        config: {
          host: SMTP_HOST,
          port: SMTP_PORT,
          user: SMTP_USER
        }
      });
    }
  } catch (error) {
    console.error('Error checking SMTP config:', error);
    res.status(500).json({ message: 'Error checking SMTP config', error: error.message });
  }
};
