const userModel = require("../models/userModel");
const roleModel = require("../models/roleModel");
const logger = require("../utils/logger");
const xlsx = require("xlsx");
const employeeModel = require("../models/employeeModel");
// ================= GET USERS =================
// exports.getUsers = async (req, res) => {
//   try {
//     logger.log("[GET USERS] Query Params:", req.query);
//     logger.log("[GET USERS] Auth User ID:", req.user?.id);

//     const result = await userModel.getUsers(req.query);

//     return res.status(200).json(result);
//   } catch (error) {
//     logger.error("GET USERS ERROR:", error);
//     return res.status(500).json({
//       message: "Error fetching users",
//       error: error.message,
//     });
//   }
// };

exports.getUsers = async (req, res) => {
  try {
    logger.log("[GET USERS] Query Params:", req.query);
    logger.log("[GET USERS] Auth User ID:", req.user?.id);
    logger.log("[GET USERS] Auth User Role:", req.user?.role);

    if (!req.user) {
      return res.status(401).json({
        message: "Unauthorized. User information not found.",
      });
    }

    const result = await userModel.getUsers(
      req.query,
      req.user.id,
      req.user.role
    );

    return res.status(200).json(result);
  } catch (error) {
    logger.error("GET USERS ERROR:", error);

    return res.status(500).json({
      message: "Error fetching users",
      error: error.message,
    });
  }
};

exports.getUserData = async (req, res) => {
  try {
    const userData = req.user;

    console.log("userData", userData);

    return res.status(200).json({
      success: true,
      user: userData,
    });
  } catch (error) {
    console.log(error);
    logger.error("GET USERS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Error fetching user",
      error: error.message,
    });
  }
};

