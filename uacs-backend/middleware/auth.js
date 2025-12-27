const jwt = require('jsonwebtoken');
const User = require('../models/User');

const isAuthenticated = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('❌ Auth error:', error.message);
    res.status(401).json({ message: 'Invalid token' });
  }
};

const isClinic = (req, res, next) => {
  const allowedRoles = ['admin', 'clinic_staff', 'clinic', 'CLINIC', 'ADMIN'];
  const userRole = (req.user.role || '').toLowerCase();
  
  if (!allowedRoles.includes(userRole)) {
    return res.status(403).json({ 
      message: 'Access denied. Clinic staff only.',
      currentRole: userRole,
      allowedRoles: allowedRoles
    });
  }
  next();
};

module.exports = isAuthenticated;
module.exports.isAuthenticated = isAuthenticated;
module.exports.isClinic = isClinic;