// ===============================
// controllers/single_pay_slip_controller.js
// ===============================

const {
  fetchSinglePaySlip,
} = require("../models/single_pay_silp_model");


const getSinglePaySlip = async (req, res) => {
  try {
    const { emp_id } = req.params;
    const { month, year } = req.query;

    if (!emp_id || !month || !year) {
      return res.status(400).json({
        success: false,
        message: "Employee ID, Month and Year required",
      });
    }

    const employeeId = Number(emp_id);
    const monthNumber = Number(month);
    const yearNumber = Number(year);

    if (
      !Number.isInteger(employeeId) ||
      employeeId <= 0 ||
      !Number.isInteger(monthNumber) ||
      monthNumber < 1 ||
      monthNumber > 12 ||
      !Number.isInteger(yearNumber) ||
      yearNumber < 1900
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid Employee ID, Month or Year",
      });
    }

    const result = await fetchSinglePaySlip(
      employeeId,
      monthNumber,
      yearNumber
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Payslip Data Not Found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Single Payslip Data",
      data: result,
    });
  } catch (error) {
    console.error("PAYSLIP ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};


module.exports = {
  getSinglePaySlip,
};