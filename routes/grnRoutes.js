const express = require("express");
const router = express.Router();

const grnController = require("../controllers/grnController");

// GET BY INVOICE NO
router.get("/:invoice_no", grnController.getGRNByInvoiceNo);

module.exports = router;