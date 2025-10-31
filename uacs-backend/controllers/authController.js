const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const emailService = require("../utils/emailService");
const { sendVerificationEmail } = require("../utils/emailService");
const Patient = require("../models/Patient");
const LoginAttempt = require("../models/LoginAttempt");
const { createAuditLog } = require("../middleware/auditLogger");

// Validate JWT_SECRET on startup
if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is not defined in environment variables");
  process.exit(1);
}

exports.register = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      gender,
      role,
      courseYear,
      email,
      idNumber,
      password,
      emailUpdates,
    } = req.body;

    // Build full name
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

    // Basic validation
    if (!firstName || !lastName || !email || !password || !role) {
      return res.status(400).json({ message: "All required fields must be filled." });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@ua\.edu\.ph$/i;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Please use a valid school email (@ua.edu.ph)." });
    }

    // Password validation
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    // Check existing user
    const emailLower = email.toLowerCase();
    const query = idNumber ? 
      { $or: [{ email: emailLower }, { idNumber }] } : 
      { email: emailLower };

    const existingUser = await User.findOne(query);
    if (existingUser) {
      return res.status(400).json({ 
        message: existingUser.email === emailLower ? 
          "Email already registered" : 
          "ID number already registered" 
      });
    }

    // Create verification token
    const verificationToken = jwt.sign(
      { email: emailLower },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Create user
    const hashedPassword = await bcrypt.hash(password, 12);
    const userObj = {
      name: fullName,
      firstName,
      lastName,
      gender,
      role: role.toLowerCase(),
      email: emailLower,
      idNumber,
      password: hashedPassword,
      emailUpdates: !!emailUpdates,
      verificationToken,
      verificationTokenExpires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      isVerified: false
    };

    // Add courseYear if provided (for students)
    if (courseYear) {
      userObj.courseYear = courseYear.trim();
    }

    const user = new User(userObj);

    await user.save();

    // Check if there's an existing patient record with this email and link it
    try {
      console.log(`🔍 Searching for patient record with email: ${emailLower}`);
      const existingPatient = await Patient.findOne({ email: emailLower });
      
      if (existingPatient) {
        console.log(`📋 Found existing patient record:`, {
          patientId: existingPatient._id,
          patientName: existingPatient.fullName,
          oldUserId: existingPatient.userId,
          visitsCount: existingPatient.visits?.length || 0,
          isArchived: existingPatient.isArchived
        });
        
        // Update the link to the new user account (preserve health records)
        existingPatient.userId = user._id;
        existingPatient.isRegisteredUser = true;
        
        // Restore from archive if it was archived
        if (existingPatient.isArchived) {
          existingPatient.isArchived = false;
          existingPatient.archivedAt = null;
          existingPatient.archivedBy = null;
          existingPatient.archiveReason = null;
          existingPatient.archiveNotes = null;
          console.log(`📂 Restored archived patient record`);
        }
        
        await existingPatient.save();
        console.log(`✅ Successfully linked patient record to new user account: ${emailLower}`);
        console.log(`   New userId: ${user._id}`);
      } else {
        console.log(`ℹ️ No existing patient record found for: ${emailLower}`);
      }
    } catch (linkError) {
      console.error('❌ Error linking patient record:', linkError);
      // Don't fail registration if linking fails
    }

    try {
      // Send verification email
      await sendVerificationEmail(emailLower, verificationToken);
      
      res.status(201).json({ 
        message: "Registration successful. Please check your email to verify your account.",
        email: emailLower,
        role: role.toLowerCase()
      });
    } catch (emailError) {
      console.error('Error sending verification email:', emailError);
      res.status(201).json({ 
        message: "Registration successful but failed to send verification email. Please contact support.",
        email: emailLower,
        role: role.toLowerCase()
      });
    }
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: "Registration failed. Please try again later." });
  }
};



exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'Verification token is required' });
    }

    // Trim any whitespace that might have been added
    const cleanToken = token.trim();

    let decoded;
    try {
      decoded = jwt.verify(cleanToken, process.env.JWT_SECRET);
    } catch (err) {
      console.error('Token verification failed:', err.message);
      return res.status(400).json({ 
        message: err.name === 'TokenExpiredError' ?
          "Verification token has expired. Please request a new verification email." :
          "Invalid verification token. Please request a new verification email."
      });
    }

    // First find the user by email
    const user = await User.findOne({ email: decoded.email });
    
    if (!user) {
      return res.status(400).json({ 
        message: "User not found. Please register first." 
      });
    }

    // If already verified, return success
    if (user.isVerified) {
      return res.json({ 
        message: "Your email is already verified. You can log in.",
        email: user.email 
      });
    }

    // Verify token matches and not expired
    if (user.verificationToken !== cleanToken || user.verificationTokenExpires < Date.now()) {
      console.error('Token mismatch or expired:', {
        matches: user.verificationToken === cleanToken,
        expired: user.verificationTokenExpires < Date.now(),
        storedToken: user.verificationToken?.substring(0, 10) + '...',
        receivedToken: cleanToken.substring(0, 10) + '...'
      });
      return res.status(400).json({ 
        message: user.verificationTokenExpires < Date.now() 
          ? "Verification token has expired. Please request a new verification email."
          : "Invalid verification token. Please request a new verification email.",
        success: false
      });
    }

    // Update user verification status using findByIdAndUpdate to ensure atomic update
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      {
        $set: {
          isVerified: true,
          verificationToken: null,
          verificationTokenExpires: null
        }
      },
      { new: true }
    );

    if (!updatedUser) {
      throw new Error('Failed to update user verification status');
    }

    res.json({ 
      message: "Email verified successfully! You can now log in.",
      email: updatedUser.email,
      success: true
    });
  } catch (err) {
    console.error('Email verification error:', err);
    res.status(500).json({ 
      message: "Verification failed. Please try again or contact support if the problem persists." 
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;

    if (!email || !password) {
      return res.status(400).json({ message: "Please provide both email and password" });
    }

    const emailLower = email.toLowerCase();

    // Check for existing login attempts
    let loginAttempt = await LoginAttempt.findOne({ email: emailLower, ipAddress });
    
    // Check if account is locked
    if (loginAttempt && loginAttempt.lockedUntil && loginAttempt.lockedUntil > new Date()) {
      const remainingTime = Math.ceil((loginAttempt.lockedUntil - new Date()) / 1000 / 60);
      return res.status(429).json({ 
        message: `Too many failed login attempts. Please try again in ${remainingTime} minute(s).`,
        lockedUntil: loginAttempt.lockedUntil
      });
    }

    const user = await User.findOne({ email: emailLower });
    if (!user) {
      // Log failed attempt
      await handleFailedLogin(loginAttempt, emailLower, ipAddress, user, req);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.isVerified) {
      return res.status(401).json({ 
        error: 'EMAIL_NOT_VERIFIED',
        message: "Please verify your email before logging in." 
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      // Log failed attempt
      await handleFailedLogin(loginAttempt, emailLower, ipAddress, user, req);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Successful login - reset attempts
    if (loginAttempt) {
      await LoginAttempt.deleteOne({ _id: loginAttempt._id });
    }

    const token = jwt.sign(
      { 
        userId: user._id,
        email: user.email,
        role: user.role 
      },
      process.env.JWT_SECRET,
      { 
        expiresIn: '24h',
        algorithm: 'HS256'
      }
    );

    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      gender: user.gender,
      idNumber: user.idNumber,
      emailUpdates: user.emailUpdates
    };

    // Log successful login
    await createAuditLog({
      user,
      action: 'LOGIN',
      resource: 'Auth',
      description: `User logged in successfully`,
      req,
      status: 'SUCCESS'
    });

    res.json({
      message: "Login successful",
      token,
      user: userData
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: "Login failed. Please try again later." });
  }
};

// Helper function to handle failed login attempts
async function handleFailedLogin(loginAttempt, email, ipAddress, user, req) {
  const MAX_ATTEMPTS = 5;
  const LOCK_TIME = 15 * 60 * 1000; // 15 minutes in milliseconds

  if (!loginAttempt) {
    // Create new login attempt record
    loginAttempt = new LoginAttempt({
      email,
      ipAddress,
      attempts: 1,
      lastAttempt: new Date()
    });
  } else {
    // Increment attempts
    loginAttempt.attempts += 1;
    loginAttempt.lastAttempt = new Date();

    // Lock account if max attempts reached
    if (loginAttempt.attempts >= MAX_ATTEMPTS) {
      loginAttempt.lockedUntil = new Date(Date.now() + LOCK_TIME);
    }
  }

  await loginAttempt.save();

  // Log failed login attempt
  if (user) {
    await createAuditLog({
      user,
      action: 'LOGIN_FAILED',
      resource: 'Auth',
      description: `Failed login attempt (${loginAttempt.attempts}/${MAX_ATTEMPTS})`,
      req,
      status: 'FAILURE',
      errorMessage: 'Invalid credentials'
    });
  }
}

exports.verifyToken = async (req, res) => {
  try {
    // req.user is set by the auth middleware (already the full user object)
    const user = req.user;
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Token is valid",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        gender: user.gender,
        idNumber: user.idNumber,
        emailUpdates: user.emailUpdates
      }
    });
  } catch (err) {
    console.error('Token verification error:', err);
    res.status(500).json({ message: "Token verification failed" });
  }
};

