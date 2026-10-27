const xlsx = require("xlsx");

const employeeTypeModel = require("../models/employeeTypeModel");

function formatDateForExcel(val) {
  if (!val) return "";

  const d = new Date(val);

  if (isNaN(d.getTime())) {
    return val;
  }

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();

  return `${dd}-${mm}-${yyyy}`;
}

// ==========================================
// GET ALL
// ==========================================


const getAllEmployeeTypes = async (req, res) => {
  try {
    const {
      searchFields,
      fromDate,
      toDate,
    } = req.query;

    const user = req.user;

    if (!user || !user.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Please login again.",
      });
    }

    const data = await employeeTypeModel.getAllEmployeeTypes({
      searchFields,
      fromDate,
      toDate,

      userId: user.id,
      role: user.role,
      is_superadmin: user.is_superadmin,

      company_id: user.company_id,
      branch_id: user.branch_id,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Get Employee Types Error:", error);

    const statusCode =
      error.message === "Unauthorized role" ||
      error.message === "Admin company_id not found" ||
      error.message === "Admin branch_id not found"
        ? 403
        : 500;

    return res.status(statusCode).json({
      success: false,
      message:
        error.message || "Failed to get employee types",
    });
  }
};


// ==========================================
// CREATE
// ==========================================

const createEmployeeType = async (req, res) => {
  try {
    const {
      emp_type,
      leave_eligibility_days,
      branch_id,
      company_id,
    } = req.body;

    // ==========================================
    // BASIC VALIDATION
    // ==========================================

    if (!emp_type || !emp_type.trim()) {
      return res.status(400).json({
        success: false,
        message: "Employee type is required",
      });
    }

    if (
      leave_eligibility_days === undefined ||
      leave_eligibility_days === null ||
      leave_eligibility_days === "" ||
      !Number.isInteger(Number(leave_eligibility_days)) ||
      Number(leave_eligibility_days) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Leave eligibility days must be a positive number",
      });
    }

    // ==========================================
    // DETERMINE COMPANY
    // ==========================================

    const role = String(req.user?.role || "")
      .trim()
      .toUpperCase();

    const isSuperAdmin =
      req.user?.is_superadmin === true ||
      req.user?.is_superadmin === 1 ||
      role === "SUPER ADMIN" ||
      role === "SUPERADMIN";

    let finalCompanyId;

    if (isSuperAdmin) {
      // SuperAdmin -> frontend selected company
      finalCompanyId = company_id;
    } else {
      // Admin -> logged-in user's company
      finalCompanyId = req.user?.company_id;
    }

    // ==========================================
    // COMPANY REQUIRED
    // ==========================================

    if (
      finalCompanyId === undefined ||
      finalCompanyId === null ||
      finalCompanyId === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Company is required",
      });
    }

    // ==========================================
    // DUPLICATE CHECK
    // Same employee type in same company
    // is NOT allowed
    // ==========================================

    const exists =
      await employeeTypeModel.checkEmployeeTypeExists(
        emp_type.trim(),
        finalCompanyId
      );

    if (exists) {
      return res.status(400).json({
        success: false,
        message: `Employee type "${emp_type.trim()}" already exists in this company`,
      });
    }

    // ==========================================
    // CREATE
    // ==========================================

    await employeeTypeModel.createEmployeeType({
      emp_type: emp_type.trim(),

      leave_eligibility_days:
        Number(leave_eligibility_days),

      userId: req.user.id,
      role: req.user.role,
      is_superadmin: req.user.is_superadmin,

      // Logged-in user's company/branch
      user_company_id: req.user.company_id,
      user_branch_id: req.user.branch_id,

      // SuperAdmin selected company/branch
      selected_company_id: company_id,
      selected_branch_id: branch_id,
    });

    return res.status(201).json({
      success: true,
      message: "Employee type created successfully",
    });

  } catch (error) {
    console.error(
      "Create Employee Type Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Server error creating employee type",
    });
  }
};
// ==========================================
// UPDATE
// ==========================================



