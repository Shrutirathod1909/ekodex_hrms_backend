const { poolPromise, sql } = require('../config/db')

const getAllEmployeeTypes = async ({
  searchFields,
  fromDate,
  toDate,
  userId,
  role,
  is_superadmin,
  company_id,
  branch_id,
}) => {
  const pool = await poolPromise;
  const request = pool.request();

  const normalizedRole = String(role || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  const isSuperAdmin =
    is_superadmin === true ||
    String(is_superadmin).toLowerCase() === "true" ||
    normalizedRole === "SUPERADMIN";

  const isAdmin = normalizedRole === "ADMIN";

  if (!isSuperAdmin && !isAdmin) {
    throw new Error("Unauthorized role");
  }

  let query = `
    SELECT
      et.*,
      c.company_name AS company_name,
      b.branch_name AS branch_name
    FROM emp_type et
    LEFT JOIN companies c
      ON c.id = et.company_id
    LEFT JOIN branch b
      ON b.id = et.branch_id
      AND b.company_id = et.company_id
    WHERE et.active = '0'
  `;

  // ADMIN: only their assigned company and branch
  if (isAdmin) {
    if (
      company_id === undefined ||
      company_id === null ||
      String(company_id).trim() === ""
    ) {
      throw new Error("Admin company_id not found");
    }

    if (
      branch_id === undefined ||
      branch_id === null ||
      String(branch_id).trim() === ""
    ) {
      throw new Error("Admin branch_id not found");
    }

    query += `
      AND et.company_id = @company_id
      AND et.branch_id = @branch_id
    `;

    request
      .input("company_id", sql.VarChar(50), String(company_id))
      .input("branch_id", sql.VarChar(50), String(branch_id));
  }

  // Parse search fields
  let fields = [];

  if (searchFields) {
    try {
      fields =
        typeof searchFields === "string"
          ? JSON.parse(searchFields)
          : searchFields;
    } catch {
      fields = [];
    }
  }

  if (!Array.isArray(fields)) {
    fields = [];
  }

  // Search: Employee Type, Company, Branch
  fields.forEach((field, index) => {
    if (!field || !field.field) {
      return;
    }

    const keyword = String(field.keyword ?? "").trim();

    if (!keyword) {
      return;
    }

    const paramName = `searchKeyword${index}`;

    if (field.field === "emp_type") {
      query += `
        AND et.emp_type LIKE @${paramName}
      `;

      request.input(
        paramName,
        sql.VarChar(255),
        `%${keyword}%`
      );
    } else if (isSuperAdmin && field.field === "company_name") {
      query += `
        AND c.company_name LIKE @${paramName}
      `;

      request.input(
        paramName,
        sql.VarChar(255),
        `%${keyword}%`
      );
    } else if (isSuperAdmin && field.field === "branch_name") {
      query += `
        AND b.branch_name LIKE @${paramName}
      `;

      request.input(
        paramName,
        sql.VarChar(255),
        `%${keyword}%`
      );
    }
  });

  // Date filter
  if (fromDate && toDate) {
    query += `
      AND et.created_on >= @fromDate
      AND et.created_on < DATEADD(DAY, 1, @toDate)
    `;

    request
      .input("fromDate", sql.Date, fromDate)
      .input("toDate", sql.Date, toDate);
  }

  query += `
    ORDER BY et.id DESC
  `;

  const result = await request.query(query);

  return result.recordset;
};




const checkEmployeeTypeExists = async (
  emp_type,
  company_id,
  id = null
) => {
  const pool = await poolPromise;

  const request = pool
    .request()
    .input("emp_type", sql.VarChar, emp_type.trim())
    .input("company_id", sql.Int, Number(company_id));

  let query = `
    SELECT id
    FROM emp_type
    WHERE LTRIM(RTRIM(emp_type)) = @emp_type
      AND company_id = @company_id
      AND active = '0'
  `;

  // Update case
  if (id) {
    query += ` AND id != @id`;
    request.input("id", sql.Int, Number(id));
  }

  const result = await request.query(query);

  return result.recordset.length > 0;
};


// const createEmployeeType = async ({
//   emp_type,
//   userId,
//   branch_id,
//   company_id,
// }) => {
//   const pool = await poolPromise

//   const request = pool.request()

//   await request
//     .input('emp_type', sql.VarChar, emp_type)
//     .input('active', sql.VarChar, '0')
//     .input('created_by', sql.VarChar, String(userId))
//     .input('created_on', sql.VarChar, new Date().toISOString())
//     .input('branch_id', sql.VarChar, branch_id || '')
//     .input('company_id', sql.VarChar, company_id || '')
//     .query(`
//       INSERT INTO emp_type (
//         emp_type,
//         active,
//         created_by,
//         created_on,
//         branch_id,
//         company_id
//       )
//       VALUES (
//         @emp_type,
//         @active,
//         @created_by,
//         @created_on,
//         @branch_id,
//         @company_id
//       )
//     `)
// }

const createEmployeeType = async ({
  emp_type,
  leave_eligibility_days,
  userId,
  role,
  is_superadmin,

  // Logged-in Admin चे IDs
  user_company_id,
  user_branch_id,

  // SuperAdmin ने select केलेले
  selected_company_id,
  selected_branch_id,
}) => {
  const pool = await poolPromise;
  const request = pool.request();

  let finalCompanyId = "";
  let finalBranchId = "";

  // ============================================
  // SUPER ADMIN
  // ============================================
  if (
    is_superadmin === true ||
    String(role).toUpperCase() === "SUPER ADMIN"
  ) {
    finalCompanyId = selected_company_id || "";
    finalBranchId = selected_branch_id || "";
  }

  // ============================================
  // ADMIN
  // ============================================
  else if (String(role).toUpperCase() === "ADMIN") {
    finalCompanyId = user_company_id || "";
    finalBranchId = user_branch_id || "";
  }

  // ============================================
  // OTHER ROLE
  // ============================================
  else {
    throw new Error("Unauthorized role");
  }

  // ============================================
  // VALIDATION
  // ============================================
  if (!finalCompanyId) {
    throw new Error("Company is required");
  }

  if (!finalBranchId) {
    throw new Error("Branch is required");
  }

  // ============================================
  // INSERT
  // ============================================
  await request
    .input("emp_type", sql.VarChar, emp_type)
    .input(
      "leave_eligibility_days",
      sql.Int,
      leave_eligibility_days
    )
    .input("active", sql.VarChar, "0")
    .input("created_by", sql.VarChar, String(userId))
    .input(
      "created_on",
      sql.VarChar,
      new Date().toISOString()
    )
    .input(
      "branch_id",
      sql.VarChar,
      String(finalBranchId)
    )
    .input(
      "company_id",
      sql.VarChar,
      String(finalCompanyId)
    )
    .query(`
      INSERT INTO emp_type (
        emp_type,
        leave_eligibility_days,
        active,
        created_by,
        created_on,
        branch_id,
        company_id
      )
      VALUES (
        @emp_type,
        @leave_eligibility_days,
        @active,
        @created_by,
        @created_on,
        @branch_id,
        @company_id
      )
    `);
};


// const updateEmployeeType = async ({
//   id,
//   emp_type,
//   userId,
// }) => {
//   const pool = await poolPromise

//   await pool
//     .request()
//     .input('id', sql.Int, id)
//     .input('emp_type', sql.VarChar, emp_type)
//     .input('modified_by', sql.VarChar, String(userId))
//     .input('modified_on', sql.VarChar, new Date().toISOString())
//     .query(`
//       UPDATE emp_type
//       SET
//         emp_type = @emp_type,
//         modified_by = @modified_by,
//         modified_on = @modified_on
//       WHERE id = @id
//     `)
// }



const updateEmployeeType = async ({
  id,
  emp_type,
  leave_eligibility_days,
  userId,
  selected_company_id,
  selected_branch_id,
}) => {
  try {
    const pool = await poolPromise;

    // ============================================
    // 1. VALIDATE IDS
    // ============================================
    const loggedInUserId = Number(userId);
    const employeeTypeId = Number(id);

    if (
      !Number.isInteger(loggedInUserId) ||
      loggedInUserId <= 0
    ) {
      throw new Error("Invalid user ID");
    }

    if (
      !Number.isInteger(employeeTypeId) ||
      employeeTypeId <= 0
    ) {
      throw new Error("Invalid employee type ID");
    }

    // ============================================
    // 2. GET LOGGED-IN USER
    // ============================================
    const userResult = await pool
      .request()
      .input(
        "userId",
        sql.Int,
        loggedInUserId
      )
      .query(`
        SELECT
          id,
          role,
          company_id,
          branch_id
        FROM users
        WHERE id = @userId
      `);

    if (!userResult.recordset.length) {
      throw new Error("User not found");
    }

    const user = userResult.recordset[0];

    // ============================================
    // 3. NORMALIZE ROLE
    // ============================================
    const role = String(user.role || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");

    // ============================================
    // 4. CHECK SUPER ADMIN / ADMIN
    // ============================================
    const isSuperAdmin =
      user.is_superadmin === true ||
      user.is_superadmin === 1 ||
      role === "SUPERADMIN" ||
      Number(user.id) === 1;

    const isAdmin = role === "ADMIN";

    if (!isSuperAdmin && !isAdmin) {
      throw new Error("Unauthorized role");
    }

    // ============================================
    // 5. VALIDATE EMPLOYEE TYPE
    // ============================================
    const employeeType = String(
      emp_type || ""
    ).trim();

    if (!employeeType) {
      throw new Error(
        "Employee type is required"
      );
    }

    if (employeeType.length > 255) {
      throw new Error(
        "Employee type cannot exceed 255 characters"
      );
    }

    // ============================================
    // 6. VALIDATE LEAVE ELIGIBILITY DAYS
    // ============================================
    if (
      leave_eligibility_days === undefined ||
      leave_eligibility_days === null ||
      String(
        leave_eligibility_days
      ).trim() === ""
    ) {
      throw new Error(
        "Leave eligibility days are required"
      );
    }

    const leaveDays = Number(
      leave_eligibility_days
    );

    if (
      !Number.isInteger(leaveDays) ||
      leaveDays < 0
    ) {
      throw new Error(
        "Leave eligibility days must be a non-negative integer"
      );
    }

    // ============================================
    // 7. DETERMINE COMPANY / BRANCH
    // ============================================
    let companyId = null;
    let branchId = null;

    // ============================================
    // SUPER ADMIN
    // ============================================
    if (isSuperAdmin) {
      companyId = selected_company_id;
      branchId = selected_branch_id;

      // ------------------------------------------
      // Company required
      // ------------------------------------------
      if (
        companyId === undefined ||
        companyId === null ||
        String(companyId).trim() === ""
      ) {
        throw new Error(
          "Company is required"
        );
      }

      // ------------------------------------------
      // Branch required
      // ------------------------------------------
      if (
        branchId === undefined ||
        branchId === null ||
        String(branchId).trim() === ""
      ) {
        throw new Error(
          "Branch is required"
        );
      }
    }

    // ============================================
    // ADMIN
    // ============================================
    if (isAdmin) {
      // ------------------------------------------
      // Admin company comes automatically
      // from logged-in user.
      // ------------------------------------------
      companyId = user.company_id;

      // ------------------------------------------
      // IMPORTANT:
      // Admin branch is NOT required.
      //
      // Example:
      // user.branch_id = "3,2"
      //
      // Admin can update employee type from
      // any branch under his company.
      // ------------------------------------------
      branchId = user.branch_id;

      if (
        companyId === undefined ||
        companyId === null ||
        String(companyId).trim() === ""
      ) {
        throw new Error(
          "Admin company not found"
        );
      }
    }

    // ============================================
    // 8. PREPARE SQL REQUEST
    // ============================================
    const request = pool
      .request()
      .input(
        "id",
        sql.Int,
        employeeTypeId
      )
      .input(
        "emp_type",
        sql.VarChar(255),
        employeeType
      )
      .input(
        "leave_eligibility_days",
        sql.Int,
        leaveDays
      )
      .input(
        "modified_by",
        sql.VarChar(50),
        String(loggedInUserId)
      )
      .input(
        "modified_on",
        sql.DateTime,
        new Date()
      );

    // ============================================
    // 9. BASE UPDATE QUERY
    // ============================================
    let updateQuery = `
      UPDATE emp_type
      SET
        emp_type = @emp_type,
        leave_eligibility_days = @leave_eligibility_days,
        modified_by = @modified_by,
        modified_on = @modified_on
    `;

    // ============================================
    // 10. SUPER ADMIN UPDATE
    // ============================================
    if (isSuperAdmin) {
      request
        .input(
          "company_id",
          sql.VarChar(50),
          String(companyId)
        )
        .input(
          "branch_id",
          sql.VarChar(50),
          String(branchId)
        );

      updateQuery += `
        ,
        company_id = @company_id,
        branch_id = @branch_id
      `;

      updateQuery += `
        WHERE id = @id
          AND active = '0'
      `;
    }

    // ============================================
    // 11. ADMIN UPDATE
    // ============================================
    if (isAdmin) {
      request.input(
        "admin_company_id",
        sql.VarChar(50),
        String(companyId)
      );

      // ------------------------------------------
      // IMPORTANT:
      // ONLY COMPANY CHECK
      //
      // NO branch_id condition.
      //
      // This allows:
      //
      // Admin branch_id = "3,2"
      //
      // Employee Type branch_id = "3"
      // OR
      // Employee Type branch_id = "2"
      // OR
      // Employee Type branch_id = "5"
      //
      // as long as company_id is same.
      // ------------------------------------------
      updateQuery += `
        WHERE id = @id
          AND company_id = @admin_company_id
          AND active = '0'
      `;
    }

    // ============================================
    // 12. LOG UPDATE INPUT
    // ============================================
    console.log(
      "======================================"
    );

    console.log(
      "EMPLOYEE TYPE UPDATE"
    );

    console.log({
      employeeTypeId,
      loggedInUserId,
      role,
      isSuperAdmin,
      isAdmin,
      companyId,
      branchId,
      employeeType,
      leaveDays,
    });

    console.log(
      "EMPLOYEE TYPE UPDATE QUERY:"
    );

    console.log(updateQuery);

    console.log(
      "======================================"
    );

    // ============================================
    // 13. EXECUTE UPDATE
    // ============================================
    const updateResult =
      await request.query(updateQuery);

    console.log(
      "EMPLOYEE TYPE UPDATE ROWS:",
      updateResult.rowsAffected
    );

    // ============================================
    // 14. CHECK UPDATE RESULT
    // ============================================
    if (
      !updateResult ||
      !updateResult.rowsAffected ||
      updateResult.rowsAffected[0] === 0
    ) {
      // ------------------------------------------
      // Check existing record for debugging
      // ------------------------------------------
      const checkResult =
        await pool
          .request()
          .input(
            "checkId",
            sql.Int,
            employeeTypeId
          )
          .query(`
            SELECT
              id,
              emp_type,
              leave_eligibility_days,
              company_id,
              branch_id,
              active
            FROM emp_type
            WHERE id = @checkId
          `);

      console.log(
        "EMPLOYEE TYPE EXISTING RECORD:",
        checkResult.recordset
      );

      throw new Error(
        "No record updated. Employee type may be inactive or inaccessible."
      );
    }

    // ============================================
    // 15. SUCCESS RESPONSE
    // ============================================
    return {
      success: true,
      message:
        "Employee type updated successfully",
    };

  } catch (error) {
    // ============================================
    // 16. ERROR LOG
    // ============================================
    console.error(
      "Update Employee Type Model Error:",
      error.message
    );

    throw error;
  }
};





const deleteEmployeeType = async ({
  id,
  userId,
}) => {
  const pool = await poolPromise

  await pool
    .request()
    .input('id', sql.Int, id)
    .input('disabled_by', sql.VarChar, String(userId))
    .input('disabled_on', sql.VarChar, new Date().toISOString())
    .query(`
      UPDATE emp_type
      SET
        active = '1',
        disabled_by = @disabled_by,
        disabled_on = @disabled_on
      WHERE id = @id
    `)
}


module.exports = {
  getAllEmployeeTypes,
  checkEmployeeTypeExists,
  createEmployeeType,
  updateEmployeeType,
  deleteEmployeeType,
}