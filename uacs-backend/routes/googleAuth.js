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
    // Verify configuration first
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    
    console.log('🔐 OAuth Configuration Check:', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      redirectUri: redirectUri
    });
    
    if (!clientId || !clientSecret || !redirectUri) {
      return res.status(500).send(`
        <html>
          <head>
            <title>Configuration Error</title>
            <style>
              body { font-family: Arial; padding: 40px; background: #f5f5f5; }
              .error-box { background: white; padding: 30px; border-radius: 10px; max-width: 600px; margin: 0 auto; border-left: 4px solid #f44336; }
              h1 { color: #f44336; margin-top: 0; }
              code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
            </style>
          </head>
          <body>
            <div class="error-box">
              <h1>❌ OAuth Configuration Missing</h1>
              <p>The following environment variables are required:</p>
              <ul>
                <li><code>GOOGLE_CLIENT_ID</code>: ${clientId ? '✓ Set' : '✗ Missing'}</li>
                <li><code>GOOGLE_CLIENT_SECRET</code>: ${clientSecret ? '✓ Set' : '✗ Missing'}</li>
                <li><code>GOOGLE_REDIRECT_URI</code>: ${redirectUri || '✗ Missing'}</li>
              </ul>
              <p>Please configure these in your <code>.env</code> file and Vercel environment variables.</p>
              <p>See <code>GOOGLE_OAUTH_FIX.md</code> for detailed setup instructions.</p>
            </div>
          </body>
        </html>
      `);
    }
    
    const authUrl = getAuthUrl();
    
    if (!authUrl) {
      return res.status(500).send(`
        <html>
          <head>
            <title>OAuth Error</title>
            <style>
              body { font-family: Arial; padding: 40px; background: #f5f5f5; }
              .error-box { background: white; padding: 30px; border-radius: 10px; max-width: 600px; margin: 0 auto; border-left: 4px solid #f44336; }
              h1 { color: #f44336; margin-top: 0; }
            </style>
          </head>
          <body>
            <div class="error-box">
              <h1>❌ Failed to Generate Authorization URL</h1>
              <p>Unable to create OAuth authorization URL. Please check your Google Cloud Console configuration.</p>
            </div>
          </body>
        </html>
      `);
    }

    console.log('✅ Redirecting to Google OAuth consent screen');
    console.log('🔗 Auth URL:', authUrl.substring(0, 100) + '...');
    
    // Redirect user to Google's consent page
    res.redirect(authUrl);
  } catch (error) {
    console.error('❌ Error generating auth URL:', error);
    res.status(500).send(`
      <html>
        <head>
          <title>Authorization Error</title>
          <style>
            body { font-family: Arial; padding: 40px; background: #f5f5f5; }
            .error-box { background: white; padding: 30px; border-radius: 10px; max-width: 600px; margin: 0 auto; border-left: 4px solid #f44336; }
            h1 { color: #f44336; margin-top: 0; }
            pre { background: #f0f0f0; padding: 10px; border-radius: 5px; overflow-x: auto; }
          </style>
        </head>
        <body>
          <div class="error-box">
            <h1>❌ Authorization Error</h1>
            <p><strong>Error:</strong> ${error.message}</p>
            <p>Check the server logs for more details.</p>
            <pre>${error.stack}</pre>
          </div>
        </body>
      </html>
    `);
  }
});

/**
 * GET /api/auth/google/callback
 * Handle OAuth callback from Google
 */
