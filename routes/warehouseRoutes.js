const express = require("express");

const router = express.Router();

const warehouseController = require("../controllers/warehouseController");
const authMiddleware = require("../middleware/authMiddleware");

// ===============================
// ROUTES
// ===============================

router.get("/", authMiddleware, warehouseController.getAllWarehouses);

router.get("/:id",authMiddleware ,warehouseController.getWarehouseById);

// CREATE
router.post("/create",authMiddleware, warehouseController.createWarehouse);

// UPDATE
router.post("/update/:id",authMiddleware,warehouseController.updateWarehouse);

// DELETE
router.post("/delete/:id",authMiddleware, warehouseController.deleteWarehouse);

module.exports = router;