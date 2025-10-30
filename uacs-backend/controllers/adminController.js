const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Feedback = require('../models/Feedback');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const LoginAttempt = require('../models/LoginAttempt');
const bcrypt = require('bcryptjs');
const { createAuditLog } = require('../middleware/auditLogger');

// ==================== USER MANAGEMENT ====================

// Get all users with filters
exports.getAllUsers = async (req, res) => {
  try {
    const { role, search, status, page = 1, limit = 50 } = req.query;
    
    const query = {};
    
    // Filter by role
    if (role) {
      query.role = role;
    }
    
    // Filter by status (active/inactive based on last login or isVerified)
    if (status === 'active') {
      query.isVerified = true;
    } else if (status === 'inactive') {
      query.isVerified = false;
    }
    
    // Search by name or email
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (page - 1) * limit;
    
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await User.countDocuments(query);
    
    res.json({
      users,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users', error: error.message });
  }
};

// Get user by ID with login history
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Get login history from audit logs
    const loginHistory = await AuditLog.find({
      user: id,
      action: { $in: ['LOGIN', 'LOGIN_FAILED', 'LOGOUT'] }
    })
      .sort({ createdAt: -1 })
      .limit(20);
    
    res.json({
      user,
      loginHistory
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Error fetching user', error: error.message });
  }
};

// Create new user
exports.createUser = async (req, res) => {
  try {
    const { firstName, lastName, email, password, role, gender, idNumber } = req.body;
    
    // Check if user exists
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Create user
    const user = new User({
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      email: email.toLowerCase(),
      password: hashedPassword,
      role,
      gender,
      idNumber,
      isVerified: true // Admin-created users are auto-verified
    });
    
    await user.save();
    
    // Log action
    await createAuditLog({
      user: req.user,
      action: 'CREATE',
      resource: 'User',
      resourceId: user._id,
      description: `Created new user: ${user.email} (${role})`,
      req,
      status: 'SUCCESS'
    });
    
    res.status(201).json({ 
      message: 'User created successfully',
      user: {
        ...user.toObject(),
        password: undefined
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Error creating user', error: error.message });
  }
};

// Update user
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Don't allow password updates through this endpoint
    delete updates.password;
    
    const user = await User.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Log action
    await createAuditLog({
      user: req.user,
      action: 'UPDATE',
      resource: 'User',
      resourceId: id,
      description: `Updated user: ${user.email}`,
      changes: { updates },
      req,
      status: 'SUCCESS'
    });
    
    res.json({ message: 'User updated successfully', user });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Error updating user', error: error.message });
  }
};

// Delete user
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Prevent deleting own account
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }
    
    await User.findByIdAndDelete(id);
    
    // Log action
    await createAuditLog({
      user: req.user,
      action: 'DELETE',
      resource: 'User',
      resourceId: id,
      description: `Deleted user: ${user.email}`,
      req,
      status: 'SUCCESS'
    });
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Error deleting user', error: error.message });
  }
};

// Reset user password
exports.resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;
    await user.save();
    
    // Log action
    await createAuditLog({
      user: req.user,
      action: 'UPDATE',
      resource: 'User',
      resourceId: id,
      description: `Reset password for user: ${user.email}`,
      req,
      status: 'SUCCESS'
    });
    
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ message: 'Error resetting password', error: error.message });
  }
};

// Toggle user active status
exports.toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    user.isVerified = !user.isVerified;
    await user.save();
    
    // Log action
    await createAuditLog({
      user: req.user,
      action: 'UPDATE',
      resource: 'User',
      resourceId: id,
      description: `${user.isVerified ? 'Activated' : 'Deactivated'} user: ${user.email}`,
      req,
      status: 'SUCCESS'
    });
    
    res.json({ 
      message: `User ${user.isVerified ? 'activated' : 'deactivated'} successfully`,
      user: {
        ...user.toObject(),
        password: undefined
      }
    });
  } catch (error) {
    console.error('Error toggling user status:', error);
    res.status(500).json({ message: 'Error toggling user status', error: error.message });
  }
};

// ==================== AUDIT LOGS ====================

