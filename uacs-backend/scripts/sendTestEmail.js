require('dotenv').config();
const { sendVerificationEmail } = require('../utils/emailService');

(async () => {
  const testEmail = process.env.TEST_EMAIL || process.env.SMTP_USER;
  if (!testEmail) {
    console.error('Set TEST_EMAIL or SMTP_USER in .env to the destination email for the test');
    process.exit(1);
  }

  try {
    // Reuse verification function for a simple test — token not required for display, use 'test-token'
    await sendVerificationEmail(testEmail, 'test-token');
    console.log('Test email sent to', testEmail);
    process.exit(0);
  } catch (err) {
    console.error('Failed to send test email:', err);
    process.exit(2);
  }
})();
