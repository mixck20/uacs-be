const express = require('express');
const router = express.Router();
const { getAuthUrl, getTokenFromCode } = require('../utils/googleMeetService');
const fs = require('fs');
const path = require('path');

/**
 * GET /api/auth/google/authorize
 * Redirect to Google OAuth consent screen
 */
router.get('/authorize', (req, res) => {
  try {
    const authUrl = getAuthUrl();
    
    if (!authUrl) {
      return res.status(500).json({
        error: 'OAuth2 not configured. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env'
      });
    }

    // Redirect user to Google's consent page
    res.redirect(authUrl);
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auth/google/callback
 * Handle OAuth callback from Google
 */
router.get('/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Authorization code not provided');
  }

  try {
    console.log('📥 Received authorization code from Google');
    
    // Exchange code for tokens
    const tokens = await getTokenFromCode(code);
    console.log('✅ Tokens received:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token
    });

    if (!tokens.refresh_token) {
      return res.status(400).send(
        'No refresh token received. Please revoke access and try again with prompt=consent'
      );
    }

    // Update .env file with refresh token
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Replace or add GOOGLE_REFRESH_TOKEN
    if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
      envContent = envContent.replace(
        /GOOGLE_REFRESH_TOKEN=.*/,
        `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`
      );
    } else {
      envContent += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`;
    }
    
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Refresh token saved to .env file');

    // Update environment variable in current process
    process.env.GOOGLE_REFRESH_TOKEN = tokens.refresh_token;

    res.send(`
      <html>
        <head>
          <title>Authorization Successful</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 10px;
              box-shadow: 0 10px 40px rgba(0,0,0,0.2);
              text-align: center;
              max-width: 500px;
            }
            h1 { color: #4CAF50; margin-bottom: 20px; }
            p { color: #555; line-height: 1.6; margin: 15px 0; }
            .success-icon { font-size: 60px; margin-bottom: 20px; }
            .button {
              display: inline-block;
              margin-top: 20px;
              padding: 12px 30px;
              background: #4CAF50;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              font-weight: bold;
            }
            .button:hover { background: #45a049; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">✅</div>
            <h1>Authorization Successful!</h1>
            <p>Google Calendar has been connected successfully.</p>
            <p>Your system can now create Google Meet links automatically when confirming appointments.</p>
            <p><strong>You can close this window and return to your application.</strong></p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" class="button">
              Return to Dashboard
            </a>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('❌ Error exchanging code for tokens:', error);
    res.status(500).send(`
      <html>
        <head>
          <title>Authorization Failed</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #f44336;
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 10px;
              text-align: center;
              max-width: 500px;
            }
            h1 { color: #f44336; }
            p { color: #555; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Authorization Failed</h1>
            <p>Error: ${error.message}</p>
            <p>Please try again or contact support.</p>
          </div>
        </body>
      </html>
    `);
  }
});

/**
 * GET /api/auth/google/status
 * Check if Google Calendar is authorized
 */
router.get('/status', (req, res) => {
  const hasRefreshToken = !!process.env.GOOGLE_REFRESH_TOKEN;
  const hasServiceAccount = !!(process.env.GOOGLE_CALENDAR_CLIENT_EMAIL && process.env.GOOGLE_CALENDAR_PRIVATE_KEY);
  
  res.json({
    oauth2: {
      configured: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
      hasRefreshToken: hasRefreshToken,
      refreshTokenLength: process.env.GOOGLE_REFRESH_TOKEN?.length || 0
    },
    serviceAccount: {
      configured: hasServiceAccount,
      clientEmail: process.env.GOOGLE_CALENDAR_CLIENT_EMAIL || 'Not set'
    },
    status: hasRefreshToken || hasServiceAccount ? 'ready' : 'not_configured',
    message: hasRefreshToken || hasServiceAccount
      ? 'Google Calendar is connected and ready to create Meet links'
      : 'Not authorized. Please visit /api/auth/google/authorize to connect or configure service account'
  });
});

/**
 * GET /api/auth/google/test-meet
 * Test Google Meet link creation
 */
router.get('/test-meet', async (req, res) => {
  const { createMeetLink } = require('../utils/googleMeetService');
  
  try {
    console.log('🧪 Testing Google Meet link creation...');
    
    const testDate = new Date();
    testDate.setDate(testDate.getDate() + 1); // Tomorrow
    const dateStr = testDate.toISOString().split('T')[0];
    
    const result = await createMeetLink({
      date: dateStr,
      time: '14:00',
      duration: 30,
      patientName: 'Test Patient',
      patientEmail: 'test@example.com',
      reason: 'Test consultation'
    });
    
    res.json({
      test: 'Google Meet Link Creation',
      timestamp: new Date().toISOString(),
      result: result,
      config: {
        hasOAuth2: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN),
        hasServiceAccount: !!(process.env.GOOGLE_CALENDAR_CLIENT_EMAIL && process.env.GOOGLE_CALENDAR_PRIVATE_KEY)
      }
    });
  } catch (error) {
    console.error('❌ Test failed:', error);
    res.status(500).json({ 
      test: 'Google Meet Link Creation',
      status: 'failed',
      error: error.message, 
      stack: error.stack,
      config: {
        hasOAuth2: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN),
        hasServiceAccount: !!(process.env.GOOGLE_CALENDAR_CLIENT_EMAIL && process.env.GOOGLE_CALENDAR_PRIVATE_KEY)
      }
    });
  }
});

module.exports = router;
