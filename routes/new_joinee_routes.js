const express = require("express");
const router = express.Router();

const controller = require("../controllers/new_joinee_Controller");
const upload = require("../middleware/upload");
const authMiddleware = require("../middleware/authMiddleware");
router.get("/", controller.getAll);
// FILE UPLOAD FIX
router.post(
  "/create",
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "aadhar_card", maxCount: 1 },
    { name: "bank_detail", maxCount: 1 },
    { name: "resume", maxCount: 1 },
    { name: "pan_card", maxCount: 1 },
  ]),
  authMiddleware,
  controller.createNewJoinee,
);

module.exports = router;
