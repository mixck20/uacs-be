const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sendVerificationEmail } = require("../utils/emailService");

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
    const user = new User({
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
    });

    await user.save();

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