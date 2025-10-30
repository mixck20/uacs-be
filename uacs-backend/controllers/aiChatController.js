const { GoogleGenerativeAI } = require('@google/generative-ai');
const TimeSlot = require('../models/TimeSlot');
const Inventory = require('../models/Inventory');
const Appointment = require('../models/Appointment');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Get clinic context for AI
const getClinicContext = async () => {
  try {
    // Get current schedules
    const schedules = await TimeSlot.find({ isAvailable: true })
      .sort({ date: 1, startTime: 1 })
      .limit(20);

    // Get available medicines
    const medicines = await Inventory.find({ 
      quantity: { $gt: 0 },
      category: 'medicine'
    }).select('name quantity category');

    // Get recent appointment stats
    const appointmentStats = await Appointment.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Format schedule information
    const scheduleInfo = schedules.map(slot => {
      const date = new Date(slot.date).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
      return `${date} at ${slot.startTime} - ${slot.endTime}`;
    }).join('\n');

    // Format medicine information
    const medicineInfo = medicines.map(med => 
      `${med.name} (${med.quantity} available)`
    ).join('\n');

    return {
      schedules: scheduleInfo || 'No available schedules at the moment',
      medicines: medicineInfo || 'No medicines currently in stock',
      appointmentStats: appointmentStats,
      totalAvailableSlots: schedules.length
    };
  } catch (error) {
    console.error('Error getting clinic context:', error);
    return {
      schedules: 'Unable to fetch schedule information',
      medicines: 'Unable to fetch medicine information',
      appointmentStats: [],
      totalAvailableSlots: 0
    };
  }
};

// System prompt with clinic information
const getSystemPrompt = (context) => `You are a helpful AI assistant for UACS University Clinic. Your role is to help students and faculty with questions about the clinic services.

CURRENT CLINIC INFORMATION:

Available Appointment Slots:
${context.schedules}

Available Medicines:
${context.medicines}

CLINIC SERVICES & PROCEDURES:

1. BOOKING APPOINTMENTS:
   - Students and faculty can book appointments through the appointment system
   - Choose from available time slots
   - Provide reason for visit and any symptoms
   - You will receive a confirmation email
   - Arrive 10 minutes early for your appointment

2. MEDICAL CERTIFICATES:
   - Medical certificates can be requested after a consultation
   - The doctor will issue the certificate if medically necessary
   - Certificates typically take 1-2 hours to process
   - You can download the certificate from the system once ready
   - Valid for excused absences as per university policy

3. MEDICINE AVAILABILITY:
   - We maintain a stock of common medicines for students and faculty
   - Check the list above for currently available medicines
   - Medicine is dispensed only after consultation with clinic staff
   - Bring your student/faculty ID when picking up medicine

4. EMERGENCY SERVICES:
   - For emergencies, come directly to the clinic during operating hours
   - Call campus security for after-hours emergencies
   - Basic first aid is available immediately

5. OPERATING HOURS:
   - Monday to Friday: 8:00 AM - 5:00 PM
   - Closed on weekends and university holidays
   - Emergency contact available 24/7 through campus security

6. HEALTH RECORDS:
   - You can view your health records through the system
   - Records include past visits, diagnoses, and prescriptions
   - Records are confidential and HIPAA compliant

IMPORTANT NOTES:
- Always be helpful, friendly, and professional
- If you don't know something specific, direct users to contact the clinic directly
- For urgent medical concerns, advise users to visit the clinic in person
- Remind users to bring their university ID
- Suggest booking appointments in advance when possible

Answer questions clearly and concisely. If the question is about scheduling, medicine availability, or procedures, use the current information provided above.`;

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
        medicinesInStock: context.medicines.split('\n').length
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
