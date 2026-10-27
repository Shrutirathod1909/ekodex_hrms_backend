const express = require("express");

const router = express.Router();

const controller = require("../controllers/productController");
const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

// ================= CREATE PRODUCT =================
router.post(
  "/create",
  authMiddleware,
  upload.array("product-img", 10),
  controller.createProduct,
);

// ================= GET PRODUCTS =================
router.get("/", authMiddleware, controller.getProducts);
router.get("/supplier/:supplier_name", controller.getProductsBySupplier);
// ================= UPDATE PRODUCT =================
router.post(
  "/update/:id",
  authMiddleware,
  upload.array("product-img", 10),
  controller.updateProduct,
);

router.post("/restore/:id", authMiddleware, controller.restoreProduct); // 🌟 ADDED FOR RESTORE

// ================= DELETE PRODUCT =================
router.post("/delete/:id", authMiddleware, controller.deleteProduct);

// Add this route near your other POST handlers
router.post("/bulk-upload", authMiddleware, controller.bulkUploadProducts);

// ================= DELETE IMAGE =================
router.delete(
  "/delete-image/:image_id",
  authMiddleware,
  controller.deleteImage,
);

module.exports = router;
