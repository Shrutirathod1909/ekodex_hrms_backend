const express = require("express");

const router = express.Router();

const {
  getBillingFormat,
} = require("../controllers/billingController");

router.get("/billing-format", getBillingFormat);

module.exports = router;