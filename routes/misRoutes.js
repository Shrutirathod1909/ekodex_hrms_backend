const express = require("express");
const router = express.Router();
const misController = require("../controllers/misController");

router.post("/mis-report", misController.misReport);

module.exports = router;