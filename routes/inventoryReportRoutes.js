// ======================================================
// routes/inventoryReportRoutes.js
// ======================================================

const express = require("express");

const router = express.Router();

const {

  exportInventoryCSV,

  exportInventoryJSON

} = require(
  "../controllers/inventoryReportController"
);

// CSV
router.get(
  "/export-csv",
  exportInventoryCSV
);

// JSON
router.get(
  "/export-json",
  exportInventoryJSON
);

module.exports = router;