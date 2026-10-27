const Warehouse = require("../models/warehouseModel");

// ===============================
// GET ALL
// ===============================
exports.getAllWarehouses = async (req, res) => {
  try {

    const data = await Warehouse.getAll(req.user?.id);

    res.status(200).json(data);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch warehouse data",
      error: error.message,
    });
  }
};

// ===============================
// GET BY ID
// ===============================
exports.getWarehouseById = async (req, res) => {
  try {

    const data = await Warehouse.getById(req.params.id);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Warehouse not found",
      });
    }

    res.status(200).json(data);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch warehouse",
      error: error.message,
    });
  }
};

// ===============================
// CREATE
// ===============================
exports.createWarehouse = async (req, res) => {
  try {

    const data = req.body;

    // LOGIN USER DETAILS
    data.created_by = req.user.id;

    data.created_by_name = req.user.name;

    const result = await Warehouse.create(data);

    res.status(201).json({
      success: true,
      message: "Warehouse created successfully",
      data: result,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to create warehouse",
      error: error.message,
    });
  }
};

// ===============================
// UPDATE
// ===============================
exports.updateWarehouse = async (req, res) => {
  try {

    const data = req.body;

    // LOGIN USER DETAILS
    data.modified_by = req.user.id;

    data.modified_by_name = req.user.name;

    await Warehouse.update(
      req.params.id,
      data
    );

    res.status(200).json({
      success: true,
      message: "Warehouse updated successfully",
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to update warehouse",
      error: error.message,
    });
  }
};

// ===============================
// DELETE
// ===============================
// ===============================
// FIX DELETE CONTROLLER
// ===============================
exports.deleteWarehouse = async (
  req,
  res
) => {

  try {

    // ===============================
    // PASS USER ALSO
    // ===============================
    await Warehouse.delete(
      req.params.id,
      req.user
    );

    res.status(200).json({
      success: true,
      message:
        "Warehouse deleted successfully",
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message:
        "Failed to delete warehouse",
      error: error.message,
    });
  }
};
