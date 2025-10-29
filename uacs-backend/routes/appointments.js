const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const appointmentController = require('../controllers/appointmentController');

router.use(isAuthenticated);

router.route('/')
  .get(appointmentController.getAllAppointments)
  .post(appointmentController.createAppointment);

router.get('/user/my-appointments', appointmentController.getUserAppointments);
router.get('/filtered', appointmentController.getFilteredAppointments);
router.get('/time-slots/available', appointmentController.getAvailableTimeSlots);
router.post('/time-slots/create', appointmentController.createTimeSlots);

router.route('/:id')
  .get(appointmentController.getAppointment)
  .put(appointmentController.updateAppointment)
  .delete(appointmentController.deleteAppointment);

router.post('/:id/cancel', appointmentController.cancelAppointment);
router.post('/:id/reschedule', appointmentController.requestReschedule);
router.post('/:id/reschedule/:requestId/respond', appointmentController.respondToReschedule);
router.post('/:id/consultation-notes', appointmentController.addConsultationNotes);

module.exports = router;