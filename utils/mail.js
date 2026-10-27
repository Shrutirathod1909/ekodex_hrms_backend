const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendResetEmail = async (email, link) => {
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Password Reset Request",
    html: `
      <h2>Password Reset</h2>
      <p>Click below link to reset password:</p>
      <a href="${link}" target="_blank">
        Reset Password
      </a>
      <p>This link will expire in 15 minutes.</p>
    `
  });
};

module.exports = { sendResetEmail };