const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const emailController = require('../controllers/emailController');

// Add logging middleware
router.use((req, res, next) => {
  console.log(`📨 Email route accessed: ${req.method} ${req.path}`);
  next();
});

// Email routes
router.post('/send', auth, emailController.sendEmail);
router.get('/history', auth, emailController.getEmailHistory);
router.get('/stats', auth, emailController.getEmailStats);
router.delete('/:id', auth, emailController.deleteEmail);

// Template routes
router.post('/templates', auth, emailController.createTemplate);
router.get('/templates', auth, emailController.getTemplates);
router.put('/templates/:id', auth, emailController.updateTemplate);
router.delete('/templates/:id', auth, emailController.deleteTemplate);

// Configuration
router.get('/smtp-config', auth, emailController.checkSMTPConfig);

module.exports = router;
