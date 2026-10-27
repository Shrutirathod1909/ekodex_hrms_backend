const express = require("express");
const router = express.Router();
const controller = require("../controllers/hsnController");
const authMiddleware = require("../middleware/authMiddleware");

router.get("/", authMiddleware, controller.getHsnCodes);

module.exports = router;
