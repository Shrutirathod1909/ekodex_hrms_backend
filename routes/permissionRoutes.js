const express = require("express");
const router = express.Router();

const permissionController = require("../controllers/permissionController");
const authMiddleware = require("../middleware/authMiddleware");

// PROTECTED ROUTE
router.get("/mymenu", authMiddleware, permissionController.getMyMenu);

router.get("/roles", authMiddleware, permissionController.getAllRoles);

router.get("/modules", authMiddleware, permissionController.getAllModules);

router.get(
  "/get-permissions",
  authMiddleware,
  permissionController.getPermissions,
);

router.post(
  "/save",
  authMiddleware,
  permissionController.savePermissionsForRole,
);

router.get(
  "/:role",
  authMiddleware,
  permissionController.getPermissionsForRole,
);

module.exports = router;
