const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminController = require('../controllers/adminController');
const backupController = require('../controllers/backupController');

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin only.' });
  }
  next();
};

// Apply auth to all routes
router.use(auth);

// ==================== USER MANAGEMENT ====================
router.use(isAdmin);
router.get('/users', adminController.getAllUsers);
router.get('/users/:id', adminController.getUserById);
router.post('/users', adminController.createUser);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);
router.post('/users/:id/reset-password', adminController.resetUserPassword);
router.post('/users/:id/toggle-status', adminController.toggleUserStatus);

// ==================== AUDIT LOGS ====================
router.get('/audit-logs', adminController.getAuditLogs);
router.get('/audit-logs/stats', adminController.getAuditStats);
router.get('/audit-logs/export', adminController.exportAuditLogs);

// ==================== ANALYTICS ====================
router.get('/analytics', adminController.getAnalytics);
router.get('/analytics/export', adminController.exportAnalytics);

// ==================== FEEDBACK ====================
router.get('/feedback', adminController.getAllFeedback);
router.put('/feedback/:id', adminController.updateFeedbackStatus);

// ==================== SYSTEM BACKUP/RESTORE ====================
// Allow clinic staff to backup, only admin can restore
router.get('/backup/export', backupController.backupSystemData);
router.post('/backup/restore', backupController.restoreSystemData);

module.exports = router;
