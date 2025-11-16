const nodemailer = require('nodemailer');

// Accept several common env var names so it's easy to copy App Password into .env
const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER || process.env.EMAIL || process.env.APP_EMAIL;
let SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.APP_PASSWORD || process.env.EMAIL_PASSWORD || '';
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;

// Trim whitespace/newlines which commonly get copied with the App Password by mistake
SMTP_PASS = SMTP_PASS.toString().replace(/\s+/g, '');

if (!SMTP_USER || !SMTP_PASS) {
  console.error('Email service configuration missing: set SMTP_USER (or EMAIL_USER/APP_EMAIL) and SMTP_PASS (or EMAIL_PASS/APP_PASSWORD) in your .env file');
  console.error('Current config:', {
    host: SMTP_HOST,
    port: SMTP_PORT,
    user: SMTP_USER || 'Not set',
    pass: SMTP_PASS ? `Set (length ${SMTP_PASS.length})` : 'Not set'
  });
}

// Warn if the App Password length isn't 16 characters — common user mistake
if (SMTP_PASS && SMTP_PASS.length !== 16) {
  console.warn('Warning: App Password length is', SMTP_PASS.length, "characters. A Gmail App Password should be 16 characters (no spaces). Please verify you copied it correctly.");
}

// Create transport. When using Gmail prefer the `service: 'gmail'` shortcut which picks sensible defaults.
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

// Verify connection configuration
transporter.verify(function (error, success) {
  if (error) {
    // Provide a concise, actionable message for auth errors and common causes
    if (error && error.code === 'EAUTH') {
      console.error('Email service authentication failed. Possible causes:');
      console.error('- Incorrect App Password (ensure it is the 16-character App Password, no spaces)');
      console.error('- 2-Step Verification not enabled for the account');
      console.error('- App Passwords disabled by Google Workspace admin');
      console.error('Underlying error message:', error.message);
    } else {
      console.error('Email service error:', error);
    }

    console.error('Email configuration:', {
      host: SMTP_HOST,
      port: SMTP_PORT,
      user: SMTP_USER || 'Not set',
      pass: SMTP_PASS ? `Set (length: ${SMTP_PASS.length})` : 'Not set'
    });
  } else {
    console.log('Email server is ready to send messages');
  }
});

