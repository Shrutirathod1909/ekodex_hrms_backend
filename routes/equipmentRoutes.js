const express = require("express");
const router = express.Router();

const controller = require("../controllers/equipmentController");
const authMiddleware = require("../middleware/authMiddleware");

// CREATE
router.post("/", authMiddleware, controller.createEquipment);

// GET ALL
router.get("/", authMiddleware, controller.getAllEquipment);

// GET BY ID
router.get("/get/:id", authMiddleware, controller.getEquipmentById);

// UPDATE
router.get("/export", authMiddleware, controller.exportEquipment);

router.post("/update/:id", authMiddleware, controller.updateEquipment);

// DELETE
router.post("/delete/:id", authMiddleware, controller.deleteEquipment);

module.exports = router;
