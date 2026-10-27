// hrms-backend/controllers/userController.js (New File)
const { poolPromise } = require("../config/db");
const logger = require("../utils/logger");
const User = require("../models/User");
const xlsx = require("xlsx"); // <-- ADD THIS LINE FOR EXPORT TO WORK
const { sql } = require("../config/db");
const bcrypt = require("bcryptjs");
const md5 = require("md5"); // ✅ USE MD5
const employeeModel = require("../models/employeeModel");
//API for getUsers : http://localhost:5000/api/users?searchFields=[{"field":"first_name","keyword":"Saurabh"}]&fromDate=2026-05-01&toDate=2026-05-19
exports.getUsers = async (req, res) => {
  try {
    logger.info("GET USERS API CALLED", {
      query: req.query,
      user: req.user?.id,
    });

    const pool = await poolPromise;

    const { searchFields, fromDate, toDate } = req.query;

    let whereClauses = ["u.active = 0"];

    const request = pool.request();

    if (searchFields) {
      const fields = JSON.parse(searchFields);

      logger.info("SEARCH FIELDS RECEIVED", fields);

      fields.forEach((field, index) => {
        if (field.field && field.keyword) {
          const paramName = `keyword${index}`;

          whereClauses.push(`u.${field.field} LIKE @${paramName}`);

          request.input(paramName, sql.VarChar, `%${field.keyword}%`);
        }
      });
    }

    if (fromDate && toDate) {
      logger.info("DATE FILTER APPLIED", { fromDate, toDate });

      whereClauses.push(
        `u.created_on BETWEEN '${fromDate} 00:00:00' AND '${toDate} 23:59:59'`,
      );
    }

    const whereSQL =
      whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

    const query = `
      SELECT u.*, 
             c.company_name AS company_name_actual,
             b.branch_name AS branch_name_actual
      FROM users u
      LEFT JOIN companies c ON u.company_id = c.id
      LEFT JOIN branch b ON u.branch_id = b.id
      ${whereSQL}
      ORDER BY u.created_on DESC
    `;

    logger.info("FINAL USER QUERY GENERATED", { query });

    const result = await request.query(query);
    logger.info("USERS FETCH SUCCESS", {
      count: result.recordset.length,
    });

    res.status(200).json(result.recordset);
  } catch (error) {
    logger.error("GET USERS FAILED", {
      message: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      message: "Error fetching users",
      error: error.message,
    });
  }
};
// 2. Create a New User
// ======================================
// CREATE USER
// ======================================
exports.createUser = async (req, res) => {
  try {
    logger.info("========== CREATE USER API ==========", {
      body: req.body,
    });

    const pool = await poolPromise;
    const userData = { ...req.body };

    // =====================
    // IMAGE UPLOAD
    // =====================
    if (req.file) {
      userData.profile_image = req.file.path;
    }

    // =====================
    // DUPLICATE EMAIL CHECK
    // =====================
    const emailCheck = await pool
      .request()
      .input("email", sql.VarChar, userData.email).query(`
        SELECT TOP 1 id 
        FROM users 
        WHERE email = @email
      `);

    if (emailCheck.recordset.length > 0) {
      logger.warn("Duplicate Email:", userData.email);

      return res.status(400).json({
        message: "Email ID already exists",
      });
    }

    // =====================
    // PASSWORD HASH (NOTE: md5 not secure)
    // =====================
    let hashedPassword = "";
    if (userData.password) {
      hashedPassword = md5(userData.password);
    }

    // =====================
    // INSERT USER
    // =====================
    const result = await pool
      .request()
      .input("first_name", sql.VarChar, userData.first_name || "")
      .input("last_name", sql.VarChar, userData.last_name || "")
      .input("fullname", sql.VarChar, userData.fullname || "")
      .input("email", sql.VarChar, userData.email || "")
      .input("password", sql.VarChar, hashedPassword || "")
      .input("phone", sql.VarChar, userData.phone || "")
      .input("role", sql.VarChar, userData.role || "")
      .input("address", sql.VarChar, userData.address || "")
      .input("city", sql.VarChar, userData.city || "")
      .input("pincode", sql.VarChar, userData.pincode || "")
      .input("company_id", sql.Int, userData.company_id || null)
      .input("branch_id", sql.Int, userData.branch_id || null)
      .input("profile_image", sql.VarChar, userData.profile_image || null)
      .input("created_by", sql.Int, req.user.id)
      .input("created_on", sql.VarChar, getFormattedDateTime()).query(`
        INSERT INTO users (
          first_name,
          last_name,
          fullname,
          email,
          password,
          phone,
          role,
          address,
          city,
          pincode,
          company_id,
          branch_id,
          profile_image,
          active,
          created_on,
          created_by
        )
        VALUES (
          @first_name,
          @last_name,
          @fullname,
          @email,
          @password,
          @phone,
          @role,
          @address,
          @city,
          @pincode,
          @company_id,
          @branch_id,
          @profile_image,
          0,
          @created_on,
          @created_by
        );

        SELECT 
          SCOPE_IDENTITY() AS id,
          CONVERT(VARCHAR(19), GETDATE(), 120) AS created_on;
      `);

    logger.success("USER CREATED SUCCESSFULLY");

    res.status(201).json({
      message: "User created successfully",
      userId: result.recordset[0].id,
      created_on: result.recordset[0].created_on,
    });
  } catch (error) {
    logger.error("CREATE USER FAILED", {
      message: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      message: "Error creating user",
      error: error.message,
    });
  }
};

// =====================
// DATE FORMAT HELPER
// =====================
function getFormattedDateTime() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");

  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    " " +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes()) +
    ":" +
    pad(d.getSeconds())
  );
}
// Helper function to get all roles for the form dropdown
exports.getRoles = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT 
        id,
        role_name
      FROM role_master
      WHERE active = 0
      ORDER BY role_name ASC
    `);

    res.status(200).json(result.recordset);
  } catch (error) {
    console.error("GET ROLES FAILED:", error);

    res.status(500).json({
      message: "Error fetching roles",
      error: error.message,
    });
  }
};

// ================= UPDATE USER =================
// ======================================
// UPDATE USER
// ======================================
exports.updateUser = async (req, res) => {
  try {
    logger.info("========== UPDATE USER API ==========");

    const pool = await poolPromise;

    const userId = req.body.id || req.params.id;
    const updateData = { ...req.body };

    // =====================
    // FILE UPLOAD
    // =====================
    if (req.file) {
      updateData.profile_image = req.file.path;
    }

    // =====================
    // PASSWORD HASH
    // =====================
    if (updateData.password) {
      updateData.password = md5(updateData.password);
    }

    // =====================
    // ALLOWED FIELDS
    // =====================
    const allowedFields = [
      "first_name",
      "last_name",
      "fullname",
      "email",
      "password",
      "phone",
      "role",
      "address",
      "city",
      "pincode",
      "company_id",
      "branch_id",
      "profile_image",
    ];

    const fields = [];
    const request = pool.request();

    // =====================
    // DYNAMIC UPDATE FIELDS
    // =====================
    Object.keys(updateData).forEach((key) => {
      if (allowedFields.includes(key) && updateData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        request.input(key, updateData[key]);
      }
    });

    // =====================
    // FIXED DATE FORMAT
    // =====================
    const modifiedOn = getFormattedDateTime();

    fields.push(`modified_on = @modified_on`);
    fields.push(`modified_by = @modified_by`);

    request.input("modified_by", sql.Int, req.user.id);
    request.input("modified_on", sql.VarChar, modifiedOn);
    request.input("id", sql.Int, userId);

    // =====================
    // QUERY
    // =====================
    const query = `
      UPDATE users
      SET ${fields.join(", ")}
      WHERE id = @id;

      SELECT TOP 1
        id,
        first_name,
        last_name,
        fullname,
        email,
        phone,
        role,
        address,
        city,
        pincode,
        company_id,
        branch_id,
        profile_image,
        CONVERT(VARCHAR(19), created_on, 120) AS created_on,
        CONVERT(VARCHAR(19), modified_on, 120) AS modified_on
      FROM users
      WHERE id = @id;
    `;

    const result = await request.query(query);

    logger.success("USER UPDATED SUCCESSFULLY");

    res.status(200).json({
      message: "User updated successfully",
      user: result.recordset[0],
    });
  } catch (error) {
    logger.error("UPDATE USER FAILED:", error);

    res.status(500).json({
      message: "Error updating user",
      error: error.message,
    });
  }
};

// =====================
// DATE FORMAT HELPER
// =====================
function getFormattedDateTime() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");

  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    " " +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes()) +
    ":" +
    pad(d.getSeconds())
  );
}

// ================= DELETE USER =================
exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    const pool = await poolPromise;

    const result = await pool.request().query(`
      UPDATE users
      SET 
        active = 1,
        disabled_on = GETDATE(),
        disabled_by = '${req.user.id}'
      WHERE id = '${userId}';

      SELECT * FROM users WHERE id = '${userId}';
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json({
      message: "User deleted successfully",
      user: result.recordset[0],
    });
  } catch (error) {
    console.error("DELETE USER FAILED:", error);

    res.status(500).json({
      message: "Error deleting user",
      error: error.message,
    });
  }
};

// ================= GET ROLES =================
exports.getRoles = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT 
        id,
        role_name
      FROM role_master
      WHERE active = 0
      ORDER BY role_name ASC
    `);

    res.status(200).json(result.recordset);
  } catch (error) {
    console.error("GET ROLES FAILED:", error);

    res.status(500).json({
      message: "Error fetching roles",
      error: error.message,
    });
  }
};

// ================= FORMAT DATE =================
function formatDateForExcel(val) {
  if (!val && val !== 0) return "";

  if (val instanceof Date && !isNaN(val.getTime())) {
    const d = val;
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();

    return `${dd}-${mm}-${yyyy}`;
  }

  return String(val);
}

// ================= GET CLIENTS =================
exports.getClients = async (req, res) => {
  try {
    const pool = await poolPromise;

    const query = `
      SELECT DISTINCT
          nc.id,
          nc.company_name,
          nc.contact_person,
          nc.client_email,
          nc.contact_no
      FROM new_client nc
      INNER JOIN users u
          ON LTRIM(RTRIM(u.client_id)) = CAST(nc.id AS VARCHAR(50))
      WHERE nc.active = '0'
      ORDER BY nc.company_name ASC
    `;

    const result = await pool.request().query(query);

    return res.status(200).json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    console.error("CLIENT API ERROR =>", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// ================= EXPORT USERS TO EXCEL =================
exports.exportUsersToExcel = async (req, res) => {
  try {
    const { searchFields, fromDate, toDate } = req.query;

    const pool = await poolPromise;

    // Build WHERE clause
    let whereClauses = ["u.active = 0"];

    if (searchFields) {
      const fields = JSON.parse(searchFields);

      fields.forEach((field) => {
        if (field.field && field.keyword) {
          whereClauses.push(`u.${field.field} LIKE '%${field.keyword}%'`);
        }
      });
    }

    if (fromDate && toDate) {
      whereClauses.push(
        `u.created_on BETWEEN '${fromDate} 00:00:00' AND '${toDate} 23:59:59'`,
      );
    }

    const whereSQL =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // Final Query
    const query = `
      SELECT 
        u.id,
        u.first_name + ' ' + u.last_name AS name,
        u.fullname,
        u.email,
        u.phone AS contactNo,
        u.address,
        u.city,
        u.pincode,
        u.role,
        c.company_name AS company_name_actual,
        b.branch_name AS branch_name_actual,
        u.created_on
      FROM users u
      LEFT JOIN companies c ON u.company_id = c.id
      LEFT JOIN branch b ON u.branch_id = b.id
      ${whereSQL}
      ORDER BY u.created_on DESC
    `;

    const result = await pool.request().query(query);

    const users = result.recordset;

    // Headers
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

    // Rows
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
      u.created_on ? formatDateForExcel(new Date(u.created_on)) : "",
    ]);

    const finalSheetData = [headers, ...excelRows];

    // Workbook
    const worksheet = xlsx.utils.aoa_to_sheet(finalSheetData);

    const workbook = xlsx.utils.book_new();

    xlsx.utils.book_append_sheet(workbook, worksheet, "Users");

    const randomNumber = Math.floor(1000000000 + Math.random() * 9000000000);

    const fileName = `Users_${randomNumber}.xlsx`;

    const excelBuffer = xlsx.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.send(excelBuffer);
  } catch (error) {
    console.error("DOWNLOAD USERS EXCEL ERROR:", error);

    res.status(500).json({
      message: "Failed to download Excel",
      error: error.message,
    });
  }
};