exports.resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    // Generate new verification token
    const verificationToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    user.verificationToken = verificationToken;
    await user.save();

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${verificationToken}`;
    
    await emailService.sendEmail(
      user.email,
      'Verify Your Email - UACS Clinic',
      `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #e51d5e;">Verify Your Email</h2>
          <p>Hello ${user.name},</p>
          <p>Click the button below to verify your email address:</p>
          <a href="${verificationUrl}" 
             style="display: inline-block; padding: 12px 24px; background-color: #e51d5e; 
                    color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">
            Verify Email
          </a>
          <p>Or copy and paste this link into your browser:</p>
          <p style="color: #666; word-break: break-all;">${verificationUrl}</p>
          <p>This link will expire in 24 hours.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `
    );

    res.json({ message: "Verification email sent successfully" });
  } catch (err) {
    console.error('Resend verification error:', err);
    res.status(500).json({ message: "Failed to resend verification email" });
  }
};

exports.logout = async (req, res) => {
  try {
    // Log logout action
    if (req.user) {
      await createAuditLog({
        user: req.user,
        action: 'LOGOUT',
        resource: 'Auth',
        description: `User logged out`,
        req,
        status: 'SUCCESS'
      });
    }
    
    res.json({ message: "Logout successful" });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ message: "Logout failed" });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email, currentPassword, firstName, lastName, course, year, contactNumber, emailUpdates } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Build update object with only provided fields
    const updateData = {};
    if (name) updateData.name = name.trim();
    if (firstName) updateData.firstName = firstName.trim();
    if (lastName) updateData.lastName = lastName.trim();
    if (course) updateData.course = course.trim();
    if (year) updateData.year = year.trim();
    if (contactNumber) updateData.contactNumber = contactNumber.trim();
    if (emailUpdates !== undefined) updateData.emailUpdates = !!emailUpdates;

    // Handle email change - requires verification
    if (email && email !== user.email) {
      // Verify current password for email change
      if (!currentPassword) {
        return res.status(400).json({ message: "Current password is required to change email" });
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isPasswordValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Check if email is already taken
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ message: "Email is already in use" });
      }

      // Generate verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      
      // Store pending email change
      user.pendingEmail = email.toLowerCase();
      user.emailChangeToken = verificationToken;
      user.emailChangeTokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

      await user.save();

      // Send verification email
      const verificationUrl = `${process.env.FRONTEND_URL}/verify-email-change/${verificationToken}`;
      
      try {
        await sendEmail({
          to: email,
          subject: 'Verify Your New Email Address',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #e51d5e;">Verify Your New Email Address</h2>
              <p>You requested to change your email address to this email.</p>
              <p>Click the button below to verify and complete the email change:</p>
              <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background: #e51d5e; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">Verify Email Change</a>
              <p>Or copy and paste this link into your browser:</p>
              <p style="color: #666; word-break: break-all;">${verificationUrl}</p>
              <p>This link will expire in 24 hours.</p>
              <p>If you didn't request this change, please ignore this email and secure your account.</p>
            </div>
          `
        });

        return res.json({
          message: "Verification email sent to your new email address. Please check your inbox.",
          requiresEmailVerification: true
        });
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
        // Rollback the pending email change
        user.pendingEmail = undefined;
        user.emailChangeToken = undefined;
        user.emailChangeTokenExpiry = undefined;
        await user.save();
        return res.status(500).json({ message: "Failed to send verification email. Please try again." });
      }
    }

    // Update other profile fields (no email change)
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password -verificationToken -emailChangeToken');

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Profile updated successfully",
      user: updatedUser
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ message: "Failed to update profile" });
  }
};

