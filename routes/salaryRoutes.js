const express = require("express");

const router = express.Router();

const salaryController = require("../controllers/salaryController");

const authMiddleware = require("../middleware/authMiddleware");

// =====================================================
// SITE WISE SALARY
// =====================================================

router.get("/site-wise", salaryController.getSiteWiseSalary);

// =====================================================
// SITE EMPLOYEE SALARY
// =====================================================

router.get("/site-employees", salaryController.getSiteSalaryEmployees);

router.get("/employee-wise", salaryController.getEmployeeWiseSalary);
// Generate salary
router.post("/generate", authMiddleware, salaryController.generateSalary);

router.get("/print-by-employee", salaryController.getPrintSalaryByEmployee);

module.exports = router;
