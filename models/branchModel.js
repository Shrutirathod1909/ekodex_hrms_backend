const { poolPromise, sql } = require("../config/db");
const { logAction } = require("../utils/auditLogger");
const logger = require("../utils/logger");
const { checkSuperadminProtection, isUserSuperAdmin } = require("../utils/superadminProtection");
const {
  addBranchId,
} = require("./superadminIdModel");

const toUpper = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim().toUpperCase();
};



const createBranch = async (data, user) => {
  const pool = await poolPromise;

  // ==============================
  // VALIDATE INPUT
  // ==============================
  if (!data.branch_name || !String(data.branch_name).trim()) {
    throw new Error("Branch Name is required");
  }

  if (
    data.company_id === undefined ||
    data.company_id === null ||
    String(data.company_id).trim() === ""
  ) {
    throw new Error("Company ID is required");
  }

  const branchName = toUpper(String(data.branch_name).trim());
  const companyId = String(data.company_id).trim();

  // ==============================
  // VALIDATE ZONE ID
  // ==============================
  const rawZoneId = data.zone_id;
  let zoneId = null;

  if (
    rawZoneId !== undefined &&
    rawZoneId !== null &&
    String(rawZoneId).trim() !== ""
  ) {
    zoneId = Number(rawZoneId);

    if (!Number.isInteger(zoneId) || zoneId <= 0) {
      throw new Error(`Invalid zone_id: ${String(rawZoneId)}`);
    }
  }

  // ==============================
  // DUPLICATE CHECK
  // SAME BRANCH NAME + SAME COMPANY
  // ==============================
  const checkBranch = await pool
    .request()
    .input("branch_name", sql.VarChar, branchName)
    .input("company_id", sql.VarChar, companyId)
    .query(`
      SELECT TOP 1
        id,
        branch_name,
        company_id
      FROM branch
      WHERE UPPER(LTRIM(RTRIM(branch_name))) =
            UPPER(LTRIM(RTRIM(@branch_name)))
        AND LTRIM(RTRIM(company_id)) =
            LTRIM(RTRIM(@company_id))
    `);

  if (checkBranch.recordset.length > 0) {
    const error = new Error(
      "Branch Name already exists for this company"
    );
    error.statusCode = 409;
    throw error;
  }

  // ==============================
// AUTO GENERATE BRANCH CODE
// ==============================
const branchCodeResult = await pool.request().query(`
  SELECT
    ISNULL(
      MAX(
        TRY_CONVERT(
          INT,
          SUBSTRING(branch_code, 3, LEN(branch_code))
        )
      ),
      0
    ) AS last_number
  FROM branch
  WHERE branch_code LIKE 'BR%'
`);

const lastNumber = Number(
  branchCodeResult.recordset?.[0]?.last_number || 0
);

const branchCode = `BR${String(lastNumber + 1).padStart(3, "0")}`;

console.log("AUTO GENERATED BRANCH CODE =", branchCode);
  // ==============================
  // INSERT BRANCH
  // ==============================
  const request = pool.request();

  request
    .input("branch_name", sql.VarChar, branchName)
   .input("branch_code", sql.VarChar, branchCode)
    .input(
      "company_name",
      sql.VarChar,
      data.company_name
        ? toUpper(String(data.company_name).trim())
        : null
    )
    .input("company_id", sql.VarChar, companyId)

    // CONTACT DETAILS
    .input(
      "email",
      sql.VarChar,
      data.email ? toUpper(String(data.email).trim()) : null
    )
    .input(
      "address",
      sql.VarChar,
      data.address ? toUpper(String(data.address).trim()) : null
    )
    .input(
      "city",
      sql.VarChar,
      data.city ? toUpper(String(data.city).trim()) : null
    )
    .input("pincode", sql.VarChar, data.pincode || null)
    .input("phone", sql.VarChar, data.phone || null)

    // ACCOUNTING
    .input(
      "costing_method",
      sql.VarChar,
      data.costing_method || null
    )
    .input(
      "def_purchase_ac",
      sql.VarChar,
      data.def_purchase_ac || null
    )
    .input(
      "def_sales_ac",
      sql.VarChar,
      data.def_sales_ac || null
    )
    .input(
      "def_branch_recv_ac",
      sql.VarChar,
      data.def_branch_recv_ac || null
    )
    .input(
      "def_branch_desp_ac",
      sql.VarChar,
      data.def_branch_desp_ac || null
    )

    // ZONE
    .input("zone_id", sql.Int, zoneId)
    .input(
      "zone_name",
      sql.VarChar,
      data.zone_name
        ? toUpper(String(data.zone_name).trim())
        : null
    )

    // SYSTEM
    .input("source", sql.VarChar, data.source || "WEB")
    .input(
      "created_by",
      sql.VarChar,
      String(user?.id ?? "")
    )
    .input(
      "created_by_name",
      sql.VarChar,
      user?.first_name || ""
    );

  const result = await request.query(`
    INSERT INTO branch
    (
      branch_name,
      branch_code,
      company_name,
      company_id,
      email,
      address,
      city,
      pincode,
      costing_method,
      def_purchase_ac,
      def_sales_ac,
      def_branch_recv_ac,
      def_branch_desp_ac,
      phone,
      zone_id,
      zone_name,
      active,
      created_by,
      created_by_name,
      created_on,
      source,
      superadmin_status
    )
    OUTPUT INSERTED.*
    VALUES
    (
      @branch_name,
      @branch_code,
      @company_name,
      @company_id,
      @email,
      @address,
      @city,
      @pincode,
      @costing_method,
      @def_purchase_ac,
      @def_sales_ac,
      @def_branch_recv_ac,
      @def_branch_desp_ac,
      @phone,
      @zone_id,
      @zone_name,
      0,
      @created_by,
      @created_by_name,
      FORMAT(
        DATEADD(MINUTE, 330, GETUTCDATE()),
        'yyyy-MM-dd HH:mm:ss'
      ),
      @source,
      '0'
    )
  `);

  // ==============================
  // VERIFY INSERT
  // ==============================
  const newBranch = result.recordset?.[0];
await addBranchId(newBranch.id);
  if (!newBranch) {
    throw new Error("Branch insert failed: no record returned");
  }

  console.log("==========================================");
  console.log("NEW BRANCH CREATED");
  console.log("ID          =", newBranch.id);
  console.log("BRANCH      =", newBranch.branch_name);
  console.log("COMPANY ID  =", newBranch.company_id);
  console.log("ZONE ID     =", newBranch.zone_id);
  console.log("CREATED ON  =", newBranch.created_on);
  console.log("==========================================");

  // ==============================
  // LOG ACTION
  // ==============================
  await logAction("branch", newBranch.id, "CREATE", pool);

  return newBranch;
};



