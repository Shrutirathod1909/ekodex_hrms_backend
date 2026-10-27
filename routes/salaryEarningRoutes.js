const express = require("express");

const router = express.Router();

const salaryEarningController =
    require("../controllers/salaryEarningController");

const authMiddleware =
    require("../middleware/authMiddleware");


// =====================================================
// GET ALL
// GET /api/salary-earning
// =====================================================

router.get(
    "/",
    authMiddleware,
    salaryEarningController.getAll
);


// =====================================================
// GET BY TEMPLATE
// IMPORTANT: MUST COME BEFORE /:id
//
// GET /api/salary-earning/template/:tmpl_id
// =====================================================

router.get(
    "/template/:tmpl_id",
    authMiddleware,
    salaryEarningController.getByTemplateId
);


// =====================================================
// CREATE
// POST /api/salary-earning/create
// =====================================================

router.post(
    "/",
    authMiddleware,
    salaryEarningController.create
);


// =====================================================
// UPDATE
// POST /api/salary-earning/update/:id
// =====================================================

router.post(
    "/update/:id",
    authMiddleware,
    salaryEarningController.update
);


// =====================================================
// DELETE
// POST /api/salary-earning/delete/:id
// =====================================================

router.post(
    "/delete/:id",
    authMiddleware,
    salaryEarningController.delete
);


// =====================================================
// RESTORE
// POST /api/salary-earning/restore/:id
// =====================================================

router.post(
    "/restore/:id",
    authMiddleware,
    salaryEarningController.restore
);


// =====================================================
// GET BY ID
// MUST COME AFTER named routes
//
// GET /api/salary-earning/:id
// =====================================================

router.get(
    "/:id",
    authMiddleware,
    salaryEarningController.getById
);


module.exports = router;