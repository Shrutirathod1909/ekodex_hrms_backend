const express = require("express");

const router = express.Router();


const {
    getAttendanceOTReport
} = require("../controllers/attendanceReportController");



// =====================================
// DOWNLOAD ATTENDANCE OT EXCEL REPORT
// =====================================

router.post(
    "/attendance-ot-report",
    getAttendanceOTReport
);



module.exports = router;