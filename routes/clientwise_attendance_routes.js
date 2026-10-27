const express = require("express");

const router = express.Router();

const clientwiseAttendanceController =
    require("../controllers/clientwise_attendance_controller");


// =========================================================
// GET CLIENT LIST
// =========================================================

router.get(
    "/clients",
    clientwiseAttendanceController.getClients
);


// =========================================================
// GET CLIENTWISE ATTENDANCE
// =========================================================

router.get(
    "/",
    clientwiseAttendanceController.getClientwiseAttendance
);


module.exports = router;