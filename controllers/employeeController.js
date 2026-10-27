const employeeModel = require("../models/employeeModel");
require("dotenv").config();
const crypto = require("crypto");
const md5 = require("md5");
const clientModel = require("../models/clientModel");
const ExcelJS = require("exceljs");
const userModel = require("../models/userModel");
const XLSX = require("xlsx");
const React = require("react");

const {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  pdf,
} = require("@react-pdf/renderer");

const logger = require("../utils/logger");
const cloudinary = require("../utils/cloudinary");
const { EMP_DOC_BASE_URL, poolPromise, sql } = require("../config/db");
const fs = require("fs");
const { getRelativePathFromApi } = require("../utils/img_path");
require("dotenv").config();

const path = require("path");

// const puppeteer = require("puppeteer");

const validateEmail = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    const exists = await employeeModel.checkEmailExists(email);

    if (exists) {
      return res.status(400).json({
        exists: true,
        message: "Email is already registered in our system.",
      });
    }

    return res.json({ exists: false });
  } catch (err) {
    logger.error("Database error: ", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const verifyEmployeeData = async (req, res) => {
  try {
    const userId = Number(req.user?.id);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const userAccess =
      await employeeModel.getUserCompanyBranch(userId);

    if (!userAccess) {
      return res.status(404).json({
        success: false,
        message: "Logged in user not found",
      });
    }

    const parseIds = (value) => [
      ...new Set(
        String(value ?? "")
          .split(",")
          .map((id) => id.trim())
          .filter((id) => /^\d+$/.test(id))
          .map(Number)
          .filter(
            (id) => Number.isSafeInteger(id) && id > 0
          )
      ),
    ];

    const companyIds = parseIds(userAccess.company_id);
    const branchIds = parseIds(userAccess.branch_id);

    if (!companyIds.length || !branchIds.length) {
      return res.status(400).json({
        success: false,
        message:
          "Company or branch not assigned to logged-in user",
      });
    }

    const companyIdString = companyIds.join(",");
    const branchIdString = branchIds.join(",");

    logger.log("==========================================");
    logger.log("VERIFY EMPLOYEE DATA");
    logger.log("User ID:", userId);
    logger.log("Company IDs:", companyIdString);
    logger.log("Branch IDs:", branchIdString);
    logger.log("==========================================");

    // Get temporary employees matching any accessible company
    // AND any accessible branch.
    const tempEmployees =
      await employeeModel.getTempEmployeeData(
        companyIdString,
        branchIdString
      );

    if (!tempEmployees.length) {
      return res.status(400).json({
        success: false,
        message: "No uploaded employees found",
        totalRecords: 0,
        successCount: 0,
        errorCount: 0,
        results: [],
      });
    }

    let successCount = 0;
    let errorCount = 0;

    for (const employee of tempEmployees) {
      const result =
        await employeeModel.verifyEmployeeData(employee);

      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    const failedEmployees =
      await employeeModel.getFailedTempEmployees(
        companyIdString,
        branchIdString
      );

    return res.status(200).json({
      success: true,
      message:
        errorCount > 0
          ? "Verification completed. Some records have errors."
          : "Bulk upload verification successful.",
      totalRecords: tempEmployees.length,
      successCount,
      errorCount,
      results: failedEmployees,
    });
  } catch (error) {
    logger.error("VERIFY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to verify employee data",
      error: error.message,
    });
  }
};


const getEmployeesDropdown = async (req, res) => {

  try {

    const pool = await poolPromise;

    // =====================================================
    // LOGIN USER
    // =====================================================

    const userId =
      req.user?.id ||
      req.user?.user_id;

    const userRole =
      req.user?.role || "";


    logger.log(
      "GET EMPLOYEES DROPDOWN USER:",
      req.user
    );


    if (!userId) {

      return res.status(401).json({

        error: true,

        message:
          "Login user not found"

      });

    }


    // =====================================================
    // GET EMP_ID + EMP_CODE FROM USERS
    // =====================================================

    const userResult =
      await pool
        .request()

        .input(
          "user_id",
          sql.Int,
          Number(userId)
        )

        .query(`

          SELECT TOP 1

            id,

            emp_id,

            emp_code,

            role

          FROM users

          WHERE id = @user_id

        `);


    if (
      !userResult.recordset.length
    ) {

      return res.status(404).json({

        error: true,

        message:
          "User record not found"

      });

    }


    const loginUser =
      userResult.recordset[0];


    const empId =
      loginUser.emp_id;


    const empCode =
      loginUser.emp_code;


    const role =
      loginUser.role ||
      userRole;


    logger.log(
      "LOGIN USER EMPLOYEE DETAILS:",
      {
        userId,
        role,
        empId,
        empCode
      }
    );


    // =====================================================
    // GET EMPLOYEES
    // =====================================================

    const employees =
      await employeeModel.getEmployeesDropdown({

        userId,

        userRole:
          role,

        userEmpId:
          empId,

        userEmpCode:
          empCode

      });


    // =====================================================
    // FORMAT RESPONSE
    // =====================================================

    const data =
      employees.map((employee) => {

        let employeeName =
          employee.emp_full_name;


        if (
          !employeeName ||
          !employeeName.trim()
        ) {

          employeeName = [

            employee.initial,

            employee.first_name,

            employee.middle_name,

            employee.last_name

          ]
            .filter(
              (value) =>
                value !== null &&
                value !== undefined &&
                String(value).trim() !== ""
            )
            .join(" ")
            .trim();

        }


        return {

          id:
            employee.id,

          employee_id:
            employee.id,

          employee_code:
            employee.employee_code || "",

          employee_name:
            employeeName || "Employee",

          first_name:
            employee.first_name || "",

          middle_name:
            employee.middle_name || "",

          last_name:
            employee.last_name || "",

          active:
            employee.active,

          company_id:
            employee.company_id,

          branch_id:
            employee.branch_id

        };

      });


    return res.status(200).json({

      error: false,

      message:
        "Employees fetched successfully",

      count:
        data.length,

      data

    });


  } catch (error) {

    logger.error(
      "EMPLOYEE CONTROLLER - GET DROPDOWN ERROR:",
      error
    );


    return res.status(500).json({

      error: true,

      message:
        "Failed to fetch employees",

      details:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined

    });

  }

};

// ======================================================
// DOWNLOAD FAILED EMPLOYEE ERROR EXCEL
// ======================================================

// ======================================================
// DOWNLOAD ALL TEMP EMPLOYEE DATA WITH ERRORS
// ======================================================

const downloadEmployeeErrors = async (req, res) => {
  try {
    // ==========================================
    // GET ALL TEMP EMPLOYEES
    // ==========================================

    const allEmployees = await employeeModel.getTempEmployeeData();

    if (!allEmployees.length) {
      return res.status(404).json({
        success: false,
        message: "No uploaded employee records found",
      });
    }

    // ==========================================
    // FORMAT DATA
    // ==========================================

    const excelData = allEmployees.map((item, index) => ({
      "SR NO": index + 1,

      "EMPLOYEE CODE": item.employee_code || "",

      INITIAL: item.initial || "",

      "FIRST NAME": item.first_name || "",

      "MIDDLE NAME": item.middle_name || "",

      "LAST NAME": item.last_name || "",

      GENDER: item.gender || "",

      DOB: item.dob || "",

      "DATE OF JOINING": item.date_of_joining || "",

      EMAIL: item.email_id || "",

      PHONE: item.phone1 || "",

      ADDRESS: item.address || "",

      CITY: item.city || "",

      STATE: item.state || "",

      PINCODE: item.pincode || "",

      COUNTRY: item.country || "",

      DESIGNATION: item.rank || "",

      DEPARTMENT: item.department || "",

      "CLIENT ID": item.client_id || "",

      "SITE ID": item.site_id || "",

      "PAN CARD": item.pancard_no || "",

      AADHAR: item.aadhar_no || "",

      UAN: item.uan_no || "",

      "PF NO": item.pf_no || "",

      ESIC: item.esis_no || "",

      "BANK NAME": item.bank_name || "",

      "ACCOUNT NO": item.account_no || "",

      IFSC: item.bank_ifsc || "",

      ERROR: item.error || "SUCCESS",
    }));

    // ==========================================
    // CREATE WORKBOOK
    // ==========================================

    const worksheet = xlsx.utils.json_to_sheet(excelData);

    // ==========================================
    // COLUMN WIDTH
    // ==========================================

    worksheet["!cols"] = [
      { wch: 10 },
      { wch: 20 },
      { wch: 10 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 10 },
      { wch: 15 },
      { wch: 18 },
      { wch: 30 },
      { wch: 15 },
      { wch: 40 },
      { wch: 20 },
      { wch: 20 },
      { wch: 12 },
      { wch: 15 },
      { wch: 25 },
      { wch: 25 },
      { wch: 15 },
      { wch: 15 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 25 },
      { wch: 25 },
      { wch: 20 },
      { wch: 60 },
    ];

    const workbook = xlsx.utils.book_new();

    xlsx.utils.book_append_sheet(workbook, worksheet, "Uploaded Employees");

    // ==========================================
    // GENERATE BUFFER
    // ==========================================

    const buffer = xlsx.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    // ==========================================
    // RESPONSE HEADERS
    // ==========================================

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=uploaded_employee_data.xlsx",
    );

    // ==========================================
    // SEND FILE
    // ==========================================

    return res.send(buffer);
  } catch (error) {
    logger.error("DOWNLOAD ERROR FILE:", error);

    return res.status(500).json({
      success: false,

      message: error.message || "Internal Server Error",
    });
  }
};

const downloadUploadErrorTemplate = async (req, res) => {
  try {
    const userId = req.user.id;

    // Login user details
    const userAccess = await employeeModel.getUserCompanyBranch(userId);

    if (!userAccess) {
      return res.status(404).json({
        success: false,
        message: "Logged in user not found",
      });
    }

    const companyId = userAccess.company_id;
    const branchId = userAccess.branch_id;

    if (!companyId || !branchId) {
      return res.status(400).json({
        success: false,
        message: "Company or Branch not assigned to logged in user",
      });
    }

    console.log("DOWNLOAD FAILED EMPLOYEES");
    console.log({
      userId,
      companyId,
      branchId,
    });

    // Only same company + same branch data
    const employees =
      await employeeModel.getFailedTempEmployees(
        companyId,
        branchId
      );

    if (!employees || employees.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No failed employee upload records found",
      });
    }

    const excelData = employees.map((employee, index) => ({
      "Sr No": index + 1,
      "Employee Code": employee.employee_code || "",
      "Client Code": employee.client_code || "",
      "First Name": employee.first_name || "",
      "Middle Name": employee.middle_name || "",
      "Last Name": employee.last_name || "",
      "Designation": employee.rank || "",
      "Department": employee.department || "",
      "Company ID": employee.company_id || "",
      "Branch ID": employee.branch_id || "",
      "Client ID": employee.client_id || "",
      "Site ID": employee.site_id || "",
      "Status": employee.em_status || "FAILED",
      "Error": employee.error || "",
    }));

    const XLSX = require("xlsx");

    const worksheet = XLSX.utils.json_to_sheet(excelData);

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Upload Errors"
    );

    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="ViewUploadedData.xlsx"'
    );

    return res.send(buffer);

  } catch (error) {
    console.error(
      "DOWNLOAD UPLOAD ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const verifyEmployeeData2 = async (req, res) => {
  try {
    // =========================================
    // USER VALIDATION
    // =========================================
    const userId = Number(req.user?.id);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // =========================================
    // CHECK SUPERADMIN
    // =========================================
    const role = String(req.user?.role || "")
      .trim()
      .toUpperCase();

    const isSuperAdmin =
      role === "SUPERADMIN" ||
      role === "SUPER ADMIN" ||
      String(req.user?.superadmin_status || "").trim() === "1";

    // =========================================
    // COMPANY / BRANCH IDS
    // Superadmin: company_id = 1, branch_id = 1
    // Normal user: IDs from authenticated token
    // =========================================
    const rawCompanyId = isSuperAdmin
      ? 1
      : req.user?.company_id;

    const rawBranchId = isSuperAdmin
      ? 1
      : req.user?.branch_id;

    const parseSingleId = (value) => {
      const text = String(value ?? "").trim();

      // This verification endpoint requires one company
      // and one branch, not comma-separated IDs.
      if (!/^\d+$/.test(text)) {
        return null;
      }

      const id = Number(text);

      return Number.isSafeInteger(id) && id > 0
        ? id
        : null;
    };

    const companyId = parseSingleId(rawCompanyId);
    const branchId = parseSingleId(rawBranchId);

    if (companyId === null || branchId === null) {
      return res.status(400).json({
        success: false,
        message: isSuperAdmin
          ? "Invalid default company or branch ID"
          : "Valid company and branch are required",
      });
    }

    console.log("==========================================");
    console.log("VERIFY EMPLOYEE DATA 2");
    console.log("User ID:", userId);
    console.log("Role:", role);
    console.log("Is Superadmin:", isSuperAdmin);
    console.log("Company ID:", companyId);
    console.log("Branch ID:", branchId);
    console.log("==========================================");

    // =========================================
    // FETCH TEMPORARY EMPLOYEES
    // =========================================
    const tempEmployees =
      await employeeModel.getTempEmployeeData(
        companyId,
        branchId
      );

    if (!tempEmployees || tempEmployees.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "No uploaded records found for your company and branch",
        totalRecords: 0,
        successCount: 0,
        errorCount: 0,
        errors: [],
      });
    }

    // =========================================
    // VERIFY RECORDS
    // =========================================
    let successCount = 0;
    let errorCount = 0;

    const errors = [];

    for (const employee of tempEmployees) {
      try {
        const result =
          await employeeModel.verifyEmployeeData2({
            ...employee,
            company_id: companyId,
            branch_id: branchId,
          });

        if (result?.success) {
          successCount++;
        } else {
          errorCount++;

          errors.push({
            employee_code: employee.employee_code,
            error:
              result?.message ||
              "Verification/update failed",
          });
        }
      } catch (err) {
        errorCount++;

        errors.push({
          employee_code: employee.employee_code,
          error:
            err.message ||
            "Verification/update failed",
        });
      }
    }

    // =========================================
    // RESPONSE
    // =========================================
    return res.status(200).json({
      success: errorCount === 0,
      message: "Verification process completed",
      isSuperAdmin,
      company_id: companyId,
      branch_id: branchId,
      totalRecords: tempEmployees.length,
      successCount,
      errorCount,
      errors,
    });
  } catch (error) {
    console.error("VERIFY DATA 2 ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Verification failed",
    });
  }
};


// const uploadEmployee = async (req, res) => {
//   try {
//     const userId = req.user.id;

//     if (!req.file) {
//       return res.status(400).json({
//         success: false,
//         message: "Please upload an Excel file",
//       });
//     }

//     console.log("REQ FILE:", req.file);

//     if (req.file.originalname.includes(" ")) {
//       return res.status(400).json({
//         success: false,
//         message: "File name should not contain spaces",
//       });
//     }

//     // ===========================
//     // Read Excel from Buffer
//     // ===========================
//     const workbook = xlsx.read(req.file.buffer, {
//       type: "buffer",
//     });

//     if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Excel sheet not found",
//       });
//     }

//     const sheet = workbook.Sheets[workbook.SheetNames[0]];

//     const rows = xlsx.utils.sheet_to_json(sheet, {
//       header: 1,
//       defval: "",
//     });

//     if (rows.length <= 2) {
//       return res.status(400).json({
//         success: false,
//         message: "No employee data found in sheet",
//       });
//     }

//     const uploadData = [];
//     const errors = [];

//     for (let i = 2; i < rows.length; i++) {
//       try {
//         const row = rows[i];
//         const excelRow = i + 1;

//         if (!row || row.length === 0) continue;

//         const employeeCode = String(row[1] || "").trim();
//         const clientCode = String(row[2] || "").trim();
//         const firstName = String(row[4] || "").trim();
//         const email = String(row[10] || "").trim();

//         // Skip completely blank rows
//         if (!employeeCode && !clientCode && !firstName && !email) {
//           continue;
//         }

//         // ===========================
//         // Required Validation
//         // ===========================
//         if (!employeeCode) {
//           errors.push({
//             row: excelRow,
//             error: "Employee Code is required",
//           });
//           continue;
//         }

//         if (!clientCode) {
//           errors.push({
//             row: excelRow,
//             error: "Client Code is required",
//           });
//           continue;
//         }

//         if (!firstName) {
//           errors.push({
//             row: excelRow,
//             error: "First Name is required",
//           });
//           continue;
//         }

//         // ===========================
//         // Email Validation
//         // ===========================
//         if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
//           errors.push({
//             row: excelRow,
//             error: `Invalid Email (${email})`,
//           });
//           continue;
//         }

//         // ===========================
//         // Client Validation
//         // ===========================
//         const clientRate = await employeeModel.getClientRateByCode(clientCode);

//         if (!clientRate) {
//           errors.push({
//             row: excelRow,
//             error: `Invalid Client Code (${clientCode})`,
//           });
//           continue;
//         }

//         // ===========================
//         // Duplicate Employee Check
//         // ===========================
//         const existingEmployee =
//           await employeeModel.checkEmployeeCode(employeeCode);

//         if (existingEmployee) {
//           errors.push({
//             row: excelRow,
//             error: `Employee Code already exists (${employeeCode})`,
//           });
//           continue;
//         }

//         // ===========================
//         // Insert Data
//         // ===========================
//         uploadData.push({
//           employee_code: employeeCode,
//           client_code: clientCode,

//           initial: row[3] || "",
//           first_name: row[4] || "",
//           middle_name: row[5] || "",
//           last_name: row[6] || "",
//           gender: row[7] || "",
//           dob: row[8] || "",
//           date_of_joining: row[9] || "",
//           email_id: row[10] || "",

//           sal_from_date: row[11] || "",
//           sal_to_date: row[12] || "",
//           rank: row[13] || "",
//           department: row[14] || "",

//           client_id: clientRate.client_id || null,
//           site_id: clientRate.id || null,

//           reporting_manager: row[15] || "",
//           reporting_user: row[16] || "",
//           gang_name: row[17] || "",

