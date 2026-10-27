const express = require("express");
const router = express.Router();

const esicController = require("../controllers/esic.controller");

// ================= ESIC DATA API =================
router.get("/get_esic_data", esicController.get_esic_data);

module.exports = router;