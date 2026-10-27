// ==========================================
// routes/order.routes.js
// ==========================================

const express = require("express");

const router = express.Router();

const orderController = require(
  "../controllers/order.controller"
);

// ==========================================
// GET ACTIVE PRODUCTS
// ==========================================

router.get(
  "/products",
  orderController.getActiveProducts
);

// ==========================================
// GET ACTIVE SUPPLIERS
// ==========================================

router.get(
  "/suppliers",
  orderController.getActiveSuppliers
);
router.post( "/pending", orderController.getPendingOrders );
router.get(
  "/product-wise-report",
  orderController.getProductWisePOReport
);
// GET ALL DATA
router.post("/uniform-sale", orderController.getUniformSaleReport);
// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;