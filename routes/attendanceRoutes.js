const express = require("express");
const router = express.Router();

const attendanceController = require("../controllers/attendanceController");
const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");
// Main attendance listing route (Handles GET listing/resets and POST searching)
router
  .route("/")
  .get(authMiddleware, attendanceController.index)
  .post(authMiddleware, attendanceController.index);

router.get(
  "/search-keyword",
  authMiddleware,
  attendanceController.getSearchKeyword,
);

router.get("/print-sheet", attendanceController.getPrintSheetData);

router.get("/print-time-sheet", attendanceController.getPrintwithtimeSheetData);
// 1. Endpoint serving searchable React-Select options data matrix inside the popup modal
router.get("/employees", attendanceController.getEmployeesDirectory);

// 2. Endpoint handling Add Attendance form post submissions parameters data blocks
router.post("/add", authMiddleware, attendanceController.addNewAttendanceEntry);

router.get(
  "/download-template",
  authMiddleware,
  attendanceController.downloadTemplate,
);

router.post(
  "/add-attendance",
  authMiddleware,
  (req, res, next) => {
    console.log("🔥 AUTH COMPLETED - CONTROLLER STARTING");
    console.log("BODY:", req.body);

    next();
  },
  attendanceController.addAttendance,
);
// NEW
// router.post(
//   "/bulk-upload",
//   authMiddleware,
//   upload.single("excelFile"),
//   attendanceController.uploadAttendance,
// );
router.post(
  "/bulk-upload",
  authMiddleware,
  upload.single("excelFile"),

  (req, res, next) => {
    console.log("BULK UPLOAD FILE:", req.file ? req.file.path : "NO FILE");
    next();
  },

  attendanceController.uploadAttendance,
);

router.post(
  "/verify-data",
  authMiddleware,
  attendanceController.verifyAttendanceData,
);

router.delete("/remove", authMiddleware, attendanceController.removeAttendance);

router.get(
  "/get-attendance-by-date",
  authMiddleware,
  attendanceController.getAttendanceByDate,
);

router.post(
  "/getAttendanceReportForDuplicates",
  authMiddleware,
  attendanceController.getAttendanceReportForDuplicates,
);
router.post(
  "/attendance-report",
  authMiddleware,
  attendanceController.getAttendanceReport,
);
router.post(
  "/updateAttendance/:attendanceId",
  authMiddleware,
  attendanceController.updateAttendance,
);
router.post(
  "/download-site-attendance",
  authMiddleware,
  attendanceController.getSiteWiseAttendance,
);

module.exports = router;
