
// ===============================
// routes/single_pay_silp_routes.js
// ===============================

const express =
  require("express");

const multer =
  require("multer");

const path =
  require("path");

const fs =
  require("fs");

const router =
  express.Router();

const {
  getSinglePaySlip,
} = require(
  "../controllers/single_pay_silp_controller"
);

const {
  uploadSalarySlip,
  getSalarySlip,
} = require(
  "../controllers/salarySlipUploadController"
);

// =======================================
// CREATE FOLDER
// =======================================

const uploadPath =
  path.join(
    __dirname,
    "../uploads/salary_slip"
  );

if (
  !fs.existsSync(uploadPath)
) {

  fs.mkdirSync(
    uploadPath,
    { recursive: true }
  );
}

// =======================================
// MULTER STORAGE
// =======================================

const storage =
  multer.diskStorage({

    destination: (
      req,
      file,
      cb
    ) => {

      cb(
        null,
        uploadPath
      );
    },

    filename: (
      req,
      file,
      cb
    ) => {

      const fileName =
        Date.now() +
        "_" +
        file.originalname
          .replace(/\s+/g, "_");

      cb(
        null,
        fileName
      );
    },
  });

// =======================================
// FILE FILTER
// =======================================

const fileFilter =
  (
    req,
    file,
    cb
  ) => {

    if (
      file.mimetype ===
      "application/pdf"
    ) {

      cb(null, true);

    } else {

      cb(
        new Error(
          "Only PDF allowed"
        ),
        false
      );
    }
  };

// =======================================
// MULTER
// =======================================

const upload =
  multer({

    storage,

    fileFilter,

    limits: {

      // 50 MB
      fileSize:
        50 *
        1024 *
        1024,
    },
  });

// =======================================
// GET PAYSLIP
// =======================================

router.get(
  "/:emp_id",
  getSinglePaySlip
);

router.get("/view/:emp_id/:month/:year", getSalarySlip);

// =======================================
// UPLOAD PDF
// =======================================

router.post(
  "/upload",
  upload.single("file"),
  uploadSalarySlip
);

module.exports =
  router;

