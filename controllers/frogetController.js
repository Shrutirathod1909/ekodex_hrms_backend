const crypto = require("crypto");
const md5 = require("md5");
const { sendResetEmail } = require("../utils/mail");
const {
  findUserByEmail,
  saveResetToken,
  findUserByToken,
  updatePassword
} = require("../models/frogetmodel");

// -----------------------------
// FORGOT PASSWORD
// -----------------------------
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Email not found"
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    // const expiry = new Date(Date.now() + 15 * 60 * 1000);
    const expiry = new Date(Date.now() + 8 * 60 * 60 * 1000);

    await saveResetToken(email, token, expiry);

    const resetLink =
      `https://hrms.odspspl.com/reset-password/${token}`;

    // 🔥 REAL EMAIL SEND HERE
    await sendResetEmail(email, resetLink);

    res.json({
      success: true,
      message: "Reset link sent to email"
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// -----------------------------
// RESET PASSWORD
// -----------------------------
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match"
      });
    }

    const user = await findUserByToken(token);

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired link"
      });
    }

    const hashed = md5(newPassword);

    await updatePassword(user.id, hashed);

    res.json({
      success: true,
      message: "Password updated successfully"
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

module.exports = {
  forgotPassword,
  resetPassword
};