const getBranches = async (queryParams, userId, userRole) => {
  const pool = await poolPromise;

  const { searchFields, fromDate, toDate } = queryParams;

  let query = `
    SELECT *
    FROM branch
    WHERE 1=1
  `;

  const request = pool.request();

  // =====================================================
  // COMPANY ACCESS
  // =====================================================

  // =====================================================
// BRANCH ACCESS BASED ON USER ROLE
// =====================================================

const normalizedRole = userRole?.trim().toUpperCase();
const isSuperAdmin =
  Number(userId) === 1 ||
  normalizedRole === "SUPER ADMIN" ||
  normalizedRole === "SUPERADMIN";

if (isSuperAdmin) {

  // ===================================================
  // SUPER ADMIN -> ALL BRANCHES
  // ===================================================

  logger.log(
    "[BRANCH ACCESS] SUPER ADMIN -> ALL BRANCHES"
  );

} else if (normalizedRole === "ADMIN") {

  // ===================================================
  // ADMIN -> ALL BRANCHES OF ASSIGNED COMPANY OR CREATED BY USER
  // ===================================================

  query += `
    AND (
      TRY_CAST(branch.created_by AS INT) = @userId
      OR EXISTS (
        SELECT 1 FROM STRING_SPLIT((SELECT ISNULL(company_id, '') FROM users WHERE id = @userId), ',') s
        WHERE LTRIM(RTRIM(s.value)) <> '' 
          AND (',' + ISNULL(branch.company_id, '') + ',' LIKE '%,' + LTRIM(RTRIM(s.value)) + ',%'
               OR branch.company_id = LTRIM(RTRIM(s.value)))
      )
      OR EXISTS (
        SELECT 1 FROM companies c
        WHERE TRY_CAST(c.created_by AS INT) = @userId
          AND (',' + ISNULL(branch.company_id, '') + ',' LIKE '%,' + CAST(c.id AS VARCHAR) + ',%'
               OR branch.company_id = CAST(c.id AS VARCHAR))
      )
    )
  `;

  request.input("userId", sql.Int, userId);

  logger.log(
    "[BRANCH ACCESS] ADMIN -> ASSIGNED COMPANY, CREATED BRANCH OR CREATED COMPANY"
  );

} else {

  // ===================================================
  // OTHER ROLES -> ONLY ASSIGNED BRANCH(ES) OR CREATED BY USER
  // ===================================================

  query += `
    AND (
      TRY_CAST(branch.created_by AS INT) = @userId
      OR branch.id IN (
        SELECT TRY_CAST(value AS INT)
        FROM STRING_SPLIT((SELECT ISNULL(branch_id, '') FROM users WHERE id = @userId), ',')
        WHERE LTRIM(RTRIM(value)) <> ''
      )
      OR EXISTS (
        SELECT 1 FROM STRING_SPLIT((SELECT ISNULL(company_id, '') FROM users WHERE id = @userId), ',') s
        WHERE LTRIM(RTRIM(s.value)) <> ''
          AND (',' + ISNULL(branch.company_id, '') + ',' LIKE '%,' + LTRIM(RTRIM(s.value)) + ',%'
               OR branch.company_id = LTRIM(RTRIM(s.value)))
      )
      OR EXISTS (
        SELECT 1 FROM companies c
        WHERE TRY_CAST(c.created_by AS INT) = @userId
          AND (',' + ISNULL(branch.company_id, '') + ',' LIKE '%,' + CAST(c.id AS VARCHAR) + ',%'
               OR branch.company_id = CAST(c.id AS VARCHAR))
      )
    )
  `;

  request.input("userId", sql.Int, userId);

  logger.log(
    "[BRANCH ACCESS] OTHER ROLE -> ASSIGNED BRANCH ONLY OR CREATED BY USER"
  );
}

  // =====================================================
  // SEARCH FILTER
  // =====================================================

  if (searchFields) {
    const parsedFields = JSON.parse(searchFields);

    parsedFields.forEach((field, index) => {
      if (!field.field || !field.keyword) {
        return;
      }

      if (field.field === "branchName") {
        query += `
          AND branch_name LIKE @branchName${index}
        `;

        request.input(
          `branchName${index}`,
          sql.VarChar,
          `%${field.keyword.trim()}%`
        );
      }
if (field.field === "company_name") {
  query += `
    AND branch.company_name LIKE @companyName${index}
  `;

  request.input(
    `companyName${index}`,
    sql.VarChar,
    `%${field.keyword.trim()}%`
  );
}
      if (field.field === "areaName") {
        query += `
          AND city LIKE @areaName${index}
        `;

        request.input(
          `areaName${index}`,
          sql.VarChar,
          `%${field.keyword.trim()}%`
        );
      }

      if (field.field === "zone_name") {
        query += `
          AND zone_name LIKE @zoneName${index}
        `;

        request.input(
          `zoneName${index}`,
          sql.VarChar,
          `%${field.keyword.trim()}%`
        );
      }

      if (field.field === "pincode") {
        query += `
          AND pincode LIKE @pincode${index}
        `;

        request.input(
          `pincode${index}`,
          sql.VarChar,
          `%${field.keyword.trim()}%`
        );
      }
    });
  }

  // =====================================================
  // DATE FILTER
  // =====================================================

  if (fromDate && toDate) {
    query += `
      AND CAST(created_on AS DATE)
      BETWEEN @fromDate AND @toDate
    `;

    request.input(
      "fromDate",
      sql.Date,
      fromDate
    );

    request.input(
      "toDate",
      sql.Date,
      toDate
    );
  }

  // =====================================================
  // ORDER
  // =====================================================

  query += `
    ORDER BY created_on DESC
  `;

  // =====================================================
  // LOG
  // =====================================================

  logger.log(
    "========== GET BRANCHES SQL =========="
  );

  logger.log(query);

  logger.log(
    "========== GET BRANCHES PARAMS =========="
  );

  logger.log(request.parameters);

  const result = await request.query(query);

  logger.log(
    "[GET BRANCHES] RESULT COUNT:",
    result.recordset.length
  );

  return result.recordset;
};
// const getBranches = async (queryParams) => {
//   const pool = await poolPromise;

