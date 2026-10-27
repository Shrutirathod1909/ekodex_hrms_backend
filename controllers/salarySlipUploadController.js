// ===============================
// controllers/salarySlipUploadController.js
// ===============================

const {
  saveSalarySlip,
  getSalarySlipByEmpMonthYear,
} = require("../models/salarySlipUploadModel");

const uploadSalarySlip = async (req, res) => {
  try {
    console.log("FILE =>", req.file);

    console.log("BODY =>", req.body);

    // ======================
    // VALIDATION
    // ======================

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const { emp_id, month, year } = req.body;

    if (!emp_id || !month || !year) {
      return res.status(400).json({
        success: false,
        message: "emp_id, month, year required",
      });
    }

    // ======================
    // FILE PATH
    // ======================

    const filePath = `salary_slip/${req.file.filename}`;

    // ======================
    // SAVE TO DB
    // ======================

    await saveSalarySlip(Number(emp_id), Number(month), Number(year), filePath);

    // ======================
    // SUCCESS
    // ======================

    return res.status(200).json({
      success: true,

      message: "Payslip Uploaded Successfully",

      path: filePath,

      full_url: `${process.env.BASE_URL}/${filePath}`,
    });
  } catch (error) {
    console.log("UPLOAD ERROR =>", error);

    return res.status(500).json({
      success: false,

      message: error.message,

      error: error,
    });
  }
};

const getSalarySlip = async (req, res) => {
  try {
    const { emp_id, month, year } = req.params;

    const data = await getSalarySlipByEmpMonthYear(
      Number(emp_id),
      Number(month),
      Number(year),
    );

    // ======================
    // NOT FOUND
    // ======================

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,

        message: "Payslip not found",
      });
    }

    // ======================
    // SUCCESS
    // ======================

    const path = data[0].salary_slip_img_path;

    return res.json({
      success: true,

      path: path,

      url: `${process.env.BASE_URL}/${path}`,
    });
  } catch (error) {
    console.log("GET PAYSLIP ERROR =>", error);

    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

module.exports = { uploadSalarySlip, getSalarySlip };
