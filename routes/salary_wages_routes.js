const express = require("express");

const router = express.Router();

const salaryWagesController = require(
  "../controllers/salary_wages_controller"
);


// ================= SALARY WAGES SHEET =================

router.post(
  "/salary-wages-sheet",
  salaryWagesController.getSalaryWagesSheet
);

module.exports = router;