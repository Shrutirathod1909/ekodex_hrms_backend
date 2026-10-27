
const authModel = require("../models/authModel");
const logger = require("../utils/logger");
const { getPool, sql } = require("../config/db");
// ========================================
// LOGIN
// ========================================
const login = async (req, res) => {
  try {
    const result = await authModel.login(req.body);

    if (!result.success) {
      return res.status(result.statusCode || 400).json({
        success: false,
        msg: result.message,
      });
    }

    return res.status(200).json({
      success: true,
      token: result.token,
      user: result.user,
        selectedCompanyId: result.selectedCompanyId ?? null,
  selectedBranchId: result.selectedBranchId ?? null,
    });
  } catch (err) {
    logger.error("LOGIN ERROR:", err);

    return res.status(500).json({
      success: false,
      msg: "Server error",
    });
  }
};

// ========================================
// GET COMPANIES BY EMAIL
// ========================================
const getCompaniesByEmail = async (req, res) => {
  try {
     await getPool();
    const email = String(req.query.email || "").trim();

    if (!email) {
      return res.status(400).json({
        success: false,
        isSuperAdmin: false,
        data: [],
        branches: [],
        selectedBranchId: null,
        msg: "Email is required",
      });
    }

    const result = await authModel.getCompaniesByEmail(email);

    if (!result.user) {
      return res.status(404).json({
        success: false,
        isSuperAdmin: false,
        user: null,
        data: [],
        branches: [],
        selectedBranchId: null,
        msg: result.msg || "User not found",
      });
    }

    if (result.msg === "User account is inactive") {
      return res.status(403).json({
        success: false,
        isSuperAdmin: false,
        user: {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
          superadmin_status: result.user.superadmin_status,
        },
        data: [],
        branches: [],
        selectedBranchId: null,
        msg: result.msg,
      });
    }

 return res.status(200).json({
  success: true,
  isSuperAdmin: result.isSuperAdmin,
  user: {
    id: result.user.id,
    email: result.user.email,
    role: result.user.role,
    superadmin_status: result.user.superadmin_status,
    login_company: result.user.login_company,
  },
  data: result.companies || [],
  branches: result.branches || [],
  selectedCompanyId: result.selectedCompanyId ?? null,
  selectedBranchId: result.selectedBranchId ?? null,
  msg: result.msg,
});
  } catch (error) {
    logger.error("GET COMPANIES BY EMAIL ERROR:", error);

    return res.status(500).json({
      success: false,
      isSuperAdmin: false,
      data: [],
      branches: [],
      selectedBranchId: null,
      msg: "Server error",
    });
  }
};

module.exports = {
  login,
  getCompaniesByEmail,
};
