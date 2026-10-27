const trainingVideoModel = require("../models/trainingVideoModel");
const logger = require("../utils/logger");

// ================= GET ALL =================
exports.getTrainingVideos = async (req, res) => {
  try {
    logger.log("[GET TRAINING VIDEOS] Query Params:", req.query);
    logger.log("[GET TRAINING VIDEOS] Auth User ID:", req.user?.id);

    const result = await trainingVideoModel.getTrainingVideos(req.query);

    return res.status(200).json(result);
  } catch (error) {
    logger.error("GET TRAINING VIDEOS ERROR:", error);
    return res.status(500).json({
      message: "Error fetching training videos",
      error: error.message,
    });
  }
};

// ================= GET BY ID =================
exports.getTrainingVideoById = async (req, res) => {
  try {
    logger.log("[GET TRAINING VIDEO BY ID] Params ID:", req.params.id);

    const result = await trainingVideoModel.getTrainingVideoById(req.params.id);

    if (!result) {
      return res.status(404).json({ message: "Training video not found" });
    }

    return res.status(200).json(result);
  } catch (error) {
    logger.error("GET TRAINING VIDEO BY ID ERROR:", error);
    return res.status(500).json({
      message: "Error fetching training video",
      error: error.message,
    });
  }
};

// ================= CREATE =================
exports.createTrainingVideo = async (req, res) => {
  try {
    logger.log("[CREATE TRAINING VIDEO] Input Body:", req.body);
    logger.log("[CREATE TRAINING VIDEO] Auth User ID:", req.user?.id);

    const result = await trainingVideoModel.createTrainingVideo(
      req.body,
      req.user
    );

    return res.status(201).json({
      message: "Training video created successfully",
      data: result,
    });
  } catch (error) {
    logger.error("CREATE TRAINING VIDEO ERROR:", error);
    return res.status(500).json({
      message: error.message || "Error creating training video",
    });
  }
};

// ================= UPDATE =================
exports.updateTrainingVideo = async (req, res) => {
  try {
    logger.log("[UPDATE TRAINING VIDEO] Params ID:", req.params.id);
    logger.log("[UPDATE TRAINING VIDEO] Input Body:", req.body);
    logger.log("[UPDATE TRAINING VIDEO] Auth User ID:", req.user?.id);

    const result = await trainingVideoModel.updateTrainingVideo(
      req.params.id,
      req.body,
      req.user
    );

    return res.status(200).json({
      message: "Training video updated successfully",
      data: result,
    });
  } catch (error) {
    logger.error("UPDATE TRAINING VIDEO ERROR:", error);
    return res.status(500).json({
      message: error.message || "Error updating training video",
    });
  }
};

// ================= DELETE =================
exports.deleteTrainingVideo = async (req, res) => {
  try {
    logger.log("[DELETE TRAINING VIDEO] Params ID:", req.params.id);
    logger.log("[DELETE TRAINING VIDEO] Auth User ID:", req.user?.id);

    await trainingVideoModel.deleteTrainingVideo(req.params.id, req.user);

    return res.status(200).json({
      message: "Training video deleted successfully",
    });
  } catch (error) {
    logger.error("DELETE TRAINING VIDEO ERROR:", error);
    return res.status(500).json({
      message: error.message || "Error deleting training video",
    });
  }
};