const updateEmployeeType = async (req, res) => {
  try {
    // ============================================================
    // 1. GET ID
    // ============================================================
    const id = Number(req.params.id);

    // ============================================================
    // 2. GET BODY
    // ============================================================
    const {
      emp_type,
      leave_eligibility_days,
      company_id,
      branch_id,
    } = req.body || {};

    // ============================================================
    // 3. DEBUG REQUEST
    // ============================================================
    console.log("======================================");
    console.log("UPDATE EMPLOYEE TYPE REQUEST");
    console.log("PARAMS:", req.params);
    console.log("BODY:", req.body);
    console.log("USER:", req.user);
    console.log("======================================");

    // ============================================================
    // 4. VALIDATE ID
    // ============================================================
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee type ID",
      });
    }

    // ============================================================
    // 5. VALIDATE EMPLOYEE TYPE
    // ============================================================
    if (
      typeof emp_type !== "string" ||
      !emp_type.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Employee type is required",
      });
    }

    // ============================================================
    // 6. VALIDATE LEAVE DAYS
    // ============================================================
    if (
      leave_eligibility_days === undefined ||
      leave_eligibility_days === null ||
      String(leave_eligibility_days).trim() === "" ||
      !Number.isInteger(
        Number(leave_eligibility_days)
      ) ||
      Number(leave_eligibility_days) < 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Leave eligibility days must be a non-negative integer",
      });
    }

    // ============================================================
    // 7. AUTH CHECK
    // ============================================================
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    // ============================================================
    // 8. ROLE
    // ============================================================
    const role = String(req.user.role || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");

    const isSuperAdmin =
      req.user.is_superadmin === true ||
      req.user.is_superadmin === 1 ||
      role === "SUPERADMIN" ||
      Number(req.user.id) === 1;

    const isAdmin = role === "ADMIN";

    // ============================================================
    // 9. ROLE VALIDATION
    // ============================================================
    if (!isSuperAdmin && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized role",
      });
    }

    // ============================================================
    // 10. DETERMINE COMPANY / BRANCH
    // ============================================================
    let finalCompanyId;
    let finalBranchId;

    if (isSuperAdmin) {
      // ----------------------------------------------------------
      // SUPER ADMIN
      // ----------------------------------------------------------
      // Company + Branch frontend मधून येतील.
      // ----------------------------------------------------------

      finalCompanyId = company_id;
      finalBranchId = branch_id;

      if (
        finalCompanyId === undefined ||
        finalCompanyId === null ||
        String(finalCompanyId).trim() === ""
      ) {
        return res.status(400).json({
          success: false,
          message: "Company is required",
        });
      }

      if (
        finalBranchId === undefined ||
        finalBranchId === null ||
        String(finalBranchId).trim() === ""
      ) {
        return res.status(400).json({
          success: false,
          message: "Branch is required",
        });
      }
    } else {
      // ----------------------------------------------------------
      // ADMIN
      // ----------------------------------------------------------
      // Admin फक्त स्वतःच्या company मध्ये update करू शकतो.
      // Branch access restriction नाही.
      // ----------------------------------------------------------

      finalCompanyId =
        req.user.company_id;

      finalBranchId =
        req.user.branch_id;

      if (
        finalCompanyId === undefined ||
        finalCompanyId === null ||
        String(finalCompanyId).trim() === ""
      ) {
        return res.status(400).json({
          success: false,
          message: "Admin company not found",
        });
      }
    }

    // ============================================================
    // 11. NORMALIZE VALUES
    // ============================================================
    const employeeTypeName =
      emp_type.trim();

    const leaveDays =
      Number(leave_eligibility_days);

    // ============================================================
    // 12. DUPLICATE CHECK
    // ============================================================
    const exists =
      await employeeTypeModel.checkEmployeeTypeExists(
        employeeTypeName,
        finalCompanyId,
        id
      );

    if (exists) {
      return res.status(400).json({
        success: false,
        message:
          "Same employee type already exists in this company",
      });
    }

    // ============================================================
    // 13. DEBUG FINAL DATA
    // ============================================================
    console.log("======================================");
    console.log("UPDATE EMPLOYEE TYPE");
    console.log({
      id,

      userId:
        req.user.id,

      role:
        req.user.role,

      isSuperAdmin,

      isAdmin,

      finalCompanyId,

      finalBranchId,

      emp_type:
        employeeTypeName,

      leave_eligibility_days:
        leaveDays,
    });
    console.log("======================================");

    // ============================================================
    // 14. UPDATE MODEL
    // ============================================================
    const result =
      await employeeTypeModel.updateEmployeeType({
        id,

        emp_type:
          employeeTypeName,

        leave_eligibility_days:
          leaveDays,

        userId:
          req.user.id,

        // Logged-in user's company
        user_company_id:
          req.user.company_id,

        // Logged-in user's branch
        user_branch_id:
          req.user.branch_id,

        // Final selected/allowed company
        selected_company_id:
          finalCompanyId,

        // Final selected/allowed branch
        selected_branch_id:
          finalBranchId,
      });

    // ============================================================
    // 15. SUCCESS
    // ============================================================
    return res.status(200).json({
      success: true,

      message:
        result?.message ||
        "Employee type updated successfully",
    });

  } catch (error) {
    // ============================================================
    // ERROR LOG
    // ============================================================
    console.error(
      "Update Employee Type Error:",
      error
    );

    // ============================================================
    // CLIENT ERRORS
    // ============================================================
    const clientErrors = [
      "User not found",
      "Unauthorized role",

      "Company is required",
      "Branch is required",

      "Admin company not found",

      "Employee type is required",

      "Invalid employee type ID",

      "Employee type not found, inactive, or you do not have access",

      "Employee type not found or you do not have access to this company",

      "Valid leave eligibility days are required",

      "Leave eligibility days must be a non-negative integer",

      "Same employee type already exists in this company",
    ];

    // ============================================================
    // KNOWN ERROR
    // ============================================================
    if (
      clientErrors.includes(error.message)
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    // ============================================================
    // UNKNOWN ERROR
    // ============================================================
    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Failed to update employee type",
    });
  }
};