//   const { searchFields, fromDate, toDate } = queryParams;

//   let query = `
//     SELECT *
//     FROM branch
//     WHERE 1=1
//   `;

//   // =========================
//   // SEARCH FILTER
//   // =========================
//   if (searchFields) {
//     const parsedFields = JSON.parse(searchFields);

//     parsedFields.forEach((field) => {
//       if (field.field && field.keyword) {
//         if (field.field === "branchName") {
//           query += `
//             AND branch_name LIKE '%${field.keyword}%'
//           `;
//         }

//         if (field.field === "areaName") {
//           query += `
//             AND city LIKE '%${field.keyword}%'
//           `;
//         }

//         if (field.field === "zone_name") {
//           query += `
//             AND zone_name LIKE '%${field.keyword}%'
//           `;
//         }

//         if (field.field === "pincode") {
//           query += `
//             AND pincode LIKE '%${field.keyword}%'
//           `;
//         }
//       }
//     });
//   }

//   // =========================
//   // DATE FILTER
//   // =========================
//   if (fromDate && toDate) {
//     query += `
//       AND CAST(created_on AS DATE)
//       BETWEEN '${fromDate}'
//       AND '${toDate}'
//     `;
//   }

//   query += `
//     ORDER BY created_on DESC
//   `;

//   const result = await pool.request().query(query);

