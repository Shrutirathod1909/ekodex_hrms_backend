const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload");
// const multer = require("multer");
const path = require("path");
const supplierController = require("../controllers/suppliercontroller");

const authMiddleware = require("../middleware/authMiddleware");

// ================= MULTER STORAGE =================
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, "uploads/suppliers/");
//   },

//   filename: (req, file, cb) => {
//     const uniqueName =
//       Date.now() + path.extname(file.originalname);

//     cb(null, uniqueName);
//   },
// });

// const upload = multer({ storage });

// ================= GET =================
router.get("/", authMiddleware, supplierController.getSuppliers);

router.get(
  "/dropdown",
  authMiddleware,
  supplierController.getSupplierForDropdown,
);

router.get("/search", authMiddleware, supplierController.searchSupplier);

// ================= CREATE =================
router.post(
  "/create",
  authMiddleware,
  upload.single("supplierlogo"),
  supplierController.createSupplier,
);

// ================= BULK CREATE =================
router.post(
  "/bulk-create",
  authMiddleware,
  supplierController.bulkCreateSuppliers,
);

// ================= UPDATE =================
router.post(
  "/update/:id",
  authMiddleware,
  upload.single("supplierlogo"),
  supplierController.updateSupplier,
);

// ================= DELETE =================
router.post("/delete/:id", authMiddleware, supplierController.deleteSupplier);
router.post("/restore/:id", authMiddleware, supplierController.restoreSupplier);

module.exports = router;
