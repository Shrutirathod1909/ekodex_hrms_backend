const express = require("express");

const router = express.Router();

const {
  getBankTrfSheet,
} = require("../controllers/bank_trf_sheet_controller");

// ================= BANK TRF SHEET =================
router.post(
  "/bank-trf-sheet",
  getBankTrfSheet
);

module.exports = router;