const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const documentVerificationController = require("../controllers/documentVerificationController");

const router = express.Router();

router.use(authMiddleware);

router.get(
  "/employee/:employeeId/documents",
  documentVerificationController.getEmployeeDocuments,
);
router.post(
  "/:documentId/pan",
  documentVerificationController.verifyPan,
);
router.post(
  "/:documentId/voter-id",
  documentVerificationController.verifyVoterId,
);
router.post(
  "/:documentId/driving-license",
  documentVerificationController.verifyDrivingLicense,
);
router.post(
  "/:documentId/aadhaar",
  documentVerificationController.startAadhaarVerification,
);
router.get(
  "/:documentId/aadhaar/:sessionId/status",
  documentVerificationController.checkAadhaarVerification,
);

module.exports = router;