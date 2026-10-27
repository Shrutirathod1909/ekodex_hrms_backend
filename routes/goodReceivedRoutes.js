// routes/goodReceivedRoutes.js
const express = require("express");
const router = express.Router();

const {
  insertGoodReceived,
  getAllGoodReceived,
  getByPONo,
  getStockBySku
} = require("../controllers/goodReceivedController");
const authMiddleware = require("../middleware/authMiddleware");

// INSERT GOOD RECEIVED
router.post("/insert",authMiddleware, insertGoodReceived);
router.get("/all", getAllGoodReceived);
router.get("/stock/:sku_code", getStockBySku);

// GET BY PO NUMBER
router.get("/po/:po_no", getByPONo);
module.exports = router;