const branchModel = require("../models/branchModel");
const logger = require("../utils/logger");
const { logAction } = require("../utils/auditLogger");
const xlsx = require("xlsx");
const clientModel = require("../models/clientModel");
const userModel = require("../models/userModel");
// const exportBranches = async (req, res) => {
//   try {
//     const branches = await branchModel.exportBranches();

//     const exportData = branches.map((branch) => ({
//       Id: branch.id,
//       Branch_Name: branch.branch_name,
//       Branch_Code: branch.branch_code,
//       Email: branch.email,
//       Address: branch.address,
//       City: branch.city,
//       Pincode: branch.pincode,
//       Costing_Method: branch.costing_method,
//       Phone: branch.phone,
//     }));

//     const worksheet = xlsx.utils.json_to_sheet(exportData);

//     const workbook = xlsx.utils.book_new();

//     xlsx.utils.book_append_sheet(workbook, worksheet, "Branches");

//     const excelBuffer = xlsx.write(workbook, {
//       type: "buffer",
//       bookType: "xlsx",
//     });

//     const fileName = `Branches_${Date.now()}.xlsx`;

//     res.setHeader(
//       "Content-Type",
//       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
//     );

//     res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

//     return res.send(excelBuffer);
//   } catch (err) {
//     console.error("Export Branch Error:", err);

//     return res.status(500).json({
//       success: false,
//       message: err.message,
//     });
//   }
// };

