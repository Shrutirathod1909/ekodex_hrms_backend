const express = require("express");
const VoucherController = require("../controllers/vouchercontroller");
const logger = require("../utils/logger");
const upload = require("../middleware/upload");
const router = express.Router();
logger.log("Voucher Routes Loaded");
router.get("/utr-template", VoucherController.downloadUTRTemplate);
// UTR BULK UPLOAD
router.post(
  "/upload-utr",
  upload.single("file"),
  VoucherController.uploadUTRFile,
);
// GET EMPLOYEES
router.post("/employees", VoucherController.getEmployees);
router.get("/download-employees", VoucherController.exportEmployees);
router.post(
  "/bulk-upload-emp-advance",
  upload.single("file"),
  VoucherController.bulkUploadEmpAdvance,
);
router.post("/getAllCompanies", VoucherController.getCompanies);
router.post("/getAllBranches", VoucherController.getBranches);
// GET ALL CHARGES TYPE
router.get("/charges-type", VoucherController.getAllChargesType);
router.post("/create", VoucherController.createVoucher);
router.post("/update-voucher/:id", VoucherController.updateVoucher);
router.get("/getAllVouchers", VoucherController.getAllVouchers);
router.get("/:id", VoucherController.getVoucher);
router.post("/delete/:id", VoucherController.deleteVoucher);
// REJECT VOUCHER
router.post("/reject/:id", VoucherController.rejectVoucherController);
router.post("/approve/:id", VoucherController.approveVoucher);
// ================= DOWNLOAD TEMPLATE =================
module.exports = router;
