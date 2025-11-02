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

const sendPasswordResetEmail = async (to, token) => {
  // Get frontend URL from environment variable
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;
  
  const mailOptions = {
    from: `"UACS System" <${process.env.SMTP_USER}>`,
    to: to,
    subject: 'Reset Your Password - UACS System',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #e51d5e;">Password Reset Request</h2>
        <p>You requested to reset your password. Click the button below to set a new password:</p>
        
        <div style="margin: 30px 0; text-align: center;">
          <a href="${resetUrl}" 
             style="background-color: #e51d5e; 
                    color: white; 
                    padding: 12px 30px; 
                    text-decoration: none; 
                    border-radius: 5px; 
                    display: inline-block;">
            Reset Password
          </a>
        </div>
        
        <p>Or copy and paste this link in your browser:</p>
        <p style="color: #4a5568;">${resetUrl}</p>
        
        <p style="margin-top: 30px; font-size: 14px; color: #718096;">
          If you didn't request a password reset, please ignore this email.
        </p>
        
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
        
        <p style="font-size: 12px; color: #718096;">
          This is an automated message from UACS System. Please do not reply to this email.
        </p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Password reset email sent to:', to);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
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
    await transporter.sendMail(mailOptions);
    console.log('Password change verification email sent to:', to);
  } catch (error) {
    console.error('Error sending password change verification email:', error);
    throw error;
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendLowStockAlert,
  sendPasswordChangeVerification
};