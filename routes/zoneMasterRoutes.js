const express = require("express");
const router = express.Router();

const zoneMasterController = require("../controllers/zoneMasterController");
const authMiddleware = require("../middleware/authMiddleware");

// GET ALL ZONES
router.get("/", authMiddleware, zoneMasterController.getZones);

// CREATE ZONE
router.post("/", authMiddleware, zoneMasterController.createZone);

// UPDATE ZONE
router.post("/update/:id", authMiddleware, zoneMasterController.updateZone);

// DELETE ZONE (SOFT)
router.delete("/:id", authMiddleware, zoneMasterController.deleteZone);

// RESTORE ZONE
router.put("/restore/:id", authMiddleware, zoneMasterController.restoreZone);

module.exports = router;
