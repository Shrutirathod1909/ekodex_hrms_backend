const express = require("express");
const router = express.Router();
const employeeLeaveController = require("../controllers/employeeLeaveController");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/addEmployeeLeave", authMiddleware, employeeLeaveController.addEmployeeLeave);
router.post("/updateEmployeeLeave/:id", authMiddleware, employeeLeaveController.updateEmployeeLeave);
router.post("/approveLeave", authMiddleware, employeeLeaveController.approveLeave);
router.post("/rejectLeave", authMiddleware, employeeLeaveController.rejectLeave);
router.get("/getEmployeeLeaveBalance", authMiddleware, employeeLeaveController.getEmployeeLeaveBalance);
router.post("/getEmployeeLeaves", authMiddleware, employeeLeaveController.getEmployeeLeaves);
router.get("/getEmployeeLeaves", authMiddleware, employeeLeaveController.getEmployeeLeaves);
router.post("/getAdminAllEmployeeLeaves", authMiddleware, employeeLeaveController.getAdminAllEmployeeLeaves);
router.get("/getAdminAllEmployeeLeaves", authMiddleware, employeeLeaveController.getAdminAllEmployeeLeaves);
router.get("/:id", authMiddleware, employeeLeaveController.getLeaveById);
router.post("/:id", authMiddleware, employeeLeaveController.deleteLeave);

module.exports = router;
