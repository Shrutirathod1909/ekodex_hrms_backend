const Supplier = require("../models/SupplierModel");

// ================= GET =================
exports.getSuppliers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;

    const limit = parseInt(req.query.limit) || 10;

    const status = req.query.status || "active";

    const activeValue = status === "active" ? 0 : 1;

    const { data, total } = await Supplier.getAll(page, limit, activeValue);

    res.json({
      success: true,
      data,
      total,
      page,
      limit,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ================= DROPDOWN =================
exports.getSupplierForDropdown = async (req, res) => {
  try {
    const { data } = await Supplier.getAllDropdown();

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

const { getRelativePathFromApi } = require("../utils/img_path");
const clientModel = require("../models/clientModel");
// ================= CREATE =================
exports.createSupplier = async (req, res) => {
  try {
    console.log("createSupplier");
    const logoUrl = getRelativePathFromApi(req.file);
    const userDetail = await clientModel.getUserById(req.user.id);
    const body = {
      ...req.body,
      logo_url: logoUrl,
      created_by: req.user.id,
      created_by_name: userDetail.first_name || "",
    };

    await Supplier.create(body);

    res.status(201).json({
      success: true,
      message: "Supplier Created Successfully",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ================= UPDATE =================
exports.updateSupplier = async (req, res) => {
  try {
    const userDetail = await clientModel.getUserById(req.user.id);
    const id = req.params.id;

    const logoUrl = getRelativePathFromApi(req.file);

    const body = {
      ...req.body,

      logo_url: logoUrl,

      modified_by: userDetail.id,

      modified_by_name: userDetail.first_name || "",
    };

    await Supplier.update(id, body);

    res.json({
      success: true,
      message: "Supplier Updated Successfully",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ================= RESTORE =================
exports.deleteSupplier = async (req, res) => {
  try {
    console.log("deleteSupplier");
    const userDetail = await clientModel.getUserById(req.user.id);
    const id = req.params.id;

    const body = {
      ...req.body,
      modified_by: userDetail.id,
      modified_by_name: userDetail.first_name || "",
    };
    await Supplier.delete(
      req.params.id,
      userDetail.id,
      userDetail.first_name || "",
    );

    res.json({
      success: true,
      message: "Supplier Deleted Successfully",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ================= DELETE =================
exports.restoreSupplier = async (req, res) => {
  try {
    console.log("RestoreSupplier");
    const userDetail = await clientModel.getUserById(req.user.id);
    const id = req.params.id;

    const body = {
      ...req.body,
      modified_by: userDetail.id,
      modified_by_name: userDetail.first_name || "",
    };
    await Supplier.restore(
      req.params.id,
      userDetail.id,
      userDetail.first_name || "",
    );

    res.json({
      success: true,
      message: "Supplier Deleted Successfully",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ================= SEARCH =================
exports.searchSupplier = async (req, res) => {
  try {
    const search = req.query.search || "";

    const suppliers = await Supplier.search(search);

    res.status(200).json({
      success: true,
      data: suppliers,
    });
  } catch (error) {
    console.error("Search Supplier Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to search suppliers",
      error: error.message,
    });
  }
};

// ================= BULK CREATE =================
// ================= CONTROLLER =================

exports.bulkCreateSuppliers = async (req, res) => {
  try {
    const suppliers = req.body?.suppliers;

    console.log("📥 Incoming suppliers:", suppliers);

    if (!Array.isArray(suppliers) || suppliers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No supplier rows provided.",
      });
    }

    const userId = parseInt(req.user.id, 10);

    if (!userId || isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const userName = req.user.name || req.user.username || "Admin";

    await Supplier.bulkCreate(suppliers, userId, userName);

    return res.status(201).json({
      success: true,
      message: `Successfully imported ${suppliers.length} suppliers`,
    });
  } catch (err) {
    console.error("❌ Bulk Upload Error:", err);

    return res.status(500).json({
      success: false,
      message: "Bulk upload failed",
      error: err.message,
    });
  }
};
