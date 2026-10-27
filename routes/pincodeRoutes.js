const express = require("express");
const router = express.Router();

const {
  getAllPincodes,
  searchPincodeController,
} = require("../controllers/pincodeController");

router.get("/pincodes", getAllPincodes);
router.get("/pincodes-dropdown/search", searchPincodeController);

module.exports = router;
