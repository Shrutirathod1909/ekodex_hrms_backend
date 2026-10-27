const express = require("express");
const router = express.Router();

const employeeController = require("../controllers/employeeController");
const authMiddleware = require("../middleware/authMiddleware");

const multer = require("multer");
const upload = require("../middleware/upload");
const { poolPromise, sql } = require("../config/db");

// =========================
// MEMORY UPLOAD (EXCEL ONLY)
// =========================
const memoryUpload = multer({
  storage: multer.memoryStorage(),
});

// =========================
// AUTH MIDDLEWARE
// =========================
router.use(authMiddleware);

// =========================
// BULK UPLOADS
// =========================
router.post(
  "/bulk-upload",
  memoryUpload.single("file"),
  employeeController.uploadEmployee,
);

router.post(
  "/bulk-update-doc",
  memoryUpload.single("file"),
  employeeController.uploadEmployeeBasic,
);
router.get(
  "/uploaderrortemplate/download",
  authMiddleware,
  employeeController.downloadUploadErrorTemplate
);
router.post("/verify-bulk-upload", employeeController.verifyEmployeeData);
router.post("/verify-bulk-update2", employeeController.verifyEmployeeData2);

// =========================
// DOCUMENT UPLOAD (IMPORTANT - KEEP BEFORE :id ROUTES)
// =========================
router.post(
  "/upload-documents",
  upload.fields([
    { name: "kycDocuments", maxCount: 50 },
    { name: "cancelledChequeFile", maxCount: 1 },
    { name: "excelFile", maxCount: 1 },
    { name: "employee_logo", maxCount: 1 },
  ]),
  employeeController.uploadEmployeeDocument,
);
router.delete(
  "/document/:id",
  authMiddleware,
  employeeController.deleteEmployeeDocument,
);
router.put(
  "/upload-documents",
  upload.fields([
    { name: "kycDocuments", maxCount: 50 },
    { name: "cancelledChequeFile", maxCount: 1 },
    { name: "excelFile", maxCount: 1 },
    { name: "employee_logo", maxCount: 1 },
  ]),
  employeeController.updateEmployeeDocuments,
);

router.post("/nominee", employeeController.createEmployeeNominee);

router.put(
  "/nominee/:id",
  authMiddleware,
  employeeController.updateEmployeeNominee,
);

// ======================================

// DELETE NOMINEE
// ======================================

router.delete(
  "/nominee/:id",
  authMiddleware,
  employeeController.deleteEmployeeNominee,
);
router.post("/experience", employeeController.createEmployeeExperience);
router.delete("/experience/:id", employeeController.deleteEmployeeExperience);

// =========================
// EMPLOYEE BASIC ROUTES
// =========================
router.get("/next-code", employeeController.getNextEmployeeCode);

router.get("/export", employeeController.exportEmployeesToExcel);

router.get(
  "/download-template",
  employeeController.downloadEmployeeUploadTemplate,
);

// router.get("/uploaderrortemplate/download", employeeController.downloadEmployeeUploadErrorTemplate);

router.get(
  "/updatetemplate/download",
  employeeController.downloadEmployeeExcel,
);
router.get(
  "/uploaderrortemplate/download",
  authMiddleware,
  employeeController.downloadUploadErrorTemplate
);

// router.get("/updateerrortemplate/download", employeeController.downloadEmployeeUpdateErrorTemplate);

// router.get("/disabled", employeeController.getDisabledEmployees);

// =========================
// CREATE / UPDATE EMPLOYEE
// =========================
router.post(
  "/",
  upload.fields([
    { name: "kycDocuments", maxCount: 50 },
    { name: "cancelledChequeFile", maxCount: 1 },
    { name: "excelFile", maxCount: 1 },
    { name: "employee_logo", maxCount: 1 },
  ]),
  employeeController.createEmployee,
);

router.put(
  "/update/:id",
  upload.fields([
    { name: "kycDocuments", maxCount: 50 },
    { name: "cancelledChequeFile", maxCount: 1 },
    { name: "excelFile", maxCount: 1 },
    { name: "employee_logo", maxCount: 1 },
  ]),
  employeeController.updateEmployee,
);

// =========================
// STATIC ROUTES (MUST COME BEFORE :id)
// =========================
router.get("/documents/:id", employeeController.getEmployeeDocuments);

router.put("/:id/status", employeeController.updateEmployeeStatus);

router.put("/:id/salary", employeeController.updateEmployeeSalary);

// router.put(
//   "/offer-status-manualy/1234",
//   authMiddleware,
//   employeeController.updateOfferStatus,
// );

router.put(
  "/offer-status/:id",
  authMiddleware,
  employeeController.updateOfferStatus,
);

router.put("/verify/:id", employeeController.verifyEmployee);

router.post(
  "/:id/generate-offer-letter",
  employeeController.generateOfferLetterOld,
);
router.get("/dropdown", employeeController.getEmployeesDropdown);
router.post("/:id/generate-id-card", employeeController.generateIdCard);

// router.post(
//   "/check-email",
//   authMiddleware,
//   employeeController.verifyEmployeeData,
// );

router.put("/restore/:id", employeeController.restoreEmployee);

// - 13/6/26 - update
router.get("/view/:id", employeeController.getEmployeeView);

// =========================
// DYNAMIC ROUTES (KEEP ALWAYS LAST)
// =========================
router.get("/:id", employeeController.getEmployeeById);

router.delete("/:id", employeeController.deleteEmployee);

router.get("/", employeeController.getAllEmployees);

module.exports = router;
