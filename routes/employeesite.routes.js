const express = require("express");

const router = express.Router();

const employeeSiteController = require("../controllers/employeesite.controller");
const authMiddleware = require("../middleware/authMiddleware");
const multer = require("multer");
const upload = require("../middleware/upload");

// =========================
// MEMORY UPLOAD (EXCEL ONLY)
// =========================
const memoryUpload = multer({
  storage: multer.memoryStorage(),
});

router.post(
  "/site-bulk-upload",
  authMiddleware,
  upload.single("file"),
  employeeSiteController.bulkUpload
);

router.post(
  "/verify-site-bulk-upload",
  employeeSiteController.verifyBulkUpload,
);

router.get(
  "/site-update-template",
  authMiddleware,
  employeeSiteController.downloadTemplate,
);

router.get(
  "/site-update-error/download",
  employeeSiteController.downloadErrorFile,
);

module.exports = router;
