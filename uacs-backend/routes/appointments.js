const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const appointmentController = require('../controllers/appointmentController');

router.use(isAuthenticated);

router.route('/')
  .get(appointmentController.getAllAppointments)
  .post(appointmentController.createAppointment);

router.route('/:id')
  .get(appointmentController.getAppointment)
  .put(appointmentController.updateAppointment)
  .delete(appointmentController.deleteAppointment);

module.exports = router;