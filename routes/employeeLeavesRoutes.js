const express = require("express");

const router = express.Router();

const {
  applySiteLeaveConfigurationController,
  getSiteLeaveConfigurationController,
  deleteSiteLeaveConfigurationController,
} = require("../controllers/employeeLeavesController");

// =====================================================
// APPLY SITE LEAVE CONFIGURATION
// =====================================================

router.post("/apply-site-leaves", applySiteLeaveConfigurationController);
router.get("/configuration/:site_id", getSiteLeaveConfigurationController);
router.post(
  "/configuration/:site_id/:id",
  deleteSiteLeaveConfigurationController,
);

module.exports = router;