//   return result.recordset;
// };

const updateBranch = async (id, data, user) => {
  await checkSuperadminProtection("branch", id, user);

  const pool = await poolPromise;

  // ==============================
  // FORMAT DATE
  // ==============================
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

  const modifiedOn = formatDateTime();

  // ==============================
  // VALIDATE BRANCH ID
  // ==============================
  const branchId = Number(id);

  if (!Number.isInteger(branchId) || branchId <= 0) {
    throw new Error("Invalid Branch ID");
  }

  // ==============================
  // CHECK EXISTING BRANCH
  // ==============================
  const existingBranchResult = await pool
    .request()
    .input("id", sql.Int, branchId)
    .query(`
      SELECT TOP 1 id, branch_code
      FROM branch
      WHERE id = @id
    `);

  if (existingBranchResult.recordset.length === 0) {
    throw new Error("Branch not found");
  }

  const existingBranch = existingBranchResult.recordset[0];

  // ==============================
  // AUTO-GENERATE BRANCH CODE
  // If branch_code is NULL or blank
  // ==============================
  let branchCode =
    data.branch_code !== undefined &&
    data.branch_code !== null &&
    String(data.branch_code).trim() !== ""
      ? String(data.branch_code).trim().toUpperCase()
      : null;

  if (!branchCode) {
    // Existing branch code preserve करा, जर आधीपासून असेल
    branchCode =
      existingBranch.branch_code &&
      String(existingBranch.branch_code).trim() !== ""
        ? String(existingBranch.branch_code).trim()
        : null;
  }

  if (!branchCode) {
    const codeResult = await pool.request().query(`
      SELECT
        ISNULL(
          MAX(
            TRY_CONVERT(
              INT,
              SUBSTRING(branch_code, 3, LEN(branch_code))
            )
          ),
          0
        ) AS last_number
      FROM branch
      WHERE branch_code LIKE 'BR%'
    `);

    const lastNumber = Number(
      codeResult.recordset?.[0]?.last_number || 0
    );

    branchCode = `BR${String(lastNumber + 1).padStart(3, "0")}`;
  }

  console.log("==========================================");
  console.log("UPDATE BRANCH");
  console.log("BRANCH ID   =", branchId);
  console.log("BRANCH CODE =", branchCode);
  console.log("==========================================");

  // ==============================
  // DUPLICATE BRANCH NAME CHECK
  // ==============================
  if (
    data.branch_name &&
    String(data.branch_name).trim() !== ""
  ) {
    const branchName = toUpper(String(data.branch_name).trim());

    const checkBranch = await pool
      .request()
      .input("branch_name", sql.VarChar, branchName)
      .input("id", sql.Int, branchId)
      .input("company_id", sql.VarChar, String(data.company_id ?? "").trim())
      .query(`
        SELECT TOP 1 id
        FROM branch
        WHERE UPPER(LTRIM(RTRIM(branch_name))) = @branch_name
          AND id <> @id
          AND LTRIM(RTRIM(company_id)) = @company_id
      `);

    if (checkBranch.recordset.length > 0) {
      const error = new Error(
        "Branch Name already exists for this company"
      );
      error.statusCode = 409;
      throw error;
    }
  }

  // ==============================
  // VALIDATE ZONE ID
  // ==============================
  let zoneId = null;

  if (
    data.zone_id !== undefined &&
    data.zone_id !== null &&
    String(data.zone_id).trim() !== ""
  ) {
    zoneId = Number(data.zone_id);

    if (!Number.isInteger(zoneId) || zoneId <= 0) {
      throw new Error(`Invalid zone_id: ${String(data.zone_id)}`);
    }
  }

  // ==============================
  // UPDATE BRANCH
  // ==============================
  const result = await pool
    .request()
    .input("id", sql.Int, branchId)
    .input(
      "branch_name",
      sql.VarChar,
      data.branch_name
        ? toUpper(String(data.branch_name).trim())
        : null
    )
    .input("branch_code", sql.VarChar, branchCode)
    .input(
      "company_name",
      sql.VarChar,
      data.company_name
        ? toUpper(String(data.company_name).trim())
        : null
    )
    .input(
      "company_id",
      sql.VarChar,
      data.company_id ?? null
    )
    .input(
      "email",
      sql.VarChar,
      data.email ? toUpper(String(data.email).trim()) : null
    )
    .input(
      "address",
      sql.VarChar,
      data.address ? toUpper(String(data.address).trim()) : null
    )
    .input(
      "city",
      sql.VarChar,
      data.city ? toUpper(String(data.city).trim()) : null
    )
    .input("pincode", sql.VarChar, data.pincode ?? null)
    .input("costing_method", sql.VarChar, data.costing_method ?? null)
    .input("def_purchase_ac", sql.VarChar, data.def_purchase_ac ?? null)
    .input("def_sales_ac", sql.VarChar, data.def_sales_ac ?? null)
    .input(
      "def_branch_recv_ac",
      sql.VarChar,
      data.def_branch_recv_ac ?? null
    )
    .input(
      "def_branch_desp_ac",
      sql.VarChar,
      data.def_branch_desp_ac ?? null
    )
    .input("phone", sql.VarChar, data.phone ?? null)
    .input("zone_id", sql.Int, zoneId)
    .input(
      "zone_name",
      sql.VarChar,
      data.zone_name
        ? toUpper(String(data.zone_name).trim())
        : null
    )
    .input("source", sql.VarChar, data.source || "WEB")
    .input("modified_by", sql.Int, Number(user.id))
    .input(
      "modified_by_name",
      sql.VarChar,
      toUpper(user.name || user.first_name || "")
    )
    .input("modified_on", sql.VarChar, modifiedOn)
    .query(`
      UPDATE branch
      SET
        branch_name = COALESCE(@branch_name, branch_name),
        branch_code = @branch_code,
        source = @source,
        company_name = @company_name,
        company_id = @company_id,
        email = @email,
        address = @address,
        city = @city,
        pincode = @pincode,
        costing_method = @costing_method,
        def_purchase_ac = @def_purchase_ac,
        def_sales_ac = @def_sales_ac,
        def_branch_recv_ac = @def_branch_recv_ac,
        def_branch_desp_ac = @def_branch_desp_ac,
        phone = @phone,
        zone_id = @zone_id,
        zone_name = @zone_name,
        modified_on = FORMAT(
          DATEADD(MINUTE, 330, GETUTCDATE()),
          'yyyy-MM-dd HH:mm:ss'
        ),
        modified_by = @modified_by,
        modified_by_name = @modified_by_name
      WHERE id = @id;

      SELECT * FROM branch WHERE id = @id;
    `);

  const updatedBranch = result.recordset?.[0];

  if (!updatedBranch) {
    throw new Error("Branch update failed");
  }

  console.log("BRANCH UPDATED:", updatedBranch.branch_code);

  await logAction("branch", updatedBranch.id, "UPDATE");

  return updatedBranch;
};

