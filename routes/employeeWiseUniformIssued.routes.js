const express = require("express");
const router = express.Router();

const controller = require("../controllers/employeeWiseUniformIssued.controller");

router.get("/employees", controller.getEmployeeList);
router.get("/uniform-all-data", controller.getAllUniformData);

module.exports = router;