const Appointment = require('../models/Appointment');
const User = require('../models/User');

exports.getAllAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find()
      .populate('patientId')
      .populate('userId', 'fullName email')
      .sort({ createdAt: -1 });
    
    // Format appointments for frontend
    const formattedAppointments = appointments.map(apt => ({
      id: apt._id,
      patientName: apt.userId ? apt.userId.fullName : (apt.patientId ? apt.patientId.fullName : 'N/A'),
      appointmentType: apt.type,
      type: apt.type,
      date: apt.date,
      time: apt.time,
      reason: apt.reason,
      status: apt.status,
      notes: apt.notes,
      isOnline: apt.isOnline,
      consultationDetails: apt.consultationDetails,
      certificateType: apt.certificateType,
      createdAt: apt.createdAt
    }));
    
    res.json(formattedAppointments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createAppointment = async (req, res) => {
  try {
    const appointmentData = {
      ...req.body,
      userId: req.body.patientId || req.user.id, // Use userId for logged-in users
      patientId: req.body.patientId || null
    };

    // If it's an online consultation, set the flag
    if (appointmentData.type === 'Online Consultation' || appointmentData.isOnline) {
      appointmentData.isOnline = true;
      appointmentData.consultationDetails = {
        chatEnabled: false,
        duration: appointmentData.duration || 30
      };
    }

    const appointment = new Appointment(appointmentData);
    const newAppointment = await appointment.save();
    
    await newAppointment.populate('userId', 'fullName email');
    
    res.status(201).json(newAppointment);
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.getAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id).populate('patientId');
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    res.json(appointment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // If confirming an online consultation, create Google Meet link placeholder
    if (req.body.status === 'Confirmed' && (appointment.isOnline || appointment.type === 'Online Consultation')) {
      // Generate a placeholder Google Meet link (in production, integrate with Google Calendar API)
      const meetLink = `https://meet.google.com/placeholder-${appointment._id}`;
      
      req.body.consultationDetails = {
        ...appointment.consultationDetails,
        meetLink: meetLink,
        chatEnabled: true
      };
      
      req.body.isOnline = true;
    }

    Object.assign(appointment, req.body);
    const updatedAppointment = await appointment.save();
    
    await updatedAppointment.populate('userId', 'fullName email');
    
    // Return the Meet link in the response if it was created
    res.json({
      ...updatedAppointment.toObject(),
      meetLink: updatedAppointment.consultationDetails?.meetLink
    });
  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.deleteAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    await appointment.deleteOne();
    res.json({ message: 'Appointment deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getUserAppointments = async (req, res) => {
  try {
    const userId = req.user.id;
    const appointments = await Appointment.find({ userId })
      .sort({ createdAt: -1 });
    
    const formattedAppointments = appointments.map(apt => ({
      id: apt._id,
      type: apt.type,
      date: apt.date,
      time: apt.time,
      reason: apt.reason,
      status: apt.status,
      notes: apt.notes,
      isOnline: apt.isOnline,
      consultationDetails: apt.consultationDetails,
      certificateType: apt.certificateType,
      createdAt: apt.createdAt
    }));
    
    res.json(formattedAppointments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};