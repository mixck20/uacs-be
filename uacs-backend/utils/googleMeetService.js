const { google } = require('googleapis');

/**
 * Google Meet Service with OAuth2
 * Handles automatic Google Meet link creation via Google Calendar API
 */

// OAuth2 Configuration
function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    console.error('❌ OAuth2 credentials missing!');
    console.error('CLIENT_ID present:', !!clientId);
    console.error('CLIENT_SECRET present:', !!clientSecret);
    console.error('REDIRECT_URI present:', !!redirectUri);
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  // Set refresh token if available
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (refreshToken) {
    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });
  }

  return oauth2Client;
}

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

/**
 * Get authenticated Google Calendar client
 */
async function getAuthClient() {
  const oauth2Client = getOAuth2Client();
  
  if (!oauth2Client) {
    return null;
  }

  // Check if we have a refresh token
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!refreshToken) {
    console.error('❌ No refresh token found. Please authorize the app first.');
    console.error('🔗 Visit: http://localhost:3000/api/auth/google/authorize');
    return null;
  }

  try {
    console.log('🔑 Attempting authentication with Google Calendar API...');
    console.log('✅ Google Calendar authentication successful');
    return oauth2Client;
  } catch (error) {
    console.error('❌ Failed to authenticate with Google Calendar:', error.message);
    console.error('Error code:', error.code);
    return null;
  }
}

/**
 * Generate authorization URL for first-time setup
 */
function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client) {
    return null;
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });

  return authUrl;
}

/**
 * Exchange authorization code for tokens
 */
async function getTokenFromCode(code) {
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client) {
    throw new Error('OAuth2 client not configured');
  }

  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
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
    duration: appointmentDetails.duration,
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

    // Validate inputs
    if (!date || !time) {
      throw new Error(`Missing required fields - date: ${date}, time: ${time}`);
    }

    console.log('📝 Parsing date and time:', { date: typeof date, time: typeof time, dateValue: date, timeValue: time });

    // Parse date and time to create ISO datetime
    let startDateTime;
    try {
      if (typeof date === 'string') {
        // Ensure time has proper format (HH:mm or HH:mm:ss)
        const timeStr = time.includes(':') ? time : `${time}:00`;
        // If date is a string like "2025-10-27"
        startDateTime = new Date(`${date}T${timeStr}:00.000+08:00`); // Asia/Manila timezone
        console.log('📅 Parsed from string:', startDateTime.toISOString());
      } else {
        // If date is already a Date object
        const dateStr = new Date(date).toISOString().split('T')[0];
        const timeStr = time.includes(':') ? time : `${time}:00`;
        startDateTime = new Date(`${dateStr}T${timeStr}:00.000+08:00`);
        console.log('📅 Parsed from Date object:', startDateTime.toISOString());
      }
    } catch (parseError) {
      console.error('❌ Date parsing error:', parseError.message);
      throw new Error(`Date parsing failed: ${parseError.message}`);
    }

    // Calculate end time
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);

    // Validate dates
    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      console.error('❌ Invalid datetime:', { start: startDateTime, end: endDateTime });
      throw new Error('Invalid date or time format');
    }

    console.log('✅ Valid datetime created:', {
      start: startDateTime.toISOString(),
      end: endDateTime.toISOString()
    });

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
      // Don't include attendees for service accounts without domain-wide delegation
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 day before
          { method: 'popup', minutes: 30 }, // 30 minutes before
        ],
      },
    };

    console.log('📅 Creating Google Calendar event with Meet link...');
    console.log('Event details:', JSON.stringify(event, null, 2));

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1,
      sendUpdates: 'none',
    });

    console.log('📊 Calendar API Response:', JSON.stringify(response.data, null, 2));

    const meetLink = response.data.hangoutLink;
    
    if (!meetLink) {
      console.error('⚠️ Meet link was not created in the response');
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
    
    // Provide helpful error message for common issues
    let errorMessage = error.message;
    let helpfulTip = '';
    
    if (error.message.includes('Invalid conference type') || error.code === 400) {
      errorMessage = 'Service accounts cannot create Google Meet links without Domain-Wide Delegation';
      helpfulTip = 'Please set up Domain-Wide Delegation in Google Workspace Admin Console, or use a regular Gmail account with OAuth2 instead of a service account.';
    }
    
    console.error('💡 Tip:', helpfulTip);
    
    return {
      success: false,
      error: errorMessage,
      helpfulTip: helpfulTip,
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
  getAuthUrl,
  getTokenFromCode,
};
