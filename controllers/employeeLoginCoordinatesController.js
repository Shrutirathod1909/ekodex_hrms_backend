const Coordinates = require("../models/employeeLoginCoordinatesModel");

// Get by employee code
exports.getByEmpCode = async (req, res) => {
  try {
    const { emp_code } = req.params;

    const data = await Coordinates.getByEmpCode(emp_code);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Get coordinates error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch coordinates",
    });
  }
};

// Create coordinates
// Create coordinates
exports.create = async (req, res) => {
  try {
    const {
      emp_code,
      office_longitude,
      office_latitude,
    } = req.body;

    // Login user ID from authentication middleware
    const created_by = req.user?.id; // तुमच्या token मधील actual field तपासा

    if (!emp_code || office_longitude === undefined || office_latitude === undefined) {
      return res.status(400).json({
        success: false,
        message: "Employee code, longitude and latitude are required",
      });
    }

    if (created_by === undefined || created_by === null) {
      return res.status(401).json({
        success: false,
        message: "Login user ID not found",
      });
    }

    const longitude = Number(office_longitude);
    const latitude = Number(office_latitude);

    if (
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180 ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid longitude or latitude",
      });
    }

    const data = await Coordinates.create({
      emp_code,
      office_longitude: longitude,
      office_latitude: latitude,
      created_by,
        created_by_name: req.user?.name,
      source: "WEB",
    });

    return res.status(201).json({
      success: true,
      message: "Coordinates added successfully",
      data,
    });
  } catch (error) {
    console.error("Create coordinates error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to add coordinates",
    });
  }
};
// Update coordinates

exports.update = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { office_longitude, office_latitude } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid coordinate ID",
      });
    }

    if (
      office_longitude === undefined ||
      office_latitude === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Longitude and latitude are required",
      });
    }

    const longitude = Number(office_longitude);
    const latitude = Number(office_latitude);

    if (
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180 ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid longitude or latitude",
      });
    }

    // Login user details from authentication middleware
    const modifiedId = req.user?.id;
    const modifiedByName = req.user?.name;

    if (modifiedId == null || !modifiedByName) {
      return res.status(401).json({
        success: false,
        message: "Login user details not found",
      });
    }

    const data = await Coordinates.update(id, {
      office_longitude: longitude,
      office_latitude: latitude,
      source: "WEB",
      modified_id: modifiedId,
      modified_by_name: modifiedByName,
    });

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Coordinates not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Coordinates updated successfully",
      data,
    });
  } catch (error) {
    console.error("Update coordinates error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update coordinates",
    });
  }
};

// Delete coordinates (soft delete)

exports.remove = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid coordinate ID",
      });
    }

    // Login user details from authentication middleware
    const deletedId = req.user?.id;
    const deletedByName = req.user?.name;

    if (deletedId == null || !deletedByName) {
      return res.status(401).json({
        success: false,
        message: "Login user details not found",
      });
    }

    const deleted = await Coordinates.delete(id, {
      deleted_id: deletedId,
      deleted_by_name: deletedByName,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Coordinates not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Coordinates deleted successfully",
    });
  } catch (error) {
    console.error("Delete coordinates error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete coordinates",
    });
  }
};
