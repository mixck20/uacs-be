const { GoogleGenerativeAI } = require('@google/generative-ai');
const TimeSlot = require('../models/TimeSlot');
const Schedule = require('../models/Schedule');
const Inventory = require('../models/Inventory');
const Appointment = require('../models/Appointment');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Get clinic context for AI - fetches REAL-TIME data
const getClinicContext = async () => {
  try {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Start of today

    // Get bookable appointment time slots (if any)
    const timeSlots = await TimeSlot.find({ 
      isAvailable: true,
      date: { $gte: now } // Only future dates
    })
      .sort({ date: 1, startTime: 1 })
      .limit(30);

    // Get staff/doctor schedule information
    const scheduleData = await Schedule.findOne();

    // Get available medicines with stock > 0
    const medicines = await Inventory.find({ 
      quantity: { $gt: 0 }
    })
      .select('name quantity category expiryDate')
      .sort({ name: 1 });

    // Get all inventory items for comprehensive information
    const allInventory = await Inventory.find({})
      .select('name quantity category')
      .sort({ name: 1 });

    // Get recent appointment stats
    const appointmentStats = await Appointment.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Format bookable time slots (if any exist)
    let timeSlotInfo = '';
    if (timeSlots.length > 0) {
      timeSlotInfo = '\n\n📅 AVAILABLE APPOINTMENT TIME SLOTS:\n' + 
        timeSlots.map(slot => {
          const date = new Date(slot.date).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
          });
          return `• ${date} at ${slot.startTime} - ${slot.endTime} (${slot.type})`;
        }).join('\n');
    }

    // Format staff and doctor schedules
    let staffScheduleInfo = '';
    if (scheduleData && scheduleData.staffSchedules && scheduleData.staffSchedules.length > 0) {
      staffScheduleInfo = '\n\n👨‍⚕️ STAFF SCHEDULES:\n';
      scheduleData.staffSchedules.forEach(staff => {
        staffScheduleInfo += `\n${staff.name} (${staff.role})`;
        if (staff.designation) staffScheduleInfo += ` - ${staff.designation}`;
        if (staff.dayOfDuty) staffScheduleInfo += `\n  Days: ${staff.dayOfDuty}`;
        if (staff.time) staffScheduleInfo += `\n  Time: ${staff.time}`;
        if (staff.schedule) staffScheduleInfo += `\n  Schedule: ${staff.schedule}`;
        staffScheduleInfo += '\n';
      });
    }

    let doctorScheduleInfo = '';
    if (scheduleData && scheduleData.doctorSchedules && scheduleData.doctorSchedules.length > 0) {
      doctorScheduleInfo = '\n\n🩺 DOCTOR SCHEDULES:\n';
      scheduleData.doctorSchedules.forEach(doctor => {
        doctorScheduleInfo += `\n${doctor.name} (${doctor.type})`;
        if (doctor.regularSchedule) doctorScheduleInfo += `\n  Regular: ${doctor.regularSchedule}`;
        if (doctor.medicalExaminationSchedule) doctorScheduleInfo += `\n  Medical Exam: ${doctor.medicalExaminationSchedule}`;
        doctorScheduleInfo += '\n';
      });
    }

    const scheduleInfo = (timeSlotInfo + staffScheduleInfo + doctorScheduleInfo).trim() ||
      'No schedule information available at the moment. Please contact the clinic directly.';

    // Format medicine information by category - show availability only, not exact counts
    const medicinesByCategory = {};
    medicines.forEach(med => {
      const cat = med.category || 'Other';
      if (!medicinesByCategory[cat]) medicinesByCategory[cat] = [];
      medicinesByCategory[cat].push(`${med.name} (Available)`);
    });

    let medicineInfo = '';
    Object.keys(medicinesByCategory).sort().forEach(category => {
      medicineInfo += `\n${category}:\n`;
      medicinesByCategory[category].forEach(item => {
        medicineInfo += `  • ${item}\n`;
      });
    });

    if (!medicineInfo) {
      medicineInfo = 'No medicines currently in stock. Please check with clinic staff for availability.';
    }

    // Format all inventory for reference - show availability status only
    const inventoryList = allInventory.map(item => 
      `${item.name} (${item.category || 'General'}) - ${item.quantity > 0 ? 'Available' : 'Out of stock'}`
    ).join('\n• ');

    return {
      schedules: scheduleInfo,
      medicines: medicineInfo.trim(),
      inventoryList: inventoryList ? `• ${inventoryList}` : 'No inventory items found',
      appointmentStats: appointmentStats,
      totalAvailableSlots: timeSlots.length,
      totalMedicinesInStock: medicines.length,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting clinic context:', error);
    return {
      schedules: 'Unable to fetch schedule information. Please contact the clinic.',
      medicines: 'Unable to fetch medicine information. Please contact the clinic.',
      inventoryList: 'Unable to fetch inventory information.',
      appointmentStats: [],
      totalAvailableSlots: 0,
      totalMedicinesInStock: 0,
      lastUpdated: new Date().toISOString()
    };
  }
};

