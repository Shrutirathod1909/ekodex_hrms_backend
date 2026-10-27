const EquipmentModel = require("../models/equipmentModel");

// ======================================
// CREATE
// ======================================
exports.createEquipment = async (req, res) => {
  try {
    const data = {
      equipment_master: req.body.equipment_master,

      rate: req.body.rate,

      active: 0,

      created_by: req.user.id,

      branch_id: req.user.branch_id,

      company_id: req.user.company_id,

      source: "web",
    };

    const result = await EquipmentModel.createEquipment(data);

    res.json({
      success: true,
      id: result.id,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ======================================
// GET ALL
// ======================================
exports.getAllEquipment = async (req, res) => {
  try {
    const queryParams = {
      ...req.query,

      branch_id: req.user.branch_id,

      company_id: req.user.company_id,
    };

    const data = await EquipmentModel.getAllEquipment(queryParams);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ======================================
// EXPORT
// ======================================
exports.exportEquipment = async (req, res) => {
  try {
    const queryParams = {
      ...req.query,

      branch_id: req.user.branch_id,

      company_id: req.user.company_id,
    };

    const data = await EquipmentModel.getAllEquipment(queryParams);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ======================================
// GET BY ID
// ======================================
exports.getEquipmentById = async (req, res) => {
  try {
    const data = await EquipmentModel.getEquipmentById(req.params.id);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ======================================
// UPDATE
// ======================================
exports.updateEquipment = async (req, res) => {
  try {
    const data = {
      equipment_master: req.body.equipment_master,

      rate: req.body.rate,

      active: req.body.active || 0,

      modified_by: req.user.id,
    };

    await EquipmentModel.updateEquipment(req.params.id, data);

    res.json({
      success: true,
      message: "Updated successfully",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ======================================
// DELETE
// ======================================
exports.deleteEquipment = async (req, res) => {
  try {
    await EquipmentModel.deleteEquipment(req.params.id, req.user.id);

    res.json({
      success: true,
      message: "Deleted successfully",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
