/**
 * Input validation utilities for backend
 */

/**
 * Validate password strength
 * Requirements:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
const validatePassword = (password) => {
  const errors = [];

  if (!password || typeof password !== 'string') {
    errors.push('Password is required');
    return { valid: false, errors };
  }

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (password.length > 128) {
    errors.push('Password must be less than 128 characters');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Validate appointment data
 */
const validateAppointmentData = (data) => {
  const errors = [];

  // Validate reason
  if (!data.reason || typeof data.reason !== 'string') {
    errors.push('Reason is required');
  } else if (data.reason.length < 10) {
    errors.push('Reason must be at least 10 characters');
  } else if (data.reason.length > 500) {
    errors.push('Reason must be less than 500 characters');
  }

  // Validate date
  if (!data.date) {
    errors.push('Date is required');
  } else {
    const appointmentDate = new Date(data.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (isNaN(appointmentDate.getTime())) {
      errors.push('Invalid date format');
    } else if (appointmentDate < today) {
      errors.push('Cannot schedule appointments in the past');
    }
    
    // Check if weekend
    const dayOfWeek = appointmentDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      errors.push('Appointments can only be scheduled on weekdays');
    }
  }

  // Validate time
  if (!data.time || typeof data.time !== 'string') {
    errors.push('Time is required');
  } else {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(data.time)) {
      errors.push('Invalid time format (use HH:mm)');
    } else {
      const [hours] = data.time.split(':').map(Number);
      if (hours < 9 || hours >= 17) {
        errors.push('Appointments must be between 9:00 AM and 5:00 PM');
      }
    }
  }

  // Validate type
  const validTypes = ['Checkup', 'Follow-up', 'Emergency', 'Consultation', 'Online Consultation', 'Clinic Visit', 'Medical Certificate'];
  if (!data.type || !validTypes.includes(data.type)) {
    errors.push('Invalid appointment type');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Validate user registration data
 */
const validateRegistrationData = (data) => {
  const errors = [];

  // Validate full name
  if (!data.fullName || typeof data.fullName !== 'string') {
    errors.push('Full name is required');
  } else if (data.fullName.length < 2) {
    errors.push('Full name must be at least 2 characters');
  } else if (data.fullName.length > 100) {
    errors.push('Full name must be less than 100 characters');
  }

  // Validate email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!data.email || typeof data.email !== 'string') {
    errors.push('Email is required');
  } else if (!emailRegex.test(data.email)) {
    errors.push('Invalid email format');
  }

  // Validate password
  if (!data.password || typeof data.password !== 'string') {
    errors.push('Password is required');
  } else if (data.password.length < 6) {
    errors.push('Password must be at least 6 characters');
  } else if (data.password.length > 128) {
    errors.push('Password must be less than 128 characters');
  }

  // Validate role
  const validRoles = ['student', 'staff', 'admin'];
  if (data.role && !validRoles.includes(data.role)) {
    errors.push('Invalid role');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Validate consultation notes
 */
const validateConsultationNotes = (data) => {
  const errors = [];

  if (data.diagnosis && typeof data.diagnosis === 'string' && data.diagnosis.length > 1000) {
    errors.push('Diagnosis must be less than 1000 characters');
  }

  if (data.symptoms && typeof data.symptoms === 'string' && data.symptoms.length > 1000) {
    errors.push('Symptoms must be less than 1000 characters');
  }

  if (data.vitalSigns) {
    if (data.vitalSigns.bloodPressure && !/^\d{2,3}\/\d{2,3}$/.test(data.vitalSigns.bloodPressure)) {
      errors.push('Invalid blood pressure format (use XXX/XX)');
    }
    
    if (data.vitalSigns.temperature && (data.vitalSigns.temperature < 35 || data.vitalSigns.temperature > 42)) {
      errors.push('Temperature must be between 35°C and 42°C');
    }
    
    if (data.vitalSigns.heartRate && (data.vitalSigns.heartRate < 40 || data.vitalSigns.heartRate > 200)) {
      errors.push('Heart rate must be between 40 and 200 bpm');
    }
  }

  if (data.prescriptions && Array.isArray(data.prescriptions)) {
    data.prescriptions.forEach((rx, index) => {
      if (!rx.medication || typeof rx.medication !== 'string') {
        errors.push(`Prescription ${index + 1}: Medication name is required`);
      }
      if (!rx.dosage || typeof rx.dosage !== 'string') {
        errors.push(`Prescription ${index + 1}: Dosage is required`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Sanitize string input on backend
 */
const sanitizeString = (str, maxLength = 500) => {
  if (!str || typeof str !== 'string') return '';
  
  return str
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
    .slice(0, maxLength);
};

module.exports = {
  validatePassword,
  validateAppointmentData,
  validateRegistrationData,
  validateConsultationNotes,
  sanitizeString
};
