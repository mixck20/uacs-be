const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.isAuthenticated = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      console.log('No token provided');
      return res.status(401).json({ message: 'Authentication required' });
    }

    console.log('Verifying token:', token.substring(0, 20) + '...');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded token:', decoded);

    const user = await User.findById(decoded.userId);
    console.log('Found user:', user ? { id: user._id, role: user.role, email: user.email } : 'No user');
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
};

exports.isClinic = (req, res, next) => {
  const allowedRoles = ['staff', 'admin', 'clinic_staff', 'clinic', 'CLINIC', 'ADMIN'];
  const userRole = (req.user.role || '').toLowerCase();
  
  console.log('Auth check:', {
    userRole,
    originalRole: req.user.role,
    userId: req.user._id,
    email: req.user.email,
    allowedRoles
  });
  
  if (!allowedRoles.includes(userRole)) {
    console.log('Access denied for role:', userRole);
    return res.status(403).json({ 
      message: 'Access denied. Clinic staff only.',
      currentRole: userRole,
      allowedRoles: allowedRoles
    });
  }
  next();
};
