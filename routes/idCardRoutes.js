const express = require("express");
const router = express.Router();

const {
  getAllIdCards,
  getIdCardByCode,
  downloadIdCard
} = require("../controllers/idCardController");

// ALL ID CARDS
router.get("/id-cards", getAllIdCards);

// SINGLE ID CARD
router.get("/id-cards/:emp_code", getIdCardByCode);

// DOWNLOAD PDF
router.get("/id-cards/:emp_code/download", downloadIdCard);

module.exports = router;