exports.updateClientSites = async (req, res) => {
  try {
    const userId = req.params.id;

    const { client_id, site_id, client_name, site_name } = req.body;

    await userModel.updateClientSites(
      userId,
      {
        client_id,
        site_id,
        client_name,
        site_name,
      },
      req.user,
    );

    res.status(200).json({
      success: true,
      message: "Client & Sites updated successfully",
    });
  } catch (error) {
    console.error("updateClientSites:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ================= GET USER BY ID =================
exports.getUserById = async (req, res) => {
  try {
    const user = await userModel.getUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.status(200).json(user);
  } catch (error) {
    logger.error("GET USER BY ID ERROR:", error);
    return res.status(500).json({
      message: "Error fetching user",
      error: error.message,
    });
  }
};
exports.createUser = async (req, res) => {
  try {
    logger.log("[CREATE USER] Input Body:", req.body);
    logger.log("[CREATE USER] File:", req.file?.originalname || "No file");
    logger.log("[CREATE USER] Auth User ID:", req.user?.id);

    const result = await userModel.createUser(req.body, req.file, req.user);
   if (
  req.body?.is_employee === true ||
  req.body?.is_employee === 'true' ||
  req.body?.is_employee === 1 ||
  req.body?.is_employee === '1'
) {
  req.body = {
    ...req.body,
    ...result,

    // IMPORTANT:
    // users मधील role employee.rank मध्ये जाईल
    rank: req.body.role || null,
  };

  const emp = await createEmployee(req);
}

    return res.status(201).json(result);
  } catch (error) {
    logger.error("CREATE USER ERROR:", error);
    return res.status(500).json({
      message: error.message || "Error creating user",
    });
  }
};

const safeDate = (val) => {
  return val && val !== "" ? new Date(val) : null;
};

const createEmployee = async (req) => {
  try {
    const d = req.body;

    // ======================================
    // USER VALIDATION
    // ======================================

    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    const user = req.user;

    // ======================================
    // FULL NAME
    // ======================================

    const emp_full_name =
      `${d.first_name || ""} ${d.middle_name || ""} ${d.last_name || ""}`.trim();

    // ======================================
    // EMPLOYEE CODE
    // ======================================

    const nextId = await employeeModel.getNextEmployeeCode();

    const employeeCode =
      d.emp_code && d.emp_code.trim() !== ""
        ? d.emp_code
        : `E${String(nextId).padStart(3, "0")}`;

    // ======================================
    // EMERGENCY CONTACTS
    // ======================================

    const emergencyContacts =
      typeof d.emergencyContacts === "string"
        ? JSON.parse(d.emergencyContacts)
        : d.emergencyContacts || [];

    // ======================================
    // FINAL DATA OBJECT
    // ======================================

    const employeeData = {
      // employee_code: employeeCode,
      employee_code: null,

      initial: d.initial || null,
      first_name: d.first_name || null,
      middle_name: d.middle_name || null,
      last_name: d.last_name || null,
      emp_full_name,

      gender: d.gender || null,

      dob: safeDate(d.dob),

      date_of_joining: safeDate(d.date_of_joining),

      reg_date: safeDate(d.reg_date),

      address: d.address || null,
      city: d.city || null,
      state: d.state || null,
      pincode: d.pincode || null,
      country: d.country || null,

      phone1: d.phone1 || null,
      phone2: d.phone2 || null,
      email_id: d.email_id || d.email || null,

      contact_person: JSON.stringify(
        emergencyContacts.map((x) => x.contact_person),
      ),

      contact_mobile: JSON.stringify(emergencyContacts.map((x) => x.mobile)),

      contact_relation: JSON.stringify(
        emergencyContacts.map((x) => x.relation),
      ),

      contact_email: JSON.stringify(emergencyContacts.map((x) => x.email)),

      p_address: d.p_address || null,
      p_city: d.p_city || null,
      p_state: d.p_state || null,
      p_pincode: d.p_pincode || null,
      p_country: d.p_country || null,
      p_phone1: d.p_phone1 || null,
      p_phone2: d.p_phone2 || null,

      marital_status: d.marital_status || null,

      mrg_date: safeDate(d.mrg_date),

      cast: d.cast || null,
      category: d.category || null,
      native_place: d.native_place || null,
      blood_group: d.blood_group || null,
      father_name: d.father_name || null,

      native_address: d.native_address || null,
      native_city: d.native_city || null,
      native_state: d.native_state || null,
      native_pincode: d.native_pincode || null,
      native_country: d.native_country || null,
      driving_license: d.driving_license || null,
      pancard_no: d.pancard_no || null,
      aadhar_no: d.aadhar_no || null,
      passport_no: d.passport_no || null,
      uan_no: d.uan_no || null,
      passport_valid_date: safeDate(d.passport_valid_date),

      pf_no: d.pf_no || null,
      esis_no: d.esis_no || null,
      esis_date: safeDate(d.esis_date),

      uan_date: safeDate(d.uan_date),

      lang1: d.lang1 || null,
      lang2: d.lang2 || null,
      lang3: d.lang3 || null,
      lang4: d.lang4 || null,
      lang5: d.lang5 || null,

      hobby1: d.hobby1 || null,
      hobby2: d.hobby2 || null,
      hobby3: d.hobby3 || null,
      hobby4: d.hobby4 || null,

      bank_name: d.bank_name || null,
      account_no: d.account_no || null,
      bank_address: d.bank_address || null,
      bank_city: d.bank_city || null,
      bank_state: d.bank_state || null,
      bank_ifsc: d.bank_ifsc || null,
      bank_micr: d.bank_micr || null,

      cancelled_cheque_image: d.cancelled_cheque_image || null,
      ac_holder_name: d.ac_holder_name || null,
      card_no: d.card_no || null,
      branch_id: d.branch_id || null,
      company_id: d.company_id || null,
      client_id: parseArrayToString(d.client_id) || null,
      site_id: parseArrayToString(d.site_id) || d.siteId || null,
      site_name: parseArrayToString(d.site_name) || null,
      client_name: parseArrayToString(d.client_name) || null,
      department: d.department || null,
    rank: d.role || d.rank || null,
      reporting_manager: d.reporting_manager || null,
      reporting_user: d.reporting_user || null,
      salary_template: d.salary_template || null,
      gross_salary: d.gross_salary || null,
      gross_salary_type: d.gross_salary_type || null,
      basic_salary: d.basic_salary || null,
      basic_salary_type: d.basic_salary_type || null,
      sal_from_date: d.sal_from_date || null,
      sal_to_date: d.sal_to_date || null,
      pf_applicable: d.pf_applicable || null,
      da_term: d.da_term || null,
      basic_term: d.basic_term || null,
      gang_name: d.gang_name || null,
      perday_salary: d.perday_salary || null,
      migrant_status: d.migrant_status || null,
      separation_type: d.separation_type || null,
      separate_reason: d.separate_reason || null,
      date_of_separation: safeDate(d.date_of_separation),

      notice_period: d.notice_period || null,
      last_working_date_sp: safeDate(d.last_working_date_sp),

      handover_given_to: d.handover_given_to || null,
      password: d.password || null,
      user_id: d.user_id || null,
      doc_name: d.doc_name || null,
      client_code: d.client_code || null,
      active: d.active || "0",

      em_status: d.em_status || "WORKING",
      emp_stages: d.emp_stages || "PENDING",
      
      employee_logo: d.profile_image || null,

      created_by: d.created_by || String(req.user.id),
      created_by_name: d.created_by_name || user.first_name || user.fullname || user.name || "System",
      created_on: d.created_on || null,

      modified_by: d.modified_by || null,
      modified_by_name: d.modified_by_name || null,
      modified_on: d.modified_on || null,

      disabled_by: d.disabled_by || null,
      disabled_by_name: d.disabled_by_name || null,
      disabled_on: d.disabled_on || null,
    };

    // ======================================
    // INSERT
    // ======================================

    const inserted = await userModel.createEmployee(employeeData);

    const { logAction } = require("../utils/auditLogger");
    await logAction("employee", inserted.id, "CREATE");

    return {
      employeeId: inserted.id,
      employeeCode: inserted.employee_code,
      emp_full_name,
    };
  } catch (err) {
    logger.error(err);

    throw err;
  }
};

const parseArrayToString = (value) => {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value.map(String).join(",").replace(/"/g, "");
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(String).join(",").replace(/"/g, "");
      }
    } catch (err) {}
    // Clean string of brackets and quotes
    return value.replace(/[\[\]"]/g, "");
  }
  return value;
};

exports.getRoles = async (req, res) => {
  try {
    const roles = await userModel.getRoles();

    return res.status(200).json(roles);
  } catch (error) {
    return res.status(500).json({
      message: "Error fetching roles",
      error: error.message,
    });
  }
};
exports.updateUser = async (req, res) => {
  try {
    logger.log("[UPDATE USER] Params ID:", req.params.id);
    logger.log("[UPDATE USER] Input Body:", req.body);
    logger.log(
      "[UPDATE USER] File:",
      req.file?.originalname || "No file"
    );
    logger.log("[UPDATE USER] Auth User ID:", req.user?.id);

    // ============================================
    // UPDATE USER
    // ============================================

    const result = await userModel.updateUser(
      req.params.id,
      req.body,
      req.file,
      req.user
    );

    // ============================================
    // EMPLOYEE FLAG
    // ============================================

    const isEmployee =
      req.body?.is_employee === true ||
      req.body?.is_employee === "true" ||
      req.body?.is_employee === 1 ||
      req.body?.is_employee === "1";

    const wasEmployee =
      result.was_employee === true ||
      result.was_employee === 1 ||
      result.was_employee === "1";

    // ============================================
    // CASE 1:
    // USER IS NEWLY CONVERTED TO EMPLOYEE
    // ============================================

    if (isEmployee && !wasEmployee) {
      logger.log(
        "[UPDATE USER] User converted to employee. Creating employee..."
      );

      req.body = {
        ...req.body,
        ...result,

        // IMPORTANT
        // users.role -> employee.rank
        rank: req.body.role || result.role || null,
      };

      const emp = await createEmployee(req);

      logger.log(
        "[UPDATE USER] Employee created:",
        emp
      );
    }

    // ============================================
    // CASE 2:
    // ALREADY EMPLOYEE
    // UPDATE EMPLOYEE RANK
    // ============================================

    if (isEmployee && wasEmployee) {
      logger.log(
        "[UPDATE USER] User already employee. Updating employee..."
      );

      const employeeId =
        result.emp_id ||
        result.employee_id ||
        req.body.emp_id;

      const role =
        req.body.role !== undefined
          ? req.body.role
          : result.role;

      if (employeeId && role !== undefined) {
        await userModel.updateEmployeeFromUser(
          employeeId,
          role,
          req.user
        );

        logger.log(
          "[UPDATE USER] Employee rank updated:",
          role
        );
      }
    }

    return res.status(200).json({
      message: "User updated successfully",
      user: result,
    });

  } catch (error) {

    logger.error("UPDATE USER ERROR:", error);

    return res.status(500).json({
      message: error.message || "Error updating user",
      error: error.message,
    });
  }
};
exports.deleteUser = async (req, res) => {
  try {
    logger.log("[DELETE USER] Params ID:", req.params.id);
    logger.log("[DELETE USER] Auth User ID:", req.user?.id);

    const result = await userModel.deleteUser(req.params.id, req.user);

    if (!result) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json({
      message: "User deleted successfully",
      user: result,
    });
  } catch (error) {
    logger.error("DELETE USER ERROR:", error);
    return res.status(500).json({
      message: error.message || "Error deleting user",
      error: error.message,
    });
  }
};
exports.restoreUser = async (req, res) => {
  try {
    logger.log("[RESTORE USER] Params ID:", req.params.id);
    logger.log("[RESTORE USER] Auth User ID:", req.user?.id);

    const result = await userModel.restoreUser(req.params.id, req.user);

    if (!result) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json({
      message: "User restored successfully",
      user: result,
    });
  } catch (error) {
    logger.error("RESTORE USER ERROR:", error);
    return res.status(500).json({
      message: error.message || "Error restoring user",
      error: error.message,
    });
  }
};

exports.getClients = async (req, res) => {
  try {
    logger.log("[GET CLIENTS] Request by User ID:", req.user?.id);

    const data = await userModel.getClients();

    return res.status(200).json({
      success: true,
      data: data,
    });
  } catch (error) {
    logger.error("CLIENT API ERROR =>", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const formatDateForExcel = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
};

exports.exportUsersToExcel = async (req, res) => {
  try {
    const users = await userModel.exportUsersToExcel(
      req.query,
      req.user
    );

    const headers = [
      "Name",
      "Email ID",
      "Contact No",
      "Address",
      "City",
      "Pincode",
      "Role",
      "Company",
      "Branch",
      "Created On",
    ];

    const excelRows = users.map((u) => [
      u.name || u.fullname || "",
      u.email || "",
      u.contactNo || "",
      u.address || "",
      u.city || "",
      u.pincode || "",
      u.role || "",
      u.company_name_actual || "",
      u.branch_name_actual || "",
      u.created_on
        ? formatDateForExcel(new Date(u.created_on))
        : "",
    ]);

    const worksheet = xlsx.utils.aoa_to_sheet([
      headers,
      ...excelRows,
    ]);

    const workbook = xlsx.utils.book_new();

    xlsx.utils.book_append_sheet(
      workbook,
      worksheet,
      "Users"
    );

    const fileName = `Users_${Date.now()}.xlsx`;

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
    logger.error("DOWNLOAD USERS EXCEL ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to download Excel",
      error: error.message,
    });
  }
};