//           address: row[18] || "",
//           city: row[19] || "",
//           state: row[20] || "",
//           pincode: row[21] || "",
//           country: row[22] || "",
//           phone1: row[23] || "",
//           phone2: row[24] || "",

//           contact_person: row[25] || "",
//           contact_mobile: row[26] || "",

//           p_address: row[27] || "",
//           p_city: row[28] || "",
//           p_state: row[29] || "",
//           p_pincode: row[30] || "",
//           p_country: row[31] || "",
//           p_phone1: row[32] || "",
//           p_phone2: row[33] || "",

//           contact_relation: row[34] || "",
//           contact_email: row[35] || "",

//           marital_status: row[36] || "",
//           mrg_date: row[37] || "",

//           cast: row[38] || "",
//           category: row[39] || "",
//           native_place: row[40] || "",
//           blood_group: row[41] || "",

//           driving_license: row[42] || "",
//           pancard_no: row[43] || "",
//           aadhar_no: row[44] || "",

//           passport_no: row[45] || "",
//           passport_valid_date: row[46] || "",

//           pf_no: row[47] || "",
//           esis_no: row[48] || "",
//           uan_no: row[49] || "",

//           created_by: userId,
//           created_on: new Date(),
//         });
//       } catch (rowError) {
//         errors.push({
//           row: i + 1,
//           error: rowError.message,
//         });
//       }
//     }

//     if (uploadData.length > 0) {
//       await employeeModel.bulkInsertTempEmployees(uploadData, userId);
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Employee upload completed",

//       totalRows: rows.length - 2,
//       successRows: uploadData.length,
//       failedRows: errors.length,
//       errors,
//     });
//   } catch (error) {
//     console.error("UPLOAD ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: error.message || "Internal Server Error",
//     });
//   }
// };

// =========================================
// UPLOAD EMPLOYEE
// =========================================


// Normalize Excel header text
const normalizeExcelHeader = (value) =>
  String(value ?? "")
    .replace(/\u00A0/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

// Map Excel columns by section and column position.
// Duplicate headers such as ADDRESS and CITY are handled
// using their section headings.
const buildEmployeeColumnMap = (sectionRow, headerRow) => {
  const map = [];

  let currentSection = "";

  for (let i = 0; i < headerRow.length; i++) {
    const sectionValue = normalizeExcelHeader(sectionRow[i]);

    if (sectionValue) {
      currentSection = sectionValue;
    }

    const header = normalizeExcelHeader(headerRow[i]);
    if (
  ["initial", "gender", "email id"].includes(header)
) {
console.log("EXCEL HEADER DEBUG:", {
  index: i,
  originalHeader: headerRow[i],
  normalizedHeader: header,
  section: currentSection,
  mappedColumn: getDatabaseColumn({
    header,
    section: currentSection,
  }),
});
}

    if (!header) {
      map.push(null);
      continue;
    }

    map.push({
      header,
      section: currentSection,
    });
  }

  return map;
};

const getDatabaseColumn = (item) => {
  if (!item) return null;

  const { header, section } = item;

  // Employee details
  const employeeMap = {
    "sr no": null,
    "employee code": "employee_code",
    "client code": "client_code",
    initial: "initial",
    "first name": "first_name",
    "middle name": "middle_name",
    "last name": "last_name",
    gender: "gender",
    dob: "dob",
    "joining date": "date_of_joining",
    "email id": "email_id",
    "salary generation from date": "sal_from_date",
    "salary generation to date": "sal_to_date",
    "designation/rank": "rank",
    department: "department",
    "reporting manager": "reporting_manager",
    "reporting user": "reporting_user",
    "gang name": "gang_name",
  };

if (
  section.includes("employee detail") &&
  Object.prototype.hasOwnProperty.call(employeeMap, header)
) {
  return employeeMap[header];
}

  // Present address
  if (section.includes("contact detail") &&
      section.includes("present")) {
    const presentMap = {
      address: "address",
      city: "city",
      state: "state",
      pincode: "pincode",
      country: "country",
      phone1: "phone1",
      phone2: "phone2",
    };

    if (Object.prototype.hasOwnProperty.call(presentMap, header)) {
      return presentMap[header];
    }
  }

  // Permanent address
  if (section.includes("permenant") ||
      section.includes("permanent")) {
    const permanentMap = {
      address: "p_address",
      city: "p_city",
      state: "p_state",
      pincode: "p_pincode",
      country: "p_country",
      phone1: "p_phone1",
      phone2: "p_phone2",
    };

    if (Object.prototype.hasOwnProperty.call(permanentMap, header)) {
      return permanentMap[header];
    }
  }

  // Emergency contact details
  if (section.includes("emergency")) {
    const emergencyMap = {
      "contact person": "contact_person",
      mobile: "contact_mobile",
      relation: "contact_relation",
      email: "contact_email",
    };

    if (Object.prototype.hasOwnProperty.call(emergencyMap, header)) {
      return emergencyMap[header];
    }
  }

  // Personal details
  if (section.includes("personal")) {
    const personalMap = {
      "marital status": "marital_status",
      "marriage date": "mrg_date",
      cast: "cast",
      category: "category",
      "native place": "native_place",
      "blood group": "blood_group",
      "driving license no": "driving_license",
      "pan card no": "pancard_no",
      "aadhar card no": "aadhar_no",
      "passport no": "passport_no",
      "passport valid date": "passport_valid_date",
      "p.f no": "pf_no",
      "esis no": "esis_no",
      "uan no": "uan_no",
      "language known(1)": "lang1",
      "language known(2)": "lang2",
      "language known(3)": "lang3",
      "language known(4)": "lang4",
      "language known(5)": "lang5",
      "hobby(1)": "hobby1",
      "hobby(2)": "hobby2",
      "hobby(3)": "hobby3",
      "hobby(4)": "hobby4",
    };

    if (Object.prototype.hasOwnProperty.call(personalMap, header)) {
      return personalMap[header];
    }
  }

  // Educational details
  if (section.includes("educational")) {
    const educationMap = {
      "document type": "doc_type",
      "passing year": "passing_year",
      "document name": "doc_name",
      image: "doc_image",
      status: "doc_status",
      "remark/description": "doc_remark",
    };

    if (Object.prototype.hasOwnProperty.call(educationMap, header)) {
      return educationMap[header];
    }
  }

  // Family and nominee details
  if (section.includes("family") || section.includes("nominee")) {
    const familyMap = {
      initial: "f_initial",
      "relative name": "f_relative_name",
      gender: "f_gender",
      relation: "f_relation",
      "date of birth": "f_dob",
      age: "f_age",
      "minor(under 18)": "f_minor",
      "guardian name (if minor 'yes')": "f_guardian",
      address: "f_address",
      "contact no": "f_contact",
      "email id": "f_email",
      "share pf %": "f_sharepf",
      "share esic %": "f_shareesic",
    };

    if (Object.prototype.hasOwnProperty.call(familyMap, header)) {
      return familyMap[header];
    }
  }

  // Previous employee details
  if (section.includes("previous employee")) {
    const previousMap = {
      "company name": "emp_company_name",
      designation: "emp_designation",
      address: "emp_address",
      city: "emp_city",
      state: "emp_state",
      country: "emp_country",
      pincode: "emp_pincode",
      "joined date": "emp_joined_date",
      "last working date": "last_working_date",
      "annual ctc rupees": "annual_ctc",
      "monthly ctc": "monthly_ctc",
      "reporting to": "reporting_to",
      "reporting to designation": "reporting_to_designation",
      email: "reporting_to_email",
      contact: "reporting_to_contact",
      "gross income in prev employee": "gross_income",
      "gross tds deducted": "gross_tds",
      "gross pt": "gross_pt",
      "total pt deducted": "total_pt",
    };

    if (Object.prototype.hasOwnProperty.call(previousMap, header)) {
      return previousMap[header];
    }
  }

  // Bank details
  if (section.includes("bank")) {
    const bankMap = {
      "bank name": "bank_name",
      "bank account no": "account_no",
      "bank address": "bank_address",
      city: "bank_city",
      state: "bank_state",
      "ifsc code": "bank_ifsc",
      "micr code": "bank_micr",
      "cancelled cheque image": "cancelled_cheque_image",
    };

    if (Object.prototype.hasOwnProperty.call(bankMap, header)) {
      return bankMap[header];
    }
  }

  // Separation details
  if (section.includes("separation")) {
    const separationMap = {
      "separation type": "separation_type",
      "separation reason": "separate_reason",
      "date of separation": "date_of_separation",
      "notice period": "notice_period",
      "last working date": "last_working_date_sp",
      "handover given to": "handover_given_to",
    };

    if (Object.prototype.hasOwnProperty.call(separationMap, header)) {
      return separationMap[header];
    }
  }

  return null;
};


const uploadEmployee = async (req, res) => {
  try {
    const userId = Number(req.user?.id);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: "Please upload an Excel file",
      });
    }

    // 1. Get user's accessible companies and branches
    const userAccess =
      await employeeModel.getUserCompanyBranch(userId);

    logger.log("User access:", userAccess);

    if (!userAccess) {
      return res.status(400).json({
        success: false,
        message: "Company and branch details not found",
      });
    }

    const parseIds = (value) => [
      ...new Set(
        String(value ?? "")
          .split(",")
          .map((id) => id.trim())
          .filter((id) => /^\d+$/.test(id))
          .map(Number)
          .filter(
            (id) => Number.isSafeInteger(id) && id > 0
          )
      ),
    ];

    const companyIds = parseIds(userAccess.company_id);
    const branchIds = parseIds(userAccess.branch_id);

    if (!companyIds.length || !branchIds.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid company_id or branch_id",
      });
    }

    // Store all IDs as comma-separated strings
    const companyIdString = companyIds.join(",");
    const branchIdString = branchIds.join(",");

    // 2. Read Excel workbook
    let workbook;

    try {
      workbook = XLSX.read(req.file.buffer, {
        type: "buffer",
        cellDates: true,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Unable to read Excel file",
        error: error.message,
      });
    }

    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      return res.status(400).json({
        success: false,
        message: "Excel file does not contain a worksheet",
      });
    }

    const worksheet = workbook.Sheets[sheetName];

    // Read rows as arrays so duplicate Excel headers are preserved
    const sheetRows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
      raw: false,
      blankrows: false,
    });

    if (sheetRows.length < 3) {
      return res.status(400).json({
        success: false,
        message:
          "Excel must contain section headers, column headers and employee rows",
      });
    }

    // Row 1: section headings
    // Row 2: column headers
    // Row 3 onwards: employee data
    const sectionRow = sheetRows[0];
    const headerRow = sheetRows[1];

    const columnMap = buildEmployeeColumnMap(
      sectionRow,
      headerRow
    );

    const excelData = sheetRows
      .slice(2)
      .filter((row) =>
        row.some(
          (value) =>
            value !== null &&
            value !== undefined &&
            String(value).trim() !== ""
        )
      )
      .map((row, rowIndex) => {
        const employee = {};

        columnMap.forEach((item, columnIndex) => {
          if (!item) return;

          const dbColumn = getDatabaseColumn(item);
          if (!dbColumn) return;

          const value = row[columnIndex];

          employee[dbColumn] =
            value === undefined ? null : value;
        });

        employee._excel_row = rowIndex + 3;

        return employee;
      });

    if (!excelData.length) {
      return res.status(400).json({
        success: false,
        message: "No employee data found in Excel",
      });
    }

    // 3. Validate mapped columns
    const totalColumnsMapped = Object.keys(
      excelData[0] || {}
    ).filter((key) => key !== "_excel_row").length;

    if (!totalColumnsMapped) {
      return res.status(400).json({
        success: false,
        message:
          "No Excel columns could be mapped to employee database fields",
      });
    }

    logger.log("Excel employee count:", excelData.length);
    logger.log("Company IDs:", companyIdString);
    logger.log("Branch IDs:", branchIdString);
    
logger.log("HEADER ROW:", headerRow);

logger.log(
  "COLUMN MAPPING:",
  columnMap.map((item, index) => ({
    index,
    header: headerRow[index],
    mapping: item,
    databaseColumn: item
      ? getDatabaseColumn(item)
      : null,
    excelValue: sheetRows[2]?.[index],
  }))
);

logger.log("CHECK DATA:", {
  initial: excelData[0]?.initial,
  first_name: excelData[0]?.first_name,
  last_name: excelData[0]?.last_name,
  gender: excelData[0]?.gender,
  email_id: excelData[0]?.email_id,
});

    logger.log("Mapped first employee:", excelData[0]);

    // 4. Prepare one row per Excel employee
    const uploadData = excelData.map((employee) => {
      const { _excel_row, ...data } = employee;

      return {
        ...data,
        company_id: companyIdString,
        branch_id: branchIdString,
        created_by: userId,
        created_on: new Date(),
      };
    });

    // 5. Insert employees once; do not loop over companies
    const result =
      await employeeModel.bulkInsertTempEmployees(
        uploadData,
        companyIdString,
        branchIdString
      );

    const totalInserted = Number(
      result.insertedRecords || 0
    );

    const totalDeleted = Number(
      result.deletedRecords || 0
    );

    return res.status(200).json({
      success: true,
      message: "Employee data uploaded successfully",
      company_ids: companyIds,
      branch_ids: branchIds,
      excelRows: excelData.length,
      totalInserted,
      totalDeleted,
      companyResults: [
        {
          company_id: companyIdString,
          branch_id: branchIdString,
          insertedCount: totalInserted,
          deletedCount: totalDeleted,
          ignoredHeaders: result.ignoredHeaders || [],
        },
      ],
    });
  } catch (error) {
    logger.error("uploadEmployee error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to upload employee data",
      error: error.message,
    });
  }
};




// ==========================================
// SAFE DATE
// ==========================================

const safeDate = (val) => {
  return val && val !== "" ? new Date(val) : null;
};

// ==========================================
// CREATE EMPLOYEE
// ==========================================

