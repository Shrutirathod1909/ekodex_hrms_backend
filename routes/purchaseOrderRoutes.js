const express = require("express");
const router = express.Router();
const {
  getPurchaseOrders,
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  getPurchaseOrdersBySupplier,
  getPurchaseOrderProducts,
  getCompanies,
  updatePurchaseOrderStatus,
  getBranchesByCompany,
} = require("../controllers/purchaseOrderController");

const {
  bulkUploadPurchaseOrders,
} = require("../controllers/purchaseOrderBulkController");

const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");
// Base API endpoints path matching: /api/purchase-orders
router.get("/", authMiddleware, getPurchaseOrders);
router.post("/create-batch", authMiddleware, createPurchaseOrder);
router.post("/update/:id", authMiddleware, updatePurchaseOrder);
// Soft Delete
router.post("/delete/:id", authMiddleware, deletePurchaseOrder);
router.post("/status/:id", authMiddleware, updatePurchaseOrderStatus);
router.get("/companies", authMiddleware, getCompanies);
router.get("/branches", authMiddleware, getBranchesByCompany);
router.get("/by-supplier", authMiddleware, getPurchaseOrdersBySupplier);
router.get("/:orderId/products", authMiddleware, getPurchaseOrderProducts);
router.post(
  "/bulk-upload",
  upload.single("productOrderExcel"),
  authMiddleware,
  bulkUploadPurchaseOrders,
);
module.exports = router;
