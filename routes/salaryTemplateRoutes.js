const express = require("express");

const router = express.Router();

const salaryTemplateController = require("../controllers/salaryTemplateController");

const authMiddleware = require("../middleware/authMiddleware");

// =====================================================
// GET ALL
// GET /api/salary-template
// =====================================================

router.get("/", authMiddleware, salaryTemplateController.getAll);

// =====================================================
// CREATE
// POST /api/salary-template
// =====================================================

router.post("/", authMiddleware, salaryTemplateController.create);
router.get("/export", authMiddleware, salaryTemplateController.exportExcel);

// =====================================================
// UPDATE
// POST /api/salary-template/update/:id
// =====================================================

router.post("/update/:id", authMiddleware, salaryTemplateController.update);

// =====================================================
// DELETE
// DELETE /api/salary-template/:id
// =====================================================

router.delete("/:id", authMiddleware, salaryTemplateController.delete);

// =====================================================
// RESTORE
// POST /api/salary-template/restore/:id
// =====================================================

router.post("/restore/:id", authMiddleware, salaryTemplateController.restore);

// =====================================================
// GET BY ID
// IMPORTANT: LAST
//
// GET /api/salary-template/:id
// =====================================================

router.get("/:id", authMiddleware, salaryTemplateController.getById);

module.exports = router;