const createEmployee = async (req, res) => {
  try {
    const d = req.body;
    logger.log("data", d);
    const userDetail = await clientModel.getUserById(req.user.id);
    logger.log("Files:", req.file);
    logger.log("email:", d.email_id);

    const emailExist = await employeeModel.checkEmailExists(d.email_id);

    // logger.log("emailExist", emailExist);
    if (emailExist) {
      return res.status(400).json({
        success: false,
        field: "email_id",
        message:
          "This email is already registered in our system. Please use a different one.",
      });
    }

    // ======================================
    // USER VALIDATION
    // ======================================

    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    // ======================================
    // FULL NAME
    // ======================================

    const emp_full_name =
      `${d.first_name || ""} ${d.middle_name || ""} ${d.last_name || ""}`.trim();

    // ======================================
    // EMPLOYEE CODE
    // ======================================

    const nextId = await employeeModel.getNextEmployeeCode();

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
      employee_code: null,

      initial: d.initial || null,
      first_name: toUpper(d.first_name) || null,
      middle_name: toUpper(d.middle_name) || null,
      last_name: toUpper(d.last_name) || null,
      emp_full_name,

      gender: toUpper(d.gender) || null,

      dob: safeDate(d.dob),

      date_of_joining: safeDate(d.date_of_joining),

      reg_date: safeDate(d.reg_date),

      address: toUpper(d.address) || null,
      city: toUpper(d.city) || null,
      state: toUpper(d.state) || null,
      pincode: toUpper(d.pincode) || null,
      country: toUpper(d.country) || null,

      phone1: d.phone1 || null,
      phone2: d.phone2 || null,
      email_id: d.email_id || null,

      contact_person: JSON.stringify(
        emergencyContacts.map((x) => x.contact_person),
      ),

      contact_mobile: JSON.stringify(emergencyContacts.map((x) => x.mobile)),

      contact_relation: JSON.stringify(
        emergencyContacts.map((x) => x.relation),
      ),

      contact_email: JSON.stringify(emergencyContacts.map((x) => x.email)),

      p_address: toUpper(d.p_address) || null,
      p_city: toUpper(d.p_city) || null,
      p_state: toUpper(d.p_state) || null,
      p_pincode: toUpper(d.p_pincode) || null,
      p_country: toUpper(d.p_country) || null,
      p_phone1: toUpper(d.p_phone1) || null,
      p_phone2: toUpper(d.p_phone2) || null,

      marital_status: toUpper(d.marital_status) || null,

      mrg_date: safeDate(d.mrg_date),

      cast: toUpper(d.cast) || null,
      category: toUpper(d.category) || null,
      native_place: toUpper(d.native_place) || null,
      blood_group: toUpper(d.blood_group) || null,
      father_name: toUpper(d.father_name) || null,

      native_address: toUpper(d.native_address) || null,
      native_city: toUpper(d.native_city) || null,
      native_state: toUpper(d.native_state) || null,
      native_pincode: toUpper(d.native_pincode) || null,
      native_country: toUpper(d.native_country) || null,
      driving_license: toUpper(d.driving_license) || null,
      pancard_no: toUpper(d.pancard_no) || null,
      aadhar_no: toUpper(d.aadhar_no) || null,
      passport_no: toUpper(d.passport_no) || null,
      uan_no: d.uan_no || null,
      passport_valid_date: safeDate(d.passport_valid_date),

      pf_no: d.pf_no || null,
      esis_no: d.esis_no || null,
      esis_date: safeDate(d.esis_date),

      uan_date: safeDate(d.uan_date),

      lang1: toUpper(d.lang1) || null,
      lang2: toUpper(d.lang2) || null,
      lang3: toUpper(d.lang3) || null,
      lang4: toUpper(d.lang4) || null,
      lang5: toUpper(d.lang5) || null,

      hobby1: toUpper(d.hobby1) || null,
      hobby2: toUpper(d.hobby2) || null,
      hobby3: toUpper(d.hobby3) || null,
      hobby4: toUpper(d.hobby4) || null,

      bank_name: toUpper(d.bank_name) || null,
      account_no: toUpper(d.account_no) || null,
      bank_address: toUpper(d.bank_address) || null,
      bank_city: toUpper(d.bank_city) || null,
      bank_state: toUpper(d.bank_state) || null,
      bank_ifsc: toUpper(d.bank_ifsc) || null,
      bank_micr: toUpper(d.bank_micr) || null,

      cancelled_cheque_image: d.cancelled_cheque_image || null,
      ac_holder_name: d.ac_holder_name || null,
      card_no: d.card_no || null,
      branch_id: d.branch_id || null,
      company_id: d.company_id || null,
      client_id: d.client_id || null,
      site_id: d.site_id || d.siteId || null,
      site_name: toUpper(d.site_name) || null,
      client_name: toUpper(d.client_name) || null,
      department: toUpper(d.department) || null,
      rank: d.rank || null,
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
      migrant_status: d?.migrant_status || null,
      separation_type: d.separation_type || null,
      separate_reason: d.separate_reason || null,
      date_of_separation: safeDate(d.date_of_separation),

      notice_period: d.notice_period || null,
      last_working_date_sp: safeDate(d.last_working_date_sp),

      handover_given_to: d.handover_given_to || null,
      password: d.password || null,
      employee_logo: req.files?.employee_logo?.[0]?.filename ? `profilephoto/${req.files.employee_logo[0].filename}` : null,
      user_id: d.user_id || null,
      doc_name: d.doc_name || null,
      client_code: d.client_code || null,
      active: d.active || "0",

      em_status: toUpper(d.em_status) || "WORKING",
      emp_stages: toUpper(d.emp_stages) || "PENDING",
      created_by: String(req.user.id),
      created_by_name: String(userDetail.first_name),
    };

    // ======================================
    // INSERT
    // ======================================

    const inserted = await employeeModel.createEmployee(employeeData);

    return res.status(201).json({
      success: true,
      employeeId: inserted.id,
      employeeCode: inserted.employee_code,
      emp_full_name,
      message: "Employee created successfully",
    });
  } catch (err) {
    logger.error(err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

const getNextEmployeeCode = async (req, res) => {
  try {
    const nextId = await employeeModel.getNextEmployeeCode();
    logger.log("nextId", nextId);
    const nextCode = String(nextId);

    return res.status(200).json({
      success: true,
      nextCode,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// controllers/employeeController.js

// ==========================================
// GET ALL EMPLOYEES
// ==========================================


const getAllEmployees = async (req, res) => {
  try {
    console.log("\n================================");
    console.log("GET ALL EMPLOYEES API");
    console.log("REQ QUERY =", req.query);
    console.log("REQ USER =", req.user);
    console.log("================================\n");

    const user = req.user || {};

    const role = String(
      user.role ||
      user.user_type ||
      user.userType ||
      ""
    ).trim().toLowerCase();

    const companyId =
      user.company_id ??
      user.companyId ??
      null;

    const employeeId =
      user.employee_id ??
      user.employeeId ??
      user.emp_id ??
      null;

    const result = await employeeModel.getAllEmployees({
      ...req.query,
      userRole: role,
      userCompanyId: companyId,
      userEmployeeId: employeeId,
    });

    console.log("TOTAL EMPLOYEES =", result.data.length);

    return res.status(200).json({
      success: true,
      count: result.data.length,
      data: result.data,
    });
  } catch (err) {
    console.error("GET EMPLOYEES ERROR:", err);

    return res.status(500).json({
      success: false,
      error: err.message,
      ...(process.env.NODE_ENV === "development"
        ? { stack: err.stack }
        : {}),
    });
  }
};

// ==========================================
// GET EMPLOYEE BY ID
// ==========================================

const getEmployeeById = async (req, res) => {
  logger.log("\n======================================");

  logger.log("GET EMPLOYEE BY ID API START");

  logger.log("TIME =", new Date());

  logger.log("PARAM ID =", req.params.id);

  logger.log("======================================\n");

  try {
    const employeeId = parseInt(req.params.id);

    // ======================================
    // VALIDATION
    // ======================================

    if (isNaN(employeeId)) {
      return res.status(400).json({
        success: false,

        error: "Invalid Employee ID",
      });
    }

    logger.log("EMPLOYEE ID =", employeeId);

    // ======================================
    // GET DATA
    // ======================================

    const result = await employeeModel.getEmployeeById(employeeId);

    const employee = result.employee;

    // ======================================
    // NOT FOUND
    // ======================================

    if (!employee) {
      logger.log("âŒ Employee Not Found");

      return res.status(404).json({
        success: false,

        error: "Employee not found",
      });
    }

    logger.log("âœ… EMPLOYEE DATA FOUND");

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      data: {
        // ====================================
        // MASTER
        // ====================================

        id: employee.id,
        reg_date: employee.reg_date,
        employee_code: employee.employee_code,
        // BASIC

        initial: employee.initial,
        first_name: employee.first_name,
        middle_name: employee.middle_name,
        last_name: employee.last_name,
        emp_full_name: employee.emp_full_name,
        gender: employee.gender,
        dob: employee.dob,
        date_of_joining: employee.date_of_joining,
        gang_name: employee.gang_name,
        rank: employee.rank,
        // ADDRESS

        address: employee.address,
        city: employee.city,
        state: employee.state,
        pincode: employee.pincode,
        country: employee.country,
        // NATIVE ADDRESS

        native_address: employee.native_address,
        native_city: employee.native_city,
        native_state: employee.native_state,
        native_pincode: employee.native_pincode,
        native_country: employee.native_country,
        // CONTACT

        phone1: employee.phone1,
        phone2: employee.phone2,
        email_id: employee.email_id,
        contact_person: employee.contact_person,
        contact_mobile: employee.contact_mobile,
        // PERMANENT

        p_address: employee.p_address,
        p_city: employee.p_city,
        p_state: employee.p_state,
        p_pincode: employee.p_pincode,
        p_country: employee.p_country,
        p_phone1: employee.p_phone1,
        p_phone2: employee.p_phone2,
        // PERSONAL

        contact_relation: employee.contact_relation,
        contact_email: employee.contact_email,
        marital_status: employee.marital_status,
        mrg_date: employee.mrg_date,
        cast: employee.cast,
        category: employee.category,
        native_place: employee.native_place,
        blood_group: employee.blood_group,
        father_name: employee.father_name,
        migrant_status: employee?.migrant_status || "",
        // DOCUMENTS

        driving_license: employee.driving_license,
        pancard_no: employee.pancard_no,
        aadhar_no: employee.aadhar_no,
        passport_no: employee.passport_no,
        uan_no: employee.uan_no,
        passport_valid_date: employee.passport_valid_date,
        pf_no: employee.pf_no,
        esis_no: employee.esis_no,
        esis_date: employee.esis_date,
        uan_date: employee.uan_date,
        // LANGUAGE

        lang1: employee.lang1,
        lang2: employee.lang2,
        lang3: employee.lang3,
        lang4: employee.lang4,
        lang5: employee.lang5,
        // HOBBY

        hobby1: employee.hobby1,
        hobby2: employee.hobby2,
        hobby3: employee.hobby3,
        hobby4: employee.hobby4,
        // BANK

        bank_name: employee.bank_name,
        account_no: employee.account_no,
        bank_address: employee.bank_address,
        bank_city: employee.bank_city,
        bank_state: employee.bank_state,
        bank_ifsc: employee.bank_ifsc,
        bank_micr: employee.bank_micr,
        ac_holder_name: employee.ac_holder_name,
        card_no: employee.card_no,
        cancelled_cheque_image: employee.cancelled_cheque_image,
        // COMPANY

        branch_id: employee.branch_id,
        branch_name: employee.branch_name,
        company_id: employee.company_id,
        company_name: employee.company_name,
        client_id: employee.client_id,
        client_name: employee.client_name,
        client_code: employee.client_code,
        site_id: employee.site_id,
        site_name: employee.site_name,
        department: employee.department,
        reporting_manager: employee.reporting_manager,
        reporting_user: employee.reporting_user,
        // SALARY

        salary_template: employee.salary_template,
        gross_salary: employee.gross_salary,
        gross_salary_type: employee.gross_salary_type,
        basic_salary: employee.basic_salary,
        basic_salary_type: employee.basic_salary_type,
        sal_from_date: employee.sal_from_date,
        sal_to_date: employee.sal_to_date,
        pf_applicable: employee.pf_applicable,
        da_term: employee.da_term,
        basic_term: employee.basic_term,
        perday_salary: employee.perday_salary,
        // SEPARATION

        separation_type: employee.separation_type,
        separate_reason: employee.separate_reason,
        date_of_separation: employee.date_of_separation,
        notice_period: employee.notice_period,
        last_working_date_sp: employee.last_working_date_sp,
        handover_given_to: employee.handover_given_to,
        // EXTRA

        password: employee.password,
        user_id: employee.user_id,
        doc_name: employee.doc_name,
        // STATUS

        em_status: employee.em_status,
        active: employee.active,
        // AUDIT

        created_by: employee.created_by,
        created_on: employee.created_on,
        modified_by: employee.modified_by,
        modified_on: employee.modified_on,
        disabled_by: employee.disabled_by,
        disabled_on: employee.disabled_on,
        // ====================================
        // EXTRA TABLES
        // ====================================

        experience_details: result.experience || [],

        document_details: result.documents || [],

        nominee_details: result.nominees || [],
      },
    });
  } catch (err) {
    logger.log("\n======================================");

    logger.log("âŒ GET EMPLOYEE ERROR");

    logger.log("======================================");

    logger.error("ERROR =", err);

    logger.error("MESSAGE =", err.message);

    logger.log("======================================\n");

    return res.status(500).json({
      success: false,

      error: err.message,
    });
  }
};

// ==========================================
// UPDATE EMPLOYEE
// ==========================================

const updateEmployee = async (req, res) => {
  logger.log("\n================ Update Employee ======================");
  logger.log(req.file);
  // logger.log(req.body.documents);
  logger.log("UPDATE EMPLOYEE API START");

  logger.log("TIME =", new Date());

  logger.log("PARAM ID =", req.params.id);

  logger.log("REQ BODY =", req.body);

  logger.log("USER =", req.user);

  logger.log("======================================\n");

  try {
    // ======================================
    // EMPLOYEE ID
    // ======================================

    const employeeId = parseInt(req.params.id);

    if (isNaN(employeeId)) {
      logger.log("âŒ Invalid Employee ID");

      return res.status(400).json({
        success: false,
        error: "Invalid Employee ID",
      });
    }

    // ======================================
    // AUTH CHECK
    // ======================================

    if (!req.user || !req.user.id) {
      logger.log("âŒ Unauthorized User");

      return res.status(401).json({
        success: false,
        error: "Unauthorized User",
      });
    }

    logger.log("EMPLOYEE ID =", employeeId);

    logger.log("MODIFIED USER =", req.user.id);

    // ======================================
    // UPDATE EMPLOYEE
    // ======================================

    if (req.files?.employee_logo?.[0]) {
      req.body.employee_logo = `profilephoto/${req.files.employee_logo[0].filename}`;
    }

    logger.log(req.body);

    const userRecord = await employeeModel.getUserById(req.user.id);
    const modifiedByName = userRecord?.first_name || String(req.user.id);

    await employeeModel.updateEmployee(employeeId, req.body, req.user.id, modifiedByName);

    logger.log("âœ… EMPLOYEE UPDATED SUCCESSFULLY");

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,
      message: "Employee updated successfully",
    });
  } catch (err) {
    logger.log("\n======================================");
    logger.log("âŒ UPDATE EMPLOYEE ERROR");
    logger.log("======================================");
    logger.error("ERROR =", err);
    logger.error("MESSAGE =", err.message);
    logger.error("STACK =", err.stack);
    logger.log("======================================\n");

    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};
// ==========================================
// UPDATE EMPLOYEE STATUS
// ==========================================

const updateEmployeeStatus = async (req, res) => {
  logger.log("\n======================================");

  logger.log("UPDATE EMPLOYEE STATUS API");

  logger.log("TIME =", new Date());

  logger.log("PARAM ID =", req.params.id);

  logger.log("REQ BODY =", req.body);

  logger.log("USER =", req.user);

  logger.log("======================================\n");

  try {
    // ======================================
    // EMPLOYEE ID
    // ======================================

    const employeeId = parseInt(req.params.id);

    if (isNaN(employeeId)) {
      logger.log("âŒ Invalid Employee ID");

      return res.status(400).json({
        success: false,

        error: "Invalid Employee ID",
      });
    }

    // ======================================
    // AUTH CHECK
    // ======================================

    if (!req.user || !req.user.id) {
      logger.log("âŒ Unauthorized User");

      return res.status(401).json({
        success: false,

        error: "Unauthorized User",
      });
    }

    // ======================================
    // STATUS
    // ======================================

    const { status } = req.body;

    if (!status) {
      logger.log("âŒ Status Required");

      return res.status(400).json({
        success: false,

        error: "Status is required",
      });
    }

    logger.log("EMPLOYEE ID =", employeeId);

    logger.log("NEW STATUS =", status);

    // ======================================
    // UPDATE STATUS
    // ======================================

    const userRecord = await employeeModel.getUserById(req.user.id);
    const modifiedByName = userRecord?.first_name || String(req.user.id);

    const result = await employeeModel.updateEmployeeStatus(
      employeeId,
      status,
      req.user.id,
      modifiedByName
    );

    // ======================================
    // CHECK RECORD
    // ======================================

    if (result.rowsAffected[0] === 0) {
      logger.log("âŒ Employee Not Found");

      return res.status(404).json({
        success: false,

        error: "Employee not found",
      });
    }

    logger.log("âœ… STATUS UPDATED SUCCESSFULLY");

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      message: "Employee status updated successfully",
    });
  } catch (err) {
    logger.log("\n======================================");

    logger.log("âŒ UPDATE STATUS ERROR");

    logger.log("======================================");

    logger.error("ERROR =", err);

    logger.error("MESSAGE =", err.message);

    logger.error("STACK =", err.stack);

    logger.log("======================================\n");

    return res.status(500).json({
      success: false,

      error: err.message,
    });
  }
};

// ==========================================
// UPDATE EMPLOYEE SALARY
// ==========================================

const updateEmployeeSalary = async (req, res) => {
  logger.log("\n======================================");

  logger.log("UPDATE EMPLOYEE SALARY API");

  logger.log("TIME =", new Date());

  logger.log("PARAM ID =", req.params.id);

  logger.log("REQ BODY =", req.body);

  logger.log("USER =", req.user);

  logger.log("======================================\n");

  try {
    // ======================================
    // EMPLOYEE ID
    // ======================================

    const employeeId = parseInt(req.params.id);

    if (isNaN(employeeId)) {
      logger.log("âŒ Invalid Employee ID");

      return res.status(400).json({
        success: false,

        error: "Invalid Employee ID",
      });
    }

    // ======================================
    // AUTH CHECK
    // ======================================

    if (!req.user || !req.user.id) {
      logger.log("âŒ Unauthorized User");

      return res.status(401).json({
        success: false,

        error: "Unauthorized User",
      });
    }

    // ======================================
    // BODY DATA
    // ======================================

    const { monthlySalary } = req.body;

    if (
      monthlySalary === undefined ||
      monthlySalary === null ||
      monthlySalary === ""
    ) {
      logger.log("âŒ Salary Required");

      return res.status(400).json({
        success: false,

        error: "Monthly salary is required",
      });
    }

    logger.log("EMPLOYEE ID =", employeeId);

    logger.log("MONTHLY SALARY =", monthlySalary);

    // ======================================
    // UPDATE SALARY
    // ======================================

    const result = await employeeModel.updateEmployeeSalary(
      employeeId,

      monthlySalary,

      req.user.id,
    );

    // ======================================
    // CHECK EMPLOYEE
    // ======================================

    if (result.rowsAffected[0] === 0) {
      logger.log("âŒ Employee Not Found");

      return res.status(404).json({
        success: false,

        error: "Employee not found",
      });
    }

    logger.log("âœ… SALARY UPDATED SUCCESSFULLY");

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      message: "Salary updated successfully",
    });
  } catch (err) {
    logger.log("\n======================================");

    logger.log("âŒ UPDATE SALARY ERROR");

    logger.log("======================================");

    logger.error("ERROR =", err);

    logger.error("MESSAGE =", err.message);

    logger.error("STACK =", err.stack);

    logger.log("======================================\n");

    return res.status(500).json({
      success: false,

      error: err.message,
    });
  }
};

// ==========================================
// DELETE / DISABLE EMPLOYEE
// ==========================================


const deleteEmployee = async (req, res) => {
  logger.log("\n======================================");
  logger.log("DELETE EMPLOYEE API");
  logger.log("TIME =", new Date());
  logger.log("PARAM ID =", req.params.id);
  logger.log("USER =", req.user);
  logger.log("======================================\n");

  try {
    // EMPLOYEE ID
    const employeeId = parseInt(req.params.id, 10);

    if (isNaN(employeeId)) {
      logger.log("❌ Invalid Employee ID");

      return res.status(400).json({
        success: false,
        error: "Invalid Employee ID",
      });
    }

    // AUTH CHECK
    if (!req.user || !req.user.id) {
      logger.log("❌ Unauthorized User");

      return res.status(401).json({
        success: false,
        error: "Unauthorized User",
      });
    }

    const userId = Number(req.user.id);

    logger.log("EMPLOYEE ID =", employeeId);
    logger.log("DISABLED BY =", userId);

    // GET USER DETAILS
    const userRecord = await employeeModel.getUserById(userId);

    const disabledByName =
      userRecord?.first_name || String(userId);

    // SUPERADMIN STATUS
    const superadminStatus = userId === 1 ? 1 : 0;

    logger.log("SUPERADMIN STATUS =", superadminStatus);

    // DISABLE EMPLOYEE
    const result = await employeeModel.deleteEmployee(
      employeeId,
      userId,
      disabledByName,
      superadminStatus
    );

    // CHECK EMPLOYEE
    if (result.rowsAffected[0] === 0) {
      logger.log("❌ Employee Not Found");

      return res.status(404).json({
        success: false,
        error: "Employee not found",
      });
    }

    logger.log("✅ EMPLOYEE DISABLED SUCCESSFULLY");

    // RESPONSE
    return res.status(200).json({
      success: true,
      message: "Employee disabled successfully",
      data: {
        employee_id: employeeId,
        disabled_by: userId,
        disabled_by_name: disabledByName,
        superadmin_status: superadminStatus,
      },
    });
  } catch (err) {
    logger.log("\n======================================");
    logger.log("❌ DELETE EMPLOYEE ERROR");
    logger.log("======================================");

    logger.error("ERROR =", err);
    logger.error("MESSAGE =", err.message);
    logger.error("STACK =", err.stack);

    logger.log("======================================\n");

    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// ==========================================
// RESTORE EMPLOYEE
// ==========================================

const restoreEmployee = async (req, res) => {
  try {
    const employeeId = parseInt(req.params.id);

    if (isNaN(employeeId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid Employee ID",
      });
    }

    const isRestored = await employeeModel.restoreEmployee(employeeId);

    if (!isRestored) {
      return res.status(404).json({
        success: false,
        error: "Employee not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Employee restored successfully",
    });
  } catch (error) {
    logger.error("RESTORE EMPLOYEE ERROR:", error);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
    });
  }
};

