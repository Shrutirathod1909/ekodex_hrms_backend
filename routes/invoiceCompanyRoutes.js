const express = require("express");

const router = express.Router();

const invoiceCompanyController = require(
  "../controllers/invoiceCompanyController"
);

// COMPANY API
router.get(
  "/",
  invoiceCompanyController.getCompanyByName
);

// SUPPLIER API
router.get(
  "/supplier/:supplier_name",
  invoiceCompanyController.getSupplierByName
);

module.exports = router;