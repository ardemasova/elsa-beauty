const nodemailer = require('nodemailer');

// Namecheap Private Email SMTP конфигурация
const transporter = process.env.MAIL_TRANSPORT === 'json'
  ? nodemailer.createTransport({ jsonTransport: true }) // tests / local dev: nothing is sent
  : nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'mail.privateemail.com',
  port: parseInt(process.env.MAIL_PORT, 10) || 587,
  secure: false, // STARTTLS
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
  // SMTP debug logs print message contents (including passwords) - only on request.
  logger: process.env.MAIL_DEBUG === 'true',
  debug: process.env.MAIL_DEBUG === 'true',
});

if (process.env.MAIL_TRANSPORT === 'json') {
  // no-op
} else if (process.env.MAIL_USER && process.env.MAIL_PASS) {
  transporter.verify((error) => {
    if (error) console.error('❌ Email service error:', error.message);
    else console.log('✅ Email service ready');
  });
} else {
  console.warn('⚠️  MAIL_USER / MAIL_PASS not set: demo sign-up emails will not be sent');
}

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Функция отправки письма с доступом к демо
async function sendDemoAccessEmail(user, tempPassword) {
  const demoUrl = process.env.DEMO_URL || 'https://app.elsaerp.com';
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #0f172a 0%, #1f2937 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0 0 10px 0; font-size: 28px; }
        .header p { margin: 0; opacity: 0.9; }
        .content { background: #f9f7f2; padding: 30px; }
        .card { background: white; padding: 20px; margin: 20px 0; border-left: 4px solid #b96c86; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .label { color: #6b7280; font-weight: bold; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px; }
        .value { color: #0f172a; font-weight: bold; font-size: 1.1rem; font-family: 'Courier New', monospace; background: #f3f4f6; padding: 12px; border-radius: 4px; margin-top: 8px; word-break: break-all; }
        .btn-container { text-align: center; margin: 30px 0; }
        .btn { background: #b96c86; color: white; padding: 15px 40px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; }
        .btn:hover { background: #a65e76; }
        .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 6px; }
        .warning strong { color: #92400e; }
        .footer { background: #f9f7f2; color: #9ca3af; text-align: center; font-size: 0.85rem; padding: 20px; border-top: 1px solid #e5e7eb; }
        .features { list-style: none; padding: 0; margin: 20px 0; }
        .features li { padding: 10px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
        .features li:last-child { border-bottom: none; }
        .tip { background: #eff6ff; border-left: 4px solid #03839a; padding: 15px; border-radius: 6px; margin: 20px 0; }
        .tip strong { color: #03839a; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Welcome to ELSA Beauty ERP!</h1>
          <p>Your demo access is ready</p>
        </div>
        
        <div class="content">
          <p>Hi <strong>${escapeHtml(user.name)}</strong>,</p>
          
          <p>Thank you for registering! Your <strong>free 2-week demo access</strong> to ELSA Beauty ERP is now active.</p>
          
          <div class="card">
            <div class="label">📧 Login Email</div>
            <div class="value">${escapeHtml(user.email)}</div>
          </div>
          
          <div class="card">
            <div class="label">🔑 Password</div>
            <div class="value">${escapeHtml(tempPassword)}</div>
          </div>
          
          <div class="btn-container">
            <a href="${demoUrl}" class="btn">🚀 Access Demo</a>
          </div>
          
          <div class="warning">
            <strong>⏰ Demo Access Duration:</strong><br>
            Your access is valid for <strong>14 days</strong> from today. After that, you can upgrade to a paid plan or contact us for an extension.
          </div>
          
          <h3 style="color: #0f172a; margin-top: 30px; margin-bottom: 15px;">📊 What You Can Do in Your Demo:</h3>
          <ul class="features">
            <li>✓ Schedule appointments</li>
            <li>✓ Manage clients & masters</li>
            <li>✓ Process payments</li>
            <li>✓ View analytics & reports</li>
            <li>✓ Use AI assistant</li>
            <li>✓ Full feature access</li>
          </ul>
          
          <div class="tip">
            <strong>💡 Pro Tip:</strong> Start by creating a test appointment to see how the scheduling system works.
          </div>
          
          <p style="margin-top: 30px; color: #6b7280;">
            Questions? <a href="mailto:support@elsaerp.com" style="color: #b96c86; text-decoration: none;"><strong>Contact our support team</strong></a>
          </p>
        </div>
        
        <div class="footer">
          <p>&copy; 2026 ELSA Beauty ERP. All rights reserved.</p>
          <p style="margin-top: 10px;">This email was sent to you because you registered for demo access.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: `"ELSA Beauty ERP" <${process.env.MAIL_USER}>`,
      to: user.email,
      subject: '🎉 Welcome to ELSA Beauty ERP - Your Demo Access is Ready!',
      html: htmlContent,
    });
    console.log(`✅ Demo email sent to ${user.email}`);
    return true;
  } catch (err) {
    console.error('❌ Email send error:', err.message);
    throw err;
  }
}

module.exports = { sendDemoAccessEmail };
