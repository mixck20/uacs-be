const Schedule = require('../models/Schedule');

// Get the current schedule
exports.getSchedule = async (req, res) => {
  try {
    let schedule = await Schedule.findOne().populate('updatedBy', 'name email');
    
    // If no schedule exists, create a default one
    if (!schedule) {
      schedule = new Schedule({
        staffSchedules: [],
        doctorSchedules: []
      });
      await schedule.save();
    }
    
    res.json(schedule);
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ message: 'Error fetching schedule', error: error.message });
  }
};

// Update the schedule (clinic staff only)
exports.updateSchedule = async (req, res) => {
  try {
    const { staffSchedules, doctorSchedules } = req.body;
    
    let schedule = await Schedule.findOne();
    
    if (!schedule) {
      schedule = new Schedule();
    }
    
    schedule.staffSchedules = staffSchedules || [];
    schedule.doctorSchedules = doctorSchedules || [];
    schedule.lastUpdated = new Date();
    schedule.updatedBy = req.user._id;
    
    await schedule.save();
    await schedule.populate('updatedBy', 'name email');
    
    res.json({ message: 'Schedule updated successfully', schedule });
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({ message: 'Error updating schedule', error: error.message });
  }
};

// Add a staff member to schedule
exports.addStaffSchedule = async (req, res) => {
  try {
    const { name, role, designation, dayOfDuty, time, schedule: scheduleText } = req.body;
    
    let schedule = await Schedule.findOne();
    if (!schedule) {
      schedule = new Schedule();
    }
    
    schedule.staffSchedules.push({
      name,
      role,
      designation: designation || '',
      dayOfDuty: dayOfDuty || '',
      time: time || '',
      schedule: scheduleText || ''
    });
    
    schedule.lastUpdated = new Date();
    schedule.updatedBy = req.user._id;
    
    await schedule.save();
    await schedule.populate('updatedBy', 'name email');
    
    res.json({ message: 'Staff schedule added successfully', schedule });
  } catch (error) {
    console.error('Error adding staff schedule:', error);
    res.status(500).json({ message: 'Error adding staff schedule', error: error.message });
  }
};

// Update a staff member's schedule
exports.updateStaffSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, designation, dayOfDuty, time, schedule: scheduleText } = req.body;
    
    const schedule = await Schedule.findOne();
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }
    
    const staffIndex = schedule.staffSchedules.findIndex(
      staff => staff._id.toString() === id
    );
    
    if (staffIndex === -1) {
      return res.status(404).json({ message: 'Staff schedule not found' });
    }
    
    schedule.staffSchedules[staffIndex] = {
      _id: id,
      name,
      role,
      designation: designation || '',
      dayOfDuty: dayOfDuty || '',
      time: time || '',
      schedule: scheduleText || ''
    };
    
    schedule.lastUpdated = new Date();
    schedule.updatedBy = req.user._id;
    
    await schedule.save();
    await schedule.populate('updatedBy', 'name email');
    
    res.json({ message: 'Staff schedule updated successfully', schedule });
  } catch (error) {
    console.error('Error updating staff schedule:', error);
    res.status(500).json({ message: 'Error updating staff schedule', error: error.message });
  }
};

// Delete a staff member's schedule
exports.deleteStaffSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    
    const schedule = await Schedule.findOne();
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }
    
    schedule.staffSchedules = schedule.staffSchedules.filter(
      staff => staff._id.toString() !== id
    );
    
    schedule.lastUpdated = new Date();
    schedule.updatedBy = req.user._id;
    
    await schedule.save();
    await schedule.populate('updatedBy', 'name email');
    
    res.json({ message: 'Staff schedule deleted successfully', schedule });
  } catch (error) {
    console.error('Error deleting staff schedule:', error);
    res.status(500).json({ message: 'Error deleting staff schedule', error: error.message });
  }
};

// Add a doctor to schedule
exports.addDoctorSchedule = async (req, res) => {
  try {
    const { name, type, regularSchedule, medicalExaminationSchedule } = req.body;
    
    let schedule = await Schedule.findOne();
    if (!schedule) {
      schedule = new Schedule();
    }
    
    schedule.doctorSchedules.push({
      name,
      type,
      regularSchedule: regularSchedule || '',
      medicalExaminationSchedule: medicalExaminationSchedule || ''
    });
    
    schedule.lastUpdated = new Date();
    schedule.updatedBy = req.user._id;
    
    await schedule.save();
    await schedule.populate('updatedBy', 'name email');
    
    res.json({ message: 'Doctor schedule added successfully', schedule });
  } catch (error) {
    console.error('Error adding doctor schedule:', error);
    res.status(500).json({ message: 'Error adding doctor schedule', error: error.message });
  }
};

// Update a doctor's schedule
exports.updateDoctorSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, regularSchedule, medicalExaminationSchedule } = req.body;
    
    const schedule = await Schedule.findOne();
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }
    
    const doctorIndex = schedule.doctorSchedules.findIndex(
      doctor => doctor._id.toString() === id
    );
    
    if (doctorIndex === -1) {
      return res.status(404).json({ message: 'Doctor schedule not found' });
    }
    
    schedule.doctorSchedules[doctorIndex] = {
      _id: id,
      name,
      type,
      regularSchedule: regularSchedule || '',
      medicalExaminationSchedule: medicalExaminationSchedule || ''
    };
    
    schedule.lastUpdated = new Date();
    schedule.updatedBy = req.user._id;
    
    await schedule.save();
    await schedule.populate('updatedBy', 'name email');
    
    res.json({ message: 'Doctor schedule updated successfully', schedule });
  } catch (error) {
    console.error('Error updating doctor schedule:', error);
    res.status(500).json({ message: 'Error updating doctor schedule', error: error.message });
  }
};

// Delete a doctor's schedule
exports.deleteDoctorSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    
    const schedule = await Schedule.findOne();
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }
    
    schedule.doctorSchedules = schedule.doctorSchedules.filter(
      doctor => doctor._id.toString() !== id
    );
    
    schedule.lastUpdated = new Date();
    schedule.updatedBy = req.user._id;
    
    await schedule.save();
    await schedule.populate('updatedBy', 'name email');
    
    res.json({ message: 'Doctor schedule deleted successfully', schedule });
  } catch (error) {
    console.error('Error deleting doctor schedule:', error);
    res.status(500).json({ message: 'Error deleting doctor schedule', error: error.message });
  }
};
