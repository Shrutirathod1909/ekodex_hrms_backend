const { poolPromise, sql } = require("../config/db");

/**
 * Checks whether the acting user is a Superadmin.
 * @param {object} user - User object (from req.user or decoded JWT)
 * @returns {boolean}
 */
const isUserSuperAdmin = (user) => {
  if (!user) return false;
  return (
    user.is_superadmin === true ||
    Number(user.id) === 1 ||
    String(user.role).trim().toUpperCase() === "SUPERADMIN" ||
    String(user.role).trim().toUpperCase() === "SUPER ADMIN"
  );
};

/**
 * Checks if the target record was created by a Superadmin.
 * If yes and the acting user is NOT a Superadmin, throws an Access Denied error.
 * 
 * @param {string} tableName - e.g. 'users', 'companies', 'branch', 'new_client'
 * @param {number|string} recordId - ID of the entity being updated or deleted
 * @param {object} actingUser - req.user object (from auth middleware)
 */
const checkSuperadminProtection = async (
  tableName,
  recordId,
  actingUser
) => {
  try {
    if (!recordId) {
      return;
    }

    // =====================================================
    // SUPER ADMIN CAN MODIFY / DELETE ANY RECORD
    // =====================================================

    if (isUserSuperAdmin(actingUser)) {
      console.log(
        "[SUPERADMIN PROTECTION] Acting user is SUPER ADMIN - ALLOWED"
      );

      return;
    }

    const pool = await poolPromise;

    // =====================================================
    // VALIDATE TABLE
    // =====================================================

    const allowedTables = [
      "branch",
      "companies",
      "users",
    ];

    if (!allowedTables.includes(tableName)) {
      throw new Error(
        `Invalid table name: ${tableName}`
      );
    }

    // =====================================================
    // CONVERT RECORD ID SAFELY
    // =====================================================

    const numericRecordId = Number(recordId);

    if (
      !Number.isInteger(numericRecordId) ||
      numericRecordId <= 0
    ) {
      throw new Error(
        `Invalid record ID: ${recordId}`
      );
    }

    console.log("====================================");
    console.log("[SUPERADMIN PROTECTION]");
    console.log("Table:", tableName);
    console.log("Record ID:", numericRecordId);
    console.log("Acting User ID:", actingUser?.id);
    console.log("====================================");

    // =====================================================
    // GET RECORD
    // =====================================================

    const res = await pool
      .request()
      .input(
        "id",
        sql.BigInt,
        numericRecordId
      )
      .query(`
        SELECT TOP 1
          id,
          created_by,
          created_by_name
        FROM dbo.${tableName}
        WHERE TRY_CONVERT(BIGINT, id) = @id
      `);

    const record = res.recordset[0];

    if (!record) {
      console.log(
        "[SUPERADMIN PROTECTION] Record not found"
      );

      return;
    }

    console.log(
      "[SUPERADMIN PROTECTION] Record:",
      record
    );

    let isCreatedBySuperadmin = false;

    // =====================================================
    // 1. CREATED BY USER ID 1
    // =====================================================

    if (
      Number(record.created_by) === 1
    ) {
      isCreatedBySuperadmin = true;
    }

    // =====================================================
    // 2. CREATED BY SUPERADMIN NAME
    // =====================================================

    const creatorName = String(
      record.created_by_name || ""
    )
      .trim()
      .toUpperCase();

    if (
      creatorName === "SUPERADMIN" ||
      creatorName === "SUPER ADMIN"
    ) {
      isCreatedBySuperadmin = true;
    }

    // =====================================================
    // 3. CHECK CREATOR USER
    // =====================================================

    if (
      !isCreatedBySuperadmin &&
      record.created_by !== null &&
      record.created_by !== undefined &&
      String(record.created_by).trim() !== ""
    ) {
      const creatorId = Number(
        record.created_by
      );

      // Only query users if created_by is numeric
      if (
        Number.isInteger(creatorId) &&
        creatorId > 0
      ) {
        const creatorRes = await pool
          .request()
          .input(
            "creatorId",
            sql.BigInt,
            creatorId
          )
          .query(`
            SELECT TOP 1
              id,
              role,
              superadmin_status
            FROM dbo.users
            WHERE TRY_CONVERT(BIGINT, id) = @creatorId
          `);

        const creator =
          creatorRes.recordset[0];

        console.log(
          "[SUPERADMIN PROTECTION] Creator:",
          creator
        );

        if (
          creator &&
          isUserSuperAdmin(creator)
        ) {
          isCreatedBySuperadmin = true;
        }
      }
    }

    // =====================================================
    // BLOCK NON-SUPERADMIN
    // =====================================================

    if (isCreatedBySuperadmin) {
      throw new Error(
        "Access Denied: Records created by Superadmin cannot be modified or deleted by other users."
      );
    }

    console.log(
      "[SUPERADMIN PROTECTION] Modification allowed"
    );

  } catch (error) {
    console.error(
      "[SUPERADMIN PROTECTION ERROR]:",
      error
    );

    throw error;
  }
};


module.exports = {
  isUserSuperAdmin,
  checkSuperadminProtection,
};
