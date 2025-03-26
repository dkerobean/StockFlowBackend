const nodemailer = require('nodemailer');

async function sendEmailNotification(product, recipients) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  recipients.forEach(async (user) => {
    await transporter.sendMail({
      from: 'inventory@yourdomain.com',
      to: user.email,
      subject: `Low Stock Alert: ${product.name}`,
      html: `
        <p>Product: ${product.name}</p>
        <p>Current Stock: ${product.quantity}</p>
        <p>Threshold: ${product.notifyAt}</p>
        <a href="${process.env.CLIENT_URL}/products/${product._id}">View Product</a>
      `
    });
  });
}