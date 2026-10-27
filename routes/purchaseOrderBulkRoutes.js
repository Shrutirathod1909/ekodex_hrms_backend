const express = require("express");
const multer = require("multer");

const {
  bulkUploadPurchaseOrders,
} = require("../controllers/purchaseOrderBulkController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// =========================
// MULTER STORAGE
// =========================

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, "uploads/");
//   },

//   filename: (req, file, cb) => {
//     cb(
//       null,
//       `${Date.now()}-${file.originalname}`
//     );
//   },
// });

// const upload = multer({ storage });

// =========================
// ROUTE
// =========================

router.post(
  "/bulk-upload",
  upload.single("file"),
  authMiddleware,
  bulkUploadPurchaseOrders,
);

module.exports = router;
