const sql = require("mssql");
const { poolPromise } = require("../config/db");
const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const upload = require("../middleware/upload");
const authMiddleware = require("../middleware/authMiddleware");

// Define User routes
router.get("/", authMiddleware,userController.getUsers);
router.post(
  "/",
  authMiddleware,
  upload.single("profileImage"),
  userController.createUser,
);

router.get("/get-user-data", authMiddleware, userController.getUserData);

router.delete("/:id", authMiddleware, userController.deleteUser);
router.put("/restore/:id", authMiddleware, userController.restoreUser);

router.post(
  "/update/:id",
  authMiddleware,
  upload.single("profileImage"),
  userController.updateUser,
);

router.post(
  "/update-client-sites/:id",
  authMiddleware,
  userController.updateClientSites,
);

// Helper routes
router.get("/roles", userController.getRoles);
//clients
//clients
router.get("/clients", authMiddleware, userController.getClients);

router.get("/export", authMiddleware, userController.exportUsersToExcel);

router.get("/:id", authMiddleware, userController.getUserById);

module.exports = router;
