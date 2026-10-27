const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const holidayMasterController = require("../controllers/holidayMasterController");

// ============================================================
// COMPANY
// ============================================================

router.get(
  "/companies",
  authMiddleware,
  holidayMasterController.getCompanies
);

// ============================================================
// CLIENT
// ============================================================

router.get(
  "/clients/:companyId",
  authMiddleware,
  holidayMasterController.getClientsByCompany
);

// ============================================================
// SITE
// ============================================================

router.get(
  "/sites/:clientId",
  authMiddleware,
  holidayMasterController.getSitesByClient
);

// ============================================================
// HOLIDAY MASTER
// ============================================================

router.get(
  "/holidays",
  authMiddleware,
  holidayMasterController.getHolidays
);

router.get(
  "/holidays/:id",
  authMiddleware,
  holidayMasterController.getHolidayById
);

router.post(
  "/holidays",
  authMiddleware,
  holidayMasterController.createHoliday
);

router.put(
  "/holidays/:id",
  authMiddleware,
  holidayMasterController.updateHoliday
);

router.delete(
  "/holidays/:id",
  authMiddleware,
  holidayMasterController.deleteHoliday
);

module.exports = router;

// const express = require("express");

// const router = express.Router();

// const holidayMasterController = require("../controllers/holidayMasterController");

// // ============================================================
// // COMPANY & BRANCH
// // ============================================================

// // Get all active companies
// router.get("/companies", holidayMasterController.getCompanies);

// // Get active branches by company
// router.get(
//   "/branches/:companyId",
//   holidayMasterController.getBranchesByCompany,
// );

// // ============================================================
// // HOLIDAY MASTER
// // ============================================================

// // Get holidays
// // Optional query parameters:
// // ?financial_year=2026-27
// // ?company_id=22
// // ?branch_id=2
// // ?active=0
// router.get("/holidays", holidayMasterController.getHolidays);

// // Get holiday by ID
// router.get("/holidays/:id", holidayMasterController.getHolidayById);

// // Create holiday
// router.post("/holidays", holidayMasterController.createHoliday);

// // Update holiday
// router.put("/holidays/:id", holidayMasterController.updateHoliday);

// // Delete / deactivate holiday
// router.delete("/holidays/:id", holidayMasterController.deleteHoliday);

// module.exports = router;


// const express = require("express");
// const router = express.Router();
// const authMiddleware = require("../middleware/authMiddleware");
// const holidayMasterController = require("../controllers/holidayMasterController");


// router.get(
//   "/clients",
//   authMiddleware,
//   holidayMasterController.getClients
// );

// router.get(
//   "/sites/:clientId",
//   authMiddleware,
//   holidayMasterController.getSitesByClient
// );

// router.get(
//   "/holidays",
//   authMiddleware,
//   holidayMasterController.getHolidays
// );

// router.get(
//   "/holidays/:id",
//   authMiddleware,
//   holidayMasterController.getHolidayById
// );

// router.post(
//   "/holidays",
//   authMiddleware,
//   holidayMasterController.createHoliday
// );

// router.put(
//   "/holidays/:id",
//   authMiddleware,
//   holidayMasterController.updateHoliday
// );

// router.delete(
//   "/holidays/:id",
//   authMiddleware,
//   holidayMasterController.deleteHoliday
// );

