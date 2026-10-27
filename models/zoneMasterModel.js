const { poolPromise, sql } = require("../config/db");
const logger = require("../utils/logger");
const { isUserSuperAdmin, checkSuperadminProtection } = require("../utils/superadminProtection");

// ================= GET ALL ZONES =================
const getZones = async (userId, userRole) => {
  try {
    const pool = await poolPromise;

    const request = pool.request();

    let query = `
      SELECT
        id,
        zone_name,
        company_id,
        company_name,
        branch_id,
        branch_name,
        active,
        created_on,
        created_by,
        created_by_name,
        modified_on,
        modified_by_name,
        disabled_by_name,
        superadmin_status
      FROM zone_master
      WHERE 1 = 1
    `;

    const normalizedRole = userRole?.trim().toUpperCase();
    const isSuperAdmin =
      Number(userId) === 1 ||
      normalizedRole === "SUPER ADMIN" ||
      normalizedRole === "SUPERADMIN";

    // =========================================
    // SUPER ADMIN -> ALL ZONES
    // =========================================
    if (isSuperAdmin) {
      logger.log("[ZONE ACCESS] SUPER ADMIN -> ALL ZONES");
    } else {
      query += `
        AND (
          TRY_CAST(zone_master.created_by AS INT) = 1
          OR TRY_CAST(zone_master.created_by AS INT) = @userId
          OR zone_master.company_id IN (
            SELECT TRY_CAST(LTRIM(RTRIM(value)) AS INT)
            FROM STRING_SPLIT(
              (SELECT ISNULL(company_id, '') FROM users WHERE id = @userId),
              ','
            )
            WHERE LTRIM(RTRIM(value)) <> ''
          )
          OR zone_master.branch_id IN (
            SELECT TRY_CAST(LTRIM(RTRIM(value)) AS INT)
            FROM STRING_SPLIT(
              (SELECT ISNULL(branch_id, '') FROM users WHERE id = @userId),
              ','
            )
            WHERE LTRIM(RTRIM(value)) <> ''
          )
          OR (zone_master.company_id IS NULL AND zone_master.branch_id IS NULL)
        )
      `;

      request.input("userId", sql.Int, userId);

      logger.log(
        "[ZONE ACCESS] USER -> CREATED ZONES, ASSIGNED COMPANY/BRANCH, OR GLOBAL ZONES"
      );
    }

    query += `
      ORDER BY id DESC
    `;

    logger.log("========== GET ZONES SQL ==========");
    logger.log(query);

    logger.log("========== GET ZONES PARAMS ==========");
    logger.log(request.parameters);

    const result = await request.query(query);

    logger.log(
      "[GET ZONES] RESULT COUNT:",
      result.recordset.length
    );

    return result.recordset;
  } catch (error) {
    logger.error("GET ZONES DB ERROR:", error);
    throw error;
  }
};

// ================= CREATE ZONE =================
// const createZone = async (data, user) => {
//   try {
//     const pool = await poolPromise;

//     // Store in UPPERCASE as per project convention
//     const zone_name = (data.zone_name || "").toString().toUpperCase().trim();

//     if (!zone_name) {
//       throw new Error("Zone name is required");
//     }

//     logger.info("CREATING ZONE => " + zone_name);

//     // CHECK DUPLICATE
//     const check = await pool
//       .request()
//       .input("zone_name", sql.VarChar, zone_name).query(`
//         SELECT id FROM zone_master
//         WHERE zone_name = @zone_name AND active = 0
//       `);

//     if (check.recordset.length > 0) {
//       throw new Error("Zone already exists");
//     }

//     // Date format: YYYY-MM-DD HH:mm:ss
//     const now = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 19).replace('T', ' ');

//     const result = await pool
//       .request()
//       .input("zone_name", sql.VarChar, zone_name)
//       .input("created_on", sql.VarChar, now)
//       .input("created_by", sql.Int, user?.id || null)
//       .input("created_by_name", sql.VarChar, (user?.first_name || user?.fullname || user?.name) || null).query(`
//         INSERT INTO zone_master (zone_name, active, created_on, created_by, created_by_name)
//         VALUES (@zone_name, 0, @created_on, @created_by, @created_by_name);

//         SELECT SCOPE_IDENTITY() AS id;
//       `);

//     const newId = result.recordset[0].id;
//     const { logAction } = require("../utils/auditLogger");
//     await logAction("zone_master", newId, "CREATE");

//     logger.success("ZONE CREATED SUCCESSFULLY => " + zone_name);
//   } catch (error) {
//     logger.error("CREATE ZONE DB ERROR:", error);
//     throw error;
//   }
// };

