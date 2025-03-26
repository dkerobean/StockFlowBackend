const nodemailer = require('nodemailer');
const { compile } = require('handlebars');
const fs = require('fs');
const path = require('path');

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const templateSource = fs.readFileSync(
  path.join(__dirname, 'templates/lowStockAlert.hbs'),
  'utf8'
);
const template = compile(templateSource);

exports.sendLowStockEmail = async (product, recipients) => {
  const html = template({
    productName: product.name,
    currentStock: product.quantity,
    threshold: product.notifyAt,
    productLink: `${process.env.CLIENT_URL}/products/${product._id}`,
    supportEmail: process.env.SUPPORT_EMAIL || 'support@yourapp.com'
  });

  await transporter.sendMail({
    from: `StockFlow Alerts <${process.env.EMAIL_FROM || 'alerts@stockflow.com'}>`,
    to: recipients.map(u => u.email).join(', '),
    subject: `Low Stock Alert: ${product.name}`,
    html
  });
};