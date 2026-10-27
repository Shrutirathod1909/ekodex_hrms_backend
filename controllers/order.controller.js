
// ==========================================
// controllers/order.controller.js
// ==========================================

const orderModel = require(
  "../models/order.model"
);

// ==========================================
// GET ACTIVE PRODUCTS
// ==========================================

exports.getActiveProducts = async (
  req,
  res
) => {

  try {

    const data =
      await orderModel.getActiveProducts();

    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};

// ==========================================
// GET ACTIVE SUPPLIERS
// ==========================================

exports.getActiveSuppliers = async (
  req,
  res
) => {

  try {

    const data =
      await orderModel.getActiveSuppliers();

    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};



// =====================================
// GET PENDING ORDERS


exports.getPendingOrders = async (
  req,
  res
) => {

  try {

    const {
      supplier_name = [],
      product_name = "",
      status = "ALL",
      fromDate = "",
      toDate = ""
    } = req.body || {};

    const result =
      await orderModel.getPendingOrders({
        supplier_name,
        product_name,
        status,
        fromDate,
        toDate
      });

    return res.status(200).json({
      success: true,
      count: result.length,
      data: result
    });

  } catch (error) {

    console.log(error);

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==========================================
// PRODUCT WISE REPORT
// ==========================================
exports.getProductWisePOReport = async (req, res) => {
  try {

    let { status } = req.query;

    let statusList = [];

    if (status) {
      statusList = Array.isArray(status)
        ? status
        : status.split(",");
    }

    const data =
      await orderModel.getProductWisePOReport(statusList);

    res.status(200).json({
      success: true,
      message: "Report fetched successfully",
      data
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getUniformSaleReport = async (req, res) => {
  try {
    const {
      supplier_name = [],
      product_name = []
    } = req.body || {};

    const data = await orderModel.getUniformSaleReport({
      supplier_name,
      product_name
    });

    res.json({ success: true, data });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