const exportBranches = async (req, res) => {
  try {
    // 1. Get search and date filters from query params
    const { searchFields, fromDate, toDate, active } = req.query;

    // 2. Parse the JSON strings
    const parsedSearchFields = searchFields ? JSON.parse(searchFields) : [];

    // 3. Call model with filters
    const branches = await branchModel.exportBranches(
      parsedSearchFields,
      fromDate,
      toDate,
      active,
      req.user?.id,
      req.user?.role
    );

    // ... (rest of your existing xlsx logic remains the same)
    const exportData = branches.map((branch) => ({
      Id: branch.id,
      Branch_Name: branch.branch_name,
      Branch_Code: branch.branch_code,
      Email: branch.email,
      Address: branch.address,
      City: branch.city,
      Pincode: branch.pincode,
      Costing_Method: branch.costing_method,
      Phone: branch.phone,
    }));

    const worksheet = xlsx.utils.json_to_sheet(exportData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Branches");
    const excelBuffer = xlsx.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Branches_${Date.now()}.xlsx"`,
    );
    return res.send(excelBuffer);
  } catch (err) {
    console.error("Export Branch Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};


const createBranch = async (req, res) => {
  try {
    logger.log("[CREATE BRANCH] Input Body:", req.body);
    logger.log("[CREATE BRANCH] Auth User ID:", req.user?.id);

    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    const userDetail = await userModel.getUserById(req.user.id);

    if (!userDetail) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const result = await branchModel.createBranch(
      req.body,
      userDetail
    );

    return res.status(201).json({
      success: true,
      message: "Branch created successfully",
      branch: result,
    });
  } catch (error) {
    logger.error("CREATE BRANCH ERROR:", error);

    if (error.statusCode === 409) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.message === "Branch Name is required" ||
      error.message === "Company ID is required" ||
      error.message?.startsWith("Invalid zone_id:")
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error creating branch",
      error: error.message,
    });
  }
};


const getBranches = async (req, res) => {
  try {
    logger.log("[GET BRANCHES] Query Params:", req.query);
    logger.log("[GET BRANCHES] Auth User ID:", req.user?.id);
    logger.log("[GET BRANCHES] Auth User Role:", req.user?.role);

    if (!req.user) {
      return res.status(401).json({
        message: "Unauthorized. User information not found.",
      });
    }

    const result = await branchModel.getBranches(
      req.query,
      req.user.id,
      req.user.role
    );

    return res.status(200).json(result);
  } catch (error) {
    logger.error("GET BRANCHES ERROR:", error);

    return res.status(500).json({
      message: "Error fetching branches",
      error: error.message,
    });
  }
};
// const getBranches = async (req, res) => {
//   try {
//     logger.log("[GET BRANCHES] Query Params:", req.query);

//     const result = await branchModel.getBranches(req.query);

//     return res.status(200).json(result);
//   } catch (error) {
//     logger.error("GET BRANCHES ERROR:", error);

//     return res.status(500).json({
//       message: "Error fetching branches",
//       error: error.message,
//     });
//   }
// };

const updateBranch = async (req, res) => {
  try {
    logger.log("====================================");
    logger.log("[UPDATE BRANCH] START");

    logger.log(
      "[UPDATE BRANCH] Params ID:",
      req.params.id
    );

    logger.log(
      "[UPDATE BRANCH] Params ID Type:",
      typeof req.params.id
    );

    logger.log(
      "[UPDATE BRANCH] Input Body:",
      req.body
    );

    logger.log(
      "[UPDATE BRANCH] Auth User ID:",
      req.user?.id
    );

    logger.log(
      "[UPDATE BRANCH] Auth User ID Type:",
      typeof req.user?.id
    );

    // =====================================================
    // STEP 1: GET USER DETAILS
    // =====================================================

    logger.log(
      "[UPDATE BRANCH] STEP 1 START - getUserById"
    );

    const userDetail =
      await userModel.getUserById(
        req.user.id
      );

    logger.log(
      "[UPDATE BRANCH] STEP 1 SUCCESS - getUserById"
    );

    logger.log(
      "[UPDATE BRANCH] User Detail:",
      userDetail
    );

    // =====================================================
    // STEP 2: UPDATE BRANCH
    // =====================================================

    logger.log(
      "[UPDATE BRANCH] STEP 2 START - updateBranch"
    );

    const result =
      await branchModel.updateBranch(
        req.params.id,
        req.body,
        userDetail
      );

    logger.log(
      "[UPDATE BRANCH] STEP 2 SUCCESS - updateBranch"
    );

    logger.log(
      "[UPDATE BRANCH] Result:",
      result
    );

    // =====================================================
    // SUCCESS
    // =====================================================

    logger.log(
      "[UPDATE BRANCH] SUCCESS"
    );

    return res.status(200).json({
      message: "Branch updated successfully",
      branch: result,
    });

  } catch (error) {

    logger.error(
      "===================================="
    );

    logger.error(
      "[UPDATE BRANCH ERROR]"
    );

    logger.error(
      "Message:",
      error.message
    );

    logger.error(
      "Stack:",
      error.stack
    );

    logger.error(
      "===================================="
    );

    return res.status(500).json({
      message: "Error updating branch",
      error: error.message,
    });
  }
};

const deleteBranch = async (req, res) => {
  try {
    logger.log("[DELETE BRANCH] Params ID:", req.params.id);
    logger.log("[DELETE BRANCH] Auth User ID:", req.user?.id);

    const userDetail = await userModel.getUserById(req.user.id);
    const result = await branchModel.deleteBranch(req.params.id, userDetail);
    // const logResult = await branchModel.deleteBranchLog(
    //   req.params.id,
    //   req.user.id,
    // );
    return res.status(200).json({
      message: "Branch deleted successfully",
      branch: result,
    });
  } catch (error) {
    logger.error("DELETE BRANCH FAILED:", error);

    return res.status(500).json({
      message: "Error deleting branch",
      error: error.message,
    });
  }
};

const restoreBranch = async (req, res) => {
  try {
    logger.log("[RESTORE BRANCH] Params ID:", req.params.id);
    logger.log("[RESTORE BRANCH] Auth User ID:", req.user?.id);

    const userDetail = await userModel.getUserById(req.user.id);
    const result = await branchModel.restoreBranch(req.params.id, userDetail);

    return res.status(200).json({
      message: "Branch restored successfully",
      branch: result,
    });
  } catch (error) {
    logger.error("RESTORE BRANCH FAILED:", error);

    return res.status(500).json({
      message: "Error restoring branch",
      error: error.message,
    });
  }
};

const getBranchesByCompany = async (req, res) => {
  try {
    const rawParam = req.params.companyId || "";

    const companyId =
      req.query.company_id ||
      req.query.companyId ||
      (rawParam !== "0" ? rawParam : null);

    console.log("Requested company IDs:", companyId);

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "Company ID is required",
      });
    }

    const result =
      await branchModel.getBranchesByCompany(companyId);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    logger.error("GET BRANCHES BY COMPANY ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  }
};

module.exports = {
  createBranch,
  getBranches,
  updateBranch,
  deleteBranch,
  restoreBranch,
  exportBranches,
  getBranchesByCompany,
};
