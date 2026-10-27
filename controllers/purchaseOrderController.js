const PurchaseOrder = require("../models/purchaseOrderModel");
const clientModel = require("../models/clientModel");

exports.getBranchesByCompany = async (req, res) => {
  try {
    const { company_id } = req.query;
    if (!company_id) {
      return res
        .status(400)
        .json({ success: false, message: "Company ID is required" });
    }

    const branches = await PurchaseOrder.getBranchesByCompany(company_id);

    res.status(200).json({
      success: true,
      data: branches,
    });
  } catch (err) {
    console.error("Error fetching branches:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch branches" });
  }
};

exports.getPurchaseOrders = async (req, res) => {
  try {
    // 1. Extract parameters from query (with defaults if missing)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const active = req.query.active || "active";
    const status = req.query.status || "Pending";

    // 2. Map frontend 'active' string to database value (0 for active, 1 for inactive)
    const activeValue = active === "active" ? 0 : 1;

    // 3. Pass all arguments to the model
    const { purchaseOrders, totalCount } =
      await PurchaseOrder.getAllPurchaseOrders(
        page,
        limit,
        activeValue,
        status,
      );

    // 4. Return consistent response structure
    res.status(200).json({
      success: true,
      data: purchaseOrders,
      totalCount,
      page,
      limit,
    });
  } catch (error) {
    console.error("Error in getPurchaseOrders:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve purchase orders.",
      error: error.message,
    });
  }
};

// ================= GET LEAF PURCHASE RECORD MAP =================
exports.getCompanies = async (req, res) => {
  try {
    const data = await PurchaseOrder.findAllActive();

    res.status(200).json({
      success: true,
      data: data,
    });
  } catch (err) {
    console.error("Error fetching companies:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch companies",
      error: err.message,
    });
  }
};

// ================= SOFT DELETE PURCHASE ORDER =================
exports.deletePurchaseOrder = async (req, res) => {
  try {
    const { id } = req.params;
    // console.log("deletePurchaseOrder", id);
    const userDetail = await clientModel.getUserById(req.user.id);

    const affectedRows = await PurchaseOrder.deletePurchaseOrder(
      id,
      userDetail,
    );

    if (affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Purchase Order not found",
      });
    }

    res.json({
      success: true,
      message: "Purchase Order moved to Inactive successfully",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Failed to delete purchase order",
      error: err.message,
    });
  }
};

// =====================================
// UPDATE PURCHASE ORDER STATUS
// =====================================
exports.updatePurchaseOrderStatus = async (req, res) => {
  try {
    const userDetail = await clientModel.getUserById(req.user.id);
    const { id } = req.params;
    const { status } = req.body;

    const user = req.user;

    // VALIDATION
    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    // ONLY ALLOW THESE STATUS
    const validStatus = ["approved", "rejected", "pending"];

    if (!validStatus.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    await PurchaseOrder.updatePurchaseOrderStatus(
      id,
      status,
      user.id,
      userDetail,
    );

    res.status(200).json({
      success: true,
      message: `Purchase Order ${status} successfully`,
    });
  } catch (error) {
    console.error("STATUS UPDATE ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update status",
      error: error.message,
    });
  }
};

exports.createPurchaseOrder = async (req, res) => {
  try {
    const userDetail = await clientModel.getUserById(req.user.id);
    // 1. Destructure new fields
    const {
      po_number,
      supplier_name,
      order_date,
      status,
      items,
      company_id,
      company_name,
      branch_id,
      branch_name,
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Line items cannot be empty." });
    }

    const grandTotal = items.reduce(
      (sum, item) => sum + (parseFloat(item.total_amount) || 0),
      0,
    );

    const masterData = {
      po_number,
      supplier_name,
      order_date,
      status,
      grand_total: grandTotal,
      company_id,
      company_name,
      branch_id,
      branch_name, // Add these
    };

    const result = await PurchaseOrder.createPurchaseOrderBatch(
      masterData,
      items,
      userDetail,
    );

    return res.status(201).json({
      success: true,
      message: "Purchase Order Manifest saved successfully.",
      order_id: result.order_id,
    });
  } catch (err) {
    // This prints the error details to your Node.js command terminal window
    console.error("======= CRITICAL DATABASE TRANSACTION CRASH =======");
    console.error(err);
    console.error("====================================================");

    // This returns the exact error string to the React client alert window
    return res.status(500).json({
      success: false,
      message: `Database Error: ${err.message || "Unknown transactional exception"}`,
      error: err,
    });
  }
};
exports.updatePurchaseOrder = async (req, res) => {
  try {
    const userDetail = await clientModel.getUserById(req.user.id);
    const order_id = req.params.id; // 👈 FIX HERE (IMPORTANT)

    const {
      po_number,
      supplier_name,
      order_date,
      status,
      items,
      company_id,
      company_name,
      branch_id,
      branch_name,
    } = req.body;

    if (!order_id) {
      return res.status(400).json({
        success: false,
        message: "order_id is required for update.",
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Line items cannot be empty.",
      });
    }

    const grandTotal = items.reduce(
      (sum, item) => sum + (parseFloat(item.total_amount) || 0),
      0,
    );

    const masterData = {
      po_number,
      supplier_name,
      order_date,
      status,
      grand_total: grandTotal,
      company_id,
      company_name,
      branch_id,
      branch_name,
    };

    const result = await PurchaseOrder.updatePurchaseOrderBatch(
      order_id,
      masterData,
      items,
      userDetail,
    );

    return res.status(200).json({
      success: true,
      message: "Purchase Order updated successfully.",
      order_id: result.order_id,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
exports.getPurchaseOrdersBySupplier = async (req, res) => {
  try {
    const { supplier_name } = req.query;

    const purchaseOrders =
      await PurchaseOrder.getPurchaseOrdersBySupplier(supplier_name);

    res.json({
      success: true,
      data: purchaseOrders,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getPurchaseOrderProducts = async (req, res) => {
  try {
    const { orderId } = req.params;

    const products = await PurchaseOrder.getPurchaseOrderProducts(orderId);

    res.json({
      success: true,
      data: products,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Failed to delete purchase order",
      error: err.message,
    });
  }
};
