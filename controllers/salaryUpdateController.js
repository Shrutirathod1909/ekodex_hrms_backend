const salaryUpdateModel = require("../models/salaryUpdateModel");

// ==========================================
// UPDATE EMPLOYEE SALARY
// ==========================================
const updateEmployeeSalary = async (req, res) => {
  try {
    const {
      employeeId,

      // Salary Template
      salary_template_id,
      salary_template,

      gross_salary,
      gross_salary_type,

      basic_salary,
      basic_salary_type,

      sal_from_date,
      sal_to_date,

      da_term,
      basic_term,

      perday_salary,
    } = req.body;

    // ==========================================
    // VALIDATION
    // ==========================================

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "Employee ID is required",
      });
    }

    // ==========================================
    // USER ID
    // ==========================================

    const userId = req.user?.id || req.user?.userId || null;

    // ==========================================
    // DATA
    // ==========================================

    const data = {
      employeeId,

      // Salary Template
      salary_template_id,
      salary_template,

      // Salary
      gross_salary,
      gross_salary_type,

      basic_salary,
      basic_salary_type,

      sal_from_date,
      sal_to_date,

      da_term,
      basic_term,

      perday_salary,
    };

    // ==========================================
    // UPDATE
    // ==========================================

    const updatedEmployee = await salaryUpdateModel.updateEmployeeSalary(
      data,
      userId,
    );

    return res.status(200).json({
      success: true,

      message: "Employee salary updated successfully",

      data: updatedEmployee,
    });
  } catch (error) {
    console.error("Salary Update Controller Error:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to update employee salary",

      error: error.message,
    });
  }
};

// ==========================================
// GET EMPLOYEE SALARY
// ==========================================
const getEmployeeSalary = async (req, res) => {
  try {
    const { employeeId } = req.params;

    if (!employeeId) {
      return res.status(400).json({
        success: false,

        message: "Employee ID is required",
      });
    }

    const employeeSalary =
      await salaryUpdateModel.getEmployeeSalary(employeeId);

    if (!employeeSalary) {
      return res.status(404).json({
        success: false,

        message: "Employee not found",
      });
    }

    return res.status(200).json({
      success: true,

      data: employeeSalary,
    });
  } catch (error) {
    console.error("Get Employee Salary Error:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to fetch employee salary",

      error: error.message,
    });
  }
};

module.exports = {
  updateEmployeeSalary,
  getEmployeeSalary,
};
