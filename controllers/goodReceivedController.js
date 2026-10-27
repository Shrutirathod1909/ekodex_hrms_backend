// controllers/goodReceivedController.js
const GoodReceivedModel = require("../models/goodReceivedModel");

const insertGoodReceived = async (req, res) => {
  try {
    const data = req.body;

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No data provided",
      });
    }

    const result = await GoodReceivedModel.insertGoodReceived(data);

    return res.status(200).json({
      success: true,
      message: result.message,
    });

  } catch (error) {
    console.error("Good Received Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

const getAllGoodReceived = async (req, res) => {
  try {
    const data = await GoodReceivedModel.getAllGoodReceived();

    res.status(200).json({
      success: true,
      data,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// GET BY PO NO
const getByPONo = async (req, res) => {
  try {
    const { po_no } = req.params;

    const data = await GoodReceivedModel.getByPONo(po_no);

    res.status(200).json({
      success: true,
      data,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};


const getStockBySku = async (req, res) => {
  try {
    const { sku_code } = req.params;

    const data = await GoodReceivedModel.getStockBySku(sku_code);

    res.status(200).json({
      success: true,
      data,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
module.exports = {
  insertGoodReceived,
    getAllGoodReceived,
      getByPONo,
      getStockBySku

};