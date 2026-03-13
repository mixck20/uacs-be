const express = require('express');
const router = express.Router();
const { isAuthenticated, isClinic } = require('../middleware/auth');
const certificateController = require('../controllers/certificateController');

// User routes
router.post('/request', isAuthenticated, certificateController.requestCertificate);
router.get('/my-certificates', isAuthenticated, certificateController.getMyCertificates);
router.get('/:id/download', isAuthenticated, certificateController.generateCertificatePDF);

// Clinic routes
router.get('/', isAuthenticated, isClinic, certificateController.getAllCertificates);
router.post('/:id/issue', isAuthenticated, isClinic, certificateController.issueCertificate);
router.post('/:id/reject', isAuthenticated, isClinic, certificateController.rejectCertificate);

module.exports = router;