const sendVerificationEmail = async (to, token) => {
  console.log('Preparing verification email:', { to, tokenLength: token?.length });

  // Get frontend URL from environment variable
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  console.log('Using base URL:', baseUrl);

  // Ensure the token is URL-safe
  const safeToken = encodeURIComponent(token);
  const verificationUrl = `${baseUrl}/verify/${safeToken}`;
  
  console.log('Generated verification URL:', verificationUrl.replace(safeToken, '***TOKEN***'));
  
  const mailOptions = {
    from: `"UA Clinic System" <${SMTP_USER}>`,
    to: to,
    subject: 'Verify Your Email - UA Clinic System',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <script>
          function verifyEmail(url) {
            window.location.replace(url);
            return false;
          }
        </script>
        <h2 style="color: #e51d5e;">Welcome to UA Clinic System!</h2>
        <p>Thank you for registering with the UA Clinic System. To complete your registration, please verify your email address by clicking the button below.</p>
        
        <div style="margin: 30px 0; text-align: center;">
          <a href="${verificationUrl}"
             style="background-color: #e51d5e; 
                    color: white; 
                    padding: 12px 30px; 
                    text-decoration: none; 
                    border-radius: 5px; 
                    display: inline-block;
                    font-weight: 600;
                    box-shadow: 0 4px 6px rgba(229, 29, 94, 0.25);">
            Verify Your Email
          </a>
        </div>
        
        <p style="color: #718096;">
          <small>If you can't click the button, copy and paste this link in your browser:</small><br>
          <span style="color: #4a5568; word-break: break-all;">${verificationUrl}</span>
        </p>
        
        <p style="margin-top: 30px; font-size: 14px; color: #718096; border-top: 1px solid #e2e8f0; padding-top: 20px;">
          If you didn't create an account with UA Clinic System, please ignore this email.
        </p>
      </div>
    `
  };

  try {
    console.log('Attempting to send verification email...');
    const info = await transporter.sendMail(mailOptions);
    console.log('Verification email sent successfully:', {
      to,
      messageId: info.messageId,
      response: info.response
    });
    return true;
  } catch (error) {
    console.error('Error sending verification email:', {
      error: error.message,
      code: error.code,
      command: error.command,
      responseCode: error.responseCode
    });
    throw error;
  }
};

const sendPasswordResetEmail = async (to, resetUrl, userName = 'User') => {
  const mailOptions = {
    from: {
      name: 'UA Clinic System',
      address: SMTP_USER
    },
    to: to,
    subject: '🔐 Password Reset Request - UA Clinic System',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa; border-radius: 10px;">
        <div style="background: linear-gradient(135deg, #e51d5e 0%, #ff6b9d 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">🔐 Password Reset Request</h1>
        </div>

        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 16px; color: #333; margin-bottom: 20px;">Hello ${userName},</p>
          
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            We received a request to reset your password for your UA Clinic System account. 
            Click the button below to create a new password:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="display: inline-block; 
                      background: linear-gradient(135deg, #e51d5e 0%, #ff6b9d 100%); 
                      color: white; 
                      padding: 14px 32px; 
                      text-decoration: none; 
                      border-radius: 8px; 
                      font-weight: bold;
                      font-size: 16px;">
              Reset My Password
            </a>
          </div>
          
          <div style="background: #f0f4f8; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #555;">
              <strong>Or copy and paste this link in your browser:</strong>
            </p>
            <p style="margin: 10px 0 0 0; word-break: break-all; color: #e51d5e; font-size: 14px;">
              ${resetUrl}
            </p>
          </div>

          <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #856404;">
              <strong>⚠️ Security Notice:</strong><br/>
              This link will expire in <strong>1 hour</strong>. If you didn't request a password reset, 
              please ignore this email or contact the clinic administrator if you have concerns.
            </p>
          </div>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; color: #6c757d; font-size: 14px;">
            <p style="margin: 5px 0;">This is an automated message from UA Clinic System</p>
            <p style="margin: 5px 0;">Please do not reply to this email</p>
          </div>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('✓ Password reset email sent successfully to:', to);
    return true;
  } catch (error) {
    console.error('✗ Error sending password reset email:', error);
    throw error;
  }
};

// Send low stock alert email
const sendLowStockAlert = async ({ itemName, currentQuantity, minQuantity, category }) => {
  const User = require('../models/User');
  
  try {
    // Get all clinic staff and admins
    const recipients = await User.find({
      role: { $in: ['admin', 'clinic', 'clinic_staff'] },
      isVerified: true
    }).select('email name');

    if (recipients.length === 0) {
      console.log('No clinic staff/admin to notify about low stock');
      return;
    }

    const emailList = recipients.map(r => r.email).join(', ');
    
    const mailOptions = {
      from: {
        name: 'UA Clinic System',
        address: SMTP_USER
      },
      to: emailList,
      subject: `⚠️ Low Stock Alert: ${itemName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa; border-radius: 10px;">
          <div style="background: linear-gradient(135deg, #e51d5e 0%, #ff6b9d 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">⚠️ Low Stock Alert</h1>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px;">
            <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-bottom: 20px;">
              <strong style="color: #856404;">Attention Required:</strong>
              <p style="margin: 5px 0 0 0; color: #856404;">The following item is running low in stock.</p>
            </div>

            <div style="margin: 25px 0;">
              <h2 style="color: #e51d5e; margin-bottom: 20px; border-bottom: 2px solid #e51d5e; padding-bottom: 10px;">
                Item Details
              </h2>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 12px; background: #f8f9fa; font-weight: bold; width: 40%;">Item Name:</td>
                  <td style="padding: 12px; background: white;">${itemName}</td>
                </tr>
                <tr>
                  <td style="padding: 12px; background: #f8f9fa; font-weight: bold;">Category:</td>
                  <td style="padding: 12px; background: white;">${category}</td>
                </tr>
                <tr>
                  <td style="padding: 12px; background: #f8f9fa; font-weight: bold;">Current Stock:</td>
                  <td style="padding: 12px; background: white; color: ${currentQuantity === 0 ? '#dc3545' : '#ffc107'}; font-weight: bold;">
                    ${currentQuantity} ${currentQuantity === 0 ? '(OUT OF STOCK)' : ''}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px; background: #f8f9fa; font-weight: bold;">Minimum Required:</td>
                  <td style="padding: 12px; background: white;">${minQuantity}</td>
                </tr>
                <tr>
                  <td style="padding: 12px; background: #f8f9fa; font-weight: bold;">Status:</td>
                  <td style="padding: 12px; background: white;">
                    <span style="background: ${currentQuantity === 0 ? '#dc3545' : '#ffc107'}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold;">
                      ${currentQuantity === 0 ? 'OUT OF STOCK' : 'LOW STOCK'}
                    </span>
                  </td>
                </tr>
              </table>
            </div>

            <div style="background: #e7f3ff; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0;">
              <strong style="color: #1565C0;">📋 Action Required:</strong>
              <ul style="margin: 10px 0 0 0; color: #1565C0; padding-left: 20px;">
                <li>Review current inventory levels</li>
                <li>Place a restock order if needed</li>
                <li>Contact supplier for availability</li>
                <li>Update inventory system after restocking</li>
              </ul>
            </div>

            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.FRONTEND_URL || 'https://uacs-fe.vercel.app'}/inventory" 
                 style="display: inline-block; background: #e51d5e; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">
                View Inventory
              </a>
            </div>

            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; color: #6c757d; font-size: 14px;">
              <p style="margin: 5px 0;">This is an automated alert from UA Clinic Inventory System</p>
              <p style="margin: 5px 0;">Please do not reply to this email</p>
            </div>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Low stock alert sent for ${itemName} to ${recipients.length} recipient(s)`);
    return true;
  } catch (error) {
    console.error('Error sending low stock alert:', error);
    throw error;
  }
};

// Send password change verification email
const sendPasswordChangeVerification = async (to, name, verificationUrl) => {
  console.log('=== Sending Password Change Verification Email ===');
  console.log('To:', to);
  console.log('Name:', name);
  console.log('SMTP Config:', {
    user: SMTP_USER || 'NOT SET',
    passLength: SMTP_PASS ? SMTP_PASS.length : 0,
    host: SMTP_HOST,
    port: SMTP_PORT
  });

  if (!SMTP_USER || !SMTP_PASS) {
    const error = new Error('Email service is not configured on server. Missing SMTP credentials.');
    console.error('EMAIL CONFIG ERROR:', error.message);
    throw error;
  }

  // Verify transporter is ready
  try {
    await transporter.verify();
    console.log('Transporter verified successfully');
  } catch (verifyError) {
    console.error('Transporter verification failed:', verifyError.message);
    throw new Error(`Email server connection failed: ${verifyError.message}`);
  }

  const mailOptions = {
    from: `"UA Clinic System" <${SMTP_USER}>`,
    to: to,
    subject: 'Verify Your Password Change',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #e51d5e;">Verify Your Password Change</h2>
        <p>Hello ${name},</p>
        <p>You requested to change your password.</p>
        <p>Click the button below to verify and complete the password change:</p>
        <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background: #e51d5e; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">Verify Password Change</a>
        <p>Or copy and paste this link into your browser:</p>
        <p style="color: #666; word-break: break-all;">${verificationUrl}</p>
        <p>This link will expire in 24 hours.</p>
        <p><strong>If you didn't request this change, please secure your account immediately.</strong></p>
        <p>Thank you,<br>UA Clinic System</p>
      </div>
    `
  };

  try {
    console.log('Attempting to send email...');
    const info = await transporter.sendMail(mailOptions);
    console.log('✓ Password change verification email sent successfully');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
    return info;
  } catch (error) {
    console.error('✗ Failed to send password change verification email');
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error stack:', error.stack);
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
};

// Send expiring medicine alert
const sendExpiringMedicineAlert = async ({ itemName, expiryDate, daysUntilExpiry, currentQuantity, category, itemId }) => {
  const User = require('../models/User');
  
  try {
    // Get all clinic staff and admins
    const recipients = await User.find({
      role: { $in: ['admin', 'clinic', 'clinic_staff'] },
      isVerified: true
    }).select('email name');

    if (recipients.length === 0) {
      console.log('No clinic staff/admin to notify about expiring medicine');
      return;
    }

    const emailList = recipients.map(r => r.email).join(', ');
    const formattedExpiryDate = new Date(expiryDate).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    const urgencyLevel = daysUntilExpiry <= 7 ? 'URGENT' : daysUntilExpiry <= 30 ? 'WARNING' : 'NOTICE';
    const urgencyColor = daysUntilExpiry <= 7 ? '#dc3545' : daysUntilExpiry <= 30 ? '#ffc107' : '#17a2b8';
    
    const mailOptions = {
      from: {
        name: 'UA Clinic System',
        address: SMTP_USER
      },
      to: emailList,
      subject: `⚠️ Expiring ${category} Alert: ${itemName} (${daysUntilExpiry} days)`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa; border-radius: 10px;">
          <div style="background: linear-gradient(135deg, #e51d5e 0%, #ff6b9d 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">⏰ Expiring ${category} Alert</h1>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px;">
            <div style="background: ${urgencyLevel === 'URGENT' ? '#f8d7da' : '#fff3cd'}; border-left: 4px solid ${urgencyColor}; padding: 15px; margin-bottom: 20px;">
              <strong style="color: ${urgencyLevel === 'URGENT' ? '#721c24' : '#856404'};">${urgencyLevel}:</strong>
              <p style="margin: 5px 0 0 0; color: ${urgencyLevel === 'URGENT' ? '#721c24' : '#856404'};">
                ${daysUntilExpiry <= 7 ? 'This item is expiring very soon!' : 'This item will expire within 30 days.'}
              </p>
            </div>

            <div style="margin: 25px 0;">
              <h2 style="color: #e51d5e; margin-bottom: 20px; border-bottom: 2px solid #e51d5e; padding-bottom: 10px;">
                Item Details
              </h2>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 12px; background: #f8f9fa; font-weight: bold; width: 40%;">Item Name:</td>
                  <td style="padding: 12px; background: white;">${itemName}</td>
                </tr>
                <tr>
                  <td style="padding: 12px; background: #f8f9fa; font-weight: bold;">Category:</td>
                  <td style="padding: 12px; background: white;">${category}</td>
                </tr>
                <tr>
                  <td style="padding: 12px; background: #f8f9fa; font-weight: bold;">Expiry Date:</td>
                  <td style="padding: 12px; background: white; color: ${urgencyColor}; font-weight: bold;">
                    ${formattedExpiryDate}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px; background: #f8f9fa; font-weight: bold;">Days Until Expiry:</td>
                  <td style="padding: 12px; background: white; color: ${urgencyColor}; font-weight: bold;">
                    ${daysUntilExpiry} days
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px; background: #f8f9fa; font-weight: bold;">Current Stock:</td>
                  <td style="padding: 12px; background: white;">${currentQuantity}</td>
                </tr>
                <tr>
                  <td style="padding: 12px; background: #f8f9fa; font-weight: bold;">Status:</td>
                  <td style="padding: 12px; background: white;">
                    <span style="background: ${urgencyColor}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold;">
                      ${urgencyLevel}
                    </span>
                  </td>
                </tr>
              </table>
            </div>

            <div style="background: #e7f3ff; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0;">
              <strong style="color: #1565C0;">📋 Recommended Actions:</strong>
              <ul style="margin: 10px 0 0 0; color: #1565C0; padding-left: 20px;">
                <li>Review if item needs immediate use</li>
                <li>Consider dispensing to patients with urgent need</li>
                <li>Remove from inventory after expiry date</li>
                <li>Plan restocking with fresh stock</li>
                <li>${daysUntilExpiry <= 7 ? '<strong>URGENT: Take action within 7 days</strong>' : 'Monitor regularly'}</li>
              </ul>
            </div>

            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.FRONTEND_URL || 'https://uacs-fe.vercel.app'}/inventory" 
                 style="display: inline-block; background: #e51d5e; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">
                View Inventory
              </a>
            </div>

            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; color: #6c757d; font-size: 14px;">
              <p style="margin: 5px 0;">This is an automated alert from UA Clinic Inventory System</p>
              <p style="margin: 5px 0;">Please do not reply to this email</p>
            </div>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Expiring medicine alert sent for ${itemName} to ${recipients.length} recipient(s)`);
    return true;
  } catch (error) {
    console.error('Error sending expiring medicine alert:', error);
    throw error;
  }
};

/**
 * Send clinic visit notification to parent/guardian
 * @param {Object} guardianContact - Guardian contact information
 * @param {Object} visitInfo - Visit details
 * @param {Object} studentInfo - Student information
 */
const sendGuardianVisitNotification = async (guardianContact, visitInfo, studentInfo) => {
  try {
    const { email, name } = guardianContact;
    const { date, diagnosis, treatment, notes } = visitInfo;
    const { fullName: studentName } = studentInfo;

    // Format visit date (don't include time as visits are dated but not timed)
    const visitDate = new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // General reason (don't expose sensitive diagnosis)
    let visitReason = 'Medical consultation';
    if (diagnosis) {
      // Use general categories instead of specific diagnosis
      if (diagnosis.toLowerCase().includes('fever') || diagnosis.toLowerCase().includes('cold') || diagnosis.toLowerCase().includes('flu')) {
        visitReason = 'Common illness (fever/cold/flu)';
      } else if (diagnosis.toLowerCase().includes('injury') || diagnosis.toLowerCase().includes('wound')) {
        visitReason = 'Minor injury or wound care';
      } else if (diagnosis.toLowerCase().includes('checkup') || diagnosis.toLowerCase().includes('physical')) {
        visitReason = 'Routine checkup';
      } else if (diagnosis.toLowerCase().includes('headache') || diagnosis.toLowerCase().includes('pain')) {
        visitReason = 'Pain or discomfort';
      } else {
        visitReason = 'Medical consultation';
      }
    }

    // General recommendations (avoid specific medical details)
    let recommendations = 'Follow clinic recommendations';
    if (treatment) {
      if (treatment.toLowerCase().includes('rest')) {
        recommendations = 'Rest and recovery advised';
      } else if (treatment.toLowerCase().includes('medicine') || treatment.toLowerCase().includes('medication')) {
        recommendations = 'Medication prescribed, follow dosage instructions';
      } else if (treatment.toLowerCase().includes('follow') || treatment.toLowerCase().includes('return')) {
        recommendations = 'Follow-up visit may be needed';
      }
    }

    // Rest days info if mentioned
    let restDaysInfo = '';
    if (notes && (notes.toLowerCase().includes('rest') || notes.toLowerCase().includes('day off'))) {
      const daysMatch = notes.match(/(\d+)\s*day/i);
      if (daysMatch) {
        restDaysInfo = `• Clinic advised ${daysMatch[1]} day(s) of rest\n`;
      } else {
        restDaysInfo = '• Rest recommended, duration as per clinic advice\n';
      }
    }

    const mailOptions = {
      from: `"UA Clinic" <${SMTP_USER}>`,
      to: email,
      subject: `Student Health Visit Notification - ${studentName}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
          <div style="background: linear-gradient(135deg, #e51d5e 0%, #c41952 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">University of the Assumption</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">College Clinic - Visit Notification</p>
          </div>

          <div style="padding: 40px 30px;">
            <p style="font-size: 16px; color: #333; margin: 0 0 20px 0;">Dear ${name},</p>

            <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 25px 0;">
              This is to inform you that <strong>${studentName}</strong> visited the University Clinic.
            </p>

            <div style="background: #f8f9fa; border-left: 4px solid #e51d5e; padding: 20px; margin: 20px 0;">
              <h3 style="color: #e51d5e; margin: 0 0 15px 0; font-size: 18px;">📋 Visit Information</h3>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: 500;">Date:</td>
                  <td style="padding: 8px 0; color: #333; font-weight: 600;">${visitDate}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: 500;">Reason:</td>
                  <td style="padding: 8px 0; color: #333; font-weight: 600;">${visitReason}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: 500;">Recommendations:</td>
                  <td style="padding: 8px 0; color: #333; font-weight: 600;">${recommendations}</td>
                </tr>
              </table>

              ${restDaysInfo ? `
                <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 12px; margin-top: 15px;">
                  <p style="margin: 0; color: #856404; font-size: 14px;">
                    <strong>⚠️ Rest Period:</strong><br/>
                    ${restDaysInfo}
                  </p>
                </div>
              ` : ''}
            </div>

            <div style="background: #e3f2fd; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #1565C0; font-size: 14px; line-height: 1.6;">
                <strong>ℹ️ Privacy Notice:</strong> This notification is provided for your awareness. Detailed medical information is kept confidential as per privacy guidelines. For specific concerns, please contact the clinic directly or speak with your child.
              </p>
            </div>

            <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 25px 0 0 0;">
              If you have any questions or concerns, please don't hesitate to contact the clinic during office hours.
            </p>

            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
              <p style="color: #666; font-size: 14px; margin: 5px 0;">
                <strong>University of the Assumption - College Clinic</strong>
              </p>
              <p style="color: #666; font-size: 14px; margin: 5px 0;">
                Contact: clinic@ua.edu.ph
              </p>
              <p style="color: #999; font-size: 12px; margin: 15px 0 0 0; font-style: italic;">
                This is an automated notification. Please do not reply to this email.
              </p>
            </div>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Guardian notification sent to ${email} for student ${studentName}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending guardian notification:', error);
    throw error;
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendLowStockAlert,
  sendPasswordChangeVerification,
  sendExpiringMedicineAlert,
  sendGuardianVisitNotification
};