const deleteBranch = async (id, user) => {
  try {
    console.log("====================================");
    console.log("[DELETE BRANCH MODEL]");
    console.log("Branch ID:", id);
    console.log("Branch ID Type:", typeof id);
    console.log("User ID:", user?.id);
    console.log("User ID Type:", typeof user?.id);
    console.log("User Company ID:", user?.company_id);
    console.log("User Branch ID:", user?.branch_id);
    console.log("====================================");

    // IMPORTANT:
    // Most likely error is coming from here
    await checkSuperadminProtection("branch", id, user);

    const pool = await poolPromise;

    const superadminStatus =
      isUserSuperAdmin(user) ? "1" : "0";

    const branchId = Number(id);
    const userId = Number(user.id);

    if (!Number.isInteger(branchId) || branchId <= 0) {
      throw new Error(`Invalid branch ID: ${id}`);
    }

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error(`Invalid user ID: ${user.id}`);
    }

    const result = await pool
      .request()
      .input("id", sql.Int, branchId)
      .input("disabled_by", sql.Int, userId)
      .input(
        "disabled_by_name",
        sql.VarChar,
        toUpper(
          user.name ||
          user.first_name ||
          ""
        )
      )
      .input(
        "superadmin_status",
        sql.NVarChar,
        superadminStatus
      )
      .query(`
        UPDATE dbo.branch
        SET
          active = 1,
          superadmin_status = @superadmin_status,
          disabled_on =
            FORMAT(
              DATEADD(
                MINUTE,
                330,
                GETUTCDATE()
              ),
              'yyyy-MM-dd HH:mm:ss'
            ),
          disabled_by = @disabled_by,
          disabled_by_name = @disabled_by_name
        WHERE id = @id;

        SELECT *
        FROM dbo.branch
        WHERE id = @id;
      `);

    const deletedBranch =
      result.recordset[0];

    if (!deletedBranch) {
      throw new Error(
        `Branch not found for ID ${branchId}`
      );
    }

    await logAction(
      "branch",
      deletedBranch.id,
      "DELETE"
    );

    return deletedBranch;

  } catch (error) {
    console.error(
      "DELETE BRANCH MODEL ERROR:",
      error
    );

    throw error;
  }
};

