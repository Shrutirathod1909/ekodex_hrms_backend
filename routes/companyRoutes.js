// routes/companyRoutes.js

const express = require("express");
const router = express.Router();

const companyController = require("../controllers/companyController");

const authMiddleware = require("../middleware/authMiddleware");

const upload = require("../middleware/upload");

// ======================================================
// COMPANY ROUTES
// ======================================================

// GET ALL COMPANIES
router.get("/", authMiddleware,companyController.getCompanies);

// CREATE COMPANY
router.post(
  "/",
  authMiddleware,
  upload.single("logo"),
  companyController.createCompany,
);

router.get("/all", authMiddleware,companyController.getAllCompanies);
router.get("/allotted", authMiddleware, companyController.getAllottedCompanies);

router.get("/branches/:client_id", companyController.getAllBranches);

// UPDATE COMPANY
router.post(
  "/update/:id",
  authMiddleware,
  upload.single("logo"),
  companyController.updateCompany,
);

// DELETE COMPANY
router.delete("/:id", authMiddleware, companyController.deleteCompany);
router.put("/restore/:id", authMiddleware, companyController.restoreCompany);

// EXPORT EXCEL

// ======================================================
// BANK DETAILS ROUTES
// ======================================================

// ADD BANK DETAILS
router.post(
  "/:id/bank-details",
  authMiddleware,
  companyController.addBankDetails,
);

// GET COMPANY BANK DETAILS
router.get(
  "/:id/bank-details",
  authMiddleware,
  companyController.getCompanyBankDetails,
);

router.get("/export", authMiddleware, companyController.exportCompanies);

module.exports = router;