// Get audit logs with filters
exports.getAuditLogs = async (req, res) => {
  try {
    const { 
      user, 
      action, 
      resource, 
      startDate, 
      endDate, 
      search,
      page = 1, 
      limit = 50 
    } = req.query;
    
    const query = {};
    
    // Filter by user
    if (user) {
      query.user = user;
    }
    
    // Filter by action
    if (action) {
      query.action = action;
    }
    
    // Filter by resource
    if (resource) {
      query.resource = resource;
    }
    
    // Filter by date range
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    // Search in description
    if (search) {
      query.description = { $regex: search, $options: 'i' };
    }
    
    const skip = (page - 1) * limit;
    
    const logs = await AuditLog.find(query)
      .populate('user', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await AuditLog.countDocuments(query);
    
    res.json({
      logs,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ message: 'Error fetching audit logs', error: error.message });
  }
};

// Get audit log statistics
exports.getAuditStats = async (req, res) => {
  try {
    // Get stats for last 24 hours
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    
    const totalActions = await AuditLog.countDocuments({
      createdAt: { $gte: twentyFourHoursAgo }
    });
    
    const uniqueUsers = await AuditLog.distinct('user', {
      createdAt: { $gte: twentyFourHoursAgo }
    });
    
    const failedActions = await AuditLog.countDocuments({
      status: { $in: ['FAILED', 'ERROR'] },
      createdAt: { $gte: twentyFourHoursAgo }
    });
    
    const actionsByType = await AuditLog.aggregate([
      { $match: { createdAt: { $gte: twentyFourHoursAgo } } },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    res.json({
      totalActions,
      uniqueUsers: uniqueUsers.length,
      failedActions,
      actionsByType
    });
  } catch (error) {
    console.error('Error fetching audit stats:', error);
    res.status(500).json({ message: 'Error fetching audit stats', error: error.message });
  }
};

// Export audit logs as CSV
exports.exportAuditLogs = async (req, res) => {
  try {
    const { userId, action, resource, startDate, endDate, search } = req.query;
    
    // Build query
    const query = {};
    if (userId) query.user = userId;
    if (action) query.action = action;
    if (resource) query.resource = resource;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    if (search) {
      query.$or = [
        { description: { $regex: search, $options: 'i' } },
        { ipAddress: { $regex: search, $options: 'i' } }
      ];
    }
    
    const logs = await AuditLog.find(query)
      .populate('user', 'name email role')
      .sort({ createdAt: -1 })
      .limit(10000); // Limit to prevent memory issues
    
    // Convert to CSV
    const csvHeader = 'Date,Time,User,Email,Role,Action,Resource,Resource ID,Description,Status\n';
    const csvRows = logs.map(log => {
      const date = new Date(log.createdAt);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      
      return [
        `${year}-${month}-${day}`,
        `${hours}:${minutes}:${seconds}`,
        `"${(log.user?.name || 'N/A').replace(/"/g, '""')}"`,
        log.user?.email || 'N/A',
        log.user?.role || 'N/A',
        log.action,
        log.resource || 'N/A',
        log.resourceId || 'N/A',
        `"${(log.description || '').replace(/"/g, '""')}"`,
        log.status || 'SUCCESS'
      ].join(',');
    }).join('\n');
    
    const csv = csvHeader + csvRows;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting audit logs:', error);
    res.status(500).json({ message: 'Error exporting audit logs', error: error.message });
  }
};

// ==================== ANALYTICS ====================

// Get dashboard analytics
exports.getAnalytics = async (req, res) => {
  try {
    // Total users by role
    const usersByRole = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Total users
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isVerified: true });
    const inactiveUsers = totalUsers - activeUsers;
    
    // Recent registrations (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newUsers = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });
    
    // Appointments statistics
    const completedAppointments = await Appointment.countDocuments({ status: 'completed' });
    const pendingAppointments = await Appointment.countDocuments({ status: 'pending' });
    const cancelledAppointments = await Appointment.countDocuments({ status: 'cancelled' });
    
    const appointmentsByStatus = await Appointment.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Most common medical complaints (from appointments)
    const commonComplaints = await Appointment.aggregate([
      { $match: { reason: { $exists: true, $ne: '' } } },
      {
        $group: {
          _id: '$reason',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Peak hours analysis (appointments by hour)
    const peakHours = await Appointment.aggregate([
      {
        $group: {
          _id: { $hour: '$date' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Patient visit frequency (categorized)
    const visitStats = await Appointment.aggregate([
      {
        $group: {
          _id: '$patient',
          visitCount: { $sum: 1 }
        }
      }
    ]);
    
    const firstTime = visitStats.filter(v => v.visitCount === 1).length;
    const returning = visitStats.filter(v => v.visitCount >= 2 && v.visitCount <= 4).length;
    const frequent = visitStats.filter(v => v.visitCount >= 5).length;
    
    res.json({
      userStats: {
        total: totalUsers,
        active: activeUsers,
        inactive: inactiveUsers,
        newUsers: newUsers
      },
      usersByRole: usersByRole,
      appointmentStats: {
        completed: completedAppointments,
        pending: pendingAppointments,
        cancelled: cancelledAppointments
      },
      appointmentsByStatus: appointmentsByStatus,
      commonComplaints: commonComplaints,
      peakHours: peakHours,
      visitFrequency: [
        { category: 'First Time', count: firstTime },
        { category: 'Returning', count: returning },
        { category: 'Frequent', count: frequent }
      ]
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ message: 'Error fetching analytics', error: error.message });
  }
};

// Export analytics as CSV
exports.exportAnalytics = async (req, res) => {
  try {
    // Get all data
    const users = await User.find().select('name email role isVerified createdAt');
    const appointments = await Appointment.find()
      .populate('patient', 'name email')
      .select('patient date status reason createdAt');
    
    // Create CSV sections
    let csv = '';
    
    // User Statistics
    csv += 'USER STATISTICS\n';
    csv += 'Name,Email,Role,Status,Registered Date\n';
    users.forEach(user => {
      const regDate = new Date(user.createdAt);
      const year = regDate.getFullYear();
      const month = String(regDate.getMonth() + 1).padStart(2, '0');
      const day = String(regDate.getDate()).padStart(2, '0');
      
      csv += [
        `"${user.name || 'N/A'}"`,
        user.email,
        user.role,
        user.isVerified ? 'Active' : 'Inactive',
        `${year}-${month}-${day}`
      ].join(',') + '\n';
    });
    
    csv += '\n';
    
    // Appointment Statistics
    csv += 'APPOINTMENT STATISTICS\n';
    csv += 'Patient Name,Patient Email,Date,Time,Status,Reason\n';
    appointments.forEach(apt => {
      const date = new Date(apt.date);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      
      csv += [
        `"${apt.patient?.name || 'N/A'}"`,
        apt.patient?.email || 'N/A',
        `${year}-${month}-${day}`,
        `${hours}:${minutes}:${seconds}`,
        apt.status,
        `"${(apt.reason || 'N/A').replace(/"/g, '""')}"`
      ].join(',') + '\n';
    });
    
    csv += '\n';
    
    // Summary Statistics
    csv += 'SUMMARY\n';
    csv += 'Metric,Value\n';
    csv += `Total Users,${users.length}\n`;
    csv += `Active Users,${users.filter(u => u.isVerified).length}\n`;
    csv += `Inactive Users,${users.filter(u => !u.isVerified).length}\n`;
    csv += `Total Appointments,${appointments.length}\n`;
    csv += `Completed Appointments,${appointments.filter(a => a.status === 'completed').length}\n`;
    csv += `Pending Appointments,${appointments.filter(a => a.status === 'pending').length}\n`;
    csv += `Cancelled Appointments,${appointments.filter(a => a.status === 'cancelled').length}\n`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=analytics-report-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting analytics:', error);
    res.status(500).json({ message: 'Error exporting analytics', error: error.message });
  }
};

// ==================== FEEDBACK ====================

// Get all feedback
exports.getAllFeedback = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    
    const query = {};
    if (status) {
      query.status = status;
    }
    
    const skip = (page - 1) * limit;
    
    const feedback = await Feedback.find(query)
      .populate('userId', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Feedback.countDocuments(query);
    
    res.json({
      feedback,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).json({ message: 'Error fetching feedback', error: error.message });
  }
};

// Update feedback status
exports.updateFeedbackStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const feedback = await Feedback.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).populate('userId', 'name email role');
    
    if (!feedback) {
      return res.status(404).json({ message: 'Feedback not found' });
    }
    
    // Log action
    await createAuditLog({
      user: req.user,
      action: 'UPDATE',
      resource: 'Feedback',
      resourceId: id,
      description: `Updated feedback status to: ${status}`,
      req,
      status: 'SUCCESS'
    });
    
    res.json({ message: 'Feedback status updated', feedback });
  } catch (error) {
    console.error('Error updating feedback:', error);
    res.status(500).json({ message: 'Error updating feedback', error: error.message });
  }
};
