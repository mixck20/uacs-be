const Appointment = require('../models/Appointment');
const User = require('../models/User');
const Patient = require('../models/Patient');
const TimeSlot = require('../models/TimeSlot');
const { createMeetLink, deleteMeetLink, updateMeetLink } = require('../utils/googleMeetService');
const { createNotification } = require('./notificationController');
const { validateAppointmentData, sanitizeString } = require('../utils/validation');

exports.getAllAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find()
      .populate('patientId')
      .populate('userId', 'name email role courseYear')
      .sort({ createdAt: -1 });
    
    console.log('Sample appointment data:', appointments[0]);
    
    // Format appointments for frontend
    const formattedAppointments = appointments.map(apt => {
      console.log('Formatting appointment:', {
        id: apt._id,
        userId: apt.userId?._id,
        userName: apt.userId?.name,
        userRole: apt.userId?.role,
        userCourseYear: apt.userId?.courseYear
      });
      
      return {
        id: apt._id,
        patientId: apt.userId?._id || apt.patientId?._id,
        patientName: apt.userId ? apt.userId.name : (apt.patientId ? apt.patientId.name : 'N/A'),
        user: apt.userId ? {
          _id: apt.userId._id,
          name: apt.userId.name,
          email: apt.userId.email,
          role: apt.userId.role,
          courseYear: apt.userId.courseYear
        } : null,
        userId: apt.userId,
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
      };
    });
    
    res.json(formattedAppointments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createAppointment = async (req, res) => {
  try {
    const userId = req.body.patientId || req.user.id;

    console.log('Creating appointment with data:', {
      userId,
      date: req.body.date,
      time: req.body.time,
      type: req.body.type,
      reason: req.body.reason,
      reasonLength: req.body.reason?.length
    });

    // Validate appointment data
    const validation = validateAppointmentData(req.body);
    if (!validation.valid) {
      console.log('Validation failed:', validation.errors);
      return res.status(400).json({ 
        message: 'Validation failed: ' + validation.errors.join(', '),
        errors: validation.errors
      });
    }

    // Sanitize text inputs
    if (req.body.reason) {
      req.body.reason = sanitizeString(req.body.reason, 500);
    }
    if (req.body.notes) {
      req.body.notes = sanitizeString(req.body.notes, 1000);
    }

    // Check if user already has a pending or confirmed appointment
    const existingActiveAppointment = await Appointment.findOne({
      userId: userId,
      status: { $in: ['Pending', 'Confirmed'] }
    });

    console.log('Existing active appointment check:', {
      userId,
      found: !!existingActiveAppointment,
      appointmentId: existingActiveAppointment?._id,
      status: existingActiveAppointment?.status
    });

    if (existingActiveAppointment) {
      return res.status(400).json({ 
        message: 'You already have a pending or confirmed appointment. Please wait for it to be completed or cancelled before booking a new one.',
        existingAppointment: {
          id: existingActiveAppointment._id,
          date: existingActiveAppointment.date,
          time: existingActiveAppointment.time,
          status: existingActiveAppointment.status,
          type: existingActiveAppointment.type,
          reason: existingActiveAppointment.reason
        }
      });
    }

    // AUTO-CREATE PATIENT RECORD if user doesn't have one
    let patientId = req.body.patientId;
    
    if (!patientId) {
      // Check if user already has a patient record
      let patient = await Patient.findOne({ userId: userId });
      
      if (!patient) {
        // Get user info to create patient record
        const user = await User.findById(userId);
        
        if (user) {
          console.log('Auto-creating patient record for user:', userId);
          
          patient = new Patient({
            userId: userId,
            fullName: user.name,
            email: user.email,
            gender: user.gender || 'Other',
            studentId: user.idNumber,
            isRegisteredUser: true
          });
          
          await patient.save();
          console.log('Patient record created:', patient._id);
        }
      }
      
      patientId = patient ? patient._id : null;
    }

    const appointmentData = {
      ...req.body,
      userId: userId,
      patientId: patientId
    };

    // If it's an online consultation, set the flag and enable chat immediately
    if (appointmentData.type === 'Online Consultation' || appointmentData.isOnline) {
      appointmentData.isOnline = true;
      appointmentData.consultationDetails = {
        chatEnabled: true, // Enable chat immediately for online consultations
        duration: appointmentData.duration || 30
      };
    }

    const appointment = new Appointment(appointmentData);
    const newAppointment = await appointment.save();
    
    await newAppointment.populate('userId', 'name email');
    
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
    const appointment = await Appointment.findById(req.params.id)
      .populate('userId', 'fullName email');
    
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const oldStatus = appointment.status;
    const newStatus = req.body.status;

    // If confirming an online consultation, create Google Meet link
    if (req.body.status === 'Confirmed' && 
        (appointment.isOnline || appointment.type === 'Online Consultation' || req.body.isOnline)) {
      
      console.log('Creating Google Meet link for appointment:', appointment._id);
      
      // Use date/time from request body if provided, otherwise use appointment's existing values
      let appointmentDate = req.body.date || appointment.date;
      const appointmentTime = req.body.time || appointment.time;
      
      // Format date properly - convert Date object to YYYY-MM-DD string
      if (appointmentDate instanceof Date) {
        appointmentDate = appointmentDate.toISOString().split('T')[0];
      } else if (typeof appointmentDate === 'string' && appointmentDate.includes('T')) {
        // If it's an ISO string, extract the date part
        appointmentDate = appointmentDate.split('T')[0];
      }
      
      console.log('📅 Formatted date for Google Meet:', { date: appointmentDate, time: appointmentTime });
      
      // Try to create a real Google Meet link
      const meetResult = await createMeetLink({
        date: appointmentDate,
        time: appointmentTime,
        duration: req.body.duration || 30,
        patientName: appointment.userId?.fullName || 'Patient',
        patientEmail: appointment.userId?.email,
        reason: appointment.reason,
      });

      if (meetResult.success) {
        console.log('✅ Google Meet link created:', meetResult.meetLink);
        req.body.consultationDetails = {
          ...appointment.consultationDetails,
          meetLink: meetResult.meetLink,
          eventId: meetResult.eventId,
          calendarLink: meetResult.calendarLink,
          chatEnabled: true,
        };
      } else {
        console.warn('⚠️ Google Meet link creation failed:', meetResult.error);
        // Fallback to placeholder link
        req.body.consultationDetails = {
          ...appointment.consultationDetails,
          meetLink: `https://meet.google.com/placeholder-${appointment._id}`,
          chatEnabled: true,
          error: meetResult.error,
        };
      }
      
      req.body.isOnline = true;
    }

    Object.assign(appointment, req.body);
    const updatedAppointment = await appointment.save();
    
    await updatedAppointment.populate('userId', 'fullName email');

    // Create notification if status changed
    if (newStatus && oldStatus !== newStatus && appointment.userId) {
      try {
        let notificationType, title, message;
        
        if (newStatus === 'Confirmed') {
          notificationType = 'appointment_confirmed';
          title = 'Appointment Confirmed';
          message = `Your ${appointment.type} appointment on ${appointment.date} at ${appointment.time} has been confirmed.`;
        } else if (newStatus === 'Declined') {
          notificationType = 'appointment_declined';
          title = 'Appointment Declined';
          message = `Your ${appointment.type} appointment on ${appointment.date} at ${appointment.time} has been declined. ${appointment.notes ? 'Reason: ' + appointment.notes : 'Please contact the clinic for more information.'}`;
        } else if (newStatus === 'Completed') {
          notificationType = 'appointment_completed';
          title = 'Appointment Completed';
          message = `Your ${appointment.type} appointment on ${appointment.date} has been completed. Thank you for visiting!`;
        }

        if (notificationType) {
          await createNotification(
            appointment.userId._id,
            notificationType,
            title,
            message,
            {
              appointmentId: appointment._id,
              appointmentType: appointment.type,
              date: appointment.date,
              time: appointment.time,
              meetLink: appointment.consultationDetails?.meetLink
            }
          );
        }
      } catch (notifError) {
        console.error('Error creating notification:', notifError);
        // Don't fail the appointment update if notification fails
      }
    }
    
    // Return the Meet link in the response
    res.json({
      ...updatedAppointment.toObject(),
      meetLink: updatedAppointment.consultationDetails?.meetLink,
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
    console.log('Fetching appointments for userId:', userId);
    
    const appointments = await Appointment.find({ userId })
      .sort({ createdAt: -1 });
    
    console.log('Found appointments:', appointments.length);
    
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
      createdAt: apt.createdAt,
      cancelReason: apt.cancelReason,
      cancelledAt: apt.cancelledAt,
      rescheduleRequests: apt.rescheduleRequests,
      consultationNotes: apt.consultationNotes,
      prescriptions: apt.prescriptions,
      followUpRecommendations: apt.followUpRecommendations,
      queueNumber: apt.queueNumber,
      queueStatus: apt.queueStatus
    }));
    
    res.json(formattedAppointments);
  } catch (error) {
    console.error('Get user appointments error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Cancel appointment
exports.cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    const appointment = await Appointment.findById(id).populate('userId', 'fullName email');
    
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Check if user has permission to cancel
    const isOwner = appointment.userId._id.toString() === userId;
    const isStaff = req.user.role === 'admin' || req.user.role === 'staff';
    
    if (!isOwner && !isStaff) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check if appointment can be cancelled
    if (appointment.status === 'Completed' || appointment.status === 'Cancelled') {
      return res.status(400).json({ message: `Cannot cancel ${appointment.status.toLowerCase()} appointment` });
    }

    // Update appointment
    appointment.status = 'Cancelled';
    appointment.cancelReason = reason;
    appointment.cancelledBy = userId;
    appointment.cancelledAt = new Date();
    
    await appointment.save();

    // Release time slot if booked
    if (appointment.isOnline || appointment.type.includes('Online')) {
      const timeSlot = await TimeSlot.findOne({
        date: appointment.date,
        startTime: appointment.time,
        appointments: appointment._id
      });
      
      if (timeSlot) {
        timeSlot.release(appointment._id);
        await timeSlot.save();
      }
    }

    // Delete Google Meet link if exists
    if (appointment.consultationDetails?.eventId) {
      await deleteMeetLink(appointment.consultationDetails.eventId);
    }

    // Send notification
    await createNotification(
      appointment.userId._id,
      'appointment_cancelled',
      'Appointment Cancelled',
      `Your ${appointment.type} appointment on ${appointment.date.toLocaleDateString()} has been cancelled. ${reason ? 'Reason: ' + reason : ''}`,
      {
        appointmentId: appointment._id,
        cancelledBy: isStaff ? 'clinic' : 'you'
      }
    );

    res.json({ message: 'Appointment cancelled successfully', appointment });
  } catch (error) {
    console.error('Cancel appointment error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Request reschedule
exports.requestReschedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { newDate, newTime, reason } = req.body;
    const userId = req.user.id;

    const appointment = await Appointment.findById(id);
    
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Check if user owns the appointment
    if (appointment.userId.toString() !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Add reschedule request
    appointment.rescheduleRequests.push({
      requestedBy: userId,
      oldDate: appointment.date,
      oldTime: appointment.time,
      newDate: new Date(newDate),
      newTime,
      reason,
      status: 'Pending'
    });

    await appointment.save();

    // Notify clinic staff
    const adminUsers = await User.find({ role: { $in: ['admin', 'staff'] } });
    for (const admin of adminUsers) {
      await createNotification(
        admin._id,
        'reschedule_requested',
        'Reschedule Request',
        `Patient has requested to reschedule appointment from ${appointment.date.toLocaleDateString()} ${appointment.time} to ${new Date(newDate).toLocaleDateString()} ${newTime}`,
        {
          appointmentId: appointment._id,
          oldDate: appointment.date,
          oldTime: appointment.time,
          newDate,
          newTime
        }
      );
    }

    res.json({ message: 'Reschedule request submitted', appointment });
  } catch (error) {
    console.error('Request reschedule error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Approve/Reject reschedule
exports.respondToReschedule = async (req, res) => {
  try {
    const { id, requestId } = req.params;
    const { action, note } = req.body; // action: 'approve' or 'reject'
    const userId = req.user.id;

    const appointment = await Appointment.findById(id).populate('userId', 'fullName email');
    
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const request = appointment.rescheduleRequests.id(requestId);
    
    if (!request) {
      return res.status(404).json({ message: 'Reschedule request not found' });
    }

    if (request.status !== 'Pending') {
      return res.status(400).json({ message: 'Request already processed' });
    }

    request.status = action === 'approve' ? 'Approved' : 'Rejected';
    request.respondedBy = userId;
    request.respondedAt = new Date();
    request.responseNote = note;

    if (action === 'approve') {
      // Release old time slot
      const oldSlot = await TimeSlot.findOne({
        date: appointment.date,
        startTime: appointment.time,
        appointments: appointment._id
      });
      
      if (oldSlot) {
        oldSlot.release(appointment._id);
        await oldSlot.save();
      }

      // Update appointment
      appointment.date = request.newDate;
      appointment.time = request.newTime;
      appointment.status = 'Rescheduled';

      // Book new time slot
      const newSlot = await TimeSlot.findOne({
        date: request.newDate,
        startTime: request.newTime,
        isAvailable: true
      });
      
      if (newSlot) {
        newSlot.book(appointment._id);
        await newSlot.save();
      }

      // Update Google Meet link if online
      if (appointment.consultationDetails?.eventId) {
        const meetResult = await updateMeetLink(appointment.consultationDetails.eventId, {
          start: {
            dateTime: new Date(`${request.newDate}T${request.newTime}`).toISOString(),
            timeZone: 'Asia/Manila'
          }
        });
        
        if (meetResult.success) {
          appointment.consultationDetails.meetLink = meetResult.meetLink;
        }
      }
    }

    await appointment.save();

    // Notify patient
    await createNotification(
      appointment.userId._id,
      action === 'approve' ? 'reschedule_approved' : 'reschedule_rejected',
      action === 'approve' ? 'Reschedule Approved' : 'Reschedule Rejected',
      action === 'approve' 
        ? `Your reschedule request has been approved. New appointment: ${request.newDate.toLocaleDateString()} at ${request.newTime}`
        : `Your reschedule request has been rejected. ${note || ''}`,
      {
        appointmentId: appointment._id
      }
    );

    res.json({ message: `Reschedule request ${action}d`, appointment });
  } catch (error) {
    console.error('Respond to reschedule error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Add consultation notes
exports.addConsultationNotes = async (req, res) => {
  try {
    const { id } = req.params;
    const { diagnosis, symptoms, vitalSigns, assessment, treatment, prescriptions, followUp } = req.body;
    const userId = req.user.id;

    const appointment = await Appointment.findById(id);
    
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Add consultation notes
    appointment.consultationNotes = {
      diagnosis,
      symptoms,
      vitalSigns,
      assessment,
      treatment,
      addedBy: userId,
      addedAt: new Date()
    };

    // Add prescriptions
    if (prescriptions && prescriptions.length > 0) {
      appointment.prescriptions = prescriptions;
    }

    // Add follow-up recommendations
    if (followUp) {
      appointment.followUpRecommendations = followUp;
    }

    await appointment.save();

    res.json({ message: 'Consultation notes added successfully', appointment });
  } catch (error) {
    console.error('Add consultation notes error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get available time slots
exports.getAvailableTimeSlots = async (req, res) => {
  try {
    const { date, type } = req.query;

    if (!date) {
      return res.status(400).json({ message: 'Date is required' });
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const query = {
      date: { $gte: startOfDay, $lte: endOfDay },
      isAvailable: true
    };

    if (type) {
      query.type = type;
    }

    const timeSlots = await TimeSlot.find(query).sort({ startTime: 1 });

    res.json(timeSlots);
  } catch (error) {
    console.error('Get available time slots error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Create time slots (admin only)
exports.createTimeSlots = async (req, res) => {
  try {
    const { date, slots } = req.body; // slots: [{ startTime, endTime, type, maxCapacity }]
    const userId = req.user.id;

    const createdSlots = [];

    for (const slot of slots) {
      const timeSlot = new TimeSlot({
        date: new Date(date),
        startTime: slot.startTime,
        endTime: slot.endTime,
        type: slot.type,
        maxCapacity: slot.maxCapacity || 1,
        createdBy: userId
      });

      await timeSlot.save();
      createdSlots.push(timeSlot);
    }

    res.json({ message: 'Time slots created successfully', slots: createdSlots });
  } catch (error) {
    console.error('Create time slots error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get appointments with filters
exports.getFilteredAppointments = async (req, res) => {
  try {
    const { status, type, startDate, endDate, search } = req.query;
    const userId = req.user.id;
    const isStaff = req.user.role === 'admin' || req.user.role === 'staff';

    let query = isStaff ? {} : { userId };

    // Status filter
    if (status && status !== 'all') {
      query.status = status;
    }

    // Type filter
    if (type && type !== 'all') {
      query.type = type;
    }

    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        query.date.$lte = new Date(endDate);
      }
    }

    let appointments = await Appointment.find(query)
      .populate('userId', 'fullName email courseYear')
      .sort({ date: -1, time: -1 });

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      appointments = appointments.filter(apt => 
        apt.reason?.toLowerCase().includes(searchLower) ||
        apt.type?.toLowerCase().includes(searchLower) ||
        apt.userId?.fullName?.toLowerCase().includes(searchLower) ||
        apt.userId?.courseYear?.toLowerCase().includes(searchLower) ||
        apt.notes?.toLowerCase().includes(searchLower)
      );
    }

    res.json(appointments);
  } catch (error) {
    console.error('Get filtered appointments error:', error);
    res.status(500).json({ message: error.message });
  }
};