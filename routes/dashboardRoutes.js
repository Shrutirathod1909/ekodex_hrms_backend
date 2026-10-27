const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const dashboardController = require("../controllers/dashboardController");
console.log("Dashboard Routes Loaded");
/* GET DASHBOARD DATA */
router.get(
    "/employee-doc-dashboard",authMiddleware,
    dashboardController.getEmployeeDocumentDashboard
);
router.get(
    "/client-sites",authMiddleware,
    dashboardController.getClientSites
);
router.get(
  "/site-wise-attendance",authMiddleware,
  dashboardController.getSiteWiseAttendance
);
router.post(
  "/getAttendanceReport",
  authMiddleware,
  dashboardController.getAttendanceReport
);
router.get(
 "/employee-doc-summary",authMiddleware,
 dashboardController.getEmployeeDocumentSummary
);
router.get(
  "/",authMiddleware,
  dashboardController.getAllClients
);
router.get(
 "/employee-stage-dashboard",authMiddleware,
 dashboardController.getEmployeeStageDashboard
);

module.exports = router;