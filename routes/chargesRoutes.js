const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const chargesController = require("../controllers/chargesController");

// GET ALL
router.get("/", authMiddleware, chargesController.getCharges);

// CREATE
router.post("/", authMiddleware, chargesController.createCharge);

// UPDATE
router.put("/:id", authMiddleware, chargesController.updateCharge);

// DELETE
router.delete("/:id", authMiddleware, chargesController.deleteCharge);

router.get(
  "/charges-master",
  authMiddleware,
  chargesController.getChargesMasterList,
);

module.exports = router;
