const permissionModel = require("../models/permissionModel");
const logger = require("../utils/logger");

// ================= GET ALL ROLES =================
// const getAllRoles = async (req, res) => {
//   try {
//     const roles = await permissionModel.getAllRoles();

//     return res.status(200).json(roles);
//   } catch (error) {
//     logger.error("GET ROLES ERROR:", error);

//     return res.status(500).json({
//       message: "Error fetching roles",
//       error: error.message,
//       stack: error.stack,
//     });
//   }
// };
const getAllRoles = async (req, res) => {
  try {
    logger.log("[GET PERMISSION ROLES] Auth User ID:", req.user?.id);
    logger.log("[GET PERMISSION ROLES] Auth User Role:", req.user?.role);

    if (!req.user) {
      return res.status(401).json({
        message: "Unauthorized. User information not found.",
      });
    }

    const roles = await permissionModel.getAllRoles(
      req.user.id,
      req.user.role
    );

    return res.status(200).json(roles);
  } catch (error) {
    logger.error("GET PERMISSION ROLES ERROR:", error);

    return res.status(500).json({
      message: "Error fetching roles",
      error: error.message,
    });
  }
};

// ================= GET ALL MODULES =================
const getAllModules = async (req, res) => {
  try {
    const modules = await permissionModel.getAllModules();

    return res.status(200).json(modules);
  } catch (error) {
    logger.error("GET MODULES ERROR:", error);

    return res.status(500).json({
      message: "Error fetching modules",
      error: error.message,
      stack: error.stack,
    });
  }
};

// ================= GET PERMISSIONS =================
const getPermissionsForRole = async (req, res) => {
  try {
    const result = await permissionModel.getPermissionsForRole(req.params.role);

    return res.status(200).json(result);
  } catch (error) {
    logger.error("GET PERMISSIONS ERROR:", error);

    return res.status(500).json({
      message: "Error fetching permissions",
      error: error.message,
      stack: error.stack,
    });
  }
};

const getPermissions = async (req, res) => {
  try {
    // console.log("getPermissions");
    // console.log("userDetails", req.user);
    const result = await permissionModel.getPermissionsForRole(req.user.role);

    return res.status(200).json(result);
  } catch (error) {
    logger.error("GET PERMISSIONS ERROR:", error);

    return res.status(500).json({
      message: "Error fetching permissions",
      error: error.message,
      stack: error.stack,
    });
  }
};

// ================= SAVE PERMISSIONS =================
const savePermissionsForRole = async (req, res) => {
  try {
    await permissionModel.savePermissionsForRole(req.body);

    return res.status(200).json({
      message: "Permissions saved successfully!",
    });
  } catch (error) {
    logger.error("SAVE PERMISSIONS ERROR:", error);

    return res.status(500).json({
      message: "Error saving permissions",
      error: error.message,
      stack: error.stack,
    });
  }
};

// ================= GET MY MENU =================
const getMyMenu = async (req, res) => {
  try {
    const result = await permissionModel.getMyMenu(req.user);

    return res.status(200).json(result);
  } catch (error) {
    logger.error("GET MENU ERROR:", error);

    return res.status(500).json({
      message: "Error fetching menu",
      error: error.message,
      stack: error.stack,
    });
  }
};

// ================= EXPORTS =================
module.exports = {
  getAllRoles,
  getAllModules,
  getPermissionsForRole,
  savePermissionsForRole,
  getMyMenu,
  getPermissions,
};
