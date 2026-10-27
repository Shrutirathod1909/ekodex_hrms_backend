const express = require("express");
const router = express.Router();

const attendanceInvoiceController = require("../controllers/attendanceInvoiceController");
const authMiddleware = require("../middleware/authMiddleware");

router.post(
  "/create-invoice",
  authMiddleware,
  attendanceInvoiceController.createInvoice,
);

module.exports = router;