const restoreBranch = async (id, user) => {
  const pool = await poolPromise;

  const targetRes = await pool
    .request()
    .input("id", sql.Int, id)
    .query("SELECT id, superadmin_status FROM branch WHERE id = @id");
  const target = targetRes.recordset[0];

  if (target && String(target.superadmin_status) === "1" && !isUserSuperAdmin(user)) {
    throw new Error(
      "Access Denied: Records deactivated by Superadmin can only be restored by Superadmin."
    );
  }

  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .input("modified_by", sql.Int, user.id)
    .input("modified_by_name", sql.VarChar, toUpper(user.name || user.first_name || "")).query(`
      UPDATE branch
      SET
        active = 0,
        superadmin_status = '0',
        disabled_by = NULL,
        disabled_by_name = NULL,
        disabled_on = NULL,
        modified_on = FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss'),
        modified_by = @modified_by,
        modified_by_name = @modified_by_name
      WHERE id = @id;

      SELECT * FROM branch WHERE id = @id;
    `);

  const restoredBranch = result.recordset[0];

  await logAction("branch", restoredBranch.id, "RESTORE");

  return restoredBranch;
};

const getBranchesByCompany = async (companyId) => {
  const pool = await poolPromise;

  try {
    if (!companyId) {
      return [];
    }

    // Normalize company IDs
    let ids = [];

    if (Array.isArray(companyId)) {
      ids = companyId
        .flatMap((id) => String(id).split(","))
        .map((id) => id.trim())
        .filter(Boolean);
    } else {
      ids = String(companyId)
        .replace(/[\[\]"]/g, "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    }

    const numericIds = [
      ...new Set(
        ids
          .map(Number)
          .filter((id) => Number.isInteger(id) && id > 0)
      ),
    ];

    console.log("Company IDs:", numericIds);
    console.log("Database:", pool.config.database);

    if (numericIds.length === 0) {
      return [];
    }

    const request = pool.request();

    // Split the comma-separated company_id stored in branch table
    const conditions = numericIds.map((id, index) => {
      request.input(`companyId${index}`, sql.Int, id);

      return `
        EXISTS (
          SELECT 1
          FROM STRING_SPLIT(
            ISNULL(CONVERT(VARCHAR(MAX), b.company_id), ''),
            ','
          ) AS company_item
          WHERE TRY_CAST(
            LTRIM(RTRIM(company_item.value)) AS INT
          ) = @companyId${index}
        )
      `;
    });

    const query = `
      SELECT
        b.*,
        c.company_name AS parent_company_name
      FROM dbo.branch b
      LEFT JOIN dbo.companies c
        ON TRY_CAST(c.id AS INT) =
           TRY_CAST(b.company_id AS INT)
      WHERE
        (${conditions.join(" OR ")})
        AND (
          b.active = 0
          OR b.active = '0'
          OR b.active IS NULL
        )
      ORDER BY b.branch_name ASC
    `;

    const result = await request.query(query);

    console.log("Branch count:", result.recordset.length);
    console.log("Branch result:", result.recordset);

    return result.recordset || [];
  } catch (error) {
    console.error("GET BRANCHES BY COMPANY ERROR:", error);
    throw error;
  }
};
// const exportBranches = async () => {
//   const pool = await poolPromise;

//   const result = await pool.request().query(`
//       SELECT
//           id,
//           branch_name,
//           branch_code,
//           email,
//           address,
//           city,
//           pincode,
//           costing_method,
//           phone
//       FROM branch
//       WHERE active = 0
//       ORDER BY id DESC
//   `);

//   return result.recordset;
// };

const exportBranches = async (searchFields, fromDate, toDate, activeStatus, userId, userRole) => {
  const pool = await poolPromise;
  const request = pool.request();

  let query = `SELECT id, branch_name, branch_code, email, address, city, pincode, costing_method, phone 
               FROM branch WHERE 1=1`;

  const normalizedRole = userRole?.trim().toUpperCase();
  const isSuperAdmin =
    Number(userId) === 1 ||
    normalizedRole === "SUPER ADMIN" ||
    normalizedRole === "SUPERADMIN";

  if (!isSuperAdmin && userId) {
    request.input("userId", sql.Int, userId);
    query += ` AND (
      TRY_CAST(created_by AS INT) = @userId
      OR branch.id IN (
        SELECT TRY_CAST(value AS INT)
        FROM STRING_SPLIT((SELECT ISNULL(branch_id, '') FROM users WHERE id = @userId), ',')
        WHERE LTRIM(RTRIM(value)) <> ''
      )
      OR EXISTS (
        SELECT 1 FROM STRING_SPLIT((SELECT ISNULL(company_id, '') FROM users WHERE id = @userId), ',') s
        WHERE LTRIM(RTRIM(s.value)) <> '' 
          AND (',' + ISNULL(branch.company_id, '') + ',' LIKE '%,' + LTRIM(RTRIM(s.value)) + ',%'
               OR branch.company_id = LTRIM(RTRIM(s.value)))
      )
      OR EXISTS (
        SELECT 1 FROM companies c
        WHERE TRY_CAST(c.created_by AS INT) = @userId
          AND (',' + ISNULL(branch.company_id, '') + ',' LIKE '%,' + CAST(c.id AS VARCHAR) + ',%'
               OR branch.company_id = CAST(c.id AS VARCHAR))
      )
    )`;
  }

  if (activeStatus !== undefined && activeStatus !== "undefined") {
    if (String(activeStatus) === "0") {
      query += ` AND (active = '0' OR active IS NULL OR active = '')`;
    } else {
      query += ` AND active = '1'`;
    }
  } else {
    // Default to active
    query += ` AND (active = '0' OR active IS NULL OR active = '')`;
  }

  // 1. Handle Keyword Search
  if (searchFields && searchFields.length > 0) {
    searchFields.forEach((item, index) => {
      // Basic mapping to ensure column names are safe
      const validColumns = ["branchName", "areaName", "pincode"];
      if (validColumns.includes(item.field)) {
        // Map frontend field names to DB column names
        const col =
          item.field === "branchName"
            ? "branch_name"
            : item.field === "areaName"
              ? "city"
              : "pincode";

        const paramName = `search${index}`;
        query += ` AND ${col} LIKE @${paramName}`;
        request.input(paramName, `%${item.keyword}%`);
      }
    });
  }

  // 2. Handle Date Range
  if (fromDate && toDate) {
    query += ` AND created_on >= @from AND created_on <= @to`;
    request.input("from", fromDate);
    request.input("to", toDate);
  }

  query += ` ORDER BY id DESC`;

  const result = await request.query(query);
  return result.recordset;
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
