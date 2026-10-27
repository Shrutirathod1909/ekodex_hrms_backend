const EmployeeModel = require("../models/employeeWiseUniformIssued.model");

// EMPLOYEES
const getEmployeeList = async (req, res) => {
  try {
    const data = await EmployeeModel.getEmployees();

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Error fetching employees",
    });
  }
};

// UNIFORM DATA (FILTER ENABLED)
const getAllUniformData = async (req, res) => {
  try {
    const data = await EmployeeModel.getAllUniformData(req.query);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Error fetching uniform data",
    });
  }
};

module.exports = {
  getEmployeeList,
  getAllUniformData,
};