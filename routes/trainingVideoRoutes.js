const express = require("express");
const router = express.Router();

const trainingVideoController = require("../controllers/trainingVideoController");
const authMiddleware = require("../middleware/authMiddleware");

// GET ALL TRAINING VIDEOS
router.get("/", authMiddleware, trainingVideoController.getTrainingVideos);

// GET BY ID
router.get("/:id", authMiddleware, trainingVideoController.getTrainingVideoById);

// CREATE
router.post("/", authMiddleware, trainingVideoController.createTrainingVideo);

// UPDATE
router.post("/update/:id", authMiddleware, trainingVideoController.updateTrainingVideo);

// DELETE (SOFT)
router.delete("/:id", authMiddleware, trainingVideoController.deleteTrainingVideo);

module.exports = router;