router.get('/callback', async (req, res) => {
  console.log('📥 OAuth callback received');
  console.log('Query params:', req.query);
  
  const { code, error, error_description } = req.query;

  // Check if user denied access
  if (error) {
    console.error('❌ OAuth error:', error, error_description);
    return res.status(400).send(`
      <html>
        <head>
          <title>Authorization Denied</title>
          <style>
            body { font-family: Arial; padding: 40px; background: #f5f5f5; }
            .error-box { background: white; padding: 30px; border-radius: 10px; max-width: 600px; margin: 0 auto; border-left: 4px solid #ff9800; }
            h1 { color: #ff9800; margin-top: 0; }
            .button { display: inline-block; margin-top: 20px; padding: 12px 30px; background: #e51d5e; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="error-box">
            <h1>⚠️ Authorization Denied</h1>
            <p><strong>Error:</strong> ${error}</p>
            <p>${error_description || 'You did not grant the necessary permissions.'}</p>
            <p>To use Google Meet integration, you need to authorize this app to access your Google Calendar.</p>
            <a href="/api/auth/google/authorize" class="button">Try Again</a>
          </div>
        </body>
      </html>
    `);
  }

  if (!code) {
    console.error('❌ No authorization code provided');
    return res.status(400).send(`
      <html>
        <head>
          <title>Authorization Failed</title>
          <style>
            body { font-family: Arial; padding: 40px; background: #f5f5f5; }
            .error-box { background: white; padding: 30px; border-radius: 10px; max-width: 600px; margin: 0 auto; border-left: 4px solid #f44336; }
            h1 { color: #f44336; margin-top: 0; }
            .button { display: inline-block; margin-top: 20px; padding: 12px 30px; background: #e51d5e; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="error-box">
            <h1>❌ Authorization Failed</h1>
            <p>Authorization code not provided by Google.</p>
            <p>This usually means:</p>
            <ul>
              <li>You cancelled the authorization</li>
              <li>The OAuth consent screen had an error</li>
              <li>The redirect URI doesn't match</li>
            </ul>
            <a href="/api/auth/google/authorize" class="button">Try Again</a>
          </div>
        </body>
      </html>
    `);
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

    // In production/Vercel, environment variables must be set via dashboard
    // In development, try to update .env file
    const isProduction = process.env.VERCEL || process.env.NODE_ENV === 'production';
    
    if (!isProduction) {
      try {
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
      } catch (err) {
        console.warn('⚠️ Could not update .env file:', err.message);
      }
    }

    // Update environment variable in current process (works for current request only in serverless)
    process.env.GOOGLE_REFRESH_TOKEN = tokens.refresh_token;
    
    console.log('✅ Refresh token obtained:', tokens.refresh_token.substring(0, 20) + '...');
    
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
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              padding: 20px;
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 10px;
              box-shadow: 0 10px 40px rgba(0,0,0,0.2);
              text-align: center;
              max-width: 600px;
            }
            h1 { color: #4CAF50; margin-bottom: 20px; }
            p { color: #555; line-height: 1.6; margin: 15px 0; }
            .success-icon { font-size: 60px; margin-bottom: 20px; }
            .token-box {
              background: #f5f5f5;
              padding: 15px;
              border-radius: 5px;
              margin: 20px 0;
              word-break: break-all;
              font-family: monospace;
              font-size: 12px;
              text-align: left;
            }
            .warning {
              background: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 15px;
              margin: 20px 0;
              text-align: left;
            }
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
            ol { text-align: left; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">✅</div>
            <h1>Authorization Successful!</h1>
            <p>Google Calendar has been connected and tokens received.</p>
            
            ${isProduction ? `
              <div class="warning">
                <strong>⚠️ Important: Production Environment Detected</strong>
                <p>You need to manually add this refresh token to Vercel environment variables:</p>
                <ol>
                  <li>Go to <a href="https://vercel.com/dashboard" target="_blank">Vercel Dashboard</a></li>
                  <li>Select your <strong>uacs-be</strong> project</li>
                  <li>Go to Settings → Environment Variables</li>
                  <li>Add or update: <code>GOOGLE_REFRESH_TOKEN</code></li>
                  <li>Paste the token below</li>
                  <li>Click Save and redeploy</li>
                </ol>
              </div>
              <div class="token-box">
                <strong>Your Refresh Token:</strong><br/>
                ${tokens.refresh_token}
              </div>
              <p style="font-size: 14px; color: #666;">Copy this token and add it to Vercel environment variables, then redeploy.</p>
            ` : `
              <p>The refresh token has been saved to your .env file locally.</p>
              <p>Your system can now create Google Meet links automatically when confirming appointments.</p>
            `}
            
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
 * GET /api/auth/google/config
 * Show current OAuth configuration for debugging
 */
router.get('/config', (req, res) => {
  res.json({
    clientId: process.env.GOOGLE_CLIENT_ID || 'Not set',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'Not set',
    hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    hasRefreshToken: !!process.env.GOOGLE_REFRESH_TOKEN,
    instructions: 'Add this EXACT redirect URI to your Google Cloud Console OAuth client',
    requiredRedirectUri: process.env.GOOGLE_REDIRECT_URI || 'https://uacs-be.vercel.app/api/auth/google/callback',
    googleCloudConsoleUrl: 'https://console.cloud.google.com/apis/credentials'
  });
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
