const grnPaymentModel = require("../models/grnPaymentModel");

// ================= CREATE =================
const createPayment = async (req, res) => {
  try {
    await grnPaymentModel.createPayment(req.body);

    res.status(201).json({
      success: true,
      message: "Payment Added Successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ================= GET ALL =================
const getAllPayments = async (req, res) => {
  try {
    const data = await grnPaymentModel.getAllPayments();

    res.status(200).json({
      success: true,
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

// ================= GET SINGLE =================
const getPaymentById = async (req, res) => {
  try {
    const data = await grnPaymentModel.getPaymentById(req.params.id);

    res.status(200).json({
      success: true,
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

// ================= UPDATE =================
const updatePayment = async (req, res) => {
  try {
    await grnPaymentModel.updatePayment(req.params.id, req.body);

    res.status(200).json({
      success: true,
      message: "Payment Updated Successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ================= DELETE =================
const deletePayment = async (req, res) => {
  try {
    await grnPaymentModel.deletePayment(req.params.id);

    res.status(200).json({
      success: true,
      message: "Payment Deleted Successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createPayment,
  getAllPayments,
  getPaymentById,
  updatePayment,
  deletePayment,
};