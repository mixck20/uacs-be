const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const emailService = require("../utils/emailService");
const { sendVerificationEmail } = require("../utils/emailService");
const Patient = require("../models/Patient");

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
      const existingPatient = await Patient.findOne({ email: emailLower, userId: null });
      if (existingPatient) {
        existingPatient.userId = user._id;
        existingPatient.isRegisteredUser = true;
        await existingPatient.save();
        console.log(`Linked existing patient record to new user: ${emailLower}`);
      }
    } catch (linkError) {
      console.error('Error linking patient record:', linkError);
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
    
    // Log full request details for debugging
    console.log('Verification request details:', {
      body: req.body,
      headers: req.headers,
      token: token ? `${token.substring(0, 10)}...` : 'missing'
    });

    if (!token) {
      console.log('No token provided in request');
      return res.status(400).json({ message: "Verification token is required" });
    }

    // Trim any whitespace that might have been added
    const cleanToken = token.trim();

    let decoded;
    try {
      decoded = jwt.verify(cleanToken, process.env.JWT_SECRET);
      console.log('Token decoded successfully:', { 
        email: decoded.email,
        exp: new Date(decoded.exp * 1000).toISOString(),
        iat: new Date(decoded.iat * 1000).toISOString()
      });
    } catch (err) {
      console.error('Token verification failed:', {
        error: err.message,
        name: err.name,
        expiredAt: err.expiredAt ? new Date(err.expiredAt).toISOString() : null
      });
      return res.status(400).json({ 
        message: err.name === 'TokenExpiredError' ?
          "Verification token has expired. Please request a new verification email." :
          "Invalid verification token. Please request a new verification email."
      });
    }

    // First find the user by email
    const user = await User.findOne({ email: decoded.email });
    
    if (!user) {
      console.error('User not found:', decoded.email);
      return res.status(400).json({ 
        message: "User not found. Please register first." 
      });
    }

    console.log('User found:', {
      email: user.email,
      currentToken: user.verificationToken?.substring(0, 10) + '...',
      receivedToken: token.substring(0, 10) + '...',
      tokenExpired: user.verificationTokenExpires < Date.now(),
      isVerified: user.isVerified
    });

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

    console.log('User verified successfully:', {
      email: updatedUser.email,
      isVerified: updatedUser.isVerified
    });

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

    if (!email || !password) {
      return res.status(400).json({ message: "Please provide both email and password" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
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
      return res.status(401).json({ message: "Invalid email or password" });
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

exports.verifyToken = async (req, res) => {
  try {
    // req.user is set by the auth middleware
    const user = await User.findById(req.user.userId).select('-password');
    
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
    // In a more advanced system, you might invalidate the token here
    // For now, just send a success response
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
    const { firstName, lastName, course, year, contactNumber, emailUpdates } = req.body;

    // Build update object with only provided fields
    const updateData = {};
    if (firstName) updateData.firstName = firstName.trim();
    if (lastName) updateData.lastName = lastName.trim();
    if (course) updateData.course = course.trim();
    if (year) updateData.year = year.trim();
    if (contactNumber) updateData.contactNumber = contactNumber.trim();
    if (emailUpdates !== undefined) updateData.emailUpdates = !!emailUpdates;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password -verificationToken');

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

// Change password
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }

    // Password validation
    if (newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters long" });
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

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ message: "Failed to change password" });
  }
};