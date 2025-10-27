const { google } = require('googleapis');

/**
 * Google Meet Service
 * Handles automatic Google Meet link creation via Google Calendar API
 */

// Load credentials from environment variables
function getCredentials() {
  const clientEmail = process.env.GOOGLE_CALENDAR_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_CALENDAR_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    console.error('❌ Google Calendar credentials missing!');
    console.error('CLIENT_EMAIL present:', !!clientEmail);
    console.error('PRIVATE_KEY present:', !!privateKey);
    return null;
  }
  
  console.log('✅ Google Calendar credentials loaded');
  console.log('Client Email:', clientEmail);

  return {
    client_email: clientEmail,
    private_key: privateKey.replace(/\\n/g, '\n'), // Handle escaped newlines
  };
}

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

/**
 * Get authenticated Google Calendar client
 */
async function getAuthClient() {
  const credentials = getCredentials();
  
  if (!credentials) {
    return null;
  }

  try {
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      SCOPES
    );

    // Test the authentication
    await auth.authorize();
    console.log('✅ Google Calendar authentication successful');
    return auth;
  } catch (error) {
    console.error('❌ Failed to authenticate with Google Calendar:', error.message);
    console.error('Full error:', error);
    return null;
  }
}

/**
 * Create a Google Meet link for an appointment
 * @param {Object} appointmentDetails - Appointment information
 * @param {Date|string} appointmentDetails.date - Appointment date
 * @param {string} appointmentDetails.time - Appointment time (HH:mm format)
 * @param {number} appointmentDetails.duration - Duration in minutes (default: 30)
 * @param {string} appointmentDetails.patientName - Patient name
 * @param {string} appointmentDetails.patientEmail - Patient email (optional)
 * @param {string} appointmentDetails.reason - Reason for consultation
 * @returns {Promise<Object>} Result with meetLink and eventId, or error
 */
async function createMeetLink(appointmentDetails) {
  console.log('🔵 Creating Google Meet link...', {
    date: appointmentDetails.date,
    time: appointmentDetails.time,
    patientName: appointmentDetails.patientName
  });
  
  try {
    const auth = await getAuthClient();
    
    if (!auth) {
      console.error('❌ Auth client not available');
      return {
        success: false,
        error: 'Google Calendar API not configured',
        fallbackLink: null
      };
    }
    
    console.log('✅ Auth client obtained');

    const calendar = google.calendar({ version: 'v3', auth });

    const { date, time, duration = 30, patientName, patientEmail, reason } = appointmentDetails;

    // Parse date and time to create ISO datetime
    let startDateTime;
    if (typeof date === 'string') {
      // If date is a string like "2025-10-27"
      startDateTime = new Date(`${date}T${time}`);
    } else {
      // If date is already a Date object
      const dateStr = date.toISOString().split('T')[0];
      startDateTime = new Date(`${dateStr}T${time}`);
    }

    // Calculate end time
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);

    // Validate dates
    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      throw new Error('Invalid date or time format');
    }

    // Create calendar event with Google Meet
    const event = {
      summary: `Online Consultation - ${patientName}`,
      description: `Consultation Reason: ${reason}\n\nThis is an online consultation via Google Meet.`,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'Asia/Manila', // Adjust to your timezone
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'Asia/Manila',
      },
      conferenceData: {
        createRequest: {
          requestId: `uacs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      attendees: patientEmail ? [{ email: patientEmail }] : [],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 day before
          { method: 'popup', minutes: 30 }, // 30 minutes before
        ],
      },
    };

    console.log('Creating Google Calendar event with Meet link...');

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1,
      sendUpdates: patientEmail ? 'all' : 'none', // Send email if we have patient email
    });

    const meetLink = response.data.hangoutLink;
    
    if (!meetLink) {
      throw new Error('Meet link was not created by Google Calendar API');
    }

    console.log('✅ Google Meet link created successfully:', meetLink);

    return {
      success: true,
      meetLink: meetLink,
      eventId: response.data.id,
      calendarLink: response.data.htmlLink,
    };

  } catch (error) {
    console.error('❌ Error creating Google Meet link:', error.message);
    console.error('Error code:', error.code);
    console.error('Error details:', JSON.stringify(error.errors || error, null, 2));
    
    return {
      success: false,
      error: error.message,
      fallbackLink: null,
    };
  }
}

/**
 * Delete a calendar event and its associated Meet link
 * @param {string} eventId - Google Calendar event ID
 * @returns {Promise<boolean>} Success status
 */
async function deleteMeetLink(eventId) {
  try {
    const auth = await getAuthClient();
    
    if (!auth || !eventId) {
      return false;
    }

    const calendar = google.calendar({ version: 'v3', auth });

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
    });

    console.log('✅ Google Calendar event deleted:', eventId);
    return true;

  } catch (error) {
    console.error('Error deleting calendar event:', error.message);
    return false;
  }
}

/**
 * Update a calendar event (e.g., reschedule)
 * @param {string} eventId - Google Calendar event ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Result with updated meetLink
 */
async function updateMeetLink(eventId, updates) {
  try {
    const auth = await getAuthClient();
    
    if (!auth || !eventId) {
      return { success: false, error: 'Invalid parameters' };
    }

    const calendar = google.calendar({ version: 'v3', auth });

    // Get existing event
    const existingEvent = await calendar.events.get({
      calendarId: 'primary',
      eventId: eventId,
    });

    // Merge updates
    const updatedEvent = {
      ...existingEvent.data,
      ...updates,
    };

    // Update the event
    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      resource: updatedEvent,
      conferenceDataVersion: 1,
    });

    console.log('✅ Google Calendar event updated:', eventId);

    return {
      success: true,
      meetLink: response.data.hangoutLink,
      eventId: response.data.id,
    };

  } catch (error) {
    console.error('Error updating calendar event:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  createMeetLink,
  deleteMeetLink,
  updateMeetLink,
};