// ==========================================
// DATE FORMAT
// ==========================================

function formatDateForExcel(val) {
  if (!val && val !== 0) return "";

  const date = new Date(val);

  if (!isNaN(date.getTime())) {
    const dd = String(date.getDate()).padStart(2, "0");

    const mm = String(date.getMonth() + 1).padStart(2, "0");

    const yyyy = date.getFullYear();

    return `${dd}-${mm}-${yyyy}`;
  }

  return String(val);
}

// ==========================================
// EXPORT EMPLOYEES TO EXCEL
// ==========================================

const exportEmployeesToExcel = async (req, res) => {
  logger.log("\n======================================");
  logger.log("EXPORT EMPLOYEES EXCEL API");
  logger.log("REQ QUERY =", req.query);
  logger.log("======================================\n");

  try {
    // ====================================
    // GET DATA
    // ====================================

    const employees = await employeeModel.exportEmployeesToExcel(req.query);

    // ====================================
    // HEADERS
    // ====================================
    // logger.log(employees);
    const headers = [
      "Employee Code",
      "Employee Name",
      "Gender",
      "Date of birth",
      "Date of Joining",
      "Designation",
      "Address",
      "City",
      "State",
      "Pincode",
      "Country",
      "Phone1",
      "Phone2",
      "Email Id",
      "Driving License No",
      "Pancard No",
      "Aadhar No",
      "Passport No",
      "UAN No",
      "ESIS No",
      "Bank Name",
      "Account No",
      "Bank Address",
      "Bank City",
      "Bank State",
      "IFSC Code",
      "MICR",
      "Basic Salary",
      "PF No",
      "Client Name",
      "Client Code",
      "Site Name",
      "Created On",
    ];

    // ====================================
    // EXCEL ROWS
    // ====================================

    const excelRows = employees.map((e) => [
      e.employee_code || "",

      `${e.first_name || ""}
           ${e.middle_name || ""}
           ${e.last_name || ""}`,
      e.gender || "",
      e.dob ? formatDateForExcel(e.dob) : "",
      e.date_of_joining ? formatDateForExcel(e.date_of_joining) : "",
      e.rank || "",
      e.address || "",
      e.city || "",
      e.state || "",
      e.pincode || "",
      e.country || "",
      e.phone1 || "",
      e.phone2 || "",
      e.email_id || "",
      e.driving_license || "",
      e.pancard_no || "",
      e.aadhar_no || "",
      e.passport_no || "",
      e.uan_no || "",
      e.esis_no || "",
      e.bank_name || "",
      e.account_no || "",
      e.bank_address || "",
      e.bank_city || "",
      e.bank_state || "",
      e.bank_ifsc || "",
      e.bank_micr || "",
      e.basic_salary || "",
      e.pf_no || "",
      e.client_name || "",
      e.client_code || "",
      e.site_name || "",
      e.created_on ? formatDateForExcel(e.created_on) : "",
    ]);

    // ====================================
    // SHEET DATA
    // ====================================

    const finalSheetData = [headers, ...excelRows];

    const worksheet = xlsx.utils.aoa_to_sheet(finalSheetData);

    const workbook = xlsx.utils.book_new();

    xlsx.utils.book_append_sheet(workbook, worksheet, "Employees");

    // ====================================
    // FILE NAME
    // ====================================

    const randomNumber = Math.floor(1000000000 + Math.random() * 9000000000);

    const fileName = `Employees_${randomNumber}.xlsx`;

    // ====================================
    // BUFFER
    // ====================================

    const excelBuffer = xlsx.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    // ====================================
    // RESPONSE
    // ====================================

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    return res.send(excelBuffer);
  } catch (error) {
    logger.error("DOWNLOAD EMPLOYEES EXCEL ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to download Excel",
      error: error.message,
    });
  }
};

const verifyEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    logger.log("================================");
    logger.log("VERIFY API CALLED");
    logger.log("PARAMS =", req.params);
    logger.log("BODY =", req.body);
    logger.log("USER =", req.user);
    logger.log("================================");

    const { verification_remark, status, client_id, site_id } = req.body;

    const employeeId = parseInt(id, 10);

    if (isNaN(employeeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee ID",
      });
    }

    const verifiedBy = req.user.id;

    // =========================
    // GET LOGIN USER
    // =========================

    const userData = await employeeModel.getUserById(verifiedBy);

    const verifyName = userData?.first_name || "";

    // logger.log("verifiedBy =>", verifiedBy);

    // logger.log("verifyName =>", verifyName);

    // =========================
    // VERIFY EMPLOYEE
    // =========================

    await employeeModel.verifyEmployee({
      employeeId,
      verification_remark,
      verifiedBy,
      verifyName,
      status,
      client_id,
      site_id,
    });

    return res.status(200).json({
      success: true,
      message: "Employee verified successfully",
      verify_by: verifiedBy,
      verify_name: verifyName,
      emp_stage: status || "Verified",
    });
  } catch (error) {
    logger.error("Verification Error:", error);

    return res.status(500).json({
      success: false,
      message: "Verification failed",
      error: error.message,
    });
  }
};

const {
  getAllIdCards,
  getIdCardByCode,
  downloadIdCard,
} = require("../controllers/idCardController");

const updateOfferStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      client_id,
      site_id,
      branch_id,
      employee_code,
      employee_type,
      reporting_manager,
      working_hours,
      shift_type,
        verification_status,  
         employee_login_coordinates,
  employee_login_coordinates_type,
    } = req.body;

    logger.log("employee :", id);

    // =========================
    // VALIDATION
    // =========================

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Employee ID is required",
      });
    }

    if (employee_code) {
      const empExists = await employeeModel.checkEmployeeCode(employee_code, id);
      if (empExists) {
        return res.status(400).json({
          success: false,
          message: "Employee code already exists",
        });
      }
    }

    // =========================
    // UPDATE EMPLOYEE STATUS
    // =========================

    logger.log('BEFORE updateOfferStatus');
    //  const employee = await employeeModel.updateOfferStatus({
    //   id,
    //   client_id,
    //   branch_id: site_id || branch_id,
    //   employee_type,
    //   reporting_manager,
    //   working_hours,
    //   shift_type,
    //   employee_code,
    // });
    logger.log(site_id,branch_id,"Site id, branch id log check---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------")
   
const employee = await employeeModel.updateOfferStatus({
  id,
  client_id,
  site_id,
  branch_id,
  employee_type,
  reporting_manager,
  working_hours,
  shift_type,
  employee_code,
  verification_status,// नवीन field
});


logger.log("REQUEST SITE ID:", site_id);
logger.log("REQUEST BRANCH ID:", branch_id);

logger.log("UPDATED EMPLOYEE SITE ID:", employee?.site_id);
logger.log("UPDATED EMPLOYEE BRANCH ID:", employee?.branch_id);

    logger.log('BEFORE addEmpCode'); const addEmpCode = await employeeModel.addEmpCodeInAllEmpTables(
      id,
      employee_code,
    );

    logger.log('BEFORE generateOfferLetterAuto'); const offrerLetterPath = await generateOfferLetterAuto(id);
    logger.log("offrerLetterPath", offrerLetterPath);
    if (!offrerLetterPath) {
      return res.status(404).json({
        success: false,
        message: "Employee Id card Generate Fail",
      });
    }
    const employeeCardId = await downloadIdCard(employee_code);
    logger.log("employeeCardId :", employeeCardId);
    if (!employeeCardId) {
      return res.status(404).json({
        success: false,
        message: "Employee Id card Generate Fail",
      });
    }
    if (employeeCardId) {
      const file = { path: employeeCardId.filePath };
      const cardPath = getRelativePathFromApi(file);
      const saveIdIntoEmployee = await employeeModel.saveCardId(id, cardPath);
    }
    // =========================
    // CHECK EMPLOYEE
    // =========================

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // =========================
    // CHECK USER EXISTS
    // =========================

    let existingUser = null;
    if (employee.email_id) {
      existingUser = await userModel.getUserByEmail(employee.email_id);
    }
    if (!existingUser && employee.phone1) {
      existingUser = await userModel.getUserByPhone(employee.phone1);
    }

      let fetchedBranchName = employee.branch_name || employee.fetched_branch_name || "";

    // =========================
    // CREATE USER
    // =========================

    if (!existingUser) {
      // =========================
      // PASSWORD
      // =========================

      // userModel.createUser automatically applies md5 hash. 
      // Do not pass employee.password here because it's already hashed, causing double md5.
      const defaultPassword = "12345";

      // =========================
      // INSERT USER
      // =========================

      await userModel.createUser({
        first_name: employee.first_name,
        middle_name: employee.middle_name,
        last_name: employee.last_name,
        fullname: employee.emp_full_name,
        email: employee.email_id,
        password: defaultPassword,
        phone: employee.phone1,
        address: employee.address,
        city: employee.city,
        pincode: employee.pincode,
        role: "EMPLOYEE",
        company_id: employee.company_id,
        branch_id: employee.branch_id,
        branch_name: fetchedBranchName,
        site_id: employee.site_id,
        emp_code: employee.employee_code,
        profile_image: employee.employee_logo,
        is_employee: 1,
        gender: employee.gender,
        bank_name: employee.bank_name,
        account_no: employee.account_no,
        bank_ifsc: employee.bank_ifsc,
        ac_holder_name: employee.ac_holder_name,
        bank_address: employee.bank_address,
        bank_state: employee.bank_state,
        bank_city: employee.bank_city,
        bank_micr: employee.bank_micr,
        card_no: employee.card_no,
        client_id: employee.client_id,
        site_id: employee.site_id,
        client_code: employee.client_code,
        site_name: employee.site_name,
        client_name: employee.client_name,
        active: 0,
        onboarding: 1,
        source: "WEB",
        emp_id: id,
         employee_login_coordinates: JSON.stringify(
      Array.isArray(employee_login_coordinates)
        ? employee_login_coordinates
        : []
    ),
    employee_login_coordinates_type:
      employee_login_coordinates_type || null,
        login_from_date: employee.login_from_date,
        login_to_date: employee.login_to_date,
        modified_by: req.user?.id,
        modified_by_name: req.user?.first_name || req.user?.fullname || req.user?.name,
        modified_on: new Date(),
        disabled_by: null,
        disabled_by_name: null,
        disabled_on: null
      }, null, req.user);
    } else {
      // Update existing user with new transfer details
      await userModel.updateUser(existingUser.id, {
        company_id: employee.company_id,
        branch_id: branch_id || employee.branch_id,
        branch_name: fetchedBranchName,
        client_id: employee.client_id,
        site_id: employee.site_id,
        client_code: employee.client_code,
        site_name: employee.site_name,
        client_name: employee.client_name,
         employee_login_coordinates: JSON.stringify(
      Array.isArray(employee_login_coordinates)
        ? employee_login_coordinates
        : []
    ),
    employee_login_coordinates_type:
      employee_login_coordinates_type || null,
        is_employee: 1,
      }, null, req.user);
    }
// ==========================================
// SAVE EMPLOYEE LOGIN COORDINATES
// ==========================================

const coordinateType = String(
  employee_login_coordinates_type || ""
)
  .trim()
  .replace(/\s+/g, " ")
  .toUpperCase();

if (coordinateType === "EMPLOYEE COORDINATES") {
  const coordinates = Array.isArray(employee_login_coordinates)
    ? employee_login_coordinates
    : [];

  await employeeModel.saveEmployeeLoginCoordinates({
    employee_code: employee.employee_code || employee_code,
    coordinates,
    user: req.user,
  });
}
    return res.status(200).json({
      success: true,
      message: "Employee approved and user created successfully",
    });
  } catch (error) {
    logger.error("Offer Status Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update offer status",
      error: error.message,
    });
  }
};

const generateOfferLetterAuto = async (id) => {
  try {
    // const { id } = req.params;
    const data = await employeeModel.getEmployeeOfferData(id);
    if (!data.emp) throw new Error("Employee not found");

    const fileName = `appointment_letter__${data.emp.client_id + "_" || ""}${data.emp.site_id || ""}_${Date.now()}.pdf`;
    const saveDir = path.join(process.env.FRONTEND_FOLDER, "/api/emp_docs");

    if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });

    // 1. Define fullPath BEFORE using it
    const fullPath = path.join(saveDir, fileName);

    // 2. Call the generator function (ensure it handles doc.end() internally)
    await generatePDFDocument(data, fullPath);

    // 3. Update DB
    const dbFilePath = `emp_docs/${fileName}`;
    await employeeModel.updateOfferLetterDetails({
      emp_id: id,
      appointment_letter_img_path: dbFilePath,
      offer_letter_ref_no: `MUM/${data.emp.employee_code}`,
    });

    // return res.status(200).json({
    //   success: false,
    //   message: { filePath: dbFilePath, fullPath },
    // });

    // 3. Stream the file directly to the frontend
    // res.setHeader("Content-Type", "application/pdf");
    // res.setHeader(
    //   "Content-Disposition",
    //   `attachment; filename=appointment_letter__${data.emp.client_id + "_" || ""}${data.emp.site_id || ""}.pdf`,
    // );

    return fullPath;
  } catch (err) {
    logger.error("ID Card Generation Error:", err);
    return {
      success: false,
      message: "Failed to generate ID card",
      error: err.message,
    };
  }
};

const generateOfferLetterOld = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await employeeModel.getEmployeeOfferData(id);
    if (!data.emp) throw new Error("Employee not found");

    const fileName = `appointment_letter__${data.emp.client_id + "_" || ""}${data.emp.site_id || ""}_${Date.now()}.pdf`;
    const saveDir = path.join(process.env.FRONTEND_FOLDER, "/api/emp_docs");

    if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });

    // 1. Define fullPath BEFORE using it
    const fullPath = path.join(saveDir, fileName);

    // 2. Call the generator function (ensure it handles doc.end() internally)
    await generatePDFDocument(data, fullPath);

    // 3. Update DB
    const dbFilePath = `emp_docs/${fileName}`;
    await employeeModel.updateOfferLetterDetails({
      emp_id: id,
      appointment_letter_img_path: dbFilePath,
      offer_letter_ref_no: `MUM/${data.emp.employee_code}`,
    });

    // return res.status(200).json({
    //   success: false,
    //   message: { filePath: dbFilePath, fullPath },
    // });

    // 3. Stream the file directly to the frontend
    // res.setHeader("Content-Type", "application/pdf");
    // res.setHeader(
    //   "Content-Disposition",
    //   `attachment; filename=appointment_letter__${data.emp.client_id + "_" || ""}${data.emp.site_id || ""}.pdf`,
    // );

    return res.sendFile(fullPath);
  } catch (err) {
    logger.error("ID Card Generation Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate ID card",
      error: error.message,
    });
  }
};

