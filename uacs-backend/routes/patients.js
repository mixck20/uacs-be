const express = require('express');
const router = express.Router();
const { isAuthenticated, isClinic } = require('../middleware/auth');
const patientController = require('../controllers/patientController');

// User routes - access their own health records (must be before other routes)
router.get('/dashboard', isAuthenticated, patientController.getUserDashboard);
router.get('/my-records', isAuthenticated, patientController.getPatientByUserId);

// Clinic staff routes - apply middleware to each route individually
router.route('/')
  .get(isAuthenticated, isClinic, patientController.getAllPatients)
  .post(isAuthenticated, isClinic, patientController.createPatient);

router.route('/:id')
  .get(isAuthenticated, isClinic, patientController.getPatient)
  .put(isAuthenticated, isClinic, patientController.updatePatient)
  .delete(isAuthenticated, isClinic, patientController.deletePatient);

// Add visit/health record
router.post('/:id/visits', isAuthenticated, isClinic, patientController.addVisitRecord);

// Archive and restore patient
router.post('/:id/archive', isAuthenticated, isClinic, patientController.archivePatient);
router.post('/:id/restore', isAuthenticated, isClinic, patientController.restorePatient);

// Link patient to user account
router.post('/link-account', isAuthenticated, isClinic, patientController.linkPatientToUser);

// Search unlinked patients
router.get('/search/unlinked', isAuthenticated, isClinic, patientController.searchUnlinkedPatients);

module.exports = router;