// Change password - requires email verification
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }

    // Password validation
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters long" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Check if new password is same as current
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({ message: "New password must be different from current password" });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    // Hash and store pending password temporarily
    const salt = await bcrypt.genSalt(10);
    const hashedNewPassword = await bcrypt.hash(newPassword, salt);
    
    user.pendingPassword = hashedNewPassword;
    user.passwordChangeToken = verificationToken;
    user.passwordChangeTokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    await user.save();

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-password-change/${verificationToken}`;
    
    try {
      await sendEmail({
        to: user.email,
        subject: 'Verify Your Password Change',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #e51d5e;">Verify Your Password Change</h2>
            <p>You requested to change your password.</p>
            <p>Click the button below to verify and complete the password change:</p>
            <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background: #e51d5e; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">Verify Password Change</a>
            <p>Or copy and paste this link into your browser:</p>
            <p style="color: #666; word-break: break-all;">${verificationUrl}</p>
            <p>This link will expire in 24 hours.</p>
            <p><strong>If you didn't request this change, please secure your account immediately.</strong></p>
          </div>
        `
      });

      res.json({ 
        message: "Verification email sent. Please check your inbox to complete the password change.",
        requiresVerification: true
      });
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Rollback the pending password change
      user.pendingPassword = undefined;
      user.passwordChangeToken = undefined;
      user.passwordChangeTokenExpiry = undefined;
      await user.save();
      return res.status(500).json({ message: "Failed to send verification email. Please try again." });
    }
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ message: "Failed to change password" });
  }
};

// Verify email change
exports.verifyEmailChange = async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      emailChangeToken: token,
      emailChangeTokenExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired verification token" });
    }

    // Update email
    user.email = user.pendingEmail;
    user.pendingEmail = undefined;
    user.emailChangeToken = undefined;
    user.emailChangeTokenExpiry = undefined;
    await user.save();

    res.json({ message: "Email changed successfully. Please login with your new email." });
  } catch (err) {
    console.error('Verify email change error:', err);
    res.status(500).json({ message: "Failed to verify email change" });
  }
};

// Verify password change
exports.verifyPasswordChange = async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      passwordChangeToken: token,
      passwordChangeTokenExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired verification token" });
    }

    // Update password
    user.password = user.pendingPassword;
    user.pendingPassword = undefined;
    user.passwordChangeToken = undefined;
    user.passwordChangeTokenExpiry = undefined;
    await user.save();

    res.json({ message: "Password changed successfully. Please login with your new password." });
  } catch (err) {
    console.error('Verify password change error:', err);
    res.status(500).json({ message: "Failed to verify password change" });
  }
};