// ======================================
// CREATE EMPLOYEE NOMINEE
// ======================================
const createEmployeeNominee = async (req, res) => {
  logger.log("\n======================================");
  logger.log("CREATE EMPLOYEE NOMINEE API START");
  logger.log("TIME =", new Date());
  logger.log("REQ BODY =", req.body);
  logger.log("======================================\n");

  try {
    const d = req.body;

    // ======================================
    // CREATE NOMINEE
    // ======================================

    const nomineeId =
      await employeeModel.createEmployeeNominee(d);

    logger.log("\n========== QUERY SUCCESS ==========");
    logger.log("Inserted Nominee ID =", nomineeId);
    logger.log("===================================\n");

    return res.status(201).json({
      success: true,
      message: "Nominee created successfully",
      nominee_id: nomineeId,
    });

  } catch (error) {
    logger.log("\n========== ERROR ==========");
    logger.log("MESSAGE =", error.message);
    logger.log("FULL ERROR =", error);
    logger.log("===========================\n");

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};



const updateEmployeeNominee = async (req, res) => {

  logger.log("\n======================================");
  logger.log("UPDATE EMPLOYEE NOMINEE API START");
  logger.log("TIME =", new Date());
  logger.log("PARAM ID =", req.params.id);
  logger.log("REQ BODY =", req.body);
  logger.log("======================================\n");

  try {

    const nomineeId = Number(req.params.id);
    const d = req.body;


    // ======================================
    // VALIDATION
    // ONLY NOMINEE ID REQUIRED
    // ======================================

    if (!nomineeId || isNaN(nomineeId)) {

      return res.status(400).json({
        success: false,
        message: "Valid Nominee ID is required",
      });

    }


    // ======================================
    // UPDATE NOMINEE
    // ======================================

    const result =
      await employeeModel.updateEmployeeNominee(
        nomineeId,
        d
      );


    // ======================================
    // NOT FOUND / UPDATE FAILED
    // ======================================

    if (!result.success) {

      return res.status(404).json({
        success: false,
        message: result.message,
      });

    }


    // ======================================
    // SUCCESS LOG
    // ======================================

    logger.log(
      "NOMINEE UPDATED SUCCESSFULLY =",
      nomineeId
    );


    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({

      success: true,

      message:
        "Nominee updated successfully",

      nominee_id:
        nomineeId,

    });


  } catch (error) {

    logger.log(
      "\n========== UPDATE ERROR =========="
    );

    logger.log(
      "MESSAGE =",
      error.message
    );

    logger.log(
      "FULL ERROR =",
      error
    );

    logger.log(
      "==================================\n"
    );


    return res.status(500).json({

      success: false,

      message:
        error.message,

    });

  }
};
const deleteEmployeeNominee = async (req, res) => {
  logger.log("\n======================================");
  logger.log("DELETE EMPLOYEE NOMINEE API START");
  logger.log("TIME =", new Date());
  logger.log("PARAM ID =", req.params.id);
  logger.log("======================================\n");

  try {
    const nomineeId = Number(req.params.id);

    // ======================================
    // VALIDATION
    // ======================================

    if (!nomineeId) {
      return res.status(400).json({
        success: false,
        message: "Valid Nominee ID is required",
      });
    }

    // ======================================
    // DELETE
    // ======================================

    const result =
      await employeeModel.deleteEmployeeNominee(
        nomineeId
      );

    if (!result.success) {
      return res.status(404).json({
        success: false,
        message: result.message,
      });
    }

    logger.log("NOMINEE DELETED SUCCESSFULLY =", nomineeId);

    return res.status(200).json({
      success: true,
      message: "Nominee deleted successfully",
      nominee_id: nomineeId,
    });

  } catch (error) {
    logger.log("\n========== DELETE ERROR ==========");
    logger.log("MESSAGE =", error.message);
    logger.log("FULL ERROR =", error);
    logger.log("==================================\n");

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// ======================================
// CREATE EMPLOYEE EXPERIENCE
// ======================================

const createEmployeeExperience = async (req, res) => {
  try {
    const d = req.body;

    // ======================================
    // VALIDATION
    // ======================================

    if (!d.emp_id) {
      return res.status(400).json({
        success: false,

        message: "Employee ID is required",
      });
    }

    // ======================================
    // SAVE EXPERIENCE
    // ======================================

    await employeeModel.createEmployeeExperience(d);

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(201).json({
      success: true,

      message: "Employee experience saved successfully",
    });
  } catch (error) {
    logger.log(error);

    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

const deleteEmployeeExperience = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: "Experience ID is required" });
    }
    await employeeModel.deleteEmployeeExperience(id);
    return res.status(200).json({ success: true, message: "Experience deleted successfully" });
  } catch (error) {
    logger.log(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ======================================
// GET EMPLOYEE DOCUMENTS
// ======================================

const getEmployeeDocuments = async (req, res) => {
  logger.log("\n======================================");

  logger.log("GET EMPLOYEE DOCUMENTS API START");

  logger.log("TIME =", new Date());

  logger.log("PARAMS =", req.params);

  logger.log("======================================\n");

  try {
    // =====================================
    // EMPLOYEE ID
    // =====================================

    const employeeId = parseInt(req.params.id, 10);

    logger.log("EMPLOYEE ID =", employeeId);

    if (isNaN(employeeId) || employeeId <= 0) {
      logger.log("âŒ INVALID EMPLOYEE ID");

      return res.status(400).json({
        success: false,
        error: "Invalid Employee ID",
      });
    }

    // =====================================
    // GET DOCUMENTS
    // =====================================

    const documents = await employeeModel.getEmployeeDocuments(employeeId);

    // =====================================
    // FORMAT IMAGE URL
    // =====================================

    const formattedDocuments = documents.map((doc) => {
      let imageUrl = "";

      if (doc.source) {
        imageUrl = `/${doc.source}`;
      }

      return {
        ...doc,
        image_url: imageUrl,
      };
    });

    logger.log("FORMATTED DOCUMENTS =", formattedDocuments);

    // =====================================
    // RESPONSE
    // =====================================

    logger.log("âœ… DOCUMENT FETCH SUCCESS");

    logger.log("TOTAL DOCUMENTS =", formattedDocuments.length);

    return res.status(200).json({
      success: true,

      count: formattedDocuments.length,

      data: formattedDocuments,
    });
  } catch (err) {
    logger.log("\n======================================");

    logger.log("âŒ GET DOCUMENT ERROR");

    logger.log("======================================");

    logger.error("ERROR =", err);

    logger.error("MESSAGE =", err.message);

    logger.error("STACK =", err.stack);

    logger.log("======================================\n");

    return res.status(500).json({
      success: false,

      error: err.message,
    });
  }
};

// ======================================
// UPDATE EMPLOYEE DOCUMENTS
// ======================================

const updateEmployeeDocuments = async (req, res) => {
  logger.log("\n======================================");

  logger.log("UPDATE EMPLOYEE DOCUMENTS API START");

  logger.log("TIME =", new Date());

  logger.log("BODY =", req.body);

  logger.log("FILES =", req.files);

  logger.log("======================================\n");

  try {
    // ======================================
    // EMPLOYEE ID
    // ======================================

    const emp_id = parseInt(req.body.emp_id, 10);

    logger.log("PARSED EMP_ID =", emp_id);

    if (isNaN(emp_id) || emp_id <= 0) {
      logger.log("âŒ INVALID EMPLOYEE ID");

      return res.status(400).json({
        success: false,
        error: "Invalid Employee ID",
      });
    }

    // ======================================
    // DOCUMENTS
    // ======================================

    const documents =
      typeof req.body.documents === "string"
        ? JSON.parse(req.body.documents)
        : req.body.documents || [];

    logger.log("DOCUMENTS =", documents);

    const files = req.files?.kycDocuments || [];

    logger.log("FILES COUNT =", files.length);

    // ======================================
    // UPDATE DOCUMENTS
    // ======================================

  const savedDocuments = await employeeModel.updateEmployeeDocuments({
  emp_id,
  documents,
  files,
  cancelledChequeFile: req.files?.cancelledChequeFile?.[0] || null,
});

    logger.log("âœ… ALL DOCUMENTS UPDATED SUCCESSFULLY");

  return res.json({
  success: true,
  message: "Documents Updated Successfully",
  documents: savedDocuments,
});
  } catch (err) {
    logger.log("\n========== UPDATE DOC ERROR ==========");

    logger.log("MESSAGE =", err.message);

    logger.log("FULL ERROR =", err);

    logger.log("======================================\n");

    return res.status(500).json({
      success: false,

      message: err.message,
    });
  }
};
const deleteEmployeeDocument = async (req, res) => {
  try {
    const documentId = parseInt(req.params.id, 10);

    if (!documentId) {
      return res.status(400).json({
        success: false,
        message: "Invalid document ID",
      });
    }

    await employeeModel.deleteEmployeeDocument(
      documentId
    );

    return res.json({
      success: true,
      message: "Document deleted successfully",
    });

  } catch (error) {
    logger.error(
      "DELETE DOCUMENT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const toUpper = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim().toUpperCase();
};

// ======================================
// UPLOAD EMPLOYEE DOCUMENT
// ======================================


const uploadEmployeeDocument = async (req, res) => {
  try {
    const emp_id = Number(req.body.emp_id);

    if (!Number.isInteger(emp_id) || emp_id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid Employee ID",
      });
    }

    const emp_code = req.body.emp_code || "";
    const created_by = req.user.id;
    const created_by_name = req.user.first_name;

    let documents;

    try {
      documents =
        typeof req.body.documents === "string"
          ? JSON.parse(req.body.documents)
          : req.body.documents || [];
    } catch {
      return res.status(400).json({
        success: false,
        message: "Invalid documents JSON",
      });
    }

    if (!Array.isArray(documents)) {
      return res.status(400).json({
        success: false,
        message: "Documents must be an array",
      });
    }

    const files = req.files?.kycDocuments || [];

    console.log("Upload request:", {
      emp_id,
      documentCount: documents.length,
      fileCount: files.length,
      documentTypes: documents.map((d) => d.documentType),
      files: files.map((f) => ({
        filename: f.filename,
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
      })),
    });

    const savedDocuments =
      await employeeModel.uploadEmployeeDocuments({
        emp_id,
        emp_code,
        created_by,
        created_by_name,
        documents,
        files,
        cancelledChequeFile:
          req.files?.cancelledChequeFile?.[0] || null,
      });

    console.log("Saved documents returned by model:", savedDocuments);

    if (!Array.isArray(savedDocuments)) {
      throw new Error(
        "Model did not return a documents array"
      );
    }

    const missingIds = savedDocuments.filter(
      (doc) => doc.id == null
    );

    if (missingIds.length > 0) {
      throw new Error(
        "One or more uploaded documents have no ID"
      );
    }

    return res.status(200).json({
      success: true,
      message: "Documents uploaded successfully",
      documents: savedDocuments,
    });
  } catch (error) {
    console.error("UPLOAD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Document upload failed",
    });
  }
};


// ======================================
// BASE64 IMAGE
// ======================================

function getBase64Image(imagePath) {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }

  const image = fs.readFileSync(imagePath);

  const ext = path.extname(imagePath).toLowerCase();

  let mimeType = "image/png";

  if (ext === ".jpg" || ext === ".jpeg") {
    mimeType = "image/jpeg";
  }

  if (ext === ".png") {
    mimeType = "image/png";
  }

  return `data:${mimeType};base64,${image.toString("base64")}`;
}

// ======================================
// STYLES
// ======================================

const styles = StyleSheet.create({
  page: {
    paddingTop: 25,
    paddingBottom: 25,
    paddingHorizontal: 35,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#000",
    backgroundColor: "#fff",
  },

  // HEADER

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },

  logo: {
    width: 75,
    height: 75,
    objectFit: "contain",
    marginRight: 15,
  },

  companySection: {
    flex: 1,
  },

  companyName: {
    fontSize: 15,
    fontWeight: "bold",
  },

  companyAddress: {
    fontSize: 8,
    lineHeight: 1.4,
    marginTop: 2,
  },

  line: {
    borderBottomWidth: 1,
    borderBottomColor: "#999",
    marginBottom: 12,
  },

  // TITLE

  title: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "bold",
    textDecoration: "underline",
    marginBottom: 10,
  },

  // RIGHT

  rightSection: {
    alignSelf: "flex-end",
    textAlign: "right",
    fontSize: 9,
    lineHeight: 1.5,
    marginBottom: 10,
  },

  // BODY

  section: {
    marginBottom: 10,
    lineHeight: 1.5,
  },

  bold: {
    fontWeight: "bold",
  },

  normalText: {
    fontSize: 10,
    lineHeight: 1.6,
  },

  // FOOTER

  footer: {
    marginTop: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },

  signBox: {
    width: 220,
  },

  signLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    marginBottom: 5,
    width: 180,
  },

  signText: {
    fontSize: 9,
  },

  // PHOTO

  photoContainer: {
    alignItems: "center",
  },

  photo: {
    width: 80,
    height: 95,
    borderWidth: 1,
    borderColor: "#000",
    objectFit: "cover",
  },

  photoLabel: {
    fontSize: 8,
    marginTop: 3,
  },

  // AUTHORISED

  authorised: {
    marginTop: 15,
  },

  authorisedTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 8,
  },

  authorisedText: {
    fontSize: 9,
    marginBottom: 2,
  },
});

// ======================================
// DATE FORMAT
// ======================================

const formatDate = (dateString) => {
  if (!dateString) return "";

  const date = new Date(dateString);

  return date.toLocaleDateString("en-GB");
};

// ======================================
// DOCUMENT
// ======================================

const OfferLetterDocument = ({
  emp,
  client,

  // ======================================
  // IMAGES
  // ======================================

  logoBase64,
  employeePhotoBase64,

  // ======================================
  // COMPANY
  // ======================================

  companyName,
  companyLogo,

  // ======================================
  // BRANCH
  // ======================================

  branchName,
  branchAddress,
}) => {

  // ======================================
  // CLIENT FULL ADDRESS
  // ======================================

  const fullAddress = [
    client?.client_add,
    client?.client_city,
    client?.client_state,
    client?.city_pincode,
  ]
    .filter(Boolean)
    .join(", ");


  // ======================================
  // BRANCH FULL DETAILS
  // ======================================

  const fullBranchAddress = [
    branchName,
    branchAddress,
  ]
    .filter(Boolean)
    .join(", ");


  // ======================================
  // DOCUMENT
  // ======================================

  return React.createElement(
    Document,
    null,

    React.createElement(
      Page,
      {
        size: "A4",
        style: styles.page,
      },


      // ======================================
      // HEADER
      // ======================================

      React.createElement(
        View,
        {
          style: styles.header,
        },


        // ======================================
        // COMPANY LOGO
        // ======================================

        logoBase64 &&
          React.createElement(
            Image,
            {
              src: logoBase64,
              style: styles.logo,
            }
          ),


        // ======================================
        // COMPANY DETAILS
        // ======================================

        React.createElement(
          View,
          {
            style: styles.companySection,
          },


          // ====================================
          // COMPANY NAME
          // ====================================

          React.createElement(
            Text,
            {
              style: styles.companyName,
            },
            companyName || "COMPANY NAME"
          ),


          // ====================================
          // BRANCH NAME
          // ====================================

          branchName &&
            React.createElement(
              Text,
              {
                style: styles.companyAddress,
              },
              branchName
            ),


          // ====================================
          // BRANCH ADDRESS
          // ====================================

          branchAddress &&
            React.createElement(
              Text,
              {
                style: styles.companyAddress,
              },
              branchAddress
            )
        )
      ),


      // ======================================
      // HEADER LINE
      // ======================================

      React.createElement(
        View,
        {
          style: styles.line,
        }
      ),


      // ======================================
      // TITLE
      // ======================================

      React.createElement(
        Text,
        {
          style: styles.title,
        },
        "POSTING ORDER"
      ),


      // ======================================
      // RIGHT SECTION
      // ======================================

      React.createElement(
        View,
        {
          style: styles.rightSection,
        },


        // ====================================
        // REFERENCE NO
        // ====================================

        React.createElement(
          Text,
          null,
          `Reference No: MUM/${
            emp?.employee_code || "----"
          }`
        ),


        // ====================================
        // DATE
        // ====================================

        React.createElement(
          Text,
          null,
          `Date: ${
            new Date().toLocaleDateString(
              "en-GB"
            )
          }`
        ),


        // ====================================
        // TICKET NO
        // ====================================

        React.createElement(
          Text,
          null,
          `Ticket No: MUM/${
            emp?.employee_code || "----"
          }`
        )
      ),


      // ======================================
      // CLIENT DETAILS
      // ======================================

      React.createElement(
        View,
        {
          style: styles.section,
        },


        // ====================================
        // TO
        // ====================================

        React.createElement(
          Text,
          null,
          "To,"
        ),


        // ====================================
        // UNIT INCHARGE
        // ====================================

        React.createElement(
          Text,
          null,
          "The Unit Incharge,"
        ),


        // ====================================
        // CLIENT NAME
        // ====================================

        React.createElement(
          Text,
          {
            style: styles.bold,
          },
          client?.company_name || "N/A"
        ),


        // ====================================
        // CLIENT ADDRESS
        // ====================================

        React.createElement(
          Text,
          null,
          fullAddress ||
            "Address Not Available"
        )
      ),


      // ======================================
      // CONTENT
      // ======================================

      React.createElement(
        View,
        {
          style: styles.section,
        },


        React.createElement(
          Text,
          {
            style: styles.normalText,
          },


          `Dear Sir/Madam,

We are pleased to inform you that ${
            emp?.first_name || ""
          } ${
            emp?.last_name || ""
          } has been appointed as a ${
            emp?.rank || "staff member"
          } at your unit.

${
  emp?.shift_type
    ? `The employee will be working the ${emp.shift_type} shift`
    : "The employee will be working"
}

${
  emp?.site_hours
    ? ` for ${emp.site_hours} hours daily`
    : ""
} at your location.

w.e.f. ${formatDate(
            emp?.date_of_joining
          )}

and he/she will report on or before ${formatDate(
            emp?.date_of_joining
          )}.

The signature of the appointed person along with his/her photograph is attached herewith.`
        )
      ),


      // ======================================
      // FOOTER
      // ======================================

      React.createElement(
        View,
        {
          style: styles.footer,
        },


        // ====================================
        // EMPLOYEE SIGNATURE
        // ====================================

        React.createElement(
          View,
          {
            style: styles.signBox,
          },


          React.createElement(
            View,
            {
              style: styles.signLine,
            }
          ),


          React.createElement(
            Text,
            {
              style: styles.signText,
            },
            "Signature of FMO"
          )
        ),


        // ====================================
        // EMPLOYEE PHOTO
        // ====================================

        React.createElement(
          View,
          {
            style: styles.photoContainer,
          },


          employeePhotoBase64 &&
            React.createElement(
              Image,
              {
                src: employeePhotoBase64,
                style: styles.photo,
              }
            ),


          React.createElement(
            Text,
            {
              style: styles.photoLabel,
            },
            "Photograph of FMO"
          )
        )
      ),


      // ======================================
      // AUTHORISED SIGNATORY
      // ======================================

      React.createElement(
        View,
        {
          style: styles.authorised,
        },


        React.createElement(
          Text,
          {
            style: styles.authorisedTitle,
          },
          "AUTHORISED SIGNATORY"
        ),


        React.createElement(
          Text,
          {
            style: styles.authorisedText,
          },
          "Name: ____________________"
        ),


        React.createElement(
          Text,
          {
            style: styles.authorisedText,
          },
          "ID No: ____________________"
        )
      )

    )
  );
};

// ======================================
// GENERATE OFFER LETTER
// ======================================
const generateOfferLetter = async (id) => {
  try {

    // ======================================
    // GET EMPLOYEE DATA
    // COMPANY + BRANCH + CLIENT
    // ======================================

    const data =
      await employeeModel.getEmployeeOfferData(id);

    if (!data?.emp) {
      throw new Error("Employee not found");
    }


    // ======================================
    // COMPANY DETAILS FROM DATABASE
    // ======================================

    const companyName =
      data.emp.company_name ||
      "COMPANY NAME";

    const companyLogo =
      data.emp.company_logo ||
      "";

    // ======================================
    // BRANCH DETAILS FROM DATABASE
    // ======================================

    const branchName =
      data.emp.branch_name ||
      "";

    const branchAddress =
      data.emp.branch_address ||
      "";


    // ======================================
    // DEBUG LOG
    // ======================================

    logger.log("==========================================");
    logger.log("OFFER LETTER EMPLOYEE");
    logger.log("Employee ID     :", data.emp.id);
    logger.log("Employee Code   :", data.emp.employee_code);
    logger.log(
      "Employee Name   :",
      `${data.emp.first_name || ""} ${data.emp.last_name || ""}`
    );

    logger.log("Company ID      :", data.emp.company_id);
    logger.log("Company Name    :", companyName);
    logger.log("Company Logo    :", companyLogo);

    logger.log("Branch ID       :", data.emp.branch_id);
    logger.log("Branch Name     :", branchName);
    logger.log("Branch Address  :", branchAddress);

    logger.log("Client ID       :", data.emp.client_id);
    logger.log(
      "Client Name     :",
      data.client?.company_name || ""
    );

    logger.log("==========================================");


    // ======================================
    // COMPANY LOGO PATH
    // ======================================

    let logoPath = null;

    if (companyLogo) {

      const cleanLogo = companyLogo
        .replace(/^[/\\]+/, "")
        .replace(/\//g, path.sep);


      // ====================================
      // POSSIBLE LOGO LOCATIONS
      // ====================================

      const possibleLogoPaths = [

        // frontend/api/company_logos/...
        path.join(
          process.env.FRONTEND_FOLDER,
          "api",
          cleanLogo
        ),

        // frontend/api/...
        path.join(
          process.env.FRONTEND_FOLDER,
          cleanLogo
        ),

        // backend/uploads/...
        path.join(
          __dirname,
          "../uploads",
          cleanLogo
        ),

      ];


      // ====================================
      // FIND LOGO
      // ====================================

      for (
        const possiblePath
        of possibleLogoPaths
      ) {

        logger.log(
          "Checking Offer Letter Logo:",
          possiblePath
        );


        if (
          fs.existsSync(possiblePath)
        ) {

          logoPath = possiblePath;

          break;
        }
      }
    }


    logger.log(
      "Company Logo Final Path:",
      logoPath
    );


    // ======================================
    // EMPLOYEE PHOTO PATH
    // ======================================

    const employeePhotoPath =
      data.emp.profile_image
        ? path.join(
            process.env.FRONTEND_FOLDER,
            "api",
            data.emp.profile_image
          )
        : null;


    // ======================================
    // COMPANY LOGO BASE64
    // ======================================

    const logoBase64 =
      logoPath &&
      fs.existsSync(logoPath)
        ? getBase64Image(logoPath)
        : null;


    // ======================================
    // EMPLOYEE PHOTO BASE64
    // ======================================

    const employeePhotoBase64 =
      employeePhotoPath &&
      fs.existsSync(employeePhotoPath)
        ? getBase64Image(employeePhotoPath)
        : null;


    // ======================================
    // DOCUMENT
    // ======================================

    const MyDocument = React.createElement(
      OfferLetterDocument,
      {
        emp: data.emp,
        client: data.client,

        logoBase64,
        employeePhotoBase64,

        // ==================================
        // COMPANY DETAILS
        // ==================================

        companyName,
        companyLogo,

        // ==================================
        // BRANCH DETAILS
        // ==================================

        branchName,
        branchAddress,
      }
    );


    // ======================================
    // PDF STREAM
    // ======================================

    const stream =
      await pdf(MyDocument).toBuffer();


    const chunks = [];


    stream.on(
      "data",
      (chunk) => {
        chunks.push(chunk);
      }
    );


    // ======================================
    // WAIT FOR PDF
    // ======================================

    await new Promise(
      (resolve, reject) => {

        stream.on(
          "end",
          resolve
        );

        stream.on(
          "error",
          reject
        );

      }
    );


    // ======================================
    // FINAL BUFFER
    // ======================================

    const pdfBuffer =
      Buffer.concat(chunks);


    // ======================================
    // FILE NAME
    // ======================================

    const fileName =
      `appointment_letter_${id}_${Date.now()}.pdf`;


    // ======================================
    // SAVE DIRECTORY
    // ======================================

    const saveDir =
      path.join(
        process.env.FRONTEND_FOLDER,
        "api",
        "emp_docs"
      );


    // ======================================
    // CREATE DIRECTORY
    // ======================================

    if (
      !fs.existsSync(saveDir)
    ) {

      fs.mkdirSync(
        saveDir,
        {
          recursive: true,
        }
      );

    }


    // ======================================
    // FULL PATH
    // ======================================

    const fullPath =
      path.join(
        saveDir,
        fileName
      );


    // ======================================
    // SAVE PDF
    // ======================================

    fs.writeFileSync(
      fullPath,
      pdfBuffer
    );


    logger.log(
      "Offer Letter Saved:",
      fullPath
    );


    // ======================================
    // DB FILE PATH
    // ======================================

    const dbFilePath =
      `api/emp_docs/${fileName}`;


    // ======================================
    // OFFER REF NO
    // ======================================

    const offerRefNo =
      `MUM/${data.emp.employee_code}`;


    // ======================================
    // UPDATE DATABASE
    // ======================================

    await employeeModel.updateOfferLetterDetails({
      emp_id: id,

      appointment_letter_img_path:
        dbFilePath,

      offer_letter_ref_no:
        offerRefNo,
    });


    // ======================================
    // RETURN
    // ======================================

    return {
      success: true,

      filePath:
        dbFilePath,

      fullPath,
    };


  } catch (err) {

    logger.error(
      "Generate Offer Letter Error:",
      err
    );

    throw err;
  }
};


const PDFDocument = require("pdfkit");

// const generatePDFDocument = (data, fullPath) => {
//   return new Promise((resolve, reject) => {
//     const doc = new PDFDocument({
//       size: "A4",
//       margin: 40,
//       bufferPages: true,
//     });

//     const writeStream = fs.createWriteStream(fullPath);
//     doc.pipe(writeStream);

//     //==================================================
//     // COLORS
//     //==================================================

//     const PRIMARY = "#0B3D91";
//     const DARK = "#222222";
//     const LIGHT = "#666666";
//     const BORDER = "#C8C8C8";

//     //==================================================
//     // COMPANY LOGO
//     //==================================================

//     const logoPath = path.join(__dirname, "../uploads/company/logo.png");

//     if (fs.existsSync(logoPath)) {
//       doc.image(logoPath, 45, 35, {
//         width: 65,
//       });
//     }

//     //==================================================
//     // COMPANY NAME
//     //==================================================

//     doc
//       .fillColor(PRIMARY)
//       .font("Helvetica-Bold")
//       .fontSize(20)
//       .text("ODS PROTECTIVE SERVICES PVT. LTD.", 120, 38);

//     doc
//       .fillColor(DARK)
//       .font("Helvetica")
//       .fontSize(10)
//       .text(
//         "Branch Office : 105 & 106, D Wing, Kailash Industrial Complex,\nVeer Savarkar Marg, Vikhroli West, Mumbai - 400079",
//         120,
//         65
//       );

//     //==================================================
//     // HEADER LINE
//     //==================================================

//     doc
//       .moveTo(40, 112)
//       .lineTo(555, 112)
//       .lineWidth(1)
//       .strokeColor(PRIMARY)
//       .stroke();

//     //==================================================
//     // TITLE
//     //==================================================

//     doc.moveDown(2);

//     doc
//       .fillColor(PRIMARY)
//       .font("Helvetica-Bold")
//       .fontSize(18)
//       .text("POSTING ORDER", {
//         align: "center",
//         underline: true,
//       });

//     //==================================================
//     // REFERENCE DETAILS
//     //==================================================

//     const refY = 150;

//     doc
//       .fillColor(DARK)
//       .fontSize(11)
//       .font("Helvetica")
//       .text("Reference No :", 360, refY);

//     doc
//       .font("Helvetica-Bold")
//       .text(`MUM/${data.emp.employee_code}`, 455, refY);

//     doc
//       .font("Helvetica")
//       .text("Date :", 360, refY + 20);

//     doc
//       .font("Helvetica-Bold")
//       .text(
//         new Date().toLocaleDateString("en-GB"),
//         455,
//         refY + 20
//       );

//     doc
//       .font("Helvetica")
//       .text("Ticket No :", 360, refY + 40);

//     doc
//       .font("Helvetica-Bold")
//       .text(`MUM/${data.emp.employee_code}`, 455, refY + 40);

//     //==================================================
//     // START BODY POSITION
//     //==================================================

//     let currentY = 220;
//         //==================================================
//     // RECIPIENT DETAILS
//     //==================================================

//     doc
//       .fillColor("#000")
//       .font("Helvetica-Bold")
//       .fontSize(12)
//       .text("To,", 45, currentY);

//     currentY += 20;

//     doc
//       .font("Helvetica")
//       .fontSize(11)
//       .text("The Unit Incharge,", 45, currentY);

//     currentY += 18;

//     doc
//       .font("Helvetica-Bold")
//       .text(data.client?.company_name || "N/A", 45, currentY);

//     currentY += 18;

//     doc
//       .font("Helvetica")
//       .text(
//         `${data.client?.client_add || "Address Not Available"}, ${
//           data.client?.client_city || ""
//         }`,
//         45,
//         currentY,
//         {
//           width: 300,
//         }
//       );

//     currentY += 55;

//     //==================================================
//     // EMPLOYEE INFORMATION BOX
//     //==================================================

//     doc
//       .roundedRect(40, currentY, 515, 120, 5)
//       .lineWidth(1)
//       .strokeColor("#CFCFCF")
//       .stroke();

//     // Blue Heading
//     doc
//       .rect(40, currentY, 515, 24)
//       .fill("#0B3D91");

//     doc
//       .fillColor("white")
//       .font("Helvetica-Bold")
//       .fontSize(12)
//       .text("EMPLOYEE DETAILS", 50, currentY + 7);

//     currentY += 35;

//     // Left Column

//     doc.fillColor("black");

//     doc
//       .font("Helvetica-Bold")
//       .fontSize(10)
//       .text("Employee Name", 50, currentY);

//     doc
//       .font("Helvetica")
//       .text(
//         `${data.emp.first_name || ""} ${data.emp.last_name || ""}`,
//         160,
//         currentY
//       );

//     currentY += 20;

//     doc
//       .font("Helvetica-Bold")
//       .text("Employee Code", 50, currentY);

//     doc
//       .font("Helvetica")
//       .text(data.emp.employee_code || "-", 160, currentY);

//     currentY += 20;

//     doc
//       .font("Helvetica-Bold")
//       .text("Designation", 50, currentY);

//     doc
//       .font("Helvetica")
//       .text(data.emp.rank || "-", 160, currentY);

//     // Right Column

//     let rightY = currentY - 40;

//     doc
//       .font("Helvetica-Bold")
//       .text("Joining Date", 310, rightY);

//     doc
//       .font("Helvetica")
//       .text(
//         data.emp.date_of_joining
//           ? new Date(data.emp.date_of_joining).toLocaleDateString("en-GB")
//           : "-",
//         410,
//         rightY
//       );

//     rightY += 20;

//     doc
//       .font("Helvetica-Bold")
//       .text("Shift", 310, rightY);

//     doc
//       .font("Helvetica")
//       .text(data.emp.shift_type || "-", 410, rightY);

//     rightY += 20;

//     doc
//       .font("Helvetica-Bold")
//       .text("Working Hours", 310, rightY);

//     doc
//       .font("Helvetica")
//       .text(
//         data.emp.working_hours
//           ? `${data.emp.working_hours} Hours`
//           : "-",
//         410,
//         rightY
//       );

//     currentY += 55;
//         //==================================================
//     // BODY
//     //==================================================

//     currentY += 20;

//     doc
//       .fillColor("#000")
//       .font("Helvetica")
//       .fontSize(11)
//       .text("Dear Sir/Madam,", 45, currentY);

//     currentY += 25;

//     const employeeName = `${data.emp.first_name || ""} ${data.emp.last_name || ""}`;

//     const joiningDate = data.emp.date_of_joining
//       ? new Date(data.emp.date_of_joining).toLocaleDateString("en-GB")
//       : "____________";

//     const designation = data.emp.rank || "Employee";
//     const shift = data.emp.shift_type || "General";
//     const hours = data.emp.working_hours || "8";

//     const bodyText =
//       `We are pleased to inform you that Mr./Ms. ${employeeName} has been appointed as ${designation} and has been posted to your unit. The employee will be working in the ${shift} shift for ${hours} hours per day. ` +
//       `The employee shall report for duty with effect from ${joiningDate}. Kindly ensure that the employee is provided all necessary guidance regarding duty allocation, attendance procedures, safety instructions and site regulations.`;

//     doc.text(bodyText, 45, currentY, {
//       width: 510,
//       align: "justify",
//       lineGap: 5,
//     });

//     currentY = doc.y + 18;

//     //==================================================
//     // REPORTING INSTRUCTIONS
//     //==================================================

//     doc
//       .font("Helvetica-Bold")
//       .fontSize(11)
//       .text("Reporting Instructions:", 45, currentY);

//     currentY += 20;

//     const instructions = [
//       "Employee must report on or before the joining date.",
//       "Employee shall carry original ID proof during reporting.",
//       "Site Incharge shall verify all joining documents.",
//       "Attendance should be marked from the first working day.",
//       "Any discrepancy should immediately be reported to HR."
//     ];

//     instructions.forEach((item) => {
//       doc
//         .circle(52, currentY + 6, 2)
//         .fill("#0B3D91");

//       doc
//         .fillColor("#000")
//         .font("Helvetica")
//         .fontSize(10)
//         .text(item, 62, currentY, {
//           width: 470
//         });

//       currentY += 18;
//     });

//     currentY += 20;

//     //==================================================
//     // PHOTO BOX
//     //==================================================

//     const photoX = 430;
//     const photoY = currentY;

//     doc
//       .roundedRect(photoX, photoY, 95, 115, 5)
//       .lineWidth(1)
//       .strokeColor("#999")
//       .stroke();

//     if (
//       data.emp.photo &&
//       fs.existsSync(data.emp.photo)
//     ) {
//       doc.image(data.emp.photo, photoX + 3, photoY + 3, {
//         fit: [89, 109],
//         align: "center",
//         valign: "center",
//       });
//     } else {
//       doc
//         .font("Helvetica")
//         .fontSize(9)
//         .fillColor("#888")
//         .text("Employee Photograph", photoX + 10, photoY + 48, {
//           width: 75,
//           align: "center",
//         });
//     }

//     //==================================================
//     // SIGNATURE SECTION
//     //==================================================

//     const signY = photoY + 20;

//     doc
//       .moveTo(50, signY + 45)
//       .lineTo(220, signY + 45)
//       .strokeColor("#000")
//       .stroke();

//     doc
//       .fillColor("#000")
//       .font("Helvetica")
//       .fontSize(10)
//       .text("Signature / Thumb Impression of Employee", 50, signY + 50);

//     doc
//       .moveTo(50, signY + 105)
//       .lineTo(220, signY + 105)
//       .stroke();

//     doc
//       .font("Helvetica")
//       .text("Signature of FMO", 50, signY + 110);

//     currentY = photoY + 140;
//         //==================================================
//     // AUTHORISED SIGNATORY SECTION
//     //==================================================

//     currentY += 20;

//     // Draw separator line
//     doc
//       .moveTo(40, currentY)
//       .lineTo(555, currentY)
//       .strokeColor("#CCCCCC")
//       .lineWidth(1)
//       .stroke();

//     currentY += 20;

//     // Left Side - Company Sign
//     doc
//       .font("Helvetica-Bold")
//       .fontSize(12)
//       .fillColor("#0B3D91")
//       .text("AUTHORISED SIGNATORY", 45, currentY);

//     currentY += 25;

//     doc
//       .fillColor("#000")
//       .font("Helvetica")
//       .fontSize(10)
//       .text("For ODS PROTECTIVE SERVICES PVT. LTD.", 45, currentY);

//     currentY += 35;

//     doc
//       .moveTo(45, currentY)
//       .lineTo(220, currentY)
//       .strokeColor("#000")
//       .stroke();

//     doc
//       .font("Helvetica")
//       .text("Authorised Signature", 45, currentY + 5);

//     //==================================================
//     // COMPANY SEAL BOX
//     //==================================================

//     doc
//       .roundedRect(390, currentY - 40, 135, 90, 5)
//       .lineWidth(1)
//       .dash(4, { space: 2 })
//       .strokeColor("#888")
//       .stroke()
//       .undash();

//     doc
//       .font("Helvetica")
//       .fontSize(10)
//       .fillColor("#777")
//       .text(
//         "COMPANY\nSEAL",
//         390,
//         currentY - 10,
//         {
//           width: 135,
//           align: "center"
//         }
//       );

//     //==================================================
//     // FOOTER
//     //==================================================

//     const pages = doc.bufferedPageRange();

//     for (let i = 0; i < pages.count; i++) {

//       doc.switchToPage(i);

//       // Footer line
//       doc
//         .moveTo(40, 790)
//         .lineTo(555, 790)
//         .strokeColor("#0B3D91")
//         .lineWidth(1)
//         .stroke();

//       doc
//         .fillColor("#666666")
//         .font("Helvetica")
//         .fontSize(8)
//         .text(
//           "ODS PROTECTIVE SERVICES PVT. LTD.",
//           40,
//           798
//         );

//       doc.text(
//         `Page ${i + 1} of ${pages.count}`,
//         450,
//         798
//       );

//       doc.text(
//         `Generated on : ${new Date().toLocaleString("en-GB")}`,
//         40,
//         810
//       );

//     }

//     //==================================================
//     // FINISH PDF
//     //==================================================

//     doc.end();

//     writeStream.on("finish", () => {
//       resolve(fullPath);
//     });

//     writeStream.on("error", (err) => {
//       reject(err);
//     });

//   });
// };

const formatDateWithSlash = (dateString) => {
  if (dateString == null && !dateString) return "";
  const [year, month, day] = dateString.split("-");
  return `${day}/${month}/${year}`;
};

const generatePDFDocument = (data, fullPath) => {

  logger.log("emp_data :", data);

  return new Promise((resolve, reject) => {

    // =====================================================
    // COMPANY DETAILS FROM DATABASE
    // =====================================================

    const companyName =
      data?.emp?.company_name ||
      "COMPANY NAME";

    const companyLogo =
      data?.emp?.company_logo ||
      "";

    // =====================================================
    // BRANCH DETAILS FROM DATABASE
    // =====================================================

    const branchName =
      data?.emp?.branch_name ||
      "";

    const branchAddress =
      data?.emp?.branch_address ||
      "";


    // =====================================================
    // DEBUG
    // =====================================================

    logger.log("==========================================");
    logger.log("GENERATE POSTING ORDER PDF");
    logger.log("Employee Code  :", data?.emp?.employee_code);
    logger.log("Company ID     :", data?.emp?.company_id);
    logger.log("Company Name   :", companyName);
    logger.log("Company Logo   :", companyLogo);
    logger.log("Branch ID      :", data?.emp?.branch_id);
    logger.log("Branch Name    :", branchName);
    logger.log("Branch Address :", branchAddress);
    logger.log("==========================================");


    // =====================================================
    // PDF SETUP
    // =====================================================

    const doc = new PDFDocument({
      size: "A4",
      margin: 30,
    });

    const writeStream =
      fs.createWriteStream(fullPath);

    doc.pipe(writeStream);

    const pageLeft = 30;
    const pageRight = 565;


    // =====================================================
    // COMPANY LOGO PATH
    // =====================================================

    let logoPath = null;

    if (companyLogo) {

      const cleanLogo =
        companyLogo
          .replace(/^[/\\]+/, "")
          .replace(/\//g, path.sep);


      const possibleLogoPaths = [

        // -----------------------------------------------
        // frontend/api/company_logos/...
        // -----------------------------------------------

        path.join(
          process.env.FRONTEND_FOLDER,
          "api",
          cleanLogo
        ),


        // -----------------------------------------------
        // frontend/api/...
        // -----------------------------------------------

        path.join(
          process.env.FRONTEND_FOLDER,
          cleanLogo
        ),


        // -----------------------------------------------
        // backend/uploads/...
        // -----------------------------------------------

        path.join(
          __dirname,
          "../uploads",
          cleanLogo
        ),

      ];


      for (
        const possiblePath
        of possibleLogoPaths
      ) {

        logger.log(
          "Checking PDF company logo:",
          possiblePath
        );


        if (
          fs.existsSync(
            possiblePath
          )
        ) {

          logoPath =
            possiblePath;

          break;

        }

      }

    }


    logger.log(
      "PDF Company Logo Final Path:",
      logoPath
    );


    // =====================================================
    // HEADER - COMPANY LOGO
    // =====================================================

    if (
      logoPath &&
      fs.existsSync(logoPath)
    ) {

      doc.image(
        logoPath,

        pageLeft - 15,

        35,

        {
          width: 95,
        }
      );

    }


    // =====================================================
    // HEADER - COMPANY NAME
    // =====================================================

    let companyFontSize = 18;

    if (
      companyName.length > 35
    ) {
      companyFontSize = 16;
    }

    if (
      companyName.length > 50
    ) {
      companyFontSize = 14;
    }


    doc
      .font("Helvetica-Bold")
      .fontSize(companyFontSize)
      .text(
        companyName,
        115,
        40,
        {
          width:
            pageRight - 115,
        }
      );


    // =====================================================
    // HEADER - BRANCH NAME
    // =====================================================

    if (branchName) {

      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(
          branchName,
          115,
          65,
          {
            width:
              pageRight - 115,
          }
        );

    }


    // =====================================================
    // HEADER - BRANCH ADDRESS
    // =====================================================

    if (branchAddress) {

      doc
        .font("Helvetica")
        .fontSize(8)
        .text(
          branchAddress,
          115,
          79,
          {
            width:
              pageRight - 115,
          }
        );

    }


    // =====================================================
    // HEADER LINE
    // =====================================================

    doc
      .moveTo(
        pageLeft,
        100
      )
      .lineTo(
        pageRight,
        100
      )
      .lineWidth(1.5)
      .stroke();


    // =====================================================
    // TITLE
    // =====================================================

    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .text(
        "POSTING ORDER",
        pageLeft,
        120,
        {
          width:
            pageRight - pageLeft,

          align: "center",

          underline: true,
        }
      );


    // =====================================================
    // META BLOCK
    // =====================================================

    const metaWidth = 195;

    const metaX =
      pageRight - metaWidth;


    doc
      .font("Helvetica-Bold")
      .fontSize(9);


    // Reference No

    doc.text(
      `Reference No.: MUM/${
        data?.emp?.employee_code || ""
      }`,

      metaX,

      170,

      {
        width: metaWidth,

        align: "right",
      }
    );


    // Date

    doc.text(
      `Date: ${
        new Date()
          .toLocaleDateString("en-GB")
      }`,

      metaX,

      182,

      {
        width: metaWidth,

        align: "right",
      }
    );


    // Ticket No

    doc.text(
      `Ticket No.: MUM/${
        data?.emp?.employee_code || ""
      }`,

      metaX,

      194,

      {
        width: metaWidth,

        align: "right",
      }
    );


    // =====================================================
    // BODY
    // =====================================================

    let y = 215;


    // To

    doc
      .font("Helvetica")
      .fontSize(10)
      .text(
        "To,",
        pageLeft,
        y
      );


    y += 15;


    // Unit Incharge

    doc
      .font("Helvetica-Bold")
      .text(
        "The Unit Incharge,",
        pageLeft,
        y
      );


    y += 15;


    // Client / Site

    doc
      .font("Helvetica-Bold")
      .text(
        data?.emp?.client_name ||
        data?.emp?.site_name ||
        "N/A",

        pageLeft,
        y
      );


    y += 30;


    // Dear Sir

    doc
      .font("Helvetica")
      .text(
        "Dear Sir,",
        pageLeft,
        y
      );


    y += 25;


    // =====================================================
    // EMPLOYEE DETAILS
    // =====================================================

    const employeeName =
      `${data?.emp?.first_name || ""} ${
        data?.emp?.last_name || ""
      }`.trim();


    const rank =
      data?.emp?.rank ||
      data?.emp?.designation ||
      "";


    const siteHours =
      data?.emp?.site_hours ||
      "12";


    const joiningDate =
      formatDateWithSlash(
        data?.emp?.date_of_joining
      ) ||
      new Date()
        .toLocaleDateString("en-GB");


    // =====================================================
    // BODY CONTENT
    // =====================================================

    doc
      .font("Helvetica")
      .fontSize(10)
      .text(
        "We have appointed ",

        pageLeft,

        y,

        {
          continued: true,
        }
      );


    doc
      .font("Helvetica-Bold")
      .text(
        employeeName,
        {
          continued: true,
        }
      );


    doc
      .font("Helvetica")
      .text(
        " as ",
        {
          continued: true,
        }
      );


    doc
      .font("Helvetica-Bold")
      .text(
        rank,
        {
          continued: true,
        }
      );


    doc
      .font("Helvetica")
      .text(
        ` for work for total ${siteHours} hours at your location w.e.f. `,

        {
          continued: true,
        }
      );


    doc
      .font("Helvetica-Bold")
      .text(
        joiningDate,

        {
          continued: true,
        }
      );


    doc
      .font("Helvetica")
      .text(
        " and he/she will report to you on or before ",

        {
          continued: true,
        }
      );


    doc
      .font("Helvetica-Bold")
      .text(
        `${joiningDate}.`
      );


    // =====================================================
    // NEXT PARAGRAPH
    // =====================================================

    doc.moveDown(1.5);


    doc
      .font("Helvetica")
      .fontSize(10)
      .text(
        "The signature of the appointed person along with his/her photograph is attached herewith for your records.",

        pageLeft,

        doc.y,

        {
          width:
            pageRight - pageLeft,
        }
      );


    // =====================================================
    // EMPLOYEE SIGNATURE BLOCK
    // =====================================================

    const blockY = 480;


    doc
      .moveTo(
        pageLeft,
        blockY
      )
      .lineTo(
        pageLeft + 175,
        blockY
      )
      .stroke();


    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(
        `Signature of ${rank}`,

        pageLeft,

        blockY + 5
      );


    // =====================================================
    // AUTHORISED SIGNATORY
    // =====================================================

    const authWidth = 195;

    const authX =
      pageRight - authWidth;


    // ================================================
    // COMPANY NAME FROM DATABASE
    // ================================================

    doc
      .font("Helvetica")
      .fontSize(10)
      .text(
        `For ${companyName}`,

        authX - 10,

        blockY - 45,

        {
          width:
            authWidth + 10,

          align: "right",
        }
      );


    // ================================================
    // AUTHORISED SIGNATORY
    // ================================================

    doc
      .font("Helvetica-Bold")
      .text(
        "AUTHORISED SIGNATORY",

        authX,

        blockY + 10,

        {
          width:
            authWidth,

          align: "right",
        }
      );


    // ================================================
    // NAME
    // ================================================

    doc
      .font("Helvetica")
      .fontSize(9)
      .text(
        "Name: ____________________",

        authX,

        blockY + 50,

        {
          width:
            authWidth,

          align: "right",
        }
      );


    // ================================================
    // ID
    // ================================================

    doc.text(
      "ID No: ____________________",

      authX,

      blockY + 65,

      {
        width:
          authWidth,

        align: "right",
      }
    );


    // =====================================================
    // END PDF
    // =====================================================

    doc.end();


    // =====================================================
    // WRITE STREAM FINISH
    // =====================================================

    writeStream.on(
      "finish",
      () => {

        logger.log(
          "Posting Order PDF Generated:",
          fullPath
        );

        resolve();

      }
    );


    writeStream.on(
      "error",
      (error) => {

        logger.error(
          "Posting Order PDF Error:",
          error
        );

        reject(error);

      }
    );

  });
};

// const generateOfferLetterOld = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const data = await employeeModel.getEmployeeOfferData(id);
//     if (!data.emp) throw new Error("Employee not found");

//     const fileName = `appointment_letter_${id}_${Date.now()}.pdf`;
//     const saveDir = path.join(process.env.FRONTEND_FOLDER, "/api/emp_docs");

//     if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });

//     // 1. Define fullPath BEFORE using it
//     const fullPath = path.join(saveDir, fileName);

//     // 2. Call the generator function (ensure it handles doc.end() internally)
//     await generatePDFDocument(data, fullPath);

//     // 3. Update DB
//     const dbFilePath = `emp_docs/${fileName}`;
//     await employeeModel.updateOfferLetterDetails({
//       emp_id: id,
//       appointment_letter_img_path: dbFilePath,
//       offer_letter_ref_no: `MUM/${data.emp.employee_code}`,
//     });

//     // return res.status(200).json({
//     //   success: false,
//     //   message: { filePath: dbFilePath, fullPath },
//     // });

//     // 3. Stream the file directly to the frontend
//     res.setHeader("Content-Type", "application/pdf");
//     res.setHeader(
//       "Content-Disposition",
//       `attachment; filename=OfferLetter_${data.emp.employee_code}.pdf`,
//     );

//     return res.sendFile(fullPath);
//   } catch (err) {
//     logger.error("ID Card Generation Error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to generate ID card",
//       error: error.message,
//     });
//   }
// };

const generateIdCard = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "Employee ID is required" });
    }
    logger.log("employee id ", id);
    // 1. Fetch employee data to get the code (Crucial fix)
    const employee = (await employeeModel.getEmployeeById(id)).employee;
    logger.log("employee:", employee);
    if (!employee) {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });
    }

    // 2. Generate the ID Card using the retrieved employee code
    const employeeCard = await downloadIdCard(employee.employee_code);
    if (!employeeCard) {
      return res.status(500).json({
        success: false,
        message: "Employee ID card generation failed",
      });
    }

    // 3. Save the path to the database
    const cardPath = getRelativePathFromApi({ path: employeeCard.filePath });
    await employeeModel.saveCardId(id, cardPath);

    // 3. Send the file back to the frontend
    // This allows your frontend 'response.blob()' to receive the PDF correctly
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=IdCard_${employee.employee_code}.pdf`,
    );
    logger.log(employeeCard);
    return res.sendFile(employeeCard.filePath);
  } catch (error) {
    logger.error("ID Card Generation Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate ID card",
      error: error.message,
    });
  }
};
// ======================================
// GET EMPLOYEE VIEW // 13/6/26
// ======================================

const getEmployeeView = async (req, res) => {
  try {
    const { id } = req.params;

    const [employee, documents, experience, family, userdetail] = await Promise.all([
      employeeModel.getEmployeeId(id),
      employeeModel.getEmployeeDocument(id),
      employeeModel.getEmployeeExperience(id),
      employeeModel.getEmployeeFamily(id),
      employeeModel.getUserById(id)
    ]);
    // ===============================
    // RESPONSE
    // ===============================

    return res.status(200).json({
      success: true,

      employee,

      documents,

      experience,

      family,
    });
  } catch (err) {
    logger.log(err);

    return res.status(500).json({
      success: false,

      message: "Failed to fetch employee view",

      error: err.message,
    });
  }
};


const uploadEmployeeBasic = async (req, res) => {
  try {
    const userId = Number(req.user?.id);

    // =========================================
    // CHECK SUPERADMIN
    // =========================================
    const role = String(req.user?.role || "")
      .trim()
      .toUpperCase();

    const isSuperAdmin =
      role === "SUPERADMIN" ||
      role === "SUPER ADMIN" ||
      String(req.user?.superadmin_status || "").trim() === "1";

    // =========================================
    // COMPANY / BRANCH IDS
    // Superadmin: company_id = 1, branch_id = 1
    // Normal user: IDs from authenticated user
    // =========================================
    const companyId = isSuperAdmin ? 1 : req.user?.company_id;
    const branchId = isSuperAdmin ? 1 : req.user?.branch_id;

    // =========================================
    // VALIDATE USER
    // =========================================
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // =========================================
    // PARSE COMPANY / BRANCH IDS
    // =========================================
    const parseIds = (value) => [
      ...new Set(
        String(value ?? "")
          .split(",")
          .map((id) => id.trim())
          .filter((id) => /^\d+$/.test(id))
          .map(Number)
          .filter(
            (id) => Number.isSafeInteger(id) && id > 0
          )
      ),
    ];

    const companyIds = parseIds(companyId);
    const branchIds = parseIds(branchId);

    if (!companyIds.length || !branchIds.length) {
      return res.status(400).json({
        success: false,
        message: "Company ID and Branch ID are required",
      });
    }

    const companyIdString = companyIds.join(",");
    const branchIdString = branchIds.join(",");

    // =========================================
    // VALIDATE FILE
    // =========================================
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: "Attach an Excel file to upload",
      });
    }

    const allowedExtensions = [".xlsx", ".xls"];
    const fileName = String(req.file.originalname || "");

    const extension = fileName
      .slice(fileName.lastIndexOf("."))
      .toLowerCase();

    if (!allowedExtensions.includes(extension)) {
      return res.status(400).json({
        success: false,
        message: "Only .xlsx and .xls files are allowed",
      });
    }

    if (fileName.includes(" ")) {
      return res.status(400).json({
        success: false,
        message: "File name should not contain spaces",
      });
    }

    logger.log("==========================================");
    logger.log("UPLOAD EMPLOYEE BASIC");
    logger.log("User ID:", userId);
    logger.log("Role:", role);
    logger.log("Is Superadmin:", isSuperAdmin);
    logger.log("Company IDs:", companyIdString);
    logger.log("Branch IDs:", branchIdString);
    logger.log("File:", fileName);
    logger.log(
      "File Size:",
      ((req.file.size || req.file.buffer.length) / 1024 / 1024).toFixed(2),
      "MB"
    );
    logger.log("==========================================");

    // =========================================
    // READ EXCEL
    // =========================================
    const workbook = XLSX.read(req.file.buffer, {
      type: "buffer",
      cellDates: true,
    });

    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      return res.status(400).json({
        success: false,
        message: "Excel sheet not found",
      });
    }

    const sheet = workbook.Sheets[firstSheetName];

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });

    logger.log("Total Excel Rows:", rows.length);

    if (rows.length <= 1) {
      return res.status(400).json({
        success: false,
        message: "Excel contains no employee data",
      });
    }

    // =========================================
    // MAX ROW LIMIT
    // First row is the header
    // =========================================
    const MAX_ROWS = 10000;
    const dataRowCount = rows.length - 1;

    if (dataRowCount > MAX_ROWS) {
      return res.status(400).json({
        success: false,
        message: `Maximum ${MAX_ROWS} employees allowed per upload`,
      });
    }

    // =========================================
    // PROCESS EXCEL DATA
    // =========================================
    const uploadArrayData = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      if (!Array.isArray(row)) {
        continue;
      }

      // Skip rows without employee code
      const employeeCode = String(row[0] ?? "").trim();

      if (!employeeCode) {
        continue;
      }

      uploadArrayData.push({
        employee_code: employeeCode,
        first_name: String(row[1] ?? "").trim(),
        middle_name: String(row[2] ?? "").trim(),
        last_name: String(row[3] ?? "").trim(),

        dob: row[4] || null,
        gender: String(row[5] ?? "").trim(),
        date_of_joining: row[6] || null,
        rank: String(row[7] ?? "").trim(),

        phone1: String(row[8] ?? "").trim(),
        email_id: String(row[9] ?? "").trim(),

        pancard_no: String(row[10] ?? "").trim(),
        aadhar_no: String(row[11] ?? "").trim(),
        esis_no: String(row[12] ?? "").trim(),
        uan_no: String(row[13] ?? "").trim(),

        basic_salary: row[14] || 0,
        account_no: String(row[15] ?? "").trim(),
        bank_ifsc: String(row[16] ?? "").trim(),

        father_name: String(row[17] ?? "").trim(),
        esis_date: row[18] || null,
        uan_date: row[19] || null,

        address: String(row[20] ?? "").trim(),
        city: String(row[21] ?? "").trim(),
        state: String(row[22] ?? "").trim(),
        pincode: String(row[23] ?? "").trim(),
        country: String(row[24] ?? "").trim(),

        // Superadmin: company_id = 1, branch_id = 1
        // Normal user: IDs from authenticated user
        company_id: companyIdString,
        branch_id: branchIdString,

        created_by: userId,
        created_on: new Date(),
      });
    }

    // =========================================
    // VALIDATE PROCESSED DATA
    // =========================================
    if (uploadArrayData.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "No valid employee rows found. Check the employee_code column.",
      });
    }

    logger.log("Valid Employees Found:", uploadArrayData.length);

    // =========================================
    // SAVE TEMPORARY EMPLOYEES
    // =========================================
    const insertResult =
      await employeeModel.addTempEmployee(uploadArrayData);

    logger.log("Temporary employee insert result:", insertResult);

    return res.status(200).json({
      success: true,
      message:
        `${uploadArrayData.length} rows uploaded successfully. ` +
        "Click on Verify Data to validate the records.",
      totalRows: uploadArrayData.length,
      company_id: companyIdString,
      branch_id: branchIdString,
      isSuperAdmin,
    });
  } catch (error) {
    logger.error("UPLOAD EMPLOYEE BASIC ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Employee upload failed",
    });
  }
};



const downloadEmployeeExcel = async (req, res) => {
  try {
    const role = req.user?.role
      ?.toLowerCase()
      .replace(/\s+/g, "");

    const companyId = req.user?.company_id;

    // Superadmin and Admin access
    if (!["superadmin", "admin"].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    if (role === "admin" && !companyId) {
      return res.status(403).json({
        success: false,
        message: "Company not found for admin",
      });
    }

    const downloadData =
      await employeeModel.getEmployeeToDownload({
        role,
        companyId,
      });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Employees");

    const headers = [
      "Employee Code",
      "First Name",
      "Middle Name",
      "Last Name",
      "DOB",
      "Gender",
      "DOJ",
      "Rank",
      "Phone1",
      "Email Id",
      "Pancard No",
      "Aadhar No",
      "ESIS No",
      "UAN No",
      "Basic Salary",
      "Account No",
      "IFSC Code",
      "Father Name",
      "DATE OF ESIC",
      "DATE OF UAN",
      "Address",
      "City",
      "State",
      "Pincode",
      "Country",
    ];

    worksheet.addRow(headers);

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = {
      vertical: "middle",
      horizontal: "center",
    };

    downloadData.forEach((row) => {
      worksheet.addRow([
        row.employee_code ?? "",
        row.first_name ?? "",
        row.middle_name ?? "",
        row.last_name ?? "",
        row.dob ?? "",
        row.gender ?? "",
        row.date_of_joining ?? "",
        row.rank ?? "",
        row.phone1 ?? "",
        row.email_id ?? "",
        row.pancard_no ?? "",
        row.aadhar_no ?? "",
        row.esis_no ?? "",
        row.uan_no ?? "",
        row.basic_salary ?? "",
        row.account_no ?? "",
        row.bank_ifsc ?? "",
        row.father_name ?? "",
        row.esis_date ?? "",
        row.uan_date ?? "",
        row.address ?? "",
        row.city ?? "",
        row.state ?? "",
        row.pincode ?? "",
        row.country ?? "",
      ]);
    });

    worksheet.columns.forEach((column) => {
      let maxLength = 15;

      column.eachCell({ includeEmpty: true }, (cell) => {
        const value =
          cell.value == null ? "" : String(cell.value);

        maxLength = Math.max(maxLength, value.length + 2);
      });

      column.width = Math.min(maxLength, 35);
    });

    const filename = `Employee_Specific_${Date.now()}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error("DOWNLOAD EMPLOYEE EXCEL ERROR:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
};



