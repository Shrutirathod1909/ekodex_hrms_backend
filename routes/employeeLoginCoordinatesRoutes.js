const express = require("express");
const router = express.Router();

const controller = require("../controllers/employeeLoginCoordinatesController");
const authMiddleware = require("../middleware/authMiddleware");

router.get("/:emp_code", controller.getByEmpCode);
router.post("/", authMiddleware, controller.create);
router.put("/:id",authMiddleware, controller.update);
router.delete("/:id",authMiddleware, controller.remove);

module.exports = router;