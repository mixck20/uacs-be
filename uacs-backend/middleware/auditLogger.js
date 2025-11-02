const AuditLog = require('../models/AuditLog');

// Helper function to create audit log
const createAuditLog = async ({
  user,
  action,
  resource,
  resourceId = null,
  description,
  changes = null,
  req,
  status = 'SUCCESS',
  errorMessage = null
}) => {
  try {
    const auditLog = new AuditLog({
      user: user._id,
      userName: user.name || `${user.firstName} ${user.lastName}`,
      userEmail: user.email,
      userRole: user.role,
      action,
      resource,
      resourceId,
      description,
      changes,
      userAgent: req.headers['user-agent'],
      status,
      errorMessage
    });

    await auditLog.save();
  } catch (error) {
    // Don't fail the main operation if audit logging fails
    console.error('Failed to create audit log:', error);
  }
};

// Middleware to log actions
const auditLogger = (action, resource) => {
  return async (req, res, next) => {
    // Store original methods
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    let responseData;
    let resourceId;

    // Intercept response
    res.json = function(data) {
      responseData = data;
      return originalJson(data);
    };

    res.send = function(data) {
      responseData = data;
      return originalSend(data);
    };

    // Continue with request
    res.on('finish', async () => {
      if (!req.user) return;

      const status = res.statusCode >= 200 && res.statusCode < 300 ? 'SUCCESS' : 'FAILURE';
      
      // Extract resource ID from response or params
      if (responseData && typeof responseData === 'object') {
        resourceId = responseData._id || responseData.id || req.params.id;
      } else {
        resourceId = req.params.id;
      }

      // Generate description
      let description = `${action} ${resource}`;
      if (resourceId) description += ` (ID: ${resourceId})`;

      // Track changes for updates
      let changes = null;
      if (action === 'UPDATE' && req.body) {
        changes = {
          updates: req.body
        };
      }

      await createAuditLog({
        user: req.user,
        action,
        resource,
        resourceId,
        description,
        changes,
        req,
        status,
        errorMessage: status === 'FAILURE' ? responseData?.message : null
      });
    });

    next();
  };
};

module.exports = {
  createAuditLog,
  auditLogger
};
