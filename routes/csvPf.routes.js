const express = require("express");
const router = express.Router();

const CsvPfController = require("../controllers/csvPf.controller");

router.get("/pf-csv", CsvPfController.getPfCsvData);

module.exports = router;