const express = require("express");

const router = express.Router();

const salaryDeductionController = require("../controllers/salaryDeductionController");

const authMiddleware = require("../middleware/authMiddleware");

// =====================================================
// GET ALL
// GET /api/salary-deduction
// =====================================================

router.get("/", authMiddleware, salaryDeductionController.getAll);

// =====================================================
// GET BY TEMPLATE
// IMPORTANT: BEFORE /:id
//
// GET /api/salary-deduction/template/:tmpl_id
// =====================================================

router.get(
  "/template/:tmpl_id",
  authMiddleware,
  salaryDeductionController.getByTemplateId,
);

// =====================================================
// CREATE
// POST /api/salary-deduction/create
// =====================================================

router.post("/", authMiddleware, salaryDeductionController.create);

// =====================================================
// UPDATE
// POST /api/salary-deduction/update/:id
// =====================================================

router.post("/update/:id", authMiddleware, salaryDeductionController.update);

// =====================================================
// DELETE
// POST /api/salary-deduction/delete/:id
// =====================================================

router.post("/delete/:id", authMiddleware, salaryDeductionController.delete);

// =====================================================
// RESTORE
// POST /api/salary-deduction/restore/:id
// =====================================================

router.post("/restore/:id", authMiddleware, salaryDeductionController.restore);

// =====================================================
// GET BY ID
// AFTER named routes
//
// GET /api/salary-deduction/:id
// =====================================================

router.get("/:id", authMiddleware, salaryDeductionController.getById);

module.exports = router;
