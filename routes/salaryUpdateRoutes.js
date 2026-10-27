const express = require("express");

const router = express.Router();

const {
    updateEmployeeSalary,
    getEmployeeSalary
} = require("../controllers/salaryUpdateController");


// ==========================================
// GET EMPLOYEE SALARY
// ==========================================

router.get(
    "/employee/:employeeId",
    getEmployeeSalary
);


// ==========================================
// UPDATE EMPLOYEE SALARY
// ==========================================

router.post(
    "/employee/:employeeId",
    (req, res, next) => {

        req.body.employeeId = req.params.employeeId;

        next();

    },
    updateEmployeeSalary
);


module.exports = router;