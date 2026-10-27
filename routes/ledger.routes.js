const express = require("express");
const router = express.Router();

const ledgerController = require("../controllers/ledger.controller");

// GET LEDGER DATA
router.get("/ledger", ledgerController.getLedger);

module.exports = router;