// const downloadEmployeeUploadTemplate = async (req, res) => {
//   try {
//     const workbook = new ExcelJS.Workbook();
//     const worksheet = workbook.addWorksheet("Employee Template");

//     const mainHeaders = [
//       "EMPLOYEE DETAIL",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "CONTACT DETAIL (PRESENT ADDRESS)",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "CONTACT DETAIL (PERMENANT ADDRESS)",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "EMERGENCY CONTACT DETAILS",
//       "",
//       "",
//       "",
//       "PERSONAL DETAILS",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "EDUCATIONAL DETAILS",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "FAMILY AND NOMINEE DETAILS",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "PREVIOUS EMPLOYEE DETAILS",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "BANK DETAILS",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "SEPERATION DETAILS",
//       "",
//       "",
//       "",
//       "",
//       "",
//       "",
//     ];

//     const subHeaders = [
//       "SR NO",
//       "EMPLOYEE CODE",
//       "CLIENT CODE",
//       "INITIAL",
//       "FIRST NAME",
//       "MIDDLE NAME",
//       "LAST NAME",
//       "GENDER",
//       "DOB",
//       "JOINING DATE",
//       "EMAIL ID",
//       "SALARY GENERATION FROM DATE",
//       "SALARY GENERATION TO DATE",
//       "DESIGNATION/RANK",
//       "DEPARTMENT",
//       "REPORTING MANAGER",
//       "REPORTING USER",
//       "GANG NAME",
//       "ADDRESS",
//       "CITY",
//       "STATE",
//       "PINCODE",
//       "COUNTRY",
//       "PHONE1",
//       "PHONE2",
//       "ADDRESS",
//       "CITY",
//       "STATE",
//       "PINCODE",
//       "COUNTRY",
//       "PHONE1",
//       "PHONE2",
//       "CONTACT PERSON",
//       "MOBILE",
//       "RELATION",
//       "EMAIL",
//       "MARITAL STATUS",
//       "MARRIAGE DATE",
//       "CAST",
//       "CATEGORY",
//       "NATIVE PLACE",
//       "BLOOD GROUP",
//       "DRIVING LICENSE NO",
//       "PAN CARD NO",
//       "AADHAR CARD NO",
//       "PASSPORT NO",
//       "PASSPORT VALID DATE",
//       "P.F NO",
//       "ESIS NO",
//       "UAN NO",
//       "LANGUAGE KNOWN(1)",
//       "LANGUAGE KNOWN(2)",
//       "LANGUAGE KNOWN(3)",
//       "LANGUAGE KNOWN(4)",
//       "LANGUAGE KNOWN(5)",
//       "HOBBY(1)",
//       "HOBBY(2)",
//       "HOBBY(3)",
//       "HOBBY(4)",
//       "DOCUMENT TYPE",
//       "PASSING YEAR",
//       "DOCUMENT NAME",
//       "IMAGE",
//       "STATUS",
//       "REMARK/DESCRIPTION",
//       "INITIAL",
//       "RELATIVE NAME",
//       "GENDER",
//       "RELATION",
//       "DATE OF BIRTH",
//       "AGE",
//       "MINOR(UNDER 18)",
//       "GUARDIAN NAME (IF MINOR 'YES')",
//       "ADDRESS",
//       "CONTACT NO",
//       "EMAIL ID",
//       "SHARE PF %",
//       "SHARE ESIC %",
//       "COMPANY NAME",
//       "DESIGNATION",
//       "ADDRESS",
//       "CITY",
//       "STATE",
//       "COUNTRY",
//       "PINCODE",
//       "JOINED DATE",
//       "LAST WORKING DATE",
//       "ANNUAL CTC RUPEES",
//       "MONTHLY CTC",
//       "REPORTING TO",
//       "REPORTING TO DESIGNATION",
//       "EMAIL",
//       "CONTACT",
//       "GROSS INCOME IN PREV EMPLOYEE",
//       "GROSS TDS DEDUCTED",
//       "GROSS PT",
//       "TOTAL PT DEDUCTED",
//       "BANK NAME",
//       "BANK ACCOUNT NO",
//       "BANK ADDRESS",
//       "CITY",
//       "STATE",
//       "IFSC CODE",
//       "MICR CODE",
//       "CANCELLED CHEQUE IMAGE",
//       "SEPARATION TYPE",
//       "SEPARATION REASON",
//       "DATE OF SEPARATION",
//       "NOTICE PERIOD",
//       "LAST WORKING DATE",
//       "HANDOVER GIVEN TO",
//     ];

//     worksheet.addRow(mainHeaders);
//     worksheet.addRow(subHeaders);

//     worksheet.getRow(1).font = {
//       bold: true,
//       size: 12,
//     };

//     worksheet.getRow(2).font = {
//       bold: true,
//     };

//     worksheet.getRow(1).alignment = {
//       horizontal: "center",
//       vertical: "middle",
//     };

//     worksheet.getRow(2).alignment = {
//       horizontal: "center",
//       vertical: "middle",
//       wrapText: true,
//     };

//     worksheet.getRow(1).height = 20;
//     worksheet.getRow(2).height = 25;

//     worksheet.columns.forEach((column) => {
//       column.width = 25;
//     });

//     worksheet.views = [
//       {
//         state: "frozen",
//         ySplit: 2,
//       },
//     ];

//     // Borders
//     [1, 2].forEach((rowNum) => {
//       worksheet.getRow(rowNum).eachCell((cell) => {
//         cell.border = {
//           top: { style: "thin" },
//           left: { style: "thin" },
//           bottom: { style: "thin" },
//           right: { style: "thin" },
//         };
//       });
//     });

//     res.setHeader(
//       "Content-Type",
//       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
//     );

//     res.setHeader(
//       "Content-Disposition",
//       'attachment; filename="EmployeeTemplate.xlsx"',
//     );

//     await workbook.xlsx.write(res);

//     res.end();
//   } catch (error) {
//     logger.error("Download Template Error:", error);

//     return res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };

const downloadEmployeeUploadTemplate = async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();

    const worksheet = workbook.addWorksheet("Employee Template");

    // =========================================
    // MAIN HEADERS
    // =========================================

    const mainHeaders = [
      "EMPLOYEE DETAIL",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "CONTACT DETAIL (PRESENT ADDRESS)",
      "",
      "",
      "",
      "",
      "",
      "",
      "CONTACT DETAIL (PERMENANT ADDRESS)",
      "",
      "",
      "",
      "",
      "",
      "",
      "EMERGENCY CONTACT DETAILS",
      "",
      "",
      "",
      "PERSONAL DETAILS",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "EDUCATIONAL DETAILS",
      "",
      "",
      "",
      "",
      "",
      "FAMILY AND NOMINEE DETAILS",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "PREVIOUS EMPLOYEE DETAILS",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "BANK DETAILS",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "SEPERATION DETAILS",
      "",
      "",
      "",
      "",
      "",
      "",
    ];

    // =========================================
    // SUB HEADERS
    // =========================================

    const subHeaders = [
      "SR NO",
      "CLIENT CODE",
      "INITIAL",
      "FIRST NAME",
      "MIDDLE NAME",
      "LAST NAME",
      "GENDER",
      "DOB",
      "JOINING DATE",
      "EMAIL ID",
      "SALARY GENERATION FROM DATE",
      "SALARY GENERATION TO DATE",
      "DESIGNATION/RANK",
      "DEPARTMENT",
      "REPORTING MANAGER",
      "REPORTING USER",
      "GANG NAME",
      "ADDRESS",
      "CITY",
      "STATE",
      "PINCODE",
      "COUNTRY",
      "PHONE1",
      "PHONE2",
      "ADDRESS",
      "CITY",
      "STATE",
      "PINCODE",
      "COUNTRY",
      "PHONE1",
      "PHONE2",
      "CONTACT PERSON",
      "MOBILE",
      "RELATION",
      "EMAIL",
      "MARITAL STATUS",
      "MARRIAGE DATE",
      "CAST",
      "CATEGORY",
      "NATIVE PLACE",
      "BLOOD GROUP",
      "DRIVING LICENSE NO",
      "PAN CARD NO",
      "AADHAR CARD NO",
      "PASSPORT NO",
      "PASSPORT VALID DATE",
      "P.F NO",
      "ESIS NO",
      "UAN NO",
      "LANGUAGE KNOWN(1)",
      "LANGUAGE KNOWN(2)",
      "LANGUAGE KNOWN(3)",
      "LANGUAGE KNOWN(4)",
      "LANGUAGE KNOWN(5)",
      "HOBBY(1)",
      "HOBBY(2)",
      "HOBBY(3)",
      "HOBBY(4)",
      "DOCUMENT TYPE",
      "PASSING YEAR",
      "DOCUMENT NAME",
      "IMAGE",
      "STATUS",
      "REMARK/DESCRIPTION",
      "INITIAL",
      "RELATIVE NAME",
      "GENDER",
      "RELATION",
      "DATE OF BIRTH",
      "AGE",
      "MINOR(UNDER 18)",
      "GUARDIAN NAME (IF MINOR 'YES')",
      "ADDRESS",
      "CONTACT NO",
      "EMAIL ID",
      "SHARE PF %",
      "SHARE ESIC %",
      "COMPANY NAME",
      "DESIGNATION",
      "ADDRESS",
      "CITY",
      "STATE",
      "COUNTRY",
      "PINCODE",
      "JOINED DATE",
      "LAST WORKING DATE",
      "ANNUAL CTC RUPEES",
      "MONTHLY CTC",
      "REPORTING TO",
      "REPORTING TO DESIGNATION",
      "EMAIL",
      "CONTACT",
      "GROSS INCOME IN PREV EMPLOYEE",
      "GROSS TDS DEDUCTED",
      "GROSS PT",
      "TOTAL PT DEDUCTED",
      "BANK NAME",
      "BANK ACCOUNT NO",
      "BANK ADDRESS",
      "CITY",
      "STATE",
      "IFSC CODE",
      "MICR CODE",
      "CANCELLED CHEQUE IMAGE",
      "SEPARATION TYPE",
      "SEPARATION REASON",
      "DATE OF SEPARATION",
      "NOTICE PERIOD",
      "LAST WORKING DATE",
      "HANDOVER GIVEN TO",
    ];

    // =========================================
    // ADD HEADERS
    // =========================================

    worksheet.addRow(mainHeaders);

    worksheet.addRow(subHeaders);

    // =========================================
    // FAKE DATA ROW
    // =========================================

    const fakeData = [
      1,
      "CLI001",
      "Mr",
      "Rahul",
      "K",
      "Sharma",
      "Male",
      "1995-05-10",
      "2025-01-15",
      "rahul@gmail.com",
      "01",
      "31",
      "Software Engineer",
      "IT",
      "Amit Patil",
      "Admin",
      "Alpha Team",

      // PRESENT ADDRESS
      "Mumbai Central",
      "Mumbai",
      "Maharashtra",
      "400001",
      "India",
      "9876543210",
      "9876543211",

      // PERMANENT ADDRESS
      "Pune Station Road",
      "Pune",
      "Maharashtra",
      "411001",
      "India",
      "9988776655",
      "9988776656",

      // EMERGENCY
      "Priya Sharma",
      "9999999999",
      "Wife",
      "priya@gmail.com",

      // PERSONAL
      "Married",
      "2020-02-20",
      "General",
      "Open",
      "Delhi",
      "B+",
      "DL123456789",
      "ABCDE1234F",
      "123412341234",
      "P1234567",
      "2030-01-01",
      "PF12345",
      "ESI12345",
      "UAN123456789",

      // LANGUAGES
      "English",
      "Hindi",
      "Marathi",
      "",
      "",

      // HOBBY
      "Cricket",
      "Reading",
      "Music",
      "",

      // EDUCATION
      "Degree",
      "2018",
      "B.Tech",
      "degree.jpg",
      "Completed",
      "Good Student",

      // FAMILY
      "Mrs",
      "Anita Sharma",
      "Female",
      "Mother",
      "1970-05-05",
      "55",
      "No",
      "",
      "Delhi",
      "9876500000",
      "anita@gmail.com",
      "50",
      "50",

      // PREVIOUS COMPANY
      "Infosys",
      "Developer",
      "Bangalore",
      "Bangalore",
      "Karnataka",
      "India",
      "560001",
      "2020-01-01",
      "2024-12-31",
      "600000",
      "50000",
      "Manager",
      "Project Lead",
      "manager@gmail.com",
      "9876540000",
      "500000",
      "50000",
      "2000",
      "24000",

      // BANK
      "HDFC Bank",
      "123456789012",
      "Andheri Branch",
      "Mumbai",
      "Maharashtra",
      "HDFC0001234",
      "400240002",
      "cheque.jpg",

      // SEPARATION
      "Resigned",
      "Personal Reason",
      "2026-01-01",
      "30 Days",
      "2026-01-30",
      "HR Manager",
    ];

    worksheet.addRow(fakeData);

    // =========================================
    // STYLING
    // =========================================

    worksheet.getRow(1).font = {
      bold: true,
      size: 12,
    };

    worksheet.getRow(2).font = {
      bold: true,
    };

    worksheet.getRow(1).alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    worksheet.getRow(2).alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };

    worksheet.getRow(1).height = 22;

    worksheet.getRow(2).height = 28;

    worksheet.columns.forEach((column) => {
      column.width = 25;
    });

    worksheet.views = [
      {
        state: "frozen",
        ySplit: 2,
      },
    ];

    // =========================================
    // BORDER
    // =========================================

    [1, 2, 3].forEach((rowNum) => {
      worksheet.getRow(rowNum).eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    });

    // =========================================
    // HEADER COLOR
    // =========================================

    // =========================================
    // DOWNLOAD
    // =========================================

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="EmployeeTemplate.xlsx"',
    );

    await workbook.xlsx.write(res);

    res.end();
  } catch (error) {
    logger.error("Download Template Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  generateOfferLetter,
  uploadEmployeeDocument,
  createEmployee,
  updateEmployeeDocuments,
  getEmployeeDocuments,
  createEmployeeExperience,
  deleteEmployeeExperience,
  createEmployeeNominee,
  getEmployeeView,
  updateOfferStatus,
  verifyEmployee,
  exportEmployeesToExcel,
  deleteEmployee,
  restoreEmployee,
  updateEmployeeSalary,
  updateEmployeeStatus,
  updateEmployee,
  getEmployeeById,
  getAllEmployees,
  getNextEmployeeCode,
  downloadEmployeeUploadTemplate,
  uploadEmployee,
  verifyEmployeeData,
  downloadEmployeeExcel,
  uploadEmployeeBasic,
  verifyEmployeeData2,
  generateOfferLetterOld,
  generateIdCard,
  verifyEmployeeData,
  getEmployeesDropdown,
    updateEmployeeNominee,
  deleteEmployeeNominee,
  deleteEmployeeDocument,
  
downloadUploadErrorTemplate 
};
