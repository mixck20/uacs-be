const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const scheduleController = require('../controllers/scheduleController');

// Get the current schedule (public - both users and clinic staff can view)
router.get('/', auth, scheduleController.getSchedule);

// Update the entire schedule (clinic staff only)
router.put('/', auth, scheduleController.updateSchedule);

// Staff schedule routes (clinic staff only)
router.post('/staff', auth, scheduleController.addStaffSchedule);
router.put('/staff/:id', auth, scheduleController.updateStaffSchedule);
router.delete('/staff/:id', auth, scheduleController.deleteStaffSchedule);

// Doctor schedule routes (clinic staff only)
router.post('/doctor', auth, scheduleController.addDoctorSchedule);
router.put('/doctor/:id', auth, scheduleController.updateDoctorSchedule);
router.delete('/doctor/:id', auth, scheduleController.deleteDoctorSchedule);

module.exports = router;
