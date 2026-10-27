const zoneMasterModel = require("../models/zoneMasterModel");
const userModel = require("../models/userModel");
const logger = require("../utils/logger");

// ================= GET ALL ZONES =================
// const getZones = async (req, res) => {
//   try {
//     logger.log("GET ZONES API CALLED");

//     const result = await zoneMasterModel.getZones();

//     return res.status(200).json(result);
//   } catch (error) {
//     logger.error("GET ZONES CONTROLLER ERROR:", error);

//     return res.status(500).json({
//       message: "Error fetching zones",
//       error: error.message,
//     });
//   }
// };

const getZones = async (req, res) => {
  try {
    logger.log("GET ZONES API CALLED");
    logger.log("[GET ZONES] Auth User ID:", req.user?.id);
    logger.log("[GET ZONES] Auth User Role:", req.user?.role);

    if (!req.user) {
      return res.status(401).json({
        message: "Unauthorized. User information not found.",
      });
    }

    const result = await zoneMasterModel.getZones(
      req.user.id,
      req.user.role
    );

    return res.status(200).json(result);
  } catch (error) {
    logger.error("GET ZONES CONTROLLER ERROR:", error);

    return res.status(500).json({
      message: "Error fetching zones",
      error: error.message,
    });
  }
};

// ================= CREATE ZONE =================
const createZone = async (req, res) => {
  try {
    logger.log("CREATE ZONE API CALLED");
    logger.log("REQ BODY =>", req.body);
    logger.log("REQ USER =>", req.user);

    const userDetail = await userModel.getUserById(req.user.id);

    await zoneMasterModel.createZone(req.body, userDetail);

    return res.status(201).json({
      message: "Zone created successfully",
    });
  } catch (error) {
    logger.error("CREATE ZONE CONTROLLER ERROR:", error);

    // Duplicate zone â€” return 409 Conflict
    if (error.message === "Zone already exists") {
      return res.status(409).json({ message: error.message });
    }

    return res.status(500).json({
      message: "Error creating zone",
      error: error.message,
    });
  }
};

// ================= UPDATE ZONE =================
// const updateZone = async (req, res) => {
//   try {
//     const { id } = req.params;

//     logger.log("UPDATE ZONE API CALLED => ID: " + id);
//     logger.log("REQ BODY =>", req.body);

//     const result = await zoneMasterModel.updateZone(id, req.body, req.user);

//     return res.status(200).json({
//       message: "Zone updated successfully",
//       zone: result,
//     });
//   } catch (error) {
//     logger.error("UPDATE ZONE CONTROLLER ERROR:", error);

//     return res.status(500).json({
//       message: "Error updating zone",
//       error: error.message,
//     });
//   }
// };
const updateZone = async (req, res) => {
  try {
    const { id } = req.params;

    logger.log("UPDATE ZONE API CALLED => ID: " + id);
    logger.log("REQ BODY =>", req.body);
    logger.log("REQ USER ID =>", req.user?.id);

    if (!req.user) {
      return res.status(401).json({
        message: "Unauthorized. User information not found.",
      });
    }

    const userDetail = await userModel.getUserById(req.user.id);

    const result = await zoneMasterModel.updateZone(
      id,
      req.body,
      userDetail
    );

    return res.status(200).json({
      message: "Zone updated successfully",
      zone: result,
    });
  } catch (error) {
    logger.error("UPDATE ZONE CONTROLLER ERROR:", error);

    return res.status(500).json({
      message: "Error updating zone",
      error: error.message,
    });
  }
};

// ================= DELETE ZONE =================
const deleteZone = async (req, res) => {
  try {
    const { id } = req.params;

    logger.log("DELETE ZONE API CALLED => ID: " + id);

    await zoneMasterModel.deleteZone(id, req.user);

    return res.status(200).json({
      message: "Zone deleted successfully",
    });
  } catch (error) {
    logger.error("DELETE ZONE CONTROLLER ERROR:", error);

    return res.status(500).json({
      message: "Error deleting zone",
      error: error.message,
    });
  }
};

// ================= RESTORE ZONE =================
const restoreZone = async (req, res) => {
  try {
    const { id } = req.params;

    logger.log("RESTORE ZONE API CALLED => ID: " + id);

    await zoneMasterModel.restoreZone(id, req.user);

    return res.status(200).json({
      message: "Zone restored successfully",
    });
  } catch (error) {
    logger.error("RESTORE ZONE CONTROLLER ERROR:", error);

    return res.status(500).json({
      message: "Error restoring zone",
      error: error.message,
    });
  }
};

module.exports = {
  getZones,
  createZone,
  updateZone,
  deleteZone,
  restoreZone,
};