const createZone = async (data, user) => {
  try {
    const pool = await poolPromise;

    // Store in UPPERCASE as per project convention
    const zone_name = (data.zone_name || "")
      .toString()
      .toUpperCase()
      .trim();

    if (!zone_name) {
      throw new Error("Zone name is required");
    }

    logger.info("CREATING ZONE => " + zone_name);

    // CHECK DUPLICATE
    const check = await pool
      .request()
      .input("zone_name", sql.VarChar, zone_name)
      .query(`
        SELECT id
        FROM zone_master
        WHERE zone_name = @zone_name
          AND active = 0
      `);

    if (check.recordset.length > 0) {
      throw new Error("Zone already exists");
    }

    // Date format: YYYY-MM-DD HH:mm:ss
    const now = new Date(Date.now() + 330 * 60000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    const firstCompanyId = user?.company_id ? parseInt(String(user.company_id).split(',')[0].trim(), 10) : null;
    const firstBranchId = user?.branch_id ? parseInt(String(user.branch_id).split(',')[0].trim(), 10) : null;

    const result = await pool
      .request()
      .input("zone_name", sql.VarChar, zone_name)
      .input("created_on", sql.VarChar, now)
      .input("created_by", sql.Int, user?.id || null)
      .input(
        "created_by_name",
        sql.VarChar,
        user?.first_name ||
          user?.fullname ||
          user?.name ||
          null
      )
      .input(
        "company_id",
        sql.Int,
        isNaN(firstCompanyId) ? null : firstCompanyId
      )
      .input(
        "company_name",
        sql.VarChar,
        user?.company_name || null
      )
      .input(
        "branch_id",
        sql.Int,
        isNaN(firstBranchId) ? null : firstBranchId
      )
      .input(
        "branch_name",
        sql.VarChar,
        user?.branch_name || null
      )
      .input("superadmin_status", sql.NVarChar, "0")
      .query(`
        INSERT INTO zone_master (
          zone_name,
          active,
          created_on,
          created_by,
          created_by_name,
          company_id,
          company_name,
          branch_id,
          branch_name,
          superadmin_status
        )
        VALUES (
          @zone_name,
          0,
          @created_on,
          @created_by,
          @created_by_name,
          @company_id,
          @company_name,
          @branch_id,
          @branch_name,
          @superadmin_status
        );

        SELECT SCOPE_IDENTITY() AS id;
      `);

    const newId = result.recordset[0].id;

    const { logAction } = require("../utils/auditLogger");

    await logAction(
      "zone_master",
      newId,
      "CREATE"
    );

    logger.success(
      "ZONE CREATED SUCCESSFULLY => " + zone_name
    );
  } catch (error) {
    logger.error("CREATE ZONE DB ERROR:", error);
    throw error;
  }
};

// ================= UPDATE ZONE =================
// const updateZone = async (id, data, user) => {
//   try {
//     const pool = await poolPromise;

//     const zone_name = (data.zone_name || "").toString().toUpperCase().trim();

//     if (!zone_name) {
//       throw new Error("Zone name is required");
//     }

//     logger.info("UPDATING ZONE ID => " + id);

//     const now = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 19).replace('T', ' ');

//     const result = await pool
//       .request()
//       .input("id", sql.Int, id)
//       .input("zone_name", sql.VarChar, zone_name)
//       .input("modified_on", sql.VarChar, now)
//       .input("modified_by", sql.Int, user?.id || null)
//       .input("modified_by_name", sql.VarChar, (user?.first_name || user?.fullname || user?.name) || null).query(`
//         UPDATE zone_master
//         SET
//           zone_name   = @zone_name,
//           modified_on = @modified_on,
//           modified_by = @modified_by,
//           modified_by_name = @modified_by_name
//         WHERE id = @id;

//         SELECT * FROM zone_master WHERE id = @id;
//       `);

//     const updatedZone = result.recordset[0];
//     const { logAction } = require("../utils/auditLogger");
//     await logAction("zone_master", id, "UPDATE");

//     logger.success("ZONE UPDATED SUCCESSFULLY => " + zone_name);

//     return updatedZone;
//   } catch (error) {
//     logger.error("UPDATE ZONE DB ERROR:", error);
//     throw error;
//   }
// };

const updateZone = async (id, data, user) => {
  try {
    await checkSuperadminProtection("zone_master", id, user);
    const pool = await poolPromise;

    const zone_name = (data.zone_name || "")
      .toString()
      .toUpperCase()
      .trim();

    if (!zone_name) {
      throw new Error("Zone name is required");
    }

    logger.info("UPDATING ZONE ID => " + id);

    const now = new Date(Date.now() + 330 * 60000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    const firstCompanyId = user?.company_id ? parseInt(String(user.company_id).split(',')[0].trim(), 10) : null;
    const firstBranchId = user?.branch_id ? parseInt(String(user.branch_id).split(',')[0].trim(), 10) : null;

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("zone_name", sql.VarChar, zone_name)
      .input("modified_on", sql.VarChar, now)
      .input("modified_by", sql.Int, user?.id || null)
      .input(
        "modified_by_name",
        sql.VarChar,
        user?.first_name ||
          user?.fullname ||
          user?.name ||
          null
      )
      .input(
        "company_id",
        sql.Int,
        isNaN(firstCompanyId) ? null : firstCompanyId
      )
      .input(
        "company_name",
        sql.VarChar,
        user?.company_name || null
      )
      .input(
        "branch_id",
        sql.Int,
        isNaN(firstBranchId) ? null : firstBranchId
      )
      .input(
        "branch_name",
        sql.VarChar,
        user?.branch_name || null
      )
      .query(`
        UPDATE zone_master
        SET
          zone_name = @zone_name,
          company_id = @company_id,
          company_name = @company_name,
          branch_id = @branch_id,
          branch_name = @branch_name,
          modified_on = @modified_on,
          modified_by = @modified_by,
          modified_by_name = @modified_by_name
        WHERE id = @id;

        SELECT *
        FROM zone_master
        WHERE id = @id;
      `);

    const updatedZone = result.recordset[0];

    const { logAction } = require("../utils/auditLogger");

    await logAction(
      "zone_master",
      id,
      "UPDATE"
    );

    logger.success(
      "ZONE UPDATED SUCCESSFULLY => " + zone_name
    );

    return updatedZone;
  } catch (error) {
    logger.error("UPDATE ZONE DB ERROR:", error);
    throw error;
  }
};

// ================= DELETE ZONE (SOFT) =================
const deleteZone = async (id, user) => {
  try {
    await checkSuperadminProtection("zone_master", id, user);
    const pool = await poolPromise;

    logger.info("DELETING ZONE ID => " + id);

    const now = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 19).replace('T', ' ');
    const superadminStatus = isUserSuperAdmin(user) ? "1" : "0";

    await pool
      .request()
      .input("id", sql.Int, id)
      .input("disabled_on", sql.VarChar, now)
      .input("disabled_by", sql.Int, user?.id || null)
      .input("disabled_by_name", sql.VarChar, (user?.first_name || user?.fullname || user?.name) || null)
      .input("superadmin_status", sql.NVarChar, superadminStatus)
      .query(`
        UPDATE zone_master
        SET
          active      = 1,
          superadmin_status = @superadmin_status,
          disabled_on = @disabled_on,
          disabled_by = @disabled_by,
          disabled_by_name = @disabled_by_name
        WHERE id = @id
      `);

    const { logAction } = require("../utils/auditLogger");
    await logAction("zone_master", id, "DELETE");

    logger.success("ZONE DELETED (SOFT) ID => " + id);
  } catch (error) {
    logger.error("DELETE ZONE DB ERROR:", error);
    throw error;
  }
};

// ================= RESTORE ZONE =================
const restoreZone = async (id, user) => {
  try {
    const pool = await poolPromise;

    logger.info("RESTORING ZONE ID => " + id);

    const targetRes = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT id, superadmin_status FROM zone_master WHERE id = @id");
    const target = targetRes.recordset[0];

    if (target && String(target.superadmin_status) === "1" && !isUserSuperAdmin(user)) {
      throw new Error(
        "Access Denied: Records deactivated by Superadmin can only be restored by Superadmin."
      );
    }

    const now = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 19).replace('T', ' ');

    await pool
      .request()
      .input("id", sql.Int, id)
      .input("modified_on", sql.VarChar, now)
      .input("modified_by", sql.Int, user?.id || null)
      .input("modified_by_name", sql.VarChar, (user?.first_name || user?.fullname || user?.name) || null)
      .query(`
        UPDATE zone_master
        SET
          active      = 0,
          superadmin_status = '0',
          disabled_by = NULL,
          disabled_by_name = NULL,
          disabled_on = NULL,
          modified_on = @modified_on,
          modified_by = @modified_by,
          modified_by_name = @modified_by_name
        WHERE id = @id
      `);

    const { logAction } = require("../utils/auditLogger");
    await logAction("zone_master", id, "RESTORE");

    logger.success("ZONE RESTORED ID => " + id);
  } catch (error) {
    logger.error("RESTORE ZONE DB ERROR:", error);
    throw error;
  }
};

module.exports = {
  getZones,
  createZone,
  updateZone,
  deleteZone,
  restoreZone,
};
