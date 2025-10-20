const express = require('express');
const router = express.Router();
const { isAuthenticated, isClinic } = require('../middleware/auth');
const patientController = require('../controllers/patientController');

router.use(isAuthenticated);
router.use(isClinic);

router.route('/')
  .get(patientController.getAllPatients)
  .post(patientController.createPatient);

router.route('/:id')
  .get(patientController.getPatient)
  .put(patientController.updatePatient)
  .delete(patientController.deletePatient);

module.exports = router;