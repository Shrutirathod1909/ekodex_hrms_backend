const multer = require("multer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();
const logger = require("../utils/logger");

// upload to frontend folder code -------------------

let frontendPath = "";
try {
  const uploadPath = path.join(__dirname, "api");

  // Split the path into an array of segments
  const segments = uploadPath.split(path.sep);

  const index = segments.indexOf(`${process.env.BACKEND_FOLDER}`);

  if (index !== -1) {
    // Before 'backend' (everything up to but not including 'backend')
    const beforeBackend = segments.slice(0, index).join(path.sep);
    // frontendPath = beforeBackend + `/${process.env.FRONTEND_FOLDER}/api/`;
    frontendPath = `${process.env.FRONTEND_FOLDER}/api/`;
    // 'backend' and everything after it
    const afterBackend = segments.slice(index).join(path.sep);

    logger.log("Before:", beforeBackend);
    logger.log("After:", afterBackend);
    console.log(frontendPath);
  }
} catch (error) {
  logger.log("Error:", error);
}

// ======================================================
// STORAGE
// ======================================================
const storage = multer.diskStorage({
  // ================= DESTINATION =================
  destination: function (req, file, cb) {
    let dest = `${process.env.FRONTEND_FOLDER}/api/`;
    let dest1 = `${process.env.FRONTEND_FOLDER}/api/`;

    // Fixed the loose 'if' statements into a continuous chain to eliminate routing bugs
    if (
      file.fieldname.includes("kycDocuments") ||
      file.fieldname === "cancelledChequeFile"
    ) {
      dest = dest1+`emp_docs/`;
    } else if (file.fieldname === "vendor") {
      dest = dest1+`vendor/`;
    } else if (file.fieldname === "excelFile") {
      dest = dest1+`excels/`;
    } else if (file.fieldname === "logo") {
      dest = dest1+`company_logos/`;
    } else if (file.fieldname === "c_attachement") {
      dest = dest1+`client_contracts/`;
    } else if (file.fieldname.includes("holiday_image")) {
      dest = dest1+`holidays/`;
    } else if (file.fieldname === "profileImage" || file.fieldname === "employee_logo") {
      dest = dest1+`profilephoto/`;
    } else if (file.fieldname === "product-img") {
      dest = dest1+`uploads/`;
    } else if (file.fieldname === "supplierlogo") {
      dest = dest1+`vendor/`;
    } else if (
      file.fieldname === "photo" ||
      file.fieldname === "aadhar_card" ||
      file.fieldname === "bank_detail" ||
      file.fieldname === "resume" ||
      file.fieldname === "pan_card"
    ) {
      dest = `${process.env.FRONTEND_FOLDER}/api/` + "emp_docs/";
    }

    // Double-check just in case a unique edge case path falls through
    fs.mkdirSync(dest, { recursive: true });

    cb(null, dest);
  },

  // ================= FILE NAME =================
  filename: function (req, file, cb) {
    try {
      const ext = path.extname(file.originalname);

      // Clean original name (keeps alphanumeric and underscores)
      const cleanOriginalName = path
        .basename(file.originalname, ext)
        .replace(/[^a-zA-Z0-9]/g, "_")
        .toLowerCase();

      // Handle Company Logo custom naming
      if (file.fieldname === "logo") {
        const companyId = req.params.id || req.body.id || "new";
        const fileName = `logo_${companyId}_${Date.now()}${ext}`;
        return cb(null, fileName);
      } else if (file.fieldname === "profileImage") {
        const userId = req.params.id || req.body.id || "new";
        const roleStr = req.body.role ? req.body.role.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase() : "user";
        const fileName = `${roleStr}_${userId}_${Date.now()}${ext}`;
        return cb(null, fileName);
      } else if (file.fieldname === "c_attachement") {
        // Name: contract_<clientId>_<companyName>_<timestamp>.ext
        const clientId = req.params.id || req.params.clientId || req.body.id || "new";
        const companyName = (req.body.companyName || req.body.company_name || "client")
          .replace(/[^a-zA-Z0-9]/g, "_")
          .toLowerCase()
          .substring(0, 30);
        const fileName = `contract_${clientId}_${companyName}_${Date.now()}${ext}`;
        return cb(null, fileName);
      } else if (file.fieldname.includes("holiday_image")) {
        const stateStr = (req.body.state || "state")
          .replace(/[^a-zA-Z0-9]/g, "_")
          .toUpperCase()
          .substring(0, 30);
        const rankStr = (req.body.rank || "rank")
          .replace(/[^a-zA-Z0-9]/g, "_")
          .toUpperCase()
          .substring(0, 30);
        const fileName = `${rankStr}_${stateStr}_${Date.now()}${ext}`;
        return cb(null, fileName);
      }

      // Default fallback naming convention for all other files
      const fileName = `${Date.now()}_${cleanOriginalName}${ext}`;
      cb(null, fileName);
    } catch (err) {
      cb(err);
    }
  },
});

// ======================================================
// FILE FILTER & LIMITS
// ======================================================
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/pdf",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/csv",
      "text/plain",
    ];

    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExt = [
      ".jpeg",
      ".jpg",
      ".png",
      ".webp",
      ".pdf",
      ".xls",
      ".xlsx",
      ".csv",
      ".doc",
      ".docx",
      ".txt",
    ];

    if (allowedExt.includes(ext)) {
      return cb(null, true);
    }
    console.error("REJECTED FILE:", file.originalname, "MIMETYPE:", file.mimetype, "EXT:", ext);
    cb(new Error(`Only JPG, PNG, WEBP, PDF, XLS, XLSX, DOC, DOCX files are allowed. Received: ${ext}`));
  },
});

module.exports = upload;