// System prompt with clinic information
const getSystemPrompt = (context) => `You are a helpful AI assistant for UACS University Clinic. Your role is to help students and faculty with questions about the clinic services.

REAL-TIME CLINIC INFORMATION (Last Updated: ${new Date(context.lastUpdated).toLocaleString()}):

� CLINIC SCHEDULES & AVAILABILITY:
${context.schedules}

💊 AVAILABLE MEDICINES IN STOCK (${context.totalMedicinesInStock} items):
${context.medicines}

📦 COMPLETE INVENTORY LIST:
${context.inventoryList}

IMPORTANT GUIDELINES:
- This information is REAL-TIME and current. Use THIS EXACT DATA above.
- When users ask about "schedule", show them the doctor/staff schedules listed above
- If there are bookable appointment time slots, inform them of those specific dates/times
- When users ask about medicines, tell them if the item is "Available" or "Out of stock"
- DO NOT mention specific stock quantities or numbers
- If a medicine is listed as "Available", simply confirm it's available
- If not listed or marked "Out of stock", tell them it's currently unavailable
- Do not make up or assume information not provided above.

COMMUNICATION STYLE:
- Be CONCISE and DIRECT - answer only what was asked
- If user asks "HOW" to do something, provide step-by-step instructions
- If user asks "WHAT" or "WHEN" or "DO YOU HAVE", give brief direct answer
- NO unnecessary introductions like "Based on our current schedule..."
- Get straight to the point

HOW-TO PROCEDURES (only provide when user asks "how"):

HOW TO BOOK APPOINTMENT:
1. Go to Appointments section in the system
2. Click "Book Appointment"
3. Select date and time from available slots
4. Choose consultation type (Online/Clinic)
5. Provide reason for visit and symptoms
6. Submit and wait for confirmation email

HOW TO REQUEST MEDICAL CERTIFICATE:
1. Book and complete a consultation first
2. During consultation, inform the doctor you need a certificate
3. After consultation, go to Certificates section
4. Click "Request Certificate"
5. Fill in required details (reason, dates needed)
6. Submit request
7. Certificate ready in 1-2 hours
8. Download from Certificates section

HOW TO GET MEDICINE:
1. Must have consultation first
2. Doctor will prescribe medicine during consultation
3. Go to clinic to pick up medicine
4. Bring your university ID
5. Medicine dispensed by clinic staff

QUICK REFERENCE (for simple questions):
- Operating Hours: Mon-Fri 8AM-5PM. Closed weekends/holidays.
- Emergencies: Visit clinic directly or call campus security after hours.

Answer based on what user asks - if they ask "how", give steps. If they ask simple questions, answer briefly.`;

// Chat with AI
exports.chat = async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ message: 'Message is required' });
    }

    // Get current clinic context
    const context = await getClinicContext();
    
    // Initialize the model with gemini-2.5-flash (stable version)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Build chat history
    const chatHistory = [
      {
        role: 'user',
        parts: [{ text: getSystemPrompt(context) }]
      },
      {
        role: 'model',
        parts: [{ text: 'I understand. I am ready to assist with questions about UACS University Clinic services, appointments, medicines, medical certificates, and general health inquiries. How can I help you today?' }]
      }
    ];

    // Add previous conversation history
    history.forEach(msg => {
      chatHistory.push({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      });
    });

    // Start chat with history
    const chat = model.startChat({
      history: chatHistory,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      },
    });

    // Send message and get response
    const result = await chat.sendMessage(message);
    const aiMessage = result.response.text();

    res.json({
      message: aiMessage,
      context: {
        availableSlots: context.totalAvailableSlots,
        medicinesInStock: context.totalMedicinesInStock,
        lastUpdated: context.lastUpdated
      }
    });

  } catch (error) {
    console.error('AI Chat error:', error);
    
    // Handle specific Gemini API errors
    if (error.response) {
      console.error('API Response Error:', error.response.data);
    }
    
    if (error.message?.includes('API key')) {
      return res.status(500).json({ 
        message: 'AI service configuration error. Please contact administrator.' 
      });
    }

    res.status(500).json({ 
      message: 'Sorry, I am having trouble processing your request. Please try again or contact the clinic directly.' 
    });
  }
};

// Get FAQ suggestions
exports.getFAQs = async (req, res) => {
  try {
    const faqs = [
      {
        question: 'How do I book an appointment?',
        category: 'Appointments'
      },
      {
        question: 'What medicines are currently available?',
        category: 'Medicines'
      },
      {
        question: 'How do I get a medical certificate?',
        category: 'Certificates'
      },
      {
        question: 'What are the clinic operating hours?',
        category: 'General'
      },
      {
        question: 'Can I view my health records?',
        category: 'Records'
      },
      {
        question: 'What should I do in case of emergency?',
        category: 'Emergency'
      }
    ];

    res.json({ faqs });
  } catch (error) {
    console.error('Error getting FAQs:', error);
    res.status(500).json({ message: 'Failed to load FAQs' });
  }
};

// Get available time slots summary
exports.getAvailableSlots = async (req, res) => {
  try {
    const slots = await TimeSlot.find({ isAvailable: true })
      .sort({ date: 1, startTime: 1 })
      .limit(10);

    const formatted = slots.map(slot => ({
      date: new Date(slot.date).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      }),
      time: `${slot.startTime} - ${slot.endTime}`,
      id: slot._id
    }));

    res.json({ slots: formatted });
  } catch (error) {
    console.error('Error getting available slots:', error);
    res.status(500).json({ message: 'Failed to load available slots' });
  }
};
