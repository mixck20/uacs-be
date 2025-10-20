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
  const baseUrl = process.env.FRONTEND_URL || 'https://uacs-fe.vercel.app';
  const verificationUrl = `${baseUrl}/verify/${token}`;
  
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
    await transporter.sendMail(mailOptions);
    console.log('Welcome email sent to:', to);
    return true;
  } catch (error) {
    console.error('Error sending welcome email:', error);
    throw error;
  }
};

const sendPasswordResetEmail = async (to, token) => {
  const resetUrl = `${process.env.FRONTEND_URL || 'https://uacs-fe.vercel.app'}/reset-password?token=${token}`;
  
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

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
};