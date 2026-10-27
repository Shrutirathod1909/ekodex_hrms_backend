const companyModel = require("../models/companyModel");
const logger = require("../utils/logger");
const xlsx = require("xlsx");

async function createCompany(req, res) {
  try {
    logger.log("[CREATE COMPANY] Input Body:", req.body);
    logger.log("[CREATE COMPANY] File:", req.file?.originalname || "No file");
    logger.log("[CREATE COMPANY] Auth User ID:", req.user?.id);
    const result = await companyModel.createCompany(
      req.body,
      req.file,
      req.user,
    );

    return res.status(201).json({
      success: true,
      message: "Company created successfully",
      company: result,
    });
  } catch (err) {
    logger.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}
// async function getCompanies(req, res) {
//   try {
//     logger.log("[GET COMPANIES] Query Params:", req.query);
//     logger.log("[GET COMPANIES] Auth User ID:", req.user?.id);

//     const result = await companyModel.getCompanies(req.query);

//     return res.status(200).json({
//       success: true,
//       count: result.length,
//       data: result,
//     });
//   } catch (err) {
//     logger.error(err);

//     return res.status(500).json({
//       success: false,
//       message: "Server error",
//       error: err.message,
//     });
//   }
// }
async function getCompanies(req, res) {
  try {
    logger.log("[GET COMPANIES] Query Params:", req.query);
    logger.log("[GET COMPANIES] Auth User ID:", req.user?.id);
    logger.log("[GET COMPANIES] Auth User Role:", req.user?.role);

    const result = await companyModel.getCompanies(
      req.query,
      req.user.id,
      req.user.role
    );

    return res.status(200).json({
      success: true,
      count: result.length,
      data: result,
    });
  } catch (err) {
    logger.error(err);

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
}

async function getAllBranches(req, res) {
  try {
    logger.info("========== GET ALL BRANCHES START ==========");

    const { client_id } = req.params;

    if (!client_id) {
      return res.json({
        success: false,
        message: "client_id is required",
        data: [],
      });
    }

    const branches = await companyModel.getAllBranches(client_id);

    return res.json({
      success: true,
      message: branches.length
        ? "Branches fetched successfully"
        : "No branches found",
      data: branches,
    });
  } catch (err) {
    logger.error("GET BRANCHES ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
      data: [],
    });
  } finally {
    logger.info("========== GET ALL BRANCHES END ==========");
  }
}

async function getAllCompanies(req, res) {
  try {
    logger.log("[GET ALL COMPANIES] Auth User ID:", req.user?.id);

    const companies = await companyModel.getAllCompanies(req.user);

    return res.json({
      success: true,
      message: companies.length
        ? "Companies fetched successfully"
        : "No companies found",
      data: companies,
    });
  } catch (err) {
    logger.error("getAllCompanies Error:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
      data: [],
    });
  }
}

async function getAllottedCompanies(req, res) {
  try {
    logger.log("[GET ALLOTTED COMPANIES] Auth User ID:", req.user?.id);

    const companies = await companyModel.getAllottedCompanies(req.user);

    return res.status(200).json({
      success: true,
      data: companies,
    });
  } catch (err) {
    logger.error("getAllottedCompanies Error:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
      data: [],
    });
  }
}

async function updateCompany(req, res) {
  try {
    logger.log("[UPDATE COMPANY] Params ID:", req.params.id);
    logger.log("[UPDATE COMPANY] Input Body:", req.body);
    logger.log("[UPDATE COMPANY] File:", req.file?.originalname || "No file");
    logger.log("[UPDATE COMPANY] Auth User ID:", req.user?.id);

    const result = await companyModel.updateCompany(
      req.params.id,
      req.body,
      req.file,
      req.user,
    );

    return res.status(200).json({
      success: true,
      message: "Company updated successfully",
      company: result,
    });
  } catch (err) {
    logger.error(err);

    if (err.message === "Company not found") {
      return res.status(404).json({
        success: false,
        message: err.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
}

async function deleteCompany(req, res) {
  try {
    logger.log("[DELETE COMPANY] Params ID:", req.params.id);
    logger.log("[DELETE COMPANY] Auth User ID:", req.user?.id);

    await companyModel.deleteCompany(req.params.id, req.user.id, req.user);

    return res.status(200).json({
      success: true,
      message: "Company deleted successfully",
    });
  } catch (err) {
    logger.error("DELETE COMPANY ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
}

async function restoreCompany(req, res) {
  try {
    logger.log("[RESTORE COMPANY] Params ID:", req.params.id);
    logger.log("[RESTORE COMPANY] Auth User ID:", req.user?.id);

    await companyModel.restoreCompany(req.params.id, req.user);

    return res.status(200).json({
      success: true,
      message: "Company restored successfully",
    });
  } catch (err) {
    logger.error("RESTORE COMPANY ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
}
async function addBankDetails(req, res) {
  try {
    logger.log("[ADD BANK DETAILS] Company ID:", req.params.id);
    logger.log("[ADD BANK DETAILS] Input Body:", req.body);
    logger.log("[ADD BANK DETAILS] Auth User ID:", req.user?.id);

    const result = await companyModel.addBankDetails(
      req.params.id,
      req.body,
      req.user,
    );

    return res.status(result.statusCode).json(result.response);
  } catch (err) {
    logger.error("ADD BANK DETAILS ERROR =>", err);

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
}

async function getCompanyBankDetails(req, res) {
  try {
    logger.log("[GET BANK DETAILS] Company ID:", req.params.id);

    const result = await companyModel.getCompanyBankDetails(req.params.id);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    logger.error("GET BANK DETAILS ERROR =>", err);

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
}


async function exportCompanies(req, res) {
  try {
    const { searchFields, fromDate, toDate, active } = req.query;

    const parsedSearchFields = searchFields
      ? JSON.parse(searchFields)
      : [];

    // Default Active; allow only 0 or 1
    const activeStatus =
      String(active) === "1" ? 1 : 0;

    const companies = await companyModel.exportCompanies(
      parsedSearchFields,
      fromDate,
      toDate,
      req.user,
      activeStatus
    );

    const exportData = companies.map((company) => ({
      Id: company.id,
      Company_Name: company.company_name,
      Email_ID: company.email_id,
      Address: company.address,
      Phone: company.phone,
      City: company.city,
      Country: company.country,
      Pincode: company.pincode,
      State: company.state,
      Currency: company.currency,
      Contactable_Person: company.contactable_person,
      Pancard_No: company.pancard_no,
      Registration_No: company.registration_no,
      GST_No: company.gst_no,
      Swift_AC_No: company.swift_ac_no,
      Website: company.website,
    }));

    const worksheet = xlsx.utils.json_to_sheet(exportData);
    const workbook = xlsx.utils.book_new();

    xlsx.utils.book_append_sheet(
      workbook,
      worksheet,
      "Companies"
    );

    const excelBuffer = xlsx.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    const statusName =
      activeStatus === 0 ? "Active" : "Inactive";

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Companies_${statusName}_${Date.now()}.xlsx"`
    );

    return res.send(excelBuffer);
  } catch (err) {
    console.error("Export Companies Error:", err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

module.exports = {
  createCompany,
  getCompanies,
  getAllBranches,
  getAllCompanies,
  getAllottedCompanies,
  updateCompany,
  deleteCompany,
  restoreCompany,
  addBankDetails,
  getCompanyBankDetails,
  exportCompanies,
};
