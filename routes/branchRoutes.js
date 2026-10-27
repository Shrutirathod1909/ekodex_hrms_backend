// hrms-backend/routes/branchRoutes.js (Full Updated Code)
const express = require("express");
const router = express.Router();
const branchController = require("../controllers/branchController");
const authMiddleware = require("../middleware/authMiddleware");

// Full CRUD, Search, and Export routes
router.get("/", authMiddleware,branchController.getBranches);

router.post("/", authMiddleware, branchController.createBranch);
router.post("/update/:id", authMiddleware, branchController.updateBranch);
router.delete("/:id", authMiddleware, branchController.deleteBranch);
router.put("/restore/:id", authMiddleware, branchController.restoreBranch);
router.get("/export", authMiddleware, branchController.exportBranches);
router.get("/by-company/:companyId", branchController.getBranchesByCompany);

module.exports = router;