// ==========================================
// DELETE
// ==========================================

const deleteEmployeeType = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee type ID",
      });
    }

    await employeeTypeModel.deleteEmployeeType({
      id,
      userId: req.user.id,
    });

    res.json({
      success: true,
      message: "Employee Type deleted successfully",
    });
  } catch (error) {
    console.error("Delete Employee Type Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete employee type",
    });
  }
};

// ==========================================
// EXPORT EXCEL
// ==========================================


const exportEmployeeTypes = async (req, res) => {
  try {
    const {
      searchFields,
      fromDate,
      toDate,
    } = req.query;

    const user = req.user;

    if (!user || !user.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Please login again.",
      });
    }

    // Pass logged-in user's role and company/branch details
    const rows = await employeeTypeModel.getAllEmployeeTypes({
      searchFields,
      fromDate,
      toDate,

      userId: user.id,
      role: user.role,
      is_superadmin: user.is_superadmin,

      company_id: user.company_id,
      branch_id: user.branch_id,
    });

    // Excel headers
    const isSuperAdmin =
      user.is_superadmin === true ||
      String(user.is_superadmin).toLowerCase() === "true" ||
      String(user.role || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "") === "SUPERADMIN";

    const headers = isSuperAdmin
      ? [
          "Company",
          "Branch",
          "Employee Type",
          "Leave Eligibility Days",
          "Created On",
        ]
      : [
          "Employee Type",
          "Leave Eligibility Days",
          "Created On",
        ];

    // Excel rows
    const excelRows = rows.map((e) =>
      isSuperAdmin
        ? [
            e.company_name || "",
            e.branch_name || "",
            e.emp_type || "",
            e.leave_eligibility_days ?? "",
            formatDateForExcel(e.created_on),
          ]
        : [
            e.emp_type || "",
            e.leave_eligibility_days ?? "",
            formatDateForExcel(e.created_on),
          ]
    );

    const worksheet = xlsx.utils.aoa_to_sheet([
      headers,
      ...excelRows,
    ]);

    const workbook = xlsx.utils.book_new();

    xlsx.utils.book_append_sheet(
      workbook,
      worksheet,
      "EmployeeTypes"
    );

    const randomNumber = Math.floor(
      1000000000 + Math.random() * 9000000000
    );

    const fileName = `EmployeeTypes_${randomNumber}.xlsx`;

    const excelBuffer = xlsx.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    return res.send(excelBuffer);
  } catch (error) {
    console.error("Export Employee Types Error:", error);

    return res.status(
      error.message === "Unauthorized role" ? 403 : 500
    ).json({
      success: false,
      message:
        error.message || "Failed to download Excel",
    });
  }
};

module.exports = {
  getAllEmployeeTypes,
  createEmployeeType,
  updateEmployeeType,
  deleteEmployeeType,
  exportEmployeeTypes,
};
