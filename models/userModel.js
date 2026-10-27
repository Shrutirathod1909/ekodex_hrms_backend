const { poolPromise, sql, DOC_BASE_URL } = require("../config/db");
const md5 = require("md5");
const logger = require("../utils/logger");
const { checkSuperadminProtection, isUserSuperAdmin } = require("../utils/superadminProtection");

const { getFormattedDateTime } = require("../utils/dateHelper");
const { getRelativePathFromApi } = require("../utils/img_path");
// =====================================================
// normalizeIds â€” converts any format to clean "1,2,3"
// Handles: array [1,2], JSON string '["1","2"]', "1,2", "1"
// =====================================================
const normalizeIds = (value) => {
  if (!value) return "";
  if (Array.isArray(value)) return value.join(",");
  if (typeof value === "string") {
    return value.replace(/[\[\]"]/g, "").trim();
  }
  return String(value);
};

const createEmployee = async (data) => {
  const pool = await poolPromise;

  // =========================================================
  // EMPLOYEE DATA
  // =========================================================

  const employeeData = {
    ...data,

    // ROLE -> RANK
    rank:
      data.rank ||
      data.role ||
      data.employee_role ||
      data.user_role ||
      null,
  };

  // =========================================================
  // DEBUG ROLE / RANK
  // =========================================================

  console.log("=================================");
  console.log("EMPLOYEE ROLE :", data.role);
  console.log("EMPLOYEE RANK :", data.rank);
  console.log("EMPLOYEE ROLE FROM employee_role :", data.employee_role);
  console.log("EMPLOYEE ROLE FROM user_role :", data.user_role);
  console.log("FINAL RANK    :", employeeData.rank);
  console.log("=================================");

  // =========================================================
  // REQUEST
  // =========================================================

  const request = pool.request();

  // =========================================================
  // LOOP ALL INPUTS
  // =========================================================

  Object.keys(employeeData).forEach((key) => {
    if (employeeData[key] !== undefined) {
      if (key === "password" && employeeData[key]) {
        request.input(key, md5(employeeData[key]));
      } else {
        request.input(key, employeeData[key]);
      }
    }
  });

  // =========================================================
  // IMPORTANT:
  // rank may not exist in Object.keys if all values are null
  // So explicitly add rank parameter.
  // =========================================================

  // request.input(
  //   "rank",
  //   sql.NVarChar,
  //   employeeData.rank != null
  //     ? String(employeeData.rank)
  //     : null
  // );

  // =========================================================
  // INSERT EMPLOYEE
  // =========================================================

  const result = await request.query(`

    INSERT INTO employee (

      employee_code,
      initial,
      first_name,
      middle_name,
      last_name,
      emp_full_name,
      gender,
      dob,
      date_of_joining,
      reg_date,

      address,
      city,
      state,
      pincode,
      country,

      phone1,
      phone2,
      email_id,

      contact_person,
      contact_mobile,
      contact_relation,
      contact_email,

      p_address,
      p_city,
      p_state,
      p_pincode,
      p_country,
      p_phone1,
      p_phone2,

      marital_status,
      mrg_date,

      cast,
      category,
      native_place,
      blood_group,
      father_name,

      native_address,
      native_city,
      native_state,
      native_pincode,
      native_country,

      driving_license,
      pancard_no,
      aadhar_no,
      passport_no,
      uan_no,
      passport_valid_date,
      pf_no,
      esis_no,
      esis_date,
      uan_date,

      lang1,
      lang2,
      lang3,
      lang4,
      lang5,

      hobby1,
      hobby2,
      hobby3,
      hobby4,

      bank_name,
      account_no,
      bank_address,
      bank_city,
      bank_state,
      bank_ifsc,
      bank_micr,
      cancelled_cheque_image,
      ac_holder_name,
      card_no,

      branch_id,
      company_id,
      client_id,
      site_id,
      site_name,
      client_name,

      department,
      rank,
      reporting_manager,
      reporting_user,

      salary_template,
      gross_salary,
      gross_salary_type,
      basic_salary,
      basic_salary_type,
      sal_from_date,
      sal_to_date,
      pf_applicable,
      da_term,
      basic_term,
      gang_name,
      perday_salary,
      migrant_status,

      separation_type,
      separate_reason,
      date_of_separation,
      notice_period,
      last_working_date_sp,
      handover_given_to,

      password,
      user_id,
      doc_name,
      client_code,

      active,
      em_status,
      emp_stages,

      created_by,
      created_by_name,
      created_on,

      employee_logo,

      modified_by,
      modified_by_name,
      modified_on,

      disabled_by,
      disabled_by_name,
      disabled_on

    )

    OUTPUT
      INSERTED.id,
      INSERTED.employee_code,
      INSERTED.rank

    VALUES (

      @employee_code,
      @initial,
      @first_name,
      @middle_name,
      @last_name,
      @emp_full_name,
      @gender,
      @dob,
      @date_of_joining,
      @reg_date,

      @address,
      @city,
      @state,
      @pincode,
      @country,

      @phone1,
      @phone2,
      @email_id,

      @contact_person,
      @contact_mobile,
      @contact_relation,
      @contact_email,

      @p_address,
      @p_city,
      @p_state,
      @p_pincode,
      @p_country,
      @p_phone1,
      @p_phone2,

      @marital_status,
      @mrg_date,

      @cast,
      @category,
      @native_place,
      @blood_group,
      @father_name,

      @native_address,
      @native_city,
      @native_state,
      @native_pincode,
      @native_country,

      @driving_license,
      @pancard_no,
      @aadhar_no,
      @passport_no,
      @uan_no,
      @passport_valid_date,
      @pf_no,
      @esis_no,
      @esis_date,
      @uan_date,

      @lang1,
      @lang2,
      @lang3,
      @lang4,
      @lang5,

      @hobby1,
      @hobby2,
      @hobby3,
      @hobby4,

      @bank_name,
      @account_no,
      @bank_address,
      @bank_city,
      @bank_state,
      @bank_ifsc,
      @bank_micr,
      @cancelled_cheque_image,
      @ac_holder_name,
      @card_no,

      @branch_id,
      @company_id,
      @client_id,
      @site_id,
      @site_name,
      @client_name,

      @department,

      -- =====================================================
      -- ROLE IS SAVED HERE
      -- =====================================================
      @rank,

      @reporting_manager,
      @reporting_user,

      @salary_template,
      @gross_salary,
      @gross_salary_type,
      @basic_salary,
      @basic_salary_type,
      @sal_from_date,
      @sal_to_date,
      @pf_applicable,
      @da_term,
      @basic_term,
      @gang_name,
      @perday_salary,
      @migrant_status,

      @separation_type,
      @separate_reason,
      @date_of_separation,
      @notice_period,
      @last_working_date_sp,
      @handover_given_to,

      @password,
      @user_id,
      @doc_name,
      @client_code,

      @active,
      @em_status,
      @emp_stages,

      @created_by,
      @created_by_name,

      COALESCE(
        @created_on,
        FORMAT(
          DATEADD(MINUTE, 330, GETUTCDATE()),
          'dd-MM-yyyy HH:mm:ss'
        )
      ),

      @employee_logo,

      @modified_by,
      @modified_by_name,
      @modified_on,

      @disabled_by,
      @disabled_by_name,
      @disabled_on

    )
  `);

  // =========================================================
  // RESULT
  // =========================================================

  const employee = result.recordset[0];

  console.log("=================================");
  console.log("EMPLOYEE CREATED");
  console.log("EMPLOYEE ID   :", employee.id);
  console.log("EMPLOYEE CODE :", employee.employee_code);
  console.log("EMPLOYEE RANK :", employee.rank);
  console.log("=================================");

  // =========================================================
  // AUDIT
  // =========================================================

  const { logAction } = require("../utils/auditLogger");

  await logAction(
    "employee",
    employee.id,
    "CREATE",
    pool
  );

  return employee;
};

const updateClientSites = async (userId, data, user) => {
  console.log(data, userId, user);
  const pool = await poolPromise;

  await pool
    .request()
    .input("id", sql.BigInt, userId)
    .input("client_id", sql.NVarChar(sql.MAX), (data.client_id || []).join(","))
    .input("site_id", sql.NVarChar(sql.MAX), (data.site_id || []).join(","))
    .input("client_name", sql.NVarChar(sql.MAX), String(data.client_name || []))
    .input("site_name", sql.NVarChar(sql.MAX), String(data.site_name || []))
    .input("modified_by", sql.BigInt, user.id).query(`
      UPDATE users
      SET
          client_id = @client_id,
          site_id = @site_id,
          client_name = @client_name,
          site_name = @site_name,
          modified_by = @modified_by,
          modified_on =  FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss')
      WHERE id = @id
    `);

  return true;
};

// ================= GET USERS =================
const getUsers = async (queryParams, userId, userRole) => {
  const pool = await poolPromise;

  const { searchFields, fromDate, toDate } = queryParams;

  let whereClauses = [];

  const request = pool.request();

  // =========================================
  // USER ACCESS CONTROL
  // =========================================

  const normalizedRole = userRole?.trim().toUpperCase();

  const currentUserRes = await pool
    .request()
    .input("currentUserId", sql.Int, userId)
    .query("SELECT id, role, superadmin_status, company_id, branch_id FROM users WHERE id = @currentUserId");
  const currentUser = currentUserRes.recordset[0];

  const isSuperAdmin =
    isUserSuperAdmin(currentUser) ||
    normalizedRole === "SUPER ADMIN" ||
    normalizedRole === "SUPERADMIN";

  if (isSuperAdmin) {
    logger.log("[USER ACCESS] SUPER ADMIN -> ALL USERS");
  } else {
    // Normal user: see users created by them OR belonging to their assigned companies
    const compIds = String(currentUser?.company_id || "")
      .replace(/[\[\]"]/g, "")
      .split(",")
      .map(Number)
      .filter((n) => !isNaN(n) && n > 0);

    if (compIds.length > 0) {
      const compConditions = compIds.map(
        (cId) => `',' + ISNULL(u.company_id, '') + ',' LIKE '%,${cId},%'`
      );
      whereClauses.push(`(u.created_by = @userId OR u.id = @userId OR (${compConditions.join(" OR ")}))`);
    } else {
      whereClauses.push(`(u.created_by = @userId OR u.id = @userId)`);
    }

    request.input("userId", sql.Int, userId);
    logger.log("[USER ACCESS] SCOPED -> CREATED BY USER OR ASSIGNED COMPANIES");
  }

  // =========================================
  // SEARCH FILTER
  // =========================================

  if (searchFields) {
    const fields = JSON.parse(searchFields);

    fields.forEach((field, index) => {
      if (field.field && field.keyword) {
        const paramName = `keyword${index}`;

        whereClauses.push(
          `u.${field.field} LIKE @${paramName}`
        );

        request.input(
          paramName,
          sql.VarChar,
          `%${field.keyword}%`
        );
      }
    });
  }

  // =========================================
  // DATE FILTER
  // =========================================

  if (fromDate && toDate) {
    whereClauses.push(
      `u.created_on >= @fromDate AND u.created_on <= @toDate`
    );

    request.input(
      "fromDate",
      sql.NVarChar,
      `${fromDate} 00:00:00`
    );

    request.input(
      "toDate",
      sql.NVarChar,
      `${toDate} 23:59:59`
    );
  }

  // =========================================
  // WHERE CLAUSE
  // =========================================

  const whereSQL =
    whereClauses.length > 0
      ? "WHERE " + whereClauses.join(" AND ")
      : "";

  // =========================================
  // MAIN QUERY
  // =========================================

  // BUG-04 FIX: Removed broken LEFT JOINs.
  // company_id is now stored as "1,2,5" so ON u.company_id = c.id always fails.
  // TRY_CAST(u.branch_id AS INT) also fails for multi-value branch_id like "2,5".
  // We use the stored company_name / branch_name columns (populated at create/update).
  const query = `
    SELECT
      u.*,
      u.company_name AS company_name_actual,
      u.branch_name  AS branch_name_actual
    FROM users u
    ${whereSQL}
    ORDER BY u.id DESC
  `;

  logger.log("========== GET USERS SQL ==========");
  logger.log(query);
  logger.log("========== GET USERS PARAMS ==========");
  logger.log(request.parameters);

  const result = await request.query(query);

  logger.log(
    "[GET USERS] RESULT COUNT:",
    result.recordset.length
  );

  // =========================================
  // RESPONSE DATA
  // =========================================

  return result.recordset.map((user) => {

    // Fallback for branch_name
    if (!user.branch_name && user.branch_name_actual) {
      user.branch_name = user.branch_name_actual;
    }

    // Profile image
    if (user.profile_image) {
      if (user.profile_image.startsWith("http")) {
        // Leave as is
      } else {
        let imgPath = user.profile_image.replace(/\\/g, "/");

        if (!imgPath.includes("profilephoto/")) {
          const parts = imgPath.split("/");
          imgPath =
            "profilephoto/" + parts[parts.length - 1];
        }

        user.profile_image = DOC_BASE_URL + imgPath;
      }
    }

    return user;
  });
};
// const getUsers = async (queryParams) => {
//   const pool = await poolPromise;

//   const { searchFields, fromDate, toDate } = queryParams;

//   let whereClauses = [];

//   const request = pool.request();

//   // ================= SEARCH FILTER =================
//   if (searchFields) {
//     const fields = JSON.parse(searchFields);

//     fields.forEach((field, index) => {
//       if (field.field && field.keyword) {
//         const paramName = `keyword${index}`;

//         whereClauses.push(`u.${field.field} LIKE @${paramName}`);

//         request.input(paramName, sql.VarChar, `%${field.keyword}%`);
//       }
//     });
//   }

//   // ================= DATE FILTER (SAFE FIX) =================
//   if (fromDate && toDate) {
//     whereClauses.push(`u.created_on >= @fromDate AND u.created_on <= @toDate`);

//     request.input("fromDate", sql.NVarChar, `${fromDate} 00:00:00`);
//     request.input("toDate", sql.NVarChar, `${toDate} 23:59:59`);
//   }

//   const whereSQL =
//     whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

//     const query = `
//       SELECT u.*,
//              c.company_name AS company_name_actual,
//              b.branch_name AS branch_name_actual
//       FROM users u
//       LEFT JOIN companies c ON u.company_id = c.id
//     LEFT JOIN branch b ON TRY_CAST(u.branch_id AS INT) = b.id
//     ${whereSQL}
//     ORDER BY u.id DESC
//   `;

//   const result = await request.query(query);

//   return result.recordset.map((user) => {
//     // Fallback for branch_name
//     if (!user.branch_name && user.branch_name_actual) {
//       user.branch_name = user.branch_name_actual;
//     }

//     if (user.profile_image) {
//       if (user.profile_image.startsWith("http")) {
//         // Leave as is
//       } else {
//         let imgPath = user.profile_image.replace(/\\/g, "/");
//         if (!imgPath.includes("profilephoto/")) {
//           const parts = imgPath.split("/");
//           imgPath = "profilephoto/" + parts[parts.length - 1];
//         }
//         user.profile_image = DOC_BASE_URL + imgPath;
//       }
//     }
//     return user;
//   });
// };

const getUserByEmail = async (email) => {
  const pool = await poolPromise;

  const result = await pool
    .request()

    .input("email", sql.VarChar, email).query(`

        SELECT *
        FROM users
        WHERE email = @email

      `);

  return result.recordset[0];
};

const getUserByPhone = async (phone) => {
  const pool = await poolPromise;

  const result = await pool
    .request()

    .input("phone", sql.VarChar, phone).query(`

        SELECT *
        FROM users
        WHERE phone = @phone

      `);

  return result.recordset[0];
};

// ================= GET USER BY ID =================
const getUserById = async (id) => {
  const pool = await poolPromise;

  try {
    console.log("====================================");
    console.log("GET USER BY ID");
    console.log("User ID:", id);
    console.log("Database:", pool.config.database);
    console.log("====================================");

    // Make sure user ID is numeric
    const userId = Number(id);

    if (!Number.isInteger(userId) || userId <= 0) {
      console.log("INVALID USER ID:", id);
      return null;
    }

    const result = await pool
      .request()
      .input("id", sql.Int, userId)
      .query(`
        SELECT
          u.*,

          /* Company name */
          (
            SELECT STRING_AGG(c.company_name, ', ')
            FROM dbo.companies c
            WHERE (
              ',' + ISNULL(u.company_id, '') + ','
            ) LIKE '%,' + CAST(c.id AS VARCHAR(20)) + ',%'
          ) AS company_name_actual,

          /* Branch name */
          (
            SELECT STRING_AGG(b.branch_name, ', ')
            FROM dbo.branch b
            WHERE (
              ',' + ISNULL(u.branch_id, '') + ','
            ) LIKE '%,' + CAST(b.id AS VARCHAR(20)) + ',%'
          ) AS branch_name_actual

        FROM dbo.users u
        WHERE u.id = @id
      `);

    const user = result.recordset[0];

    console.log("USER RESULT:", user);

    if (!user) {
      return null;
    }

    /* =====================================================
       COMPANY NAME
    ===================================================== */

    if (
      !user.company_name &&
      user.company_name_actual
    ) {
      user.company_name = user.company_name_actual;
    }

    /* =====================================================
       BRANCH NAME
    ===================================================== */

    if (
      !user.branch_name &&
      user.branch_name_actual
    ) {
      user.branch_name = user.branch_name_actual;
    }

    /* =====================================================
       PROFILE IMAGE
    ===================================================== */

    if (user.profile_image) {
      if (!user.profile_image.startsWith("http")) {
        let imgPath = user.profile_image.replace(/\\/g, "/");

        if (!imgPath.includes("profilephoto/")) {
          const parts = imgPath.split("/");

          imgPath =
            "profilephoto/" +
            parts[parts.length - 1];
        }

        user.profile_image =
          DOC_BASE_URL + imgPath;
      }
    }

    return user;

  } catch (error) {
    console.error(
      "GET USER BY ID MODEL ERROR:",
      error
    );

    throw error;
  }
};


// ================= CREATE USER =================
// const createUser = async (data, file, user) => {
//   const pool = await poolPromise;

//   const userData = { ...data };

//   console.log(userData);

//   // ================= COMPUTE FULLNAME =================
//   const nameParts = [
//     userData.first_name || "",
//     userData.middle_name || "",
//     userData.last_name || "",
//   ]
//     .map((s) => s.trim().toUpperCase())
//     .filter(Boolean);
//   userData.fullname = nameParts.join(" ");

//   userData.first_name = (userData.first_name || "").toUpperCase();
//   userData.middle_name = (userData.middle_name || "").toUpperCase();
//   userData.last_name = (userData.last_name || "").toUpperCase();

//   // ================= IMAGE =================
//   if (file) {
//     userData.profile_image = file.path;
//   }

//   // ================= DUPLICATE EMAIL CHECK =================
//   const emailCheck = await pool
//     .request()
//     .input("email", sql.VarChar, userData.email).query(`
//       SELECT TOP 1 id
//       FROM users
//       WHERE email = @email
//     `);

//   if (emailCheck.recordset.length > 0) {
//     throw new Error("Email ID already exists");
//   }

//   // ================= PASSWORD HASH =================
//   let hashedPassword = null;

//   if (userData.password) {
//     hashedPassword = md5(userData.password);
//   }

//   // ================= COMPANY =================
//   let company_name = null;

//   if (userData.company_id) {
//     const companyRes = await pool
//       .request()
//       .input("company_id", sql.Int, userData.company_id).query(`
//       SELECT company_name
//       FROM companies
//       WHERE id = @company_id
//     `);

//     company_name = companyRes.recordset[0]?.company_name || null;
//   }

//   // ================= BRANCH =================
//   let branch_name = null;

//   if (userData.branch_id) {
//     const branchRes = await pool
//       .request()
//       .input("branch_id", sql.Int, userData.branch_id).query(`
//       SELECT branch_name
//       FROM branch
//       WHERE id = @branch_id
//     `);

//     branch_name = branchRes.recordset[0]?.branch_name || null;
//   }
//   // ================= INSERT USER =================
//   const result = await pool
//     .request()
//     .input("first_name", sql.VarChar, userData.first_name || "")
//     .input("middle_name", sql.VarChar, userData.middle_name || "")
//     .input("last_name", sql.VarChar, userData.last_name || "")
//     .input("fullname", sql.VarChar, userData.fullname || "")
//     .input("email", sql.VarChar, userData.email || "")
//     .input("password", sql.VarChar, hashedPassword || "")
//     .input("phone", sql.VarChar, userData.phone || "")
//     .input("role", sql.VarChar, userData.role || "")
//     .input("address", sql.VarChar, userData.address || "")
//     .input("city", sql.VarChar, userData.city || "")
//     .input("pincode", sql.VarChar, userData.pincode || "")
//     .input("company_id", sql.Int, userData.company_id || null)
//     .input("branch_id", sql.Int, userData.branch_id || null)
//     .input("profile_image", sql.VarChar, userData.profile_image || null)
//     .input("created_by", sql.Int, user?.id || null)
//     .input("created_by_name", sql.VarChar, (user?.first_name || user?.fullname || user?.name) || null)
//     .input("company_name", sql.VarChar, company_name)
//     .input("branch_name", sql.VarChar, branch_name)
//     .input("client_id", sql.VarChar, normalizeIds(userData.client_id))
//     .input("client_name", sql.VarChar, normalizeIds(userData.client_name))
//     .input("created_on", sql.VarChar, getFormattedDateTime()).query(`
//   INSERT INTO users (
//     first_name,
//     middle_name,
//     last_name,
//     fullname,
//     email,
//     password,
//     phone,
//     role,
//     address,
//     city,
//     pincode,
//     profile_image,
//     active,
//     company_id,
//     company_name,
//     branch_id,
//     branch_name,
//     client_id,
//     client_name,
//     created_on,
//     created_by,
//     created_by_name
//   )
//   VALUES (
//     @first_name,
//     @middle_name,
//     @last_name,
//     @fullname,
//     @email,
//     @password,
//     @phone,
//     @role,
//     @address,
//     @city,
//     @pincode,
//     @profile_image,
//     0,
//     @company_id,
//     @company_name,
//     @branch_id,
//     @branch_name,
//     @client_id,
//     @client_name,
//     @created_on,
//     @created_by,
//     @created_by_name
//   );

//   SELECT
//     SCOPE_IDENTITY() AS id,
//     CONVERT(VARCHAR(19), DATEADD(MINUTE, 330, GETUTCDATE()), 120) AS created_on;
// `);

//   const newId = result.recordset[0].id;
//   const { logAction } = require("../utils/auditLogger");
//   await logAction("users", newId, "CREATE");

//   return {
//     message: "User created successfully",
//     userId: newId,
//     created_on: result.recordset[0].created_on,
//   };
// };

const createUser = async (data, file, user) => {
  const pool = await poolPromise;

  const userData = { ...data };

  // ================= FULL NAME =================
  const nameParts = [
    userData.first_name || "",
    userData.middle_name || "",
    userData.last_name || "",
  ]
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  userData.fullname = nameParts.join(" ");

  userData.first_name = (userData.first_name || "").toUpperCase();
  userData.middle_name = (userData.middle_name || "").toUpperCase();
  userData.last_name = (userData.last_name || "").toUpperCase();
  userData.email = (userData.email || "").toUpperCase();
  userData.address = (userData.address || "").toUpperCase();
  userData.city = (userData.city || "").toUpperCase();
  userData.regionState = (userData.regionState || "").toUpperCase();
  userData.country = (userData.country || "").toUpperCase();

  // ================= IMAGE =================
  if (file) {
    userData.profile_image = getRelativePathFromApi(file);
  }

  // ================= DUPLICATE EMAIL CHECK =================
  if (userData.email) {
    const emailCheck = await pool
      .request()
      .input("email", sql.VarChar, userData.email).query(`
        SELECT TOP 1 id
        FROM users
        WHERE email = @email
      `);

    if (emailCheck.recordset.length > 0) {
      throw new Error("Email ID already exists");
    }
  }
 if (userData.phone && String(userData.phone).trim()) {
    const phone = String(userData.phone).trim();

    const phoneCheck = await pool
      .request()
      .input("phone", sql.NVarChar, phone)
      .query(`
        SELECT TOP 1 id
        FROM users
        WHERE LTRIM(RTRIM(phone)) = @phone
      `);

    if (phoneCheck.recordset.length > 0) {
      throw new Error("Phone number already exists");
    }
  }
  // ================= PASSWORD HASH =================
  const hashedPassword = userData.password ? md5(userData.password) : null;

  // ================= BRANCH & COMPANY =================
  let normalizedCompanyId = normalizeIds(userData.company_id);
  let normalizedBranchId = normalizeIds(userData.branch_id);

  let branch_name = "";
  let company_name = "";

  if (normalizedCompanyId) {
    const compNumIds = normalizedCompanyId
      .split(",")
      .map(Number)
      .filter((n) => !isNaN(n) && n > 0);
    if (compNumIds.length > 0) {
      const companyRes = await pool.request().query(`
        SELECT company_name
        FROM companies
        WHERE id IN (${compNumIds.join(",")})
      `);
      company_name = companyRes.recordset
        .map((r) => r.company_name?.toUpperCase())
        .filter(Boolean)
        .join(", ");
    }
  }

  if (normalizedBranchId) {
    const brNumIds = normalizedBranchId
      .split(",")
      .map(Number)
      .filter((n) => !isNaN(n) && n > 0);
    if (brNumIds.length > 0) {
      const branchRes = await pool.request().query(`
        SELECT branch_name
        FROM branch
        WHERE id IN (${brNumIds.join(",")})
      `);
      branch_name = branchRes.recordset
        .map((r) => r.branch_name?.toUpperCase())
        .filter(Boolean)
        .join(", ");
    }
  }

  // ================= CLIENT IDS =================
  let clientIds = [];

  try {
    let rawClient = userData.client_id;
    if (typeof rawClient === 'string' && rawClient.startsWith('[')) {
      clientIds = JSON.parse(rawClient).map(Number).filter(Boolean);
    } else if (rawClient) {
      clientIds = String(rawClient).split(',').map(Number).filter(Boolean);
    }
  } catch {
    clientIds = [];
  }

  // ================= SITE & CLIENT DETAILS =================
  let siteIds = normalizeIds(userData.site_id);

  let fetchedClientCode = "";
  let fetchedClientName = "";
  if (clientIds.length > 0) {
    if (!siteIds) {
      const siteResult = await pool.request().query(`
        SELECT id
        FROM client_rates
        WHERE client_id IN (${clientIds.join(",")})
      `);
      siteIds = siteResult.recordset.map((row) => row.id).join(",");
    }

    const clientRes = await pool.request().query(`
      SELECT company_name AS client_name, x_client_code AS client_code FROM new_client WHERE id IN (${clientIds.join(",")})
    `);
    if (clientRes.recordset.length > 0) {
      fetchedClientName = clientRes.recordset.map(row => row.client_name).filter(Boolean).join(",");
      fetchedClientCode = clientRes.recordset.map(row => row.client_code).filter(Boolean).join(",");
    }
  }

  let fetchedSiteName = "";
  if (siteIds) {
    const siteRes = await pool.request().query(`
      SELECT site_name FROM client_rates WHERE id IN (${siteIds})
    `);
    if (siteRes.recordset.length > 0) {
      fetchedSiteName = siteRes.recordset.map(row => row.site_name).filter(Boolean).join(",");
    }
  }
// ================= EMPLOYEE LOGIN SETTINGS =================
const employeeLoginCoordinates =
  userData.employee_login_coordinates === true ||
  userData.employee_login_coordinates === "true" ||
  userData.employee_login_coordinates === 1 ||
  userData.employee_login_coordinates === "1"
    ? 1
    : 0;
    console.log(
  "employee_login_coordinates_type:",
  userData.employee_login_coordinates_type
);

console.log("Full userData:", userData);

const employeeLoginCoordinatesType =
  userData.employee_login_coordinates_type ??
  userData.login_coordinates_type ??
  null;

const loginCompany =
  userData.login_company === true ||
  userData.login_company === "true" ||
  userData.login_company === 1 ||
  userData.login_company === "1"
    ? 1
    : 0;


  // ================= INSERT USER =================
  const result = await pool
    .request()
    .input("first_name", sql.NVarChar, userData.first_name)
    .input("middle_name", sql.NVarChar, userData.middle_name)
    .input("last_name", sql.NVarChar, userData.last_name)
    .input("fullname", sql.NVarChar, userData.fullname)
    .input("email", sql.NVarChar, userData.email || null)
    .input("password", sql.NVarChar, hashedPassword || "")
    .input("phone", sql.NVarChar, userData.phone || "")
    .input("role", sql.NVarChar, (userData.role || "").toUpperCase())
    .input("address", sql.NVarChar, userData.address)
    .input("city", sql.NVarChar, userData.city || "")
    .input("pincode", sql.NVarChar, userData.pincode || "")
    .input("company_id", sql.NVarChar, normalizedCompanyId || null)
    .input("branch_id", sql.NVarChar, normalizedBranchId || null)
    .input("superadmin_status", sql.NVarChar, userData.superadmin_status ? String(userData.superadmin_status) : "0")
    .input("profile_image", sql.NVarChar, userData.profile_image || null)
    .input("created_by", sql.Int, user?.id || null)
    .input("created_by_name", sql.NVarChar, ((user?.first_name || user?.fullname || user?.name) ? (user?.first_name || user?.fullname || user?.name).toUpperCase() : null))
    .input("modified_by", sql.Int, userData.modified_by || null)
    .input("modified_by_name", sql.NVarChar, userData.modified_by_name || null)
    .input("modified_on", sql.DateTime, userData.modified_on || null)
    .input("disabled_by", sql.Int, userData.disabled_by || null)
    .input("disabled_by_name", sql.NVarChar, userData.disabled_by_name || null)
    .input("disabled_on", sql.DateTime, userData.disabled_on || null)
    .input("company_name", sql.NVarChar, company_name || "")
    .input("branch_name", sql.NVarChar, branch_name || "")
    .input("client_id", sql.NVarChar, normalizeIds(userData.client_id))
    .input("client_name", sql.NVarChar, userData.client_name ? normalizeIds(userData.client_name) : fetchedClientName)
    .input("site_id", sql.NVarChar, siteIds)
    .input("bank_state", sql.NVarChar, userData.bank_state != null ? String(userData.bank_state) : (userData?.regionState || ""))
    .input("bank_city", sql.NVarChar, userData.bank_city != null ? String(userData.bank_city) : (userData?.country || ""))
    .input("face_enable", sql.NVarChar, (userData.face_enable === true || userData.face_enable === 'true' || userData.face_enable === 1 || userData.face_enable === '1') ? '1' : '0')
    .input("tracking_app_access", sql.NVarChar, (userData.tracking_app_access === true || userData.tracking_app_access === 'true' || userData.tracking_app_access === 1 || userData.tracking_app_access === '1') ? '1' : '0')
    .input("is_employee", sql.Bit, (userData.is_employee === true || userData.is_employee === 'true' || userData.is_employee === 1 || userData.is_employee === '1') ? 1 : 0)
   .input(
  "employee_login_coordinates",
  sql.Bit,
  employeeLoginCoordinates
)
.input(
  "employee_login_coordinates_type",
  sql.NVarChar,
  employeeLoginCoordinatesType
)
.input(
  "login_company",
  sql.Bit,
  loginCompany
)
    .input("emp_code", sql.NVarChar, userData.emp_code != null ? String(userData.emp_code) : null)
    .input("gender", sql.NVarChar, userData.gender != null ? String(userData.gender) : null)
    .input("bank_name", sql.NVarChar, userData.bank_name != null ? String(userData.bank_name) : null)
    .input("account_no", sql.NVarChar, userData.account_no != null ? String(userData.account_no) : null)
    .input("bank_ifsc", sql.NVarChar, userData.bank_ifsc != null ? String(userData.bank_ifsc) : null)
    .input("ac_holder_name", sql.NVarChar, userData.ac_holder_name != null ? String(userData.ac_holder_name) : null)
    .input("bank_address", sql.NVarChar, userData.bank_address != null ? String(userData.bank_address) : null)
    .input("bank_micr", sql.NVarChar, userData.bank_micr != null ? String(userData.bank_micr) : null)
    .input("card_no", sql.NVarChar, userData.card_no != null ? String(userData.card_no) : null)
    .input("client_code", sql.NVarChar, userData.client_code != null ? String(userData.client_code) : (fetchedClientCode || null))
    .input("site_name", sql.NVarChar, userData.site_name != null ? normalizeIds(userData.site_name) : (fetchedSiteName || null))
    .input("onboarding", sql.NVarChar, userData.onboarding != null ? String(userData.onboarding) : null)
    .input("login_from_date", sql.VarChar, userData.login_from_date != null ? String(userData.login_from_date) : null)
    .input("login_to_date", sql.VarChar, userData.login_to_date != null ? String(userData.login_to_date) : null)
    .input("source", sql.NVarChar, userData.source || "WEB")
    .input("new_site_id", sql.NVarChar, userData.new_site_id != null ? String(userData.new_site_id) : (userData.client_code != null ? String(userData.client_code) : (fetchedClientCode || null)))
    .input("emp_id", sql.Int, userData.emp_id || null)
    
    .query(`
      INSERT INTO users (
        first_name,
        middle_name,
        last_name,
        fullname,
        email,
        password,
        phone,
        role,
        address,
        city,
        pincode,
        profile_image,
        active,
        company_id,
        company_name,
        branch_id,
        branch_name,
        superadmin_status,
        client_id,
        client_name,
        site_id,
        bank_state,
        bank_city,
        face_enable,
        tracking_app_access,
        is_employee,
        employee_login_coordinates,
        employee_login_coordinates_type,
login_company,
        emp_code,
        gender,
        bank_name,
        account_no,
        bank_ifsc,
        ac_holder_name,
        bank_address,
        bank_micr,
        card_no,
        client_code,
        site_name,
        onboarding,
        login_from_date,
        login_to_date,
        source,
        new_site_id,
        emp_id,
        created_on,
        created_by,
        created_by_name,
        modified_by,
        modified_by_name,
        modified_on,
        disabled_by,
        disabled_by_name,
        disabled_on
      )
      VALUES (
        @first_name,
        @middle_name,
        @last_name,
        @fullname,
        @email,
        @password,
        @phone,
        @role,
        @address,
        @city,
        @pincode,
        @profile_image,
        0,
        @company_id,
        @company_name,
        @branch_id,
        @branch_name,
        @superadmin_status,
        @client_id,
        @client_name,
        @site_id,
        @bank_state,
        @bank_city,
        @face_enable,
        @tracking_app_access,
        @is_employee,
        @employee_login_coordinates,
        @employee_login_coordinates_type,
@login_company,
        @emp_code,
        @gender,
        @bank_name,
        @account_no,
        @bank_ifsc,
        @ac_holder_name,
        @bank_address,
        @bank_micr,
        @card_no,
        @client_code,
        @site_name,
        @onboarding,
        @login_from_date,
        @login_to_date,
        @source,
        @new_site_id,
        @emp_id,
        FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss'),
        @created_by,
        @created_by_name,
        @modified_by,
        @modified_by_name,
        @modified_on,
        @disabled_by,
        @disabled_by_name,
        @disabled_on
      );

      SELECT SCOPE_IDENTITY() AS id;
    `);

  const newId = result.recordset[0].id;
console.log(
  "Final employeeLoginCoordinatesType:",
  employeeLoginCoordinatesType
);
  const { logAction } = require("../utils/auditLogger");
  await logAction("users", newId, "CREATE", pool);

  return {
    message: "User created successfully",
    userId: newId,
    profile_image: userData.profile_image || null
  };
};

const createEmployeeUser = async (data, file, user) => {
  const pool = await poolPromise;

  const userData = { ...data };

  // ================= FULL NAME =================
  const nameParts = [
    userData.first_name || "",
    userData.middle_name || "",
    userData.last_name || "",
  ]
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  userData.fullname = nameParts.join(" ");

  userData.first_name = (userData.first_name || "").toUpperCase();
  userData.middle_name = (userData.middle_name || "").toUpperCase();
  userData.last_name = (userData.last_name || "").toUpperCase();
  userData.email = (userData.email || "").toUpperCase();
  userData.address = (userData.address || "").toUpperCase();
  userData.city = (userData.city || "").toUpperCase();
  userData.regionState = (userData.regionState || "").toUpperCase();
  userData.country = (userData.country || "").toUpperCase();

  // ================= IMAGE =================
  if (file) {
    userData.profile_image = getRelativePathFromApi(file);
  }

  // ================= DUPLICATE EMAIL CHECK =================
  const emailCheck = await pool
    .request()
    .input("email", sql.VarChar, userData.email).query(`
      SELECT TOP 1 id
      FROM users
      WHERE email = @email
    `);

  if (emailCheck.recordset.length > 0) {
    throw new Error("Email ID already exists");
  }

  // ================= PASSWORD HASH =================
  const hashedPassword = userData.password ? md5(userData.password) : null;

  // ================= COMPANY =================
  let company_name = "";

  if (userData.company_id) {
    const companyRes = await pool
      .request()
      .input("company_id", sql.Int, userData.company_id).query(`
        SELECT company_name
        FROM companies
        WHERE id = @company_id
      `);

    company_name = companyRes.recordset[0]?.company_name?.toUpperCase() || "";
  }

  // ================= BRANCH =================
  let branch_name = "";

  if (userData.branch_id) {
    const branchRes = await pool
      .request()
      .input("branch_id", sql.Int, userData.branch_id).query(`
        SELECT branch_name
        FROM branch
        WHERE id = @branch_id
      `);

    branch_name = branchRes.recordset[0]?.branch_name?.toUpperCase() || "";
  }

  // ================= CLIENT IDS =================
  let clientIds = [];

  try {
    clientIds = JSON.parse(userData.client_id || "[]")
      .map(Number)
      .filter(Boolean);
  } catch {
    clientIds = [];
  }

  // ================= SITE IDS =================
  let siteIds = "";

  if (clientIds.length > 0) {
    const siteResult = await pool.request().query(`
      SELECT id
      FROM client_rates
      WHERE client_id IN (${clientIds.join(",")})
    `);

    siteIds = siteResult.recordset.map((row) => row.id).join(",");
  }

  // ================= INSERT USER =================
  const result = await pool
    .request()
    .input("first_name", sql.NVarChar, userData.first_name)
    .input("middle_name", sql.NVarChar, userData.middle_name)
    .input("last_name", sql.NVarChar, userData.last_name)
    .input("fullname", sql.NVarChar, userData.fullname)
    .input("email", sql.NVarChar, userData.email)
    .input("password", sql.NVarChar, hashedPassword || "")
    .input("phone", sql.NVarChar, userData.phone || "")
    .input("role", sql.NVarChar, (userData.role || "").toUpperCase())
    .input("address", sql.NVarChar, userData.address)
    .input("city", sql.NVarChar, userData.city || "")
    .input("pincode", sql.NVarChar, userData.pincode || "")
    .input("company_id", sql.Int, userData.company_id || null)
    .input("branch_id", sql.Int, userData.branch_id || null)
    .input("profile_image", sql.NVarChar, userData.profile_image || null)
    .input("created_by", sql.Int, user?.id || null)
    .input("created_by_name", sql.NVarChar, (user?.first_name || user?.fullname || user?.name) || null)
    .input("company_name", sql.NVarChar, company_name || "")
    .input("branch_name", sql.NVarChar, branch_name || "")
    .input("client_id", sql.NVarChar, normalizeIds(userData.client_id))
    .input("client_name", sql.NVarChar, normalizeIds(userData.client_name))
    .input("site_id", sql.NVarChar, siteIds)
    .input("bank_state", sql.NVarChar, userData?.regionState || "")
    .input("bank_city", sql.NVarChar, userData?.country || "").query(`
      INSERT INTO users (
        first_name,
        middle_name,
        last_name,
        fullname,
        email,
        password,
        phone,
        role,
        address,
        city,
        pincode,
        profile_image,
        active,
        company_id,
        company_name,
        branch_id,
        branch_name,
        client_id,
        client_name,
        site_id,
        bank_state,
        bank_city,
        created_on,
        created_by,
        created_by_name
      )
      VALUES (
        @first_name,
        @middle_name,
        @last_name,
        @fullname,
        @email,
        @password,
        @phone,
        @role,
        @address,
        @city,
        @pincode,
        @profile_image,
        0,
        @company_id,
        @company_name,
        @branch_id,
        @branch_name,
        @client_id,
        @client_name,
        @site_id,
        @bank_state,
        @bank_city,
        FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss'),
        @created_by,
        @created_by_name
      );

      SELECT SCOPE_IDENTITY() AS id;
    `);

  const newId = result.recordset[0].id;

  const { logAction } = require("../utils/auditLogger");
  await logAction("users", newId, "CREATE", pool);

  return {
    message: "User created successfully",
    userId: newId,
    profile_image: userData.profile_image || null
  };
};

// const getRoles = async () => {
//   const pool = await poolPromise;

//   const result = await pool.request().query(`
//     SELECT 
//       id,
//       role_name
//     FROM role_master
//     WHERE active = 0
//     ORDER BY role_name ASC
//   `);

//   return result.recordset;
// };

// ================= UPDATE USER =================
// ================= UPDATE USER =================
const updateUser = async (id, data, file, user) => {
  console.log("========== UPDATE USER START ==========");
  await checkSuperadminProtection("users", id, user);

  const pool = await poolPromise;

  const updateData = { ...data };
if (
  updateData.employee_login_coordinates_type === undefined &&
  updateData.login_coordinates_type !== undefined
) {
  updateData.employee_login_coordinates_type =
    updateData.login_coordinates_type;
}

console.log(
  "LOGIN TYPE FROM REQUEST:",
  updateData.login_coordinates_type
);

console.log(
  "LOGIN TYPE TO SAVE:",
  updateData.employee_login_coordinates_type
);
  // ================= COMPUTE FULLNAME =================
  // Fetch existing user to combine correctly if only partial fields sent
  const existingUserRes = await pool
    .request()
    .input("id", sql.Int, id)
    .query(
      "SELECT first_name, middle_name, last_name, is_employee FROM users WHERE id = @id",
    );
  const existingUser = existingUserRes.recordset[0] || {};

  const fName =
    updateData.first_name !== undefined
      ? updateData.first_name
      : existingUser.first_name || "";
  const mName =
    updateData.middle_name !== undefined
      ? updateData.middle_name
      : existingUser.middle_name || "";
  const lName =
    updateData.last_name !== undefined
      ? updateData.last_name
      : existingUser.last_name || "";

  const nameParts = [fName, mName, lName]
    .map((s) =>
      String(s || "")
        .trim()
        .toUpperCase(),
    )
    .filter(Boolean);
  if (nameParts.length > 0) {
    updateData.fullname = nameParts.join(" ");
  }

  if (updateData.first_name !== undefined) {
    updateData.first_name = (updateData.first_name || "").toUpperCase();
  }
  if (updateData.middle_name !== undefined) {
    updateData.middle_name = (updateData.middle_name || "").toUpperCase();
  }
  if (updateData.last_name !== undefined) {
    updateData.last_name = (updateData.last_name || "").toUpperCase();
  }

  console.log("UPDATE DATA =", updateData);

  // ================= FILE UPLOAD =================
  if (file) {
    updateData.profile_image = getRelativePathFromApi(file);

    console.log("PROFILE IMAGE =", updateData.profile_image);
  }

  // ================= PASSWORD HASH =================
  if (updateData.password) {
    console.log("OLD PASSWORD =", updateData.password);

    updateData.password = md5(updateData.password);

    console.log("HASHED PASSWORD =", updateData.password);
  } else {
    // BUG FIX: Do not overwrite with empty password
    delete updateData.password;
  }

  // ================= COMPANY NAME =================
  if (updateData.company_id !== undefined) {
    const compIds = normalizeIds(updateData.company_id);
    updateData.company_id = compIds || null;
    if (compIds) {
      const numericCompIds = compIds.split(',').map(Number).filter((n) => !isNaN(n) && n > 0);
      if (numericCompIds.length > 0) {
        const companyRes = await pool.request().query(`
          SELECT company_name FROM companies WHERE id IN (${numericCompIds.join(',')})
        `);
        updateData.company_name = companyRes.recordset.map((r) => r.company_name?.toUpperCase()).filter(Boolean).join(", ");
      } else {
        updateData.company_name = null;
      }
    } else {
      updateData.company_name = null;
    }
  }

  // ================= BRANCH NAME =================
  if (updateData.branch_id !== undefined) {
    const brIds = normalizeIds(updateData.branch_id);
    updateData.branch_id = brIds || null;
    if (brIds) {
      const numericBrIds = brIds.split(',').map(Number).filter((n) => !isNaN(n) && n > 0);
      if (numericBrIds.length > 0) {
        const branchRes = await pool.request().query(`
          SELECT branch_name FROM branch WHERE id IN (${numericBrIds.join(',')})
        `);
        updateData.branch_name = branchRes.recordset.map((r) => r.branch_name?.toUpperCase()).filter(Boolean).join(", ");
      } else {
        updateData.branch_name = null;
      }
    } else {
      updateData.branch_name = null;
    }
  }

  // ================= ALLOWED FIELDS =================
  const allowedFields = [
    "first_name",
    "middle_name",
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
    "company_name",
    "branch_id",
    "branch_name",
    "superadmin_status",
    "client_id",
    "client_name",
    "site_id",
    "site_name",
    "new_site_id",
    "client_code",
    "profile_image",
    "face_enable",
    "tracking_app_access",
    "employee_login_coordinates",
      "employee_login_coordinates_type", // NEW

"login_company",
    "is_employee",
    "source",
  ];

  const fields = [];

  const request = pool.request();

  // ================= DYNAMIC FIELDS =================
  Object.keys(updateData).forEach((key) => {
    if (allowedFields.includes(key) && updateData[key] !== undefined) {
      console.log(`FIELD => ${key} :`, updateData[key]);

      fields.push(`${key} = @${key}`);

      if (key === "client_id" || key === "client_name" || key === "site_id" || key === "site_name") {
        request.input(key, sql.VarChar, normalizeIds(updateData[key]));
      } else if (key === "face_enable" || key === "tracking_app_access") {
        request.input(key, sql.NVarChar, (updateData[key] === true || updateData[key] === 'true' || updateData[key] === 1 || updateData[key] === '1') ? '1' : '0');
      } else if (key === "is_employee") {
        request.input(key, sql.Bit, (updateData[key] === true || updateData[key] === 'true' || updateData[key] === 1 || updateData[key] === '1') ? 1 : 0);    
      } else if (
  key === "employee_login_coordinates" ||
  key === "login_company"
) {
  const value =
    updateData[key] === true ||
    updateData[key] === "true" ||
    updateData[key] === 1 ||
    updateData[key] === "1";

  request.input(key, sql.Bit, value ? 1 : 0);}
  else if (key === "employee_login_coordinates_type") {
  request.input(
    key,
    sql.NVarChar,
    updateData[key] != null
      ? String(updateData[key])
      : null
  );
}
  else if (key === "company_id" || key === "branch_id") {
        request.input(
          key,
          sql.NVarChar,
          updateData[key] ? normalizeIds(updateData[key]) : null,
        );
      } else if (key === "superadmin_status") {
        request.input(key, sql.NVarChar, updateData[key] ? String(updateData[key]) : "0");
      } else {
        request.input(key, updateData[key]);
      }
    }
  });

  console.log("FIELDS ARRAY =", fields);

  // ================= AUDIT FIELDS =================
  const modifiedOn = getFormattedDateTime();

  console.log("MODIFIED ON =", modifiedOn);

  console.log("MODIFIED BY =", user.id);

  fields.push("modified_on = FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss')");
  fields.push("modified_by = @modified_by");
  fields.push("modified_by_name = @modified_by_name");

  request.input("modified_on", sql.VarChar, modifiedOn);

  request.input("modified_by", sql.Int, user.id);

  request.input("modified_by_name", sql.VarChar, ((user?.first_name || user?.fullname || user?.name) ? (user?.first_name || user?.fullname || user?.name).toUpperCase() : ""));

  request.input("id", sql.Int, id);

  console.log("USER ID =", id);
console.log(
  "LOGIN COORDINATES TYPE:",
  updateData.employee_login_coordinates_type
);
  // ================= QUERY =================
  const query = `
    UPDATE users
    SET ${fields.join(", ")}
    WHERE id = @id;

    SELECT TOP 1
      *
    FROM users
    WHERE id = @id;
  `;

  console.log("FINAL QUERY =", query);

  const result = await request.query(query);

  const updatedUser = result.recordset[0];
  const { logAction } = require("../utils/auditLogger");
  await logAction("users", id, "UPDATE");

  console.log("UPDATED USER RESULT =", updatedUser);

  console.log("========== UPDATE USER END ==========");

  return { ...updatedUser, was_employee: existingUser.is_employee };
};
const updateEmployeeFromUser = async (
  employeeId,
  role,
  user
) => {
  const pool = await poolPromise;

  const request = pool
    .request()
    .input(
      "employeeId",
      sql.Int,
      parseInt(employeeId)
    )
    .input(
      "rank",
      sql.NVarChar,
      role ? String(role) : null
    )
    .input(
      "modified_by",
      sql.Int,
      user?.id || null
    )
    .input(
      "modified_by_name",
      sql.NVarChar,
      (
        user?.first_name ||
        user?.fullname ||
        user?.name ||
        ""
      ).toUpperCase()
    );

  const result = await request.query(`
    UPDATE employee
    SET
      rank = @rank,
      modified_by = @modified_by,
      modified_by_name = @modified_by_name,
      modified_on = FORMAT(
        DATEADD(MINUTE, 330, GETUTCDATE()),
        'yyyy-MM-dd HH:mm:ss'
      )
    WHERE id = @employeeId;

    SELECT TOP 1
      id,
      employee_code,
      rank
    FROM employee
    WHERE id = @employeeId;
  `);

  const employee = result.recordset[0];

  console.log("=================================");
  console.log("EMPLOYEE UPDATED");
  console.log("EMPLOYEE ID :", employee?.id);
  console.log("NEW RANK    :", employee?.rank);
  console.log("=================================");

  const { logAction } = require("../utils/auditLogger");

  if (employee) {
    await logAction(
      "employee",
      employee.id,
      "UPDATE",
      pool
    );
  }

  return employee;
};

// ================= DELETE USER =================
const deleteUser = async (userId, user) => {
  await checkSuperadminProtection("users", userId, user);
  const pool = await poolPromise;

  const superadminStatus = isUserSuperAdmin(user) ? "1" : "0";

  const result = await pool
    .request()
    .input("id", sql.Int, userId)
    .input("disabled_by", sql.Int, user.id)
    .input("disabled_by_name", sql.VarChar, ((user?.first_name || user?.fullname || user?.name) ? (user?.first_name || user?.fullname || user?.name).toUpperCase() : ""))
    .input("superadmin_status", sql.NVarChar, superadminStatus)
    .query(`
      UPDATE users
      SET 
        active = 1,
        superadmin_status = @superadmin_status,
        disabled_on = CONVERT(VARCHAR(19), DATEADD(MINUTE, 330, GETUTCDATE()), 120),
        disabled_by = @disabled_by,
        disabled_by_name = @disabled_by_name
      WHERE id = @id;

      SELECT TOP 1 *
      FROM users
      WHERE id = @id;
    `);

  if (result.recordset.length === 0) {
    return null;
  }

  const deletedUser = result.recordset[0];
  const { logAction } = require("../utils/auditLogger");
  await logAction("users", userId, "DELETE");

  return deletedUser;
};

// ================= RESTORE USER =================
const restoreUser = async (userId, user) => {
  const pool = await poolPromise;

  const targetRes = await pool
    .request()
    .input("id", sql.Int, userId)
    .query("SELECT id, superadmin_status FROM users WHERE id = @id");
  const target = targetRes.recordset[0];

  if (target && String(target.superadmin_status) === "1" && !isUserSuperAdmin(user)) {
    throw new Error(
      "Access Denied: Records deactivated by Superadmin can only be restored by Superadmin."
    );
  }

  const result = await pool
    .request()
    .input("id", sql.Int, userId)
    .input("modified_by", sql.Int, user.id)
    .input("modified_by_name", sql.VarChar, ((user?.first_name || user?.fullname || user?.name) ? (user?.first_name || user?.fullname || user?.name).toUpperCase() : "")).query(`
      UPDATE users
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

      SELECT TOP 1 *
      FROM users
      WHERE id = @id;
    `);

  if (result.recordset.length === 0) {
    return null;
  }

  const restoredUser = result.recordset[0];
  const { logAction } = require("../utils/auditLogger");
  await logAction("users", userId, "RESTORE");

  return restoredUser;
};

const getClients = async () => {
  const pool = await poolPromise;

  const result = await pool.request().query(`
    SELECT DISTINCT
        nc.id,
        nc.company_name,
        nc.contact_person,
        nc.client_email,
        nc.contact_no,
             nc.billing_company_id
    FROM new_client nc
    WHERE nc.active = '0'
    ORDER BY nc.company_name ASC
  `);

  return result.recordset;
};
const exportUsersToExcel = async (
  { searchFields, fromDate, toDate, active },
  loggedUser
) => {
  const pool = await poolPromise;
  const request = pool.request();

  const whereClauses = [];

  // =====================================================
  // ACTIVE
  // =====================================================

  let activeValue = 0;

  if (active !== undefined && active !== "") {
    const parsed = Number(active);

    if (!Number.isNaN(parsed)) {
      activeValue = parsed;
    }
  }

  request.input("active", sql.Int, activeValue);

  whereClauses.push(`
    u.active = @active
  `);

  // =====================================================
  // ROLE BASED COMPANY FILTER
  // =====================================================

  const role = String(loggedUser?.role || "")
    .trim()
    .toUpperCase();

  const loggedUserId = Number(loggedUser?.id);

  const isSuperAdmin =
    loggedUser?.is_superadmin === true ||
    loggedUser?.is_superadmin === 1 ||
    role === "SUPER ADMIN" ||
    role === "SUPERADMIN" ||
    loggedUserId === 1;

  console.log("======================================");
  console.log("[EXPORT USERS]");
  console.log("Logged User ID:", loggedUserId);
  console.log("Role:", role);
  console.log("Is Super Admin:", isSuperAdmin);
  console.log("Company ID:", loggedUser?.company_id);
  console.log("======================================");

  // =====================================================
  // SUPER ADMIN
  // =====================================================

  if (!isSuperAdmin) {
    /*
      ADMIN:
      फक्त त्याच्या company_id मधले users

      Employee:
      स्वतःचा data
    */

    if (role === "ADMIN") {
      const companyId = String(
        loggedUser?.company_id || ""
      ).trim();

      if (!companyId) {
        throw new Error(
          "Logged-in admin company_id not found"
        );
      }

      request.input(
        "loggedCompanyId",
        sql.NVarChar,
        companyId
      );

      whereClauses.push(`
        ',' + ISNULL(u.company_id, '') + ','
        LIKE '%,' + @loggedCompanyId + ',%'
      `);

    } else {
      // Employee / other user
      if (!loggedUserId) {
        throw new Error(
          "Logged-in user id not found"
        );
      }

      request.input(
        "loggedUserId",
        sql.Int,
        loggedUserId
      );

      whereClauses.push(`
        u.id = @loggedUserId
      `);
    }
  }

  // =====================================================
  // SEARCH
  // =====================================================

  let parsedSearchFields = [];

  if (searchFields) {
    try {
      parsedSearchFields =
        typeof searchFields === "string"
          ? JSON.parse(searchFields)
          : searchFields;
    } catch (error) {
      parsedSearchFields = [];
    }
  }

  const allowedFields = {
    fullname: "u.fullname",
    email: "u.email",
    phone: "u.phone",
  };

  if (Array.isArray(parsedSearchFields)) {
    parsedSearchFields.forEach((field, index) => {
      if (!field?.field || !field?.keyword) {
        return;
      }

      const dbField =
        allowedFields[field.field];

      if (!dbField) {
        return;
      }

      const paramName = `keyword_${index}`;

      request.input(
        paramName,
        sql.NVarChar,
        String(field.keyword)
      );

      whereClauses.push(`
        ${dbField} LIKE '%' + @${paramName} + '%'
      `);
    });
  }

  // =====================================================
  // DATE
  // =====================================================

  if (fromDate && toDate) {
    request.input(
      "fromDate",
      sql.DateTime,
      new Date(`${fromDate}T00:00:00`)
    );

    request.input(
      "toDate",
      sql.DateTime,
      new Date(`${toDate}T00:00:00`)
    );

    whereClauses.push(`
      u.created_on >= @fromDate
      AND u.created_on < DATEADD(DAY, 1, @toDate)
    `);
  }

  // =====================================================
  // QUERY
  // =====================================================

  const query = `
    SELECT
      u.id,

      LTRIM(RTRIM(
        ISNULL(u.first_name, '') +
        CASE
          WHEN ISNULL(u.first_name, '') <> ''
           AND ISNULL(u.last_name, '') <> ''
          THEN ' '
          ELSE ''
        END +
        ISNULL(u.last_name, '')
      )) AS name,

      u.fullname,
      u.email,
      u.phone AS contactNo,
      u.address,
      u.city,
      u.pincode,
      u.role,

      ISNULL(
        STUFF((
          SELECT ', ' + ISNULL(c.company_name, '')
          FROM companies c
          WHERE ',' + ISNULL(u.company_id, '') + ','
            LIKE '%,' + CAST(c.id AS VARCHAR(50)) + ',%'
          FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 2, ''),
        ''
      ) AS company_name_actual,

      ISNULL(
        STUFF((
          SELECT ', ' + ISNULL(b.branch_name, '')
          FROM branch b
          WHERE ',' + ISNULL(u.branch_id, '') + ','
            LIKE '%,' + CAST(b.id AS VARCHAR(50)) + ',%'
          FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 2, ''),
        ''
      ) AS branch_name_actual,

      u.created_on

    FROM users u

    WHERE ${whereClauses.join(" AND ")}

    ORDER BY u.id DESC
  `;

  console.log("[EXPORT USERS SQL]");
  console.log(query);

  const result = await request.query(query);

  console.log(
    "[EXPORT USERS] Records:",
    result.recordset.length
  );

  return result.recordset;
};

// all roles
const getRoles = async () => {

  const pool = await poolPromise;

  const result = await pool.request().query(`
    SELECT id, role_name, active, created_by_name, modified_by_name, disabled_by_name
    FROM role_master
    WHERE UPPER(LTRIM(RTRIM(role_name))) NOT IN ('SUPER ADMIN', 'SUPERADMIN')
    ORDER BY id DESC
  `);

  return result.recordset;
};


module.exports = {
  getUsers,
  getUserByEmail,
  getUserByPhone,
  createUser,
  getRoles,
  updateUser,
  deleteUser,
  restoreUser,
  getClients,
  exportUsersToExcel,
  getUserById,
  createEmployee,
  updateClientSites,
  updateEmployeeFromUser
};
