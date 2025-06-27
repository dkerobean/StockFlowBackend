// const nodemailer = require('nodemailer');
// const { compile } = require('handlebars');
// const fs = require('fs');
// const path = require('path');

// const transporter = nodemailer.createTransport({
//   service: process.env.EMAIL_SERVICE || 'gmail',
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS
//   }
// });

// const templateSource = fs.readFileSync(
//   path.join(__dirname, 'templates/lowStockAlert.hbs'),
//   'utf8'
// );
// const template = compile(templateSource);

// exports.sendLowStockEmail = async (product, recipients) => {
//   const html = template({
//     productName: product.name,
//     currentStock: product.quantity,
//     threshold: product.notifyAt,
//     productLink: `${process.env.CLIENT_URL}/products/${product._id}`,
//     supportEmail: process.env.SUPPORT_EMAIL || 'support@yourapp.com'
//   });

//   await transporter.sendMail({
//     from: `StockFlow Alerts <${process.env.EMAIL_FROM || 'alerts@stockflow.com'}>`,
//     to: recipients.map(u => u.email).join(', '),
//     subject: `Low Stock Alert: ${product.name}`,
//     html
//   });
// };


const { Resend } = require('resend'); // Import Resend
const { compile } = require('handlebars');
const fs = require('fs');
const path = require('path');

// Instantiate Resend client with API Key from .env
const resend = new Resend(process.env.RESEND_API_KEY);

// Keep template compilation logic
const templateSource = fs.readFileSync(
  path.join(__dirname, 'templates/lowStockAlert.hbs'),
  'utf8'
);
const template = compile(templateSource);

exports.sendLowStockEmail = async (product, recipients) => {
  // Check if email service is properly configured
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    console.warn('Email service not configured - skipping email notification');
    return { skipped: true, reason: 'Email service not configured' };
  }

  // Template data remains the same
  const html = template({
    productName: product.name,
    currentStock: product.quantity,
    threshold: product.notifyAt,
    productLink: `${process.env.CLIENT_URL}/products/${product._id}`,
    supportEmail: process.env.SUPPORT_EMAIL || 'support@yourverifieddomain.com'
  });

  try {
    // Use resend.emails.send()
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM, // Use EMAIL_FROM from .env (verified domain)
      to: recipients.map(u => u.email), // Pass emails as an array
      subject: `Low Stock Alert: ${product.name}`,
      html: html // Pass the compiled HTML
    });

    if (error) {
      console.error('Error sending email via Resend:', error);
      // Don't throw on rate limiting or domain verification errors to prevent crash
      if (error.name === 'rate_limit_exceeded' || error.statusCode === 403) {
        console.warn('Email service issue - continuing without email notification');
        return { skipped: true, reason: error.message || 'Email service issue' };
      }
      throw new Error(`Failed to send low stock email: ${error.message}`);
    }

    console.log('Low stock email sent successfully via Resend:', data);
    return data; // Return the success response data

  } catch (err) {
    console.error('Exception caught while sending email:', err);
    // For non-critical errors, don't crash the application
    if (err.message.includes('rate_limit_exceeded') || err.message.includes('domain is not verified')) {
      console.warn('Email service issue - continuing without email notification');
      return { skipped: true, reason: err.message };
    }
    throw err;
  }
};