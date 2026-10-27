const roleModel = require("../models/roleModel");
const logger = require("../utils/logger");
const userModel = require("../models/userModel");
// ================= GET ROLES =================
// const getRoles = async (req, res) => {
//   try {
//     logger.log("[GET ROLES] Auth User ID:", req.user?.id);
//     const result = await roleModel.getRoles();
//     return res.json(result);
//   } catch (error) {
//     return res.status(500).json({
//       message: "Error fetching roles",
//     });
//   }
// };

const getRoles = async (req, res) => {
  try {
    logger.log("[GET ROLES] Auth User ID:", req.user?.id);
    logger.log("[GET ROLES] Auth User Role:", req.user?.role);

    if (!req.user) {
      return res.status(401).json({
        message: "Unauthorized. User information not found.",
      });
    }

    const result = await roleModel.getRoles(
      req.user.id,
      req.user.role
    );

    return res.json(result);
  } catch (error) {
    logger.error("GET ROLES ERROR:", error);

    return res.status(500).json({
      message: "Error fetching roles",
      error: error.message,
    });
  }
};

// ================= CREATE ROLE =================
const createRole = async (req, res) => {
  try {
    logger.log("[CREATE ROLE] Input Body:", req.body);
    logger.log("[CREATE ROLE] Auth User ID:", req.user?.id);

    const userDetail = await userModel.getUserById(req.user.id);
    const result =
      await roleModel.createRole(req.body, userDetail);

    return res.status(201).json({
      message: "Role created successfully",
    });

  } catch (error) {
    logger.error("CREATE ROLE ERROR:", error);
    return res.status(500).json({
      message: error.message || "Error creating role",
    });
  }
};

// ================= UPDATE ROLE =================
const updateRole = async (req, res) => {
  try {
    logger.log("[UPDATE ROLE] Params ID:", req.params.id);
    logger.log("[UPDATE ROLE] Input Body:", req.body);
    logger.log("[UPDATE ROLE] Auth User ID:", req.user?.id);

    const userDetail = await userModel.getUserById(req.user.id);
    const result =
      await roleModel.updateRole(
        req.params.id,
        req.body,
        userDetail
      );

    return res.json({
      message: "Role updated successfully",
      data: result,
    });

  } catch (error) {
    logger.error("UPDATE ROLE ERROR:", error);
    return res.status(500).json({
      message: "Error updating role",
    });
  }
};

// ================= DELETE ROLE =================
const deleteRole = async (req, res) => {
  try {
    logger.log("[DELETE ROLE] Params ID:", req.params.id);
    logger.log("[DELETE ROLE] Auth User ID:", req.user?.id);

    const userDetail = await userModel.getUserById(req.user.id);
    await roleModel.deleteRole(req.params.id, userDetail);

    return res.json({
      message: "Role deleted successfully",
    });

  } catch (error) {
    logger.error("DELETE ROLE ERROR:", error);
    return res.status(500).json({
      message: error.message || "Error deleting role",
    });
  }
};

// ================= RESTORE ROLE =================
const restoreRole = async (req, res) => {
  try {
    logger.log("[RESTORE ROLE] Params ID:", req.params.id);
    logger.log("[RESTORE ROLE] Auth User ID:", req.user?.id);

    const userDetail = await userModel.getUserById(req.user.id);
    await roleModel.restoreRole(req.params.id, userDetail);

    return res.json({
      message: "Role restored successfully",
    });

  } catch (error) {
    logger.error("RESTORE ROLE ERROR:", error);
    return res.status(500).json({
      message: error.message || "Error restoring role",
    });
  }
};

module.exports = {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  restoreRole,
};
