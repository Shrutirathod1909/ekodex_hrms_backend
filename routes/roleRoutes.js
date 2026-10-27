const express = require("express");
const router = express.Router();

const roleController = require("../controllers/roleController");
const authMiddleware = require("../middleware/authMiddleware");

// GET ALL ROLES
router.get("/", authMiddleware, roleController.getRoles);

// CREATE ROLE
router.post("/", authMiddleware, roleController.createRole);

// UPDATE ROLE
router.post("/update/:id", authMiddleware, roleController.updateRole);

// DELETE ROLE
router.delete("/:id", authMiddleware, roleController.deleteRole);

// RESTORE ROLE
router.put("/restore/:id", authMiddleware, roleController.restoreRole);

module.exports = router;
