const express = require("express");

const router = express.Router();

const upload = require(
  "../middleware/upload"
);

const uniformController = require(
  "../controllers/uniformIssueController"
);

const authMiddleware = require(
  "../middleware/authMiddleware"
);

// GET ALL
router.get(
  "/",
  authMiddleware,
  uniformController.getAllUniforms
);

// GET BY ID
router.get(
  "/:id",
  authMiddleware,
  uniformController.getUniformById
);

// CREATE
router.post(
  "/",
  upload.single("attachment"),
  authMiddleware,
  uniformController.createUniform
);

module.exports = router;