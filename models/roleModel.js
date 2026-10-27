const { poolPromise, sql } = require("../config/db");
const logger = require("../utils/logger");
const { isUserSuperAdmin } = require("../utils/superadminProtection");


const toUpper = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim().toUpperCase();
};

const formatDateTime = () => {
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
};

// ================= GET ROLES =================


const getRoles = async (userId, userRole) => {
  const pool = await poolPromise;

  const request = pool.request();

  let query = `
    SELECT
      id,
      role_name,
      active,
      created_by,
      created_by_name,
      modified_by_name,
      disabled_by,
      disabled_by_name,
      superadmin_status
    FROM role_master
    WHERE 1 = 1
      AND UPPER(LTRIM(RTRIM(role_name))) NOT IN ('SUPER ADMIN', 'SUPERADMIN')
  `;

  const normalizedRole = userRole?.trim().toUpperCase();

  // SUPER ADMIN -> ALL ROLES
  if (normalizedRole === "SUPER ADMIN") {
    logger.log("[ROLE ACCESS] SUPER ADMIN -> ALL ROLES");
  }

  // ADMIN -> ALL ROLES
  else if (normalizedRole === "ADMIN") {
    logger.log("[ROLE ACCESS] ADMIN -> ALL ROLES");
  }

  // OTHER ROLE -> ONLY CURRENT USER ROLE
  else {
    query += `
      AND UPPER(LTRIM(RTRIM(role_name))) = UPPER(
        LTRIM(RTRIM(
          (
            SELECT role
            FROM users
            WHERE id = @userId
          )
        ))
      )
    `;

    request.input("userId", sql.Int, userId);

    logger.log(
      "[ROLE ACCESS] OTHER ROLE -> CURRENT USER ROLE ONLY"
    );
  }

  query += `
    ORDER BY id DESC
  `;

  logger.log("========== GET ROLES SQL ==========");
  logger.log(query);
  logger.log("========== GET ROLES PARAMS ==========");
  logger.log(request.parameters);

  const result = await request.query(query);

  logger.log(
    "[GET ROLES] RESULT COUNT:",
    result.recordset.length
  );

  return result.recordset;
};
// const getRoles = async () => {

//   const pool = await poolPromise;

//   const result = await pool.request().query(`
//     SELECT id, role_name, active, created_by_name, modified_by_name, disabled_by_name
//     FROM role_master
//     ORDER BY id DESC
//   `);

//   return result.recordset;
// };

// ================= CREATE ROLE =================
const createRole = async (data, user) => {

  const pool = await poolPromise;
  const { role_name } = data;

  if (!role_name) {
    throw new Error("Role name is required");
  }

  // CHECK DUPLICATE
  const check = await pool.request()
    .input("role_name", sql.VarChar, toUpper(role_name))
    .query(`
      SELECT id FROM role_master
      WHERE role_name = @role_name
    `);

  if (check.recordset.length > 0) {
    throw new Error("Role already exists");
  }

  const createdOn = formatDateTime();

  const result = await pool.request()
    .input("role_name", sql.VarChar, toUpper(role_name))
    .input("created_by", sql.Int, user?.id)
    .input("created_by_name", sql.VarChar, toUpper(user?.first_name || user?.fullname || user?.name))
    .input("created_on", sql.VarChar, createdOn)
    .input("source", sql.VarChar, "web")
    .input("superadmin_status", sql.NVarChar, "0")
    .query(`
      INSERT INTO role_master (role_name, active, created_by, created_by_name, created_on, source, superadmin_status)
      VALUES (@role_name, 0, @created_by, @created_by_name, @created_on, @source, @superadmin_status);

      SELECT SCOPE_IDENTITY() AS id;
    `);

  const newId = result.recordset[0].id;
  const { logAction } = require("../utils/auditLogger");
  await logAction("role_master", newId, "CREATE");
};

// ================= UPDATE ROLE =================
const updateRole = async (id, data, user) => {

  const pool = await poolPromise;
  const { role_name } = data;

  const modifiedOn = formatDateTime();

  const result = await pool.request()
    .input("id", sql.Int, id)
    .input("role_name", sql.VarChar, toUpper(role_name))
    .input("modified_by", sql.Int, user?.id)
    .input("modified_by_name", sql.VarChar, toUpper(user?.first_name || user?.fullname || user?.name))
    .input("modified_on", sql.VarChar, modifiedOn)
    .query(`
      UPDATE role_master
      SET role_name = @role_name,
          modified_by = @modified_by,
          modified_by_name = @modified_by_name,
          modified_on = @modified_on
      WHERE id = @id;

      SELECT * FROM role_master WHERE id = @id;
    `);

  const updatedRole = result.recordset[0];
  const { logAction } = require("../utils/auditLogger");
  await logAction("role_master", id, "UPDATE");

  return updatedRole;
};

// ================= DELETE ROLE =================
const deleteRole = async (id, user) => {

  const pool = await poolPromise;
  const disabledOn = formatDateTime();
  const superadminStatus = isUserSuperAdmin(user) ? "1" : "0";

  await pool.request()
    .input("id", sql.Int, id)
    .input("disabled_by", sql.Int, user?.id)
    .input("disabled_by_name", sql.VarChar, toUpper(user?.first_name || user?.fullname || user?.name))
    .input("disabled_on", sql.VarChar, disabledOn)
    .input("superadmin_status", sql.NVarChar, superadminStatus)
    .query(`
      UPDATE role_master
        SET 
          active = 1,
          superadmin_status = @superadmin_status,
          disabled_by = @disabled_by,
          disabled_by_name = @disabled_by_name,
          disabled_on = @disabled_on
        WHERE id = @id;
    `);

  const { logAction } = require("../utils/auditLogger");
  await logAction("role_master", id, "DELETE");
};

// ================= RESTORE ROLE =================
const restoreRole = async (id, user) => {

  const pool = await poolPromise;

  const targetRes = await pool
    .request()
    .input("id", sql.Int, id)
    .query("SELECT id, superadmin_status FROM role_master WHERE id = @id");
  const target = targetRes.recordset[0];

  if (target && String(target.superadmin_status) === "1" && !isUserSuperAdmin(user)) {
    throw new Error(
      "Access Denied: Records deactivated by Superadmin can only be restored by Superadmin."
    );
  }

  const modifiedOn = formatDateTime();

  await pool.request()
    .input("id", sql.Int, id)
    .input("modified_by", sql.Int, user?.id)
    .input("modified_by_name", sql.VarChar, toUpper(user?.first_name || user?.fullname || user?.name))
    .input("modified_on", sql.VarChar, modifiedOn)
    .query(`
      UPDATE role_master
        SET 
          active = 0,
          superadmin_status = '0',
          disabled_by = NULL,
          disabled_by_name = NULL,
          disabled_on = NULL,
          modified_by = @modified_by,
          modified_by_name = @modified_by_name,
          modified_on = @modified_on
        WHERE id = @id;
    `);

  const { logAction } = require("../utils/auditLogger");
  await logAction("role_master", id, "RESTORE");
};

module.exports = {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  restoreRole,
};
