const Chat = require('../models/Chat');
const Appointment = require('../models/Appointment');

// Get chat messages for an appointment
exports.getAppointmentChat = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const userId = req.user.id;

    // Verify appointment belongs to user or user is admin/staff
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointment.userId.toString() !== userId && req.user.role !== 'admin' && req.user.role !== 'staff' && req.user.role !== 'clinic_staff') {
      return res.status(403).json({ message: 'Access denied' });
    }

    let chat = await Chat.findOne({ appointmentId });

    // Create chat if it doesn't exist
    if (!chat) {
      chat = new Chat({
        appointmentId,
        userId: appointment.userId,
        messages: [{
          sender: 'clinic',
          senderName: 'UA Clinic',
          text: 'Hello! Welcome to the pre-consultation chat. Feel free to ask any questions or share concerns before your appointment.',
          timestamp: new Date(),
          read: false
        }]
      });
      await chat.save();
    }

    console.log('Returning chat with', chat.messages.length, 'messages');
    chat.messages.forEach((msg, i) => {
      console.log(`Message ${i}:`, { sender: msg.sender, text: msg.text.substring(0, 30) });
    });

    res.json(chat);
  } catch (error) {
    console.error('Get chat error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Send a message in chat
exports.sendMessage = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { text } = req.body;
    const userId = req.user.id;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Message text is required' });
    }

    // Verify appointment belongs to user or user is admin/staff
    const appointment = await Appointment.findById(appointmentId).populate('userId', 'name');
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const isClinic = req.user.role === 'admin' || req.user.role === 'staff' || req.user.role === 'clinic_staff';
    const isPatient = appointment.userId._id.toString() === userId;

    if (!isClinic && !isPatient) {
      return res.status(403).json({ message: 'Access denied' });
    }

    let chat = await Chat.findOne({ appointmentId });

    // Create chat if it doesn't exist
    if (!chat) {
      chat = new Chat({
        appointmentId,
        userId: appointment.userId._id,
        messages: []
      });
    }

    const message = {
      sender: isClinic ? 'clinic' : 'user',
      senderName: isClinic ? req.user.name || 'UA Clinic' : appointment.userId.name,
      text: text.trim(),
      timestamp: new Date(),
      read: false
    };

    console.log('Creating message:', { sender: message.sender, isClinic, isPatient, userRole: req.user.role });

    chat.messages.push(message);
    await chat.save();

    res.json({ message: 'Message sent', chat });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Mark messages as read
exports.markMessagesAsRead = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const userId = req.user.id;

    const chat = await Chat.findOne({ appointmentId });
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Verify access
    const appointment = await Appointment.findById(appointmentId);
    const isClinic = req.user.role === 'admin' || req.user.role === 'staff' || req.user.role === 'clinic_staff';
    const isPatient = appointment.userId.toString() === userId;

    if (!isClinic && !isPatient) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Mark all messages as read for the current user
    const senderType = isClinic ? 'user' : 'clinic';
    chat.messages.forEach(msg => {
      if (msg.sender === senderType) {
        msg.read = true;
      }
    });

    await chat.save();

    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get unread message count for user's appointments
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all user's appointments
    const appointments = await Appointment.find({ userId }).select('_id');
    const appointmentIds = appointments.map(apt => apt._id);

    // Get all chats for these appointments
    const chats = await Chat.find({ appointmentId: { $in: appointmentIds } });

    let unreadCount = 0;
    chats.forEach(chat => {
      chat.messages.forEach(msg => {
        if (msg.sender === 'clinic' && !msg.read) {
          unreadCount++;
        }
      });
    });

    res.json({ count: unreadCount });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ message: error.message });
  }
};
