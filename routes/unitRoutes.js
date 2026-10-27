const express = require("express");
const router = express.Router();
const controller = require("../controllers/uomController");
const authMiddleware = require("../middleware/authMiddleware");

router.get("/", authMiddleware, controller.getUnits);

module.exports = router;
