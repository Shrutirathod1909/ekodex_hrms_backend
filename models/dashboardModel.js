
// models/dashboardModel.js

const { poolPromise ,sql } = require("../config/db");
const logger = require("../utils/logger");


const getEmployeeDocumentDashboard = async (filters, userId) => {
  const pool = await poolPromise;

  // =====================================================
  // HELPERS
  // =====================================================

  const parseIds = (value) => {
    if (value === null || value === undefined) return [];

    return [...new Set(
      String(value)
        .split(",")
        .map((value) => Number(value.trim()))
        .filter(
          (value) =>
            Number.isSafeInteger(value) && value > 0
        )
    )];
  };

  const hasFilterValue = (value) => {
    if (value === null || value === undefined) return false;

    const normalized = String(value).trim();

    return (
      normalized !== "" &&
      normalized !== "undefined" &&
      normalized !== "null"
    );
  };

  const normalizeStatus = (value) => {
    const status = String(value || "").trim().toUpperCase();

    if (status === "APPROVED") return "VERIFIED";
    if (status === "REJECTED") return "NOT VERIFIED";

    return status;
  };

  // =====================================================
  // DOCUMENT DEFINITIONS
  // =====================================================

  const documents = [
    {
      name: "Aadhar",
      summaryKey: "aadhar",
      condition: `
        (
          UPPER(ISNULL(d.doc_type, '')) LIKE '%AADHAR%'
          OR UPPER(ISNULL(d.doc_type, '')) LIKE '%AADHAAR%'
        )
      `,
    },
    {
      name: "PAN",
      summaryKey: "pan",
      condition: `
        UPPER(ISNULL(d.doc_type, '')) LIKE '%PAN%'
      `,
    },
    {
      name: "Passport",
      summaryKey: "passport",
      condition: `
        UPPER(ISNULL(d.doc_type, '')) LIKE '%PASSPORT%'
      `,
    },
    {
      name: "Bank",
      summaryKey: "bank",
      condition: `
        UPPER(ISNULL(d.doc_type, '')) LIKE '%BANK%'
      `,
    },
    {
      name: "PF",
      summaryKey: "pf",
      condition: `
        UPPER(ISNULL(d.doc_type, '')) LIKE '%PF%'
      `,
    },
    {
      name: "UAN",
      summaryKey: "uan",
      condition: `
        UPPER(ISNULL(d.doc_type, '')) LIKE '%UAN%'
      `,
    },
    {
      name: "ESIC",
      summaryKey: "esic",
      condition: `
        UPPER(ISNULL(d.doc_type, '')) LIKE '%ESI%'
      `,
    },
  ];

  // =====================================================
  // VALIDATE USER ID
  // =====================================================

  const loggedInUserId = Number(userId);

  if (
    !Number.isSafeInteger(loggedInUserId) ||
    loggedInUserId <= 0
  ) {
    throw new Error("Invalid logged-in user ID");
  }

  try {
    // =====================================================
    // GET LOGGED-IN USER
    // =====================================================

    const userResult = await pool
      .request()
      .input("userId", sql.Int, loggedInUserId)
      .query(`
        SELECT
          id,
          role,
          company_id,
          branch_id,
          client_id,
          site_id,
          superadmin_status
        FROM users
        WHERE id = @userId
          AND active = '0'
      `);

    if (!userResult.recordset?.length) {
      const error = new Error(
        "User not found or inactive"
      );

      error.statusCode = 401;
      throw error;
    }

    const user = userResult.recordset[0];

    const role = String(user.role || "")
      .trim()
      .toLowerCase();

    const isSuperAdmin =
      role === "super admin" ||
      role === "superadmin" ||
      Number(user.superadmin_status) === 1;

    const isAdmin = role === "admin";

    console.log("========== DOCUMENT DASHBOARD USER ==========");
    console.log({
      userId: user.id,
      role: user.role,
      isSuperAdmin,
      company_id: user.company_id,
      branch_id: user.branch_id,
      client_id: user.client_id,
      site_id: user.site_id,
    });

    // =====================================================
    // BUILD ACCESS FILTER
    // =====================================================

    const request = pool.request();

    let whereCondition = `WHERE e.active = 0`;

    // -----------------------------------------------------
    // SUPERADMIN: ALL EMPLOYEES
    // -----------------------------------------------------

    if (isSuperAdmin) {
      console.log("DOCUMENT ACCESS: SUPERADMIN");

      // Superadmin can optionally filter by company.
      if (hasFilterValue(filters.company_id)) {
        const selectedCompanyIds = parseIds(
          filters.company_id
        );

        if (selectedCompanyIds.length === 0) {
          return {
            summary: { total_employee: 0 },
            employees: [],
          };
        }

        const placeholders = selectedCompanyIds.map(
          (_, index) => `@company${index}`
        );

        selectedCompanyIds.forEach((id, index) => {
          request.input(`company${index}`, sql.Int, id);
        });

        whereCondition += `
          AND TRY_CAST(e.company_id AS BIGINT)
              IN (${placeholders.join(", ")})
        `;
      }
    }

    // -----------------------------------------------------
    // ADMIN: ONLY ASSIGNED COMPANY
    // -----------------------------------------------------

    else if (isAdmin) {
      console.log("DOCUMENT ACCESS: ADMIN COMPANY");

      let companyIds = parseIds(user.company_id);

      if (hasFilterValue(filters.company_id)) {
        const requestedCompanyIds = parseIds(
          filters.company_id
        );

        // A requested company must already be assigned to admin.
        companyIds = companyIds.filter((id) =>
          requestedCompanyIds.includes(id)
        );
      }

      if (companyIds.length === 0) {
        return {
          summary: { total_employee: 0 },
          employees: [],
        };
      }

      const placeholders = companyIds.map(
        (_, index) => `@adminCompany${index}`
      );

      companyIds.forEach((id, index) => {
        request.input(`adminCompany${index}`, sql.Int, id);
      });

      whereCondition += `
        AND TRY_CAST(e.company_id AS BIGINT)
            IN (${placeholders.join(", ")})
      `;
    }

    // -----------------------------------------------------
    // NORMAL USER: ASSIGNED CLIENT OR SITE
    // -----------------------------------------------------

    else {
      console.log("DOCUMENT ACCESS: CLIENT/SITE");

      const clientIds = parseIds(user.client_id);
      const siteIds = parseIds(user.site_id);

      const accessConditions = [];

      if (clientIds.length > 0) {
        const placeholders = clientIds.map(
          (_, index) => `@accessClient${index}`
        );

        clientIds.forEach((id, index) => {
          request.input(`accessClient${index}`, sql.Int, id);
        });

        accessConditions.push(`
          TRY_CAST(e.client_id AS BIGINT)
          IN (${placeholders.join(", ")})
        `);
      }

      if (siteIds.length > 0) {
        const placeholders = siteIds.map(
          (_, index) => `@accessSite${index}`
        );

        siteIds.forEach((id, index) => {
          request.input(`accessSite${index}`, sql.Int, id);
        });

        accessConditions.push(`
          TRY_CAST(e.site_id AS BIGINT)
          IN (${placeholders.join(", ")})
        `);
      }

      if (accessConditions.length === 0) {
        return {
          summary: { total_employee: 0 },
          employees: [],
        };
      }

      whereCondition += `
        AND (${accessConditions.join(" OR ")})
      `;

      // Optional company filter can only narrow access.
      if (hasFilterValue(filters.company_id)) {
        const companyIds = parseIds(filters.company_id);

        if (companyIds.length === 0) {
          return {
            summary: { total_employee: 0 },
            employees: [],
          };
        }

        const placeholders = companyIds.map(
          (_, index) => `@normalCompany${index}`
        );

        companyIds.forEach((id, index) => {
          request.input(`normalCompany${index}`, sql.Int, id);
        });

        whereCondition += `
          AND TRY_CAST(e.company_id AS BIGINT)
              IN (${placeholders.join(", ")})
        `;
      }
    }

    // -----------------------------------------------------
    // OPTIONAL BRANCH FILTER
    // -----------------------------------------------------

    if (hasFilterValue(filters.branch_id)) {
      const branchIds = parseIds(filters.branch_id);

      if (branchIds.length === 0) {
        return {
          summary: { total_employee: 0 },
          employees: [],
        };
      }

      const placeholders = branchIds.map(
        (_, index) => `@branch${index}`
      );

      branchIds.forEach((id, index) => {
        request.input(`branch${index}`, sql.Int, id);
      });

      whereCondition += `
        AND TRY_CAST(e.branch_id AS BIGINT)
            IN (${placeholders.join(", ")})
      `;
    }

    console.log("DOCUMENT WHERE:", whereCondition);

    // =====================================================
    // DOCUMENT SELECT FIELDS
    // =====================================================

    const documentFields = documents
      .map(({ name, condition }) => {
        return `
          COALESCE(
            MAX(
              CASE
                WHEN ${condition}
                THEN NULLIF(
                  LTRIM(RTRIM(d.doc_status)),
                  ''
                )
              END
            ),
            'PENDING'
          ) AS [${name}],

          MAX(
            CASE
              WHEN ${condition}
              THEN 1
              ELSE 0
            END
          ) AS [${name}_uploaded]
        `;
      })
      .join(",\n");

    // =====================================================
    // EMPLOYEE QUERY
    // =====================================================

    const employeeQuery = `
      SELECT
        e.id AS employee_id,
        e.employee_code,
        e.emp_full_name,
        e.company_id,
        e.branch_id,
        e.client_id,
        e.site_id,
        ${documentFields}
      FROM employee e
      LEFT JOIN emp_docs d
        ON d.emp_id = e.id
      ${whereCondition}
      GROUP BY
        e.id,
        e.employee_code,
        e.emp_full_name,
        e.company_id,
        e.branch_id,
        e.client_id,
        e.site_id
      ORDER BY e.emp_full_name ASC
    `;

    const employeeResult = await request.query(employeeQuery);

    const employees = employeeResult.recordset || [];

    // =====================================================
    // BUILD SUMMARY FROM THE SAME EMPLOYEE RESULT
    // This guarantees the summary uses the same access scope.
    // =====================================================

    const summary = {
      total_employee: employees.length,
    };

    for (const document of documents) {
      const { name, summaryKey } = document;

      let uploaded = 0;
      let verified = 0;
      let pending = 0;
      let notVerified = 0;

      for (const employee of employees) {
        const wasUploaded =
          Number(employee[`${name}_uploaded`]) === 1;

        const status = normalizeStatus(employee[name]);

        if (wasUploaded) {
          uploaded += 1;
        }

        if (status === "VERIFIED") {
          verified += 1;
        } else if (status === "NOT VERIFIED") {
          notVerified += 1;
        } else {
          // Missing documents and explicit pending statuses
          // are counted as pending.
          pending += 1;
        }
      }

      summary[`${summaryKey}_uploaded`] = uploaded;
      summary[`${summaryKey}_verified`] = verified;
      summary[`${summaryKey}_pending`] = pending;
      summary[`${summaryKey}_not_verified`] = notVerified;
    }

    console.log("DOCUMENT SUMMARY:", summary);
    console.log("DOCUMENT EMPLOYEE COUNT:", employees.length);

    // Remove helper flags from employee rows if not needed
    // by the frontend. Keep document statuses unchanged.
    const cleanEmployees = employees.map((employee) => {
      const result = { ...employee };

      for (const { name } of documents) {
        delete result[`${name}_uploaded`];
      }

      return result;
    });

    return {
      summary,
      employees: cleanEmployees,
    };
  } catch (error) {
    console.error(
      "getEmployeeDocumentDashboard ERROR:",
      error
    );

    throw error;
  }
};

const getEmployeeDocumentSummary = async (
  userId,
  client_id = "",
  site_id = "",
  company_id = "",
  branch_id = ""
) => {
  try {
    const pool = await poolPromise;

    // =====================================================
    // 1. VALIDATE USER ID
    // =====================================================

    const loggedInUserId = Number(userId);

    if (
      !Number.isSafeInteger(loggedInUserId) ||
      loggedInUserId <= 0
    ) {
      throw new Error("Invalid logged-in user ID");
    }

    // =====================================================
    // 2. GET LOGGED-IN USER
    // =====================================================

    const userResult = await pool
      .request()
      .input("userId", sql.Int, loggedInUserId)
      .query(`
        SELECT
          id,
          role,
          company_id,
          branch_id,
          client_id,
          site_id,
          superadmin_status,
          active
        FROM users
        WHERE id = @userId
          AND active = '0'
      `);

    if (!userResult.recordset?.length) {
      const error = new Error(
        "User not found or inactive"
      );
      error.statusCode = 401;
      throw error;
    }

    const user = userResult.recordset[0];

    const role = String(user.role || "")
      .trim()
      .toLowerCase();

    const isSuperAdmin =
      role === "super admin" ||
      role === "superadmin" ||
      Number(user.superadmin_status) === 1;

    const isAdmin = role === "admin";

    console.log("DOCUMENT SUMMARY USER:", {
      userId: user.id,
      role: user.role,
      company_id: user.company_id,
      branch_id: user.branch_id,
      client_id: user.client_id,
      site_id: user.site_id,
      isSuperAdmin,
    });

    // =====================================================
    // 3. HELPERS
    // =====================================================

    const parseIds = (value) => {
      if (value === null || value === undefined) {
        return [];
      }

      return [
        ...new Set(
          String(value)
            .split(",")
            .map((v) => Number(v.trim()))
            .filter(
              (v) =>
                Number.isSafeInteger(v) && v > 0
            )
        ),
      ];
    };

    const hasFilterValue = (value) => {
      if (value === null || value === undefined) {
        return false;
      }

      const normalized = String(value).trim();

      return (
        normalized !== "" &&
        normalized !== "undefined" &&
        normalized !== "null"
      );
    };

    const request = pool.request();

    let whereCondition = `
      WHERE e.active = 0
    `;

    // =====================================================
    // 4. ACCESS FILTERS
    // =====================================================

    // SUPER ADMIN: all employees, optional filters
    if (isSuperAdmin) {
      console.log("DOCUMENT ACCESS: SUPER ADMIN");

      if (hasFilterValue(company_id)) {
        const ids = parseIds(company_id);

        if (!ids.length) {
          return getEmptyDocumentSummary();
        }

        const params = ids.map(
          (_, i) => `@company${i}`
        );

        ids.forEach((id, i) => {
          request.input(`company${i}`, sql.BigInt, id);
        });

        whereCondition += `
          AND TRY_CAST(e.company_id AS BIGINT)
              IN (${params.join(",")})
        `;
      }
    }

    // ADMIN: assigned company only
    else if (isAdmin) {
      console.log("DOCUMENT ACCESS: ADMIN");

      let companyIds = parseIds(user.company_id);

      if (hasFilterValue(company_id)) {
        const requestedIds = parseIds(company_id);

        companyIds = companyIds.filter(
          (id) => requestedIds.includes(id)
        );
      }

      if (!companyIds.length) {
        return getEmptyDocumentSummary();
      }

      const params = companyIds.map(
        (_, i) => `@adminCompany${i}`
      );

      companyIds.forEach((id, i) => {
        request.input(
          `adminCompany${i}`,
          sql.BigInt,
          id
        );
      });

      whereCondition += `
        AND TRY_CAST(e.company_id AS BIGINT)
            IN (${params.join(",")})
      `;
    }

    // NORMAL USER: assigned client or site only
    else {
      console.log("DOCUMENT ACCESS: NORMAL USER");

      const clientIds = parseIds(user.client_id);
      const siteIds = parseIds(user.site_id);

      const accessConditions = [];

      if (clientIds.length) {
        const params = clientIds.map(
          (_, i) => `@accessClient${i}`
        );

        clientIds.forEach((id, i) => {
          request.input(
            `accessClient${i}`,
            sql.BigInt,
            id
          );
        });

        accessConditions.push(`
          TRY_CAST(e.client_id AS BIGINT)
          IN (${params.join(",")})
        `);
      }

      if (siteIds.length) {
        const params = siteIds.map(
          (_, i) => `@accessSite${i}`
        );

        siteIds.forEach((id, i) => {
          request.input(
            `accessSite${i}`,
            sql.BigInt,
            id
          );
        });

        accessConditions.push(`
          TRY_CAST(e.site_id AS BIGINT)
          IN (${params.join(",")})
        `);
      }

      if (!accessConditions.length) {
        return getEmptyDocumentSummary();
      }

      whereCondition += `
        AND (${accessConditions.join(" OR ")})
      `;
    }

    // =====================================================
    // 5. OPTIONAL FILTERS
    // =====================================================

    const addSingleIdFilter = (
      value,
      column,
      parameter
    ) => {
      if (!hasFilterValue(value)) {
        return true;
      }

      const ids = parseIds(value);

      if (ids.length !== 1) {
        return false;
      }

      whereCondition += `
        AND TRY_CAST(e.${column} AS BIGINT) = @${parameter}
      `;

      request.input(parameter, sql.BigInt, ids[0]);

      return true;
    };

    // Company filter for normal users can only narrow access.
    if (!isSuperAdmin && !isAdmin) {
      if (hasFilterValue(company_id)) {
        const ids = parseIds(company_id);

        if (!ids.length) {
          return getEmptyDocumentSummary();
        }

        const params = ids.map(
          (_, i) => `@normalCompany${i}`
        );

        ids.forEach((id, i) => {
          request.input(
            `normalCompany${i}`,
            sql.BigInt,
            id
          );
        });

        whereCondition += `
          AND TRY_CAST(e.company_id AS BIGINT)
              IN (${params.join(",")})
        `;
      }
    }

    // Branch filter applies to every role.
    if (hasFilterValue(branch_id)) {
      const ids = parseIds(branch_id);

      if (!ids.length) {
        return getEmptyDocumentSummary();
      }

      const params = ids.map(
        (_, i) => `@branch${i}`
      );

      ids.forEach((id, i) => {
        request.input(`branch${i}`, sql.BigInt, id);
      });

      whereCondition += `
        AND TRY_CAST(e.branch_id AS BIGINT)
            IN (${params.join(",")})
      `;
    }

    // Optional client and site filters must only narrow access.
    if (
      !addSingleIdFilter(
        client_id,
        "client_id",
        "filterClientId"
      )
    ) {
      return getEmptyDocumentSummary();
    }

    if (
      !addSingleIdFilter(
        site_id,
        "site_id",
        "filterSiteId"
      )
    ) {
      return getEmptyDocumentSummary();
    }

    console.log("DOCUMENT SUMMARY WHERE:", whereCondition);

    // =====================================================
    // 6. DOCUMENT DEFINITIONS
    // =====================================================

    const documents = [
      {
        key: "aadhar",
        condition: `
          (
            UPPER(ISNULL(d.doc_type, '')) LIKE '%AADHAR%'
            OR UPPER(ISNULL(d.doc_type, '')) LIKE '%AADHAAR%'
          )
        `,
      },
      {
        key: "pan",
        condition: `
          UPPER(ISNULL(d.doc_type, '')) LIKE '%PAN%'
        `,
      },
      {
        key: "bank",
        condition: `
          UPPER(ISNULL(d.doc_type, '')) LIKE '%BANK%'
        `,
      },
      {
        key: "passport",
        condition: `
          UPPER(ISNULL(d.doc_type, '')) LIKE '%PASSPORT%'
        `,
      },
      {
        key: "pf",
        condition: `
          UPPER(ISNULL(d.doc_type, '')) LIKE '%PF%'
        `,
      },
      {
        key: "uan",
        condition: `
          UPPER(ISNULL(d.doc_type, '')) LIKE '%UAN%'
        `,
      },
      {
        key: "esic",
        condition: `
          (
            UPPER(ISNULL(d.doc_type, '')) LIKE '%ESIC%'
            OR UPPER(ISNULL(d.doc_type, '')) LIKE '%ESI%'
          )
        `,
      },
    ];

    // =====================================================
    // 7. BUILD DOCUMENT COUNTS
    // =====================================================

    const documentSelect = documents
      .map(({ key, condition }) => `
        MAX(
          CASE
            WHEN ${condition}
            THEN 1 ELSE 0
          END
        ) AS ${key}_uploaded,

        MAX(
          CASE
            WHEN ${condition}
             AND UPPER(LTRIM(RTRIM(ISNULL(d.doc_status, ''))))
                 IN ('VERIFIED', 'APPROVED')
            THEN 1 ELSE 0
          END
        ) AS ${key}_verified,

        MAX(
          CASE
            WHEN ${condition}
             AND UPPER(LTRIM(RTRIM(ISNULL(d.doc_status, ''))))
                 IN ('NOT VERIFIED', 'REJECTED')
            THEN 1 ELSE 0
          END
        ) AS ${key}_not_verified,

        MAX(
          CASE
            WHEN ${condition}
             AND UPPER(LTRIM(RTRIM(ISNULL(d.doc_status, ''))))
                 = 'PENDING'
            THEN 1 ELSE 0
          END
        ) AS ${key}_pending
      `)
      .join(",\n");

    // =====================================================
    // 8. SUMMARY QUERY
    // =====================================================

    const summarySelect = documents
      .map(({ key }) => `
        ISNULL(SUM(${key}_uploaded), 0)
          AS ${key}_uploaded,

        ISNULL(SUM(${key}_verified), 0)
          AS ${key}_verified,

        ISNULL(SUM(${key}_pending), 0)
          +
        SUM(CASE
          WHEN ${key}_uploaded = 0 THEN 1
          ELSE 0
        END)
          AS ${key}_pending,

        ISNULL(SUM(
          CASE
            WHEN ${key}_verified = 0
             AND ${key}_not_verified = 1
            THEN 1 ELSE 0
          END
        ), 0)
          AS ${key}_not_verified
      `)
      .join(",\n");

    const query = `
      WITH DocSummary AS (
        SELECT
          e.id,
          ${documentSelect}
        FROM employee e
        LEFT JOIN emp_docs d
          ON TRY_CAST(d.emp_id AS BIGINT)
           = TRY_CAST(e.id AS BIGINT)
        ${whereCondition}
        GROUP BY e.id
      )
      SELECT
        COUNT(*) AS total_employee,
        ${summarySelect}
      FROM DocSummary;
    `;

    // =====================================================
    // 9. EXECUTE
    // =====================================================

    const result = await request.query(query);

    const summary =
      result.recordset?.[0] ||
      getEmptyDocumentSummary();

    console.log("FINAL DOCUMENT SUMMARY:", summary);

    return summary;
  } catch (error) {
    console.error(
      "getEmployeeDocumentSummary ERROR:",
      error
    );

    throw error;
  }
};

// =====================================================
// EMPTY SUMMARY HELPER
// =====================================================

const getEmptyDocumentSummary = () => {
  const summary = {
    total_employee: 0,
  };

  for (const key of [
    "aadhar",
    "pan",
    "bank",
    "passport",
    "pf",
    "uan",
    "esic",
  ]) {
    summary[`${key}_uploaded`] = 0;
    summary[`${key}_verified`] = 0;
    summary[`${key}_pending`] = 0;
    summary[`${key}_not_verified`] = 0;
  }

  return summary;
};
const getClientSiteCount = async (req) => {
  try {
    const pool = await poolPromise;

    // =====================================================
    // GET LOGGED-IN USER ID
    // =====================================================

    const userId = Number(req.user?.id);

    if (!userId) {
      throw new Error(
        "Logged-in user ID not found"
      );
    }

    console.log("====================================");
    console.log("GET CLIENT SITE COUNT");
    console.log("====================================");

    console.log(
      "Logged-in User ID:",
      userId
    );

    // =====================================================
    // GET USER DETAILS
    // =====================================================

    const userResult = await pool
      .request()
      .input(
        "userId",
        sql.Int,
        userId
      )
      .query(`
        SELECT
          id,
          role,
          company_id,
          branch_id,
          site_id,
          client_id,
          superadmin_status
        FROM users
        WHERE
          id = @userId
          AND active = '0'
      `);

    // =====================================================
    // USER NOT FOUND
    // =====================================================

    if (
      !userResult.recordset ||
      userResult.recordset.length === 0
    ) {
      throw new Error(
        "User not found or inactive"
      );
    }

    const user =
      userResult.recordset[0];

    // =====================================================
    // NORMALIZE ROLE
    // =====================================================

    const role = String(
      user.role || ""
    )
      .trim()
      .toLowerCase();

    // =====================================================
    // SUPER ADMIN CHECK
    //
    // SUPER ADMIN:
    // role = SUPER ADMIN
    //
    // OR
    //
    // superadmin_status = 1
    // =====================================================

    const isSuperAdmin =
      role === "super admin" ||
      role === "superadmin" ||
      Number(user.superadmin_status) === 1;

    // =====================================================
    // DEBUG
    // =====================================================

    console.log(
      "USER ACCESS:",
      {
        userId: user.id,
        role: user.role,
        company_id: user.company_id,
        branch_id: user.branch_id,
        site_id: user.site_id,
        client_id: user.client_id,
        superadmin_status:
          user.superadmin_status,
        isSuperAdmin,
      }
    );

    // =====================================================
    // 1. SUPER ADMIN
    //
    // SHOW ALL CLIENTS + ALL SITES
    // =====================================================

    if (isSuperAdmin) {

      console.log(
        "ACCESS TYPE: SUPER ADMIN"
      );

      const result =
        await pool
          .request()
          .query(`
            SELECT

              COUNT(
                DISTINCT c.id
              ) AS totalClients,

              (
                SELECT
                  COUNT(*)
                FROM client_rates cr
                WHERE
                  cr.active = 0
              ) AS totalSites

            FROM new_client c

            WHERE
              c.active = 0
          `);

      const totalClients =
        Number(
          result.recordset[0]
            ?.totalClients || 0
        );

      const totalSites =
        Number(
          result.recordset[0]
            ?.totalSites || 0
        );

      console.log(
        "SUPER ADMIN RESULT:",
        {
          totalClients,
          totalSites,
        }
      );

      return {
        totalClients,
        totalSites,
      };
    }

    // =====================================================
    // 2. ADMIN
    //
    // users.company_id
    //        =
    // new_client.billing_company_id
    //
    // SHOW ONLY OWN COMPANY
    // =====================================================

    if (role === "admin") {

      console.log(
        "ACCESS TYPE: ADMIN"
      );

      // ---------------------------------------------------
      // ADMIN COMPANY ID
      // ---------------------------------------------------

      const companyId =
        Number(user.company_id);

      console.log(
        "ADMIN COMPANY ID:",
        companyId
      );

      // ---------------------------------------------------
      // COMPANY ID NOT FOUND
      // ---------------------------------------------------

      if (!companyId) {
        console.log(
          "ADMIN COMPANY ID NOT FOUND"
        );

        return {
          totalClients: 0,
          totalSites: 0,
        };
      }

      // ---------------------------------------------------
      // ADMIN QUERY
      // ---------------------------------------------------

      const result =
        await pool
          .request()
          .input(
            "companyId",
            sql.Int,
            companyId
          )
          .query(`
            SELECT

              COUNT(
                DISTINCT c.id
              ) AS totalClients,

              (
                SELECT
                  COUNT(*)
                FROM client_rates cr
                INNER JOIN new_client nc
                  ON cr.client_id = nc.id

                WHERE
                  cr.active = 0
                  AND nc.active = 0
                  AND nc.billing_company_id = @companyId
              ) AS totalSites

            FROM new_client c

            WHERE
              c.active = 0
              AND c.billing_company_id = @companyId
          `);

      const totalClients =
        Number(
          result.recordset[0]
            ?.totalClients || 0
        );

      const totalSites =
        Number(
          result.recordset[0]
            ?.totalSites || 0
        );

      console.log(
        "ADMIN RESULT:",
        {
          companyId,
          totalClients,
          totalSites,
        }
      );

      return {
        totalClients,
        totalSites,
      };
    }

    // =====================================================
    // 3. NORMAL USER
    //
    // client_id / site_id BASED ACCESS
    // =====================================================

    console.log(
      "ACCESS TYPE: NORMAL USER"
    );

    // =====================================================
    // CLIENT IDS
    // =====================================================

    const clientIds =
      String(
        user.client_id || ""
      )
        .split(",")
        .map(
          (id) =>
            Number(id.trim())
        )
        .filter(
          (id) =>
            Number.isInteger(id) &&
            id > 0
        );

    // =====================================================
    // SITE IDS
    // =====================================================

    const siteIds =
      String(
        user.site_id || ""
      )
        .split(",")
        .map(
          (id) =>
            Number(id.trim())
        )
        .filter(
          (id) =>
            Number.isInteger(id) &&
            id > 0
        );

    console.log(
      "NORMAL USER CLIENT IDS:",
      clientIds
    );

    console.log(
      "NORMAL USER SITE IDS:",
      siteIds
    );

    // =====================================================
    // NO ACCESS
    // =====================================================

    if (
      clientIds.length === 0 &&
      siteIds.length === 0
    ) {
      return {
        totalClients: 0,
        totalSites: 0,
      };
    }

    // =====================================================
    // BUILD REQUEST
    // =====================================================

    const request =
      pool.request();

    const clientConditions = [];
    const siteConditions = [];

    // =====================================================
    // CLIENT PARAMETERS
    // =====================================================

    if (
      clientIds.length > 0
    ) {

      const clientParams =
        clientIds
          .map(
            (_, index) =>
              `@client${index}`
          )
          .join(",");

      clientIds.forEach(
        (id, index) => {
          request.input(
            `client${index}`,
            sql.Int,
            id
          );
        }
      );

      clientConditions.push(
        `c.id IN (${clientParams})`
      );
    }

    // =====================================================
    // SITE PARAMETERS
    // =====================================================

    if (
      siteIds.length > 0
    ) {

      const siteParams =
        siteIds
          .map(
            (_, index) =>
              `@site${index}`
          )
          .join(",");

      siteIds.forEach(
        (id, index) => {
          request.input(
            `site${index}`,
            sql.Int,
            id
          );
        }
      );

      siteConditions.push(
        `cr.id IN (${siteParams})`
      );
    }

    // =====================================================
    // TOTAL CLIENTS
    //
    // CLIENT ACCESS DIRECTLY OR THROUGH SITE
    // =====================================================

    let totalClients = 0;

    if (
      clientIds.length > 0 &&
      siteIds.length > 0
    ) {

      const clientResult =
        await request.query(`
          SELECT
            COUNT(
              DISTINCT c.id
            ) AS totalClients

          FROM new_client c

          LEFT JOIN client_rates cr
            ON cr.client_id = c.id
            AND cr.active = 0

          WHERE
            c.active = 0

            AND (
              ${clientConditions[0]}
              OR
              ${siteConditions[0]}
            )
        `);

      totalClients =
        Number(
          clientResult.recordset[0]
            ?.totalClients || 0
        );

    } else if (
      clientIds.length > 0
    ) {

      const clientResult =
        await request.query(`
          SELECT
            COUNT(
              DISTINCT c.id
            ) AS totalClients

          FROM new_client c

          WHERE
            c.active = 0

            AND
            ${clientConditions[0]}
        `);

      totalClients =
        Number(
          clientResult.recordset[0]
            ?.totalClients || 0
        );

    } else {

      const clientResult =
        await request.query(`
          SELECT
            COUNT(
              DISTINCT c.id
            ) AS totalClients

          FROM new_client c

          INNER JOIN client_rates cr
            ON cr.client_id = c.id

          WHERE
            c.active = 0
            AND cr.active = 0

            AND
            ${siteConditions[0]}
        `);

      totalClients =
        Number(
          clientResult.recordset[0]
            ?.totalClients || 0
        );
    }

    // =====================================================
    // TOTAL SITES
    // =====================================================

    let totalSites = 0;

    // -----------------------------------------------------
    // BOTH CLIENT + SITE ACCESS
    // -----------------------------------------------------

    if (
      clientIds.length > 0 &&
      siteIds.length > 0
    ) {

      const siteResult =
        await request.query(`
          SELECT
            COUNT(
              DISTINCT cr.id
            ) AS totalSites

          FROM client_rates cr

          INNER JOIN new_client c
            ON cr.client_id = c.id

          WHERE
            cr.active = 0
            AND c.active = 0

            AND (
              ${clientConditions[0]}
              OR
              ${siteConditions[0]}
            )
        `);

      totalSites =
        Number(
          siteResult.recordset[0]
            ?.totalSites || 0
        );

    }

    // -----------------------------------------------------
    // ONLY CLIENT ACCESS
    // -----------------------------------------------------

    else if (
      clientIds.length > 0
    ) {

      const siteResult =
        await request.query(`
          SELECT
            COUNT(
              DISTINCT cr.id
            ) AS totalSites

          FROM client_rates cr

          INNER JOIN new_client c
            ON cr.client_id = c.id

          WHERE
            cr.active = 0
            AND c.active = 0

            AND
            ${clientConditions[0]}
        `);

      totalSites =
        Number(
          siteResult.recordset[0]
            ?.totalSites || 0
        );
    }

    // -----------------------------------------------------
    // ONLY SITE ACCESS
    // -----------------------------------------------------

    else {

      const siteResult =
        await request.query(`
          SELECT
            COUNT(
              DISTINCT cr.id
            ) AS totalSites

          FROM client_rates cr

          INNER JOIN new_client c
            ON cr.client_id = c.id

          WHERE
            cr.active = 0
            AND c.active = 0

            AND
            ${siteConditions[0]}
        `);

      totalSites =
        Number(
          siteResult.recordset[0]
            ?.totalSites || 0
        );
    }

    // =====================================================
    // FINAL RESULT
    // =====================================================

    console.log(
      "NORMAL USER RESULT:",
      {
        totalClients,
        totalSites,
      }
    );

    return {
      totalClients,
      totalSites,
    };

  } catch (error) {

    console.error(
      "GET CLIENT SITE COUNT ERROR:",
      error
    );

    throw error;
  }
};

 const getUserAccess= async (userId) => {
    const pool = await poolPromise;

    const result = await pool.request().input("userId", sql.Int, userId).query(`
        SELECT
            id,
            role,
            site_id,
            client_id
        FROM users
        WHERE
            id=@userId
            AND active='0'
    `);

    return result.recordset[0];
  };



const getEmployeeStageDashboard = async (
  userId,
  client_id = "",
  site_id = "",
  company_id = "",
  branch_id = ""
) => {
  try {
    const pool = await poolPromise;

    const zeroSummaryObject = {
      pending_count: 0,
      offer_letter_issued_count: 0,
      verified_count: 0,
      total_employees: 0,
    };

    // Validate logged-in user
    const loggedInUserId = Number(userId);

    if (
      !Number.isInteger(loggedInUserId) ||
      loggedInUserId <= 0
    ) {
      throw new Error("Invalid logged-in user ID");
    }

    // Get user access information
    const userRequest = pool.request();

    userRequest.input("userId", sql.Int, loggedInUserId);

    const userResult = await userRequest.query(`
      SELECT
        id,
        role,
        company_id,
        branch_id,
        client_id,
        site_id,
        superadmin_status,
        active
      FROM users
      WHERE id = @userId
        AND active = '0'
    `);

    if (!userResult.recordset?.length) {
      throw new Error(
        `User not found or inactive: ${loggedInUserId}`
      );
    }

    const user = userResult.recordset[0];

    const role = String(user.role || "")
      .trim()
      .toLowerCase();

    const isSuperAdmin =
      role === "super admin" ||
      role === "superadmin" ||
      Number(user.superadmin_status) === 1;

    console.log("STAGE DASHBOARD USER:", {
      userId: loggedInUserId,
      role,
      isSuperAdmin,
      userCompanyIds: user.company_id,
      userBranchIds: user.branch_id,
      userClientIds: user.client_id,
      userSiteIds: user.site_id,
    });

    console.log("RECEIVED FILTERS:", {
      client_id,
      site_id,
      company_id,
      branch_id,
    });

    const request = pool.request();

    // Base filter
    let whereCondition = `WHERE e.active = 0`;

    const isValidId = (value) => {
      if (
        value === undefined ||
        value === null ||
        String(value).trim() === ""
      ) {
        return false;
      }

      const n = Number(value);

      return Number.isInteger(n) && n > 0;
    };

    const parseIds = (value) =>
      String(value ?? "")
        .split(",")
        .map((v) => Number(v.trim()))
        .filter(
          (v) => Number.isInteger(v) && v > 0
        );

    // Add selected client filter
    if (isValidId(client_id)) {
      request.input(
        "filterClientId",
        sql.BigInt,
        Number(client_id)
      );

      whereCondition += `
        AND TRY_CAST(e.client_id AS BIGINT)
            = @filterClientId
      `;
    }

    // Add selected site filter
    if (isValidId(site_id)) {
      request.input(
        "filterSiteId",
        sql.BigInt,
        Number(site_id)
      );

      whereCondition += `
        AND TRY_CAST(e.site_id AS BIGINT)
            = @filterSiteId
      `;
    }

    // Add selected company filter
    if (isValidId(company_id)) {
      request.input(
        "filterCompanyId",
        sql.BigInt,
        Number(company_id)
      );

      whereCondition += `
        AND TRY_CAST(e.company_id AS BIGINT)
            = @filterCompanyId
      `;
    }

    // Add selected branch filter
    if (isValidId(branch_id)) {
      request.input(
        "filterBranchId",
        sql.BigInt,
        Number(branch_id)
      );

      whereCondition += `
        AND TRY_CAST(e.branch_id AS BIGINT)
            = @filterBranchId
      `;
    }

    // Access control
    if (isSuperAdmin) {
      // Super admin can view records matching selected filters.
      console.log("ACCESS: SUPER ADMIN");
    } else if (role === "admin") {
      // Admin is restricted to assigned companies.
      const adminCompanyIds = parseIds(user.company_id);

      if (!adminCompanyIds.length) {
        console.log("ADMIN HAS NO COMPANY ACCESS");
        return zeroSummaryObject;
      }

      const companyParams = adminCompanyIds
        .map((_, i) => `@adminCompany${i}`)
        .join(", ");

      adminCompanyIds.forEach((id, i) => {
        request.input(`adminCompany${i}`, sql.BigInt, id);
      });

      whereCondition += `
        AND TRY_CAST(e.company_id AS BIGINT)
            IN (${companyParams})
      `;

      console.log("ACCESS: ADMIN", adminCompanyIds);
    } else {
      // Normal users are restricted to their assigned
      // client/site access.
      const userClientIds = parseIds(user.client_id);
      const userSiteIds = parseIds(user.site_id);

      if (
        !userClientIds.length &&
        !userSiteIds.length
      ) {
        console.log("USER HAS NO CLIENT/SITE ACCESS");
        return zeroSummaryObject;
      }

      const accessConditions = [];

      if (userClientIds.length) {
        const params = userClientIds
          .map((_, i) => `@userClient${i}`)
          .join(", ");

        userClientIds.forEach((id, i) => {
          request.input(`userClient${i}`, sql.BigInt, id);
        });

        accessConditions.push(`
          TRY_CAST(e.client_id AS BIGINT)
          IN (${params})
        `);
      }

      if (userSiteIds.length) {
        const params = userSiteIds
          .map((_, i) => `@userSite${i}`)
          .join(", ");

        userSiteIds.forEach((id, i) => {
          request.input(`userSite${i}`, sql.BigInt, id);
        });

        accessConditions.push(`
          TRY_CAST(e.site_id AS BIGINT)
          IN (${params})
        `);
      }

      whereCondition += `
        AND (${accessConditions.join(" OR ")})
      `;

      console.log("ACCESS: NORMAL USER", {
        userClientIds,
        userSiteIds,
      });
    }

    // Log final query filters
    console.log("FINAL WHERE CONDITION:", whereCondition);

    // Count employees and stage-wise totals
    const result = await request.query(`
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN UPPER(
                LTRIM(RTRIM(ISNULL(e.emp_stages, '')))
              ) = 'PENDING'
              THEN 1 ELSE 0
            END
          ),
          0
        ) AS pending_count,

        COALESCE(
          SUM(
            CASE
              WHEN UPPER(
                LTRIM(RTRIM(ISNULL(e.emp_stages, '')))
              ) = 'OFFER LETTER ISSUED'
              THEN 1 ELSE 0
            END
          ),
          0
        ) AS offer_letter_issued_count,

        COALESCE(
          SUM(
            CASE
              WHEN UPPER(
                LTRIM(RTRIM(ISNULL(e.emp_stages, '')))
              ) = 'VERIFIED'
              THEN 1 ELSE 0
            END
          ),
          0
        ) AS verified_count,

        COUNT_BIG(*) AS total_employees

      FROM employee e
      ${whereCondition};
    `);

    const row = result.recordset?.[0] || {};

    const summary = {
      pending_count: Number(row.pending_count || 0),
      offer_letter_issued_count: Number(
        row.offer_letter_issued_count || 0
      ),
      verified_count: Number(row.verified_count || 0),
      total_employees: Number(row.total_employees || 0),
    };

    console.log("FINAL STAGE SUMMARY:", summary);

    return summary;
  } catch (error) {
    console.error(
      "getEmployeeStageDashboard Error:",
      error
    );

    throw error;
  }
};

// const getSiteWiseAttendance = async (
//     date,
//     userId,
//     filterType="today",
//     fromDate=null,
//     toDate=null,
//     company_id="",
//     branch_id=""
// ) => {

//   const pool = await poolPromise;

//   let siteIds = "";
//   let clientIds = "";
//   const excludedStatuses = [
//     "pending",
//     "verified",
//     "rejected",
//     "on hold",
//     "offer letter not issued",
//     "offer letter on hold",
//     "readytojoin",
//   ];

//   //-------------------------------------------------------
//   // Date Filter
//   //-------------------------------------------------------

//   let startDate;
//   let endDate;


//   const today = new Date(date || new Date());

//   today.setHours(0,0,0,0);


//   switch(filterType){


//     case "7days":

//       startDate = new Date(today);
//       startDate.setDate(today.getDate() - 6);

//       endDate = new Date(today);

//     break;



//     case "1month":

//       startDate = new Date(today);
//       startDate.setMonth(today.getMonth() - 1);

//       endDate = new Date(today);

//     break;



//     case "90days":

//       startDate = new Date(today);
//       startDate.setDate(today.getDate() - 89);

//       endDate = new Date(today);

//     break;



//     case "custom":


//       if(!fromDate || !toDate){
//           throw new Error("Custom date required");
//       }


//       startDate = new Date(fromDate);

//       endDate = new Date(toDate);


//       if(startDate > endDate){
//           throw new Error(
//             "From date cannot be greater than To date"
//           );
//       }


//     break;



//     default:

//       startDate = new Date(today);

//       endDate = new Date(today);

//   }




//   //-------------------------------------------------------
//   // User
//   //-------------------------------------------------------

//   const userResult = await pool
//   .request()
//   .input(
//       "userId",
//       sql.Int,
//       userId
//   )
//   .query(`

//       SELECT 
//           role,
//           site_id,
//           client_id

//       FROM users

//       WHERE id=@userId
//       AND active='0'

//   `);



//   if(userResult.recordset.length===0){

//       throw new Error("User not found");

//   }



//   const user = userResult.recordset[0];




//   //-------------------------------------------------------
//   // User Permission
//   //-------------------------------------------------------


// if(
// (user.role || "")
// .toLowerCase()
// .trim()==="admin"
// ){

// const siteResult = await pool
// .request()
// .input("company_id", sql.VarChar, company_id || "")
// .input("branch_id", sql.VarChar, branch_id || "")
// .query(`
// SELECT id
// FROM client_rates
// WHERE active='0'

// AND (
//     @company_id = ''
//     OR TRY_CAST(client_id AS BIGINT) =
//        TRY_CAST(@company_id AS BIGINT)
// )

// AND (
//     @branch_id = ''
//     OR id =
//        TRY_CAST(@branch_id AS BIGINT)
// )
// `);


//     siteIds = siteResult.recordset
//     .map(x=>x.id)
//     .join(",");



//     const clientResult = await pool
//     .request()
//     .query(`
//         SELECT id
//         FROM new_client
//         WHERE active='0'
//     `);


//     clientIds = clientResult.recordset
//     .map(x=>x.id)
//     .join(",");

// }



//   const safeSiteIds = siteIds
//   .split(",")
//   .map(id=>id.trim())
//   .filter(id=>id!=="")
//   .map(Number)
//   .join(",") || "0";



//   const safeClientIds = clientIds
//   .split(",")
//   .map(id=>id.trim())
//   .filter(id=>id!=="")
//   .map(Number)
//   .join(",") || "0";



// console.log(
//     "SITE COUNT:",
//     safeSiteIds.split(",").length
// );




//   //-------------------------------------------------------
//   // Attendance Summary
//   //-------------------------------------------------------


//   const attendanceRequest = pool.request();


//   attendanceRequest.input(
//       "startDate",
//       sql.Date,
//       startDate
//   );


//   attendanceRequest.input(
//       "endDate",
//       sql.Date,
//       endDate
//   );


//   attendanceRequest.input(
//       "branch_id",
//       sql.VarChar,
//       branch_id || ""
//   );

// console.time("Attendance Query");

//   const attendanceResult =
//   await attendanceRequest.query(`


//     SELECT

//         site_id,


//       SUM(
//     CASE
//         WHEN emp_status = 'P'
//         THEN 1
//         ELSE 0
//     END
// ) total_P,



//         SUM(
//             CASE
//                 WHEN emp_status='W'
//                 THEN 1
//                 ELSE 0
//             END
//         ) total_WO,



//         SUM(
//             CASE
//                 WHEN emp_status='A'
//                 THEN 1
//                 ELSE 0
//             END
//         ) total_A


//     FROM emp_attendance


//  WHERE

// check_in_date >= @startDate
// AND check_in_date < DATEADD(day,1,@endDate)

// AND site_id IN (${safeSiteIds})
// AND active = 0

// AND
// (
//     @branch_id=''
//     OR site_id = TRY_CAST(@branch_id AS BIGINT)
// )

// GROUP BY site_id


//   `);


// console.timeEnd("Attendance Query");

//   const attendanceData={};



//   attendanceResult.recordset.forEach(row=>{

//       attendanceData[row.site_id]=row;

//   });





//   //-------------------------------------------------------
//   // Site Details
//   //-------------------------------------------------------


//   const siteRequest = pool.request();


//   siteRequest.input(
//       "company_id",
//       sql.VarChar,
//       company_id || ""
//   );


//   siteRequest.input(
//       "branch_id",
//       sql.VarChar,
//       branch_id || ""
//   );

// console.time("Site Query");


// const siteResult =
// await siteRequest.query(`

//     SELECT

//         cr.id,

//         cr.site_name,

//         cr.cc_state,

//         cr.client_code,

//         cr.cc_contact_person,

//         cr.cc_total_manpower,

//         nc.company_name


//     FROM client_rates cr


//     INNER JOIN new_client nc

//     ON TRY_CAST(cr.client_id AS BIGINT)=nc.id



//     WHERE


//         cr.id IN (${safeSiteIds})



//         AND
//         (
//             @company_id=''
//             OR TRY_CAST(cr.client_id AS BIGINT)
//             =
//             TRY_CAST(@company_id AS BIGINT)
//         )



//         AND
//         (
//             @branch_id=''
//             OR cr.id =
//             TRY_CAST(@branch_id AS BIGINT)
//         )


// `);

// console.timeEnd("Site Query");
// //-------------------------------------------------------
// // Unmarked Employee Count (All Sites)
// //-------------------------------------------------------


// // const unmarkedRequest = pool.request();

// // unmarkedRequest.input(
// //     "startDate",
// //     sql.Date,
// //     startDate
// // );


// // unmarkedRequest.input(
// //     "endDate",
// //     sql.Date,
// //     endDate
// // );


// // const unmarkedResult =
// // await unmarkedRequest.query(`

// // SELECT
// //     e.site_id,
// //     COUNT(e.employee_code) AS unmarked_count

// // FROM employee e

// // WHERE
// //     e.active = '0'

// //     AND e.site_id IN (${safeSiteIds})

// //     AND NOT EXISTS
// //     (
// //         SELECT 1
// //         FROM emp_attendance a

// //         WHERE
// //             a.emp_code = e.employee_code

// //             AND a.site_id = e.site_id

// //             AND a.check_in_date >= @startDate

// //             AND a.check_in_date < DATEADD(DAY,1,@endDate)
// //     )

// // GROUP BY
// //     e.site_id

// // `);

// // const unmarkedData = {};


// // unmarkedResult.recordset.forEach(row=>{

// //     unmarkedData[row.site_id] =
// //     Number(row.unmarked_count || 0);

// // });

// // const unmarkedRequest = pool.request();

// // unmarkedRequest.input(
// //     "startDate",
// //     sql.Date,
// //     startDate
// // );

// // unmarkedRequest.input(
// //     "endDate",
// //     sql.Date,
// //     endDate
// // );

// // const unmarkedResult = await unmarkedRequest.query(`
// //     WITH DateTracker AS (
// //         SELECT CAST(@startDate AS DATE) AS AttendanceDate
// //         UNION ALL
// //         SELECT DATEADD(DAY, 1, AttendanceDate)
// //         FROM DateTracker
// //         WHERE AttendanceDate < CAST(@endDate AS DATE)
// //     ),
// //     EmployeeDateMatrix AS (
// //         SELECT 
// //             e.employee_code,
// //             e.site_id,
// //             d.AttendanceDate
// //         FROM employee e
// //         CROSS JOIN DateTracker d
// //         WHERE e.active = '0'
// //           AND e.site_id IN (${safeSiteIds})
// //           AND LOWER(e.emp_stages) NOT IN ('pending', 'verified', 'rejected', 'on hold', 'offer letter not issued', 'offer letter on hold', 'readytojoin')
// //     )
// //     SELECT 
// //         edm.site_id,
// //         COUNT(edm.employee_code) AS unmarked_count
// //     FROM EmployeeDateMatrix edm
// //     WHERE NOT EXISTS (
// //         SELECT 1 
// //         FROM emp_attendance a
// //         WHERE a.emp_code = edm.employee_code
// //           AND a.site_id = edm.site_id
// //           AND a.active = '0'
// //           AND CAST(a.check_in_date AS DATE) = edm.AttendanceDate
// //     )
// //     GROUP BY edm.site_id
// // `);

// // const unmarkedData = {};

// // unmarkedResult.recordset.forEach(row => {
// //     unmarkedData[row.site_id] = Number(row.unmarked_count || 0);
// // });
//   //-------------------------------------------------------
//   // Final Report
//   //-------------------------------------------------------


// //-------------------------------------------------------
// // Final Report
// //-------------------------------------------------------

// const report = [];

// let totalPresent = 0;
// let totalAttendanceAbsent = 0;
// let totalUnmarked = 0;
// let totalFinalAbsent = 0;
// for (const site of siteResult.recordset) {


//     const att =
//     attendanceData[site.id] ||
//     {
//         total_P:0,
//         total_WO:0,
//         total_A:0
//     };



//     const totalManpower =
//     Number(site.cc_total_manpower || 0);



//     const pCount =
//     Number(att.total_P || 0);



//     const woCount =
//     Number(att.total_WO || 0);




//     //-------------------------------------------------------
//     // Unmarked Employee Count
//     //-------------------------------------------------------

// const unmarkedCount =
// unmarkedData[site.id] || 0;

//     //-------------------------------------------------------
//     // Final Absent
//     //-------------------------------------------------------
// const finalAbsentCount =
//     Number(att.total_A || 0) + unmarkedCount;

// const Finaltemabsent=( Number(att.total_A || 0))
//     const totalAttendance =
//     pCount +
//     finalAbsentCount;


//     totalPresent += pCount;
//     totalAttendanceAbsent += Number(att.total_A || 0);
//     totalUnmarked += unmarkedCount;
//     totalFinalAbsent += finalAbsentCount;

//     //-------------------------------------------------------
//     // Push Report
//     //-------------------------------------------------------

//     report.push({

//         StateName:
//         site.cc_state,


//         BranchName:
//         site.site_name,


//         ClientName:
//         site.company_name,


//         SiteCode:
//         site.client_code,


//         SiteName:
//         site.site_name,


//         SiteSupervisor:
//         site.cc_contact_person,



//         TotalManpowerOfSite:
//         totalManpower,



//         P:
//         pCount,



//         A:
//         finalAbsentCount,



//         WO:
//         woCount,



//         PresentPercent:

//         totalAttendance > 0

//         ?

//         Number(
//             (
//                 (pCount * 100) /
//                 totalAttendance
//             )
//             .toFixed(2)
//         )

//         :

//         0,



//         AbsentPercent:

//         totalAttendance > 0

//         ?

//         Number(
//             (
//                 (finalAbsentCount * 100) /
//                 totalAttendance
//             )
//             .toFixed(2)
//         )

//         :

//         0


//     });


// }


// console.log("Final Report:");
// console.table(
//     report.map(r => ({
//         Site: r.SiteName,
//         Present: r.P,
//         AttendanceAbsent: r.AttendanceAbsent,
//         Unmarked: r.Unmarked,
//         FinalAbsent: r.A,
//         WO: r.WO
//     }))
// );

// console.log("========== GRAND TOTAL ==========");
// console.log("Total Present          :", totalPresent);
// console.log("Total AttendanceAbsent :", totalAttendanceAbsent);
// console.log("Total Unmarked         :", totalUnmarked);
// console.log("Total Final Absent     :", totalFinalAbsent);
// console.log("=================================");

// return report;

// };         

// const getSiteWiseAttendance = async (
//     fromDate,
//     toDate,
//     userId,
// ) => {
//     const pool = await poolPromise;

//     let siteIds = "";
//     let clientIds = "";

//     //-------------------------------------------------------
//     // Date
//     //-------------------------------------------------------

//     // const dateObj = new Date(date);

//     // const day = dateObj.getDate();
//     // const month = dateObj.getMonth() + 1;
//     // const year = dateObj.getFullYear();

//     //-------------------------------------------------------
//     // User
//     //-------------------------------------------------------

//     const userResult = await pool.request().input("userId", sql.Int, userId)
//       .query(`
//         SELECT role,site_id,client_id
//         FROM users
//         WHERE id=@userId
//         AND active='0'
//     `);

//     if (userResult.recordset.length == 0) {
//       throw new Error("User not found");
//     }

//     const user = userResult.recordset[0];
// const excludedStatuses = [
//   "pending",
//   "verified",
//   "rejected",
//   "on hold",
//   "offer letter not issued",
//   "offer letter on hold",
//   "readytojoin",
// ];
//     //-------------------------------------------------------
//     // ADMIN
//     //-------------------------------------------------------

//     if ((user.role || "").toLowerCase().trim() === "admin") {
//       const siteResult = await pool.request().query(`
//             SELECT id
//             FROM client_rates
//             WHERE active='0'
//         `);

//       siteIds = siteResult.recordset.map((x) => x.id).join(",");

//       const clientResult = await pool.request().query(`
//             SELECT id
//             FROM new_client
//             WHERE active='0'
//         `);

//       clientIds = clientResult.recordset.map((x) => x.id).join(",");
//     } else {
//       siteIds = user.site_id || "";
//       clientIds = user.client_id || "";
//     }

//     //-------------------------------------------------------
//     // Attendance Summary
//     //-------------------------------------------------------

// //   const attendanceResult = await pool
// //   .request()
// //   .input("checkDate", sql.Date, new Date(date))
// //   .query(`
// //     SELECT
// //         site_id,

// //         SUM(
// //             CASE
// //                 WHEN emp_status IN ('P','PP','PPP','PPPP','PPPPP')
// //                 THEN 1
// //                 ELSE 0
// //             END
// //         ) total_P,

// //         SUM(
// //             CASE
// //                 WHEN emp_status='W'
// //                 THEN 1
// //                 ELSE 0
// //             END
// //         ) total_WO,

// //         SUM(
// //             CASE
// //                 WHEN emp_status='A'
// //                 THEN 1
// //                 ELSE 0
// //             END
// //         ) total_A

// //     FROM emp_attendance

// //     WHERE
// //         check_in_date = @checkDate
// //         AND site_id IN (${siteIds})
// //         AND active = 0

// //     GROUP BY site_id
// // `);
// //     const attendanceData = {};

// //     attendanceResult.recordset.forEach((row) => {
// //       attendanceData[row.site_id] = row;
// //     });

//     //-------------------------------------------------------
//     // Site Details
//     //-------------------------------------------------------
// console.log("Before Site Query");
//     const siteResult = await pool.request()
//     .query(`
//         SELECT

//             cr.id,
//             cr.site_name,
//             cr.cc_state,
//             cr.client_code,
//             cr.cc_contact_person,
//             cr.cc_loct_Startdate,
//             cr.cc_loct_Enddate,
//             cr.cc_total_manpower,

//             nc.company_name

//         FROM client_rates cr

//         INNER JOIN new_client nc
//             ON cr.client_id=nc.id

//         WHERE
//             cr.id IN (${siteIds})
//             AND cr.client_id IN (${clientIds})
//          AND cr.active = 0
        
//     `);
// console.log("Site IDs:", siteIds);
// console.log("Client IDs:", clientIds);
// console.log("Total Sites:", siteResult.recordset.length);
// console.table(siteResult.recordset);
// const siteIdArray = siteIds.split(",").map(Number);
// const fetchedIds = siteResult.recordset.map(r => Number(r.id));

// const missingIds = siteIdArray.filter(id => !fetchedIds.includes(id));

// console.log("Missing Site IDs:", missingIds);
//     //-------------------------------------------------------
//     // Final Report
//     //-------------------------------------------------------

//     const report = [];

// const startDate = new Date(fromDate);
// const endDate = new Date(toDate);

// console.log("From Date:", fromDate);
// console.log("To Date:", toDate);
// console.log("Start Date:", startDate);
// console.log("End Date:", endDate);
// for (
//   let currentDate = new Date(startDate);
//   currentDate <= endDate;
//   currentDate.setDate(currentDate.getDate() + 1)
// ) {
//   const checkDate = new Date(currentDate);
//  const attendanceResult = await pool

//   .request()

//   .input("checkDate", sql.Date, checkDate)

//   .query(`

//     SELECT

//         site_id,



//         SUM(

//             CASE

//                 WHEN emp_status IN ('P','PP','PPP','PPPP','PPPPP')

//                 THEN 1

//                 ELSE 0

//             END

//         ) total_P,



//         SUM(

//             CASE

//                 WHEN emp_status='W'

//                 THEN 1

//                 ELSE 0

//             END

//         ) total_WO,



//         SUM(

//             CASE

//                 WHEN emp_status='A'

//                 THEN 1

//                 ELSE 0

//             END

//         ) total_A



//     FROM emp_attendance



//   WHERE
//     CAST(check_in_date AS DATE) = @checkDate

//         AND site_id IN (${siteIds})

//         AND active = 0



//     GROUP BY site_id

// `);

//     const attendanceData = {};



//     attendanceResult.recordset.forEach((row) => {

//       attendanceData[row.site_id] = row;

//     });
//     console.log("Checking Date:", checkDate);

// console.log("Attendance Query Result:");
// console.table(attendanceResult.recordset);
// for (const site of siteResult.recordset) {
//       const att = attendanceData[site.id] || {
//         total_P: 0,
//         total_WO: 0,
//         total_A: 0,
//       };

//   const totalManpower = Number(site.cc_total_manpower || 0);

// const pCount = Number(att.total_P || 0);

// const woCount = Number(att.total_WO || 0);

// const aStatusCount = Number(att.total_A || 0);

// // PHP same logic
// const unmarkedResult = await pool
//   .request()
//   .input("siteId", sql.Int, site.id)
// .input("checkDate", sql.Date, checkDate)
//   .query(`
//         SELECT COUNT(e.employee_code) AS unmarked_count
//         FROM employee e
//         WHERE
//             e.site_id = @siteId
//             AND e.active='0'
//             AND LOWER(ISNULL(e.emp_stages,'')) NOT IN (
//                 '${excludedStatuses.join("','")}'
//             )
//             AND NOT EXISTS (
//                 SELECT 1
//                 FROM emp_attendance a
//                 WHERE
//                     a.emp_code = e.employee_code
//                   AND CAST(a.check_in_date AS DATE) = @checkDate  
//                     AND a.active='0'
//             )
//     `);

// const unmarkedCount = Number(
//   unmarkedResult.recordset[0]?.unmarked_count || 0
// );

// const finalAbsentCount = aStatusCount + unmarkedCount;
// console.log("----------- SITE DATA -----------");

// console.log({
//     Date: checkDate,
//     SiteId: site.id,
//     SiteName: site.site_name,
//     Manpower: totalManpower,
//     Present: pCount,
//     AbsentStatus: aStatusCount,
//     Unmarked: unmarkedCount,
//     FinalAbsent: finalAbsentCount,
//     WO: woCount
// });
// const totalAttendance = pCount + finalAbsentCount;

// let presentPercent = 0;
// let absentPercent = 0;

// if (totalAttendance > 0) {
//   presentPercent = Number(
//     ((pCount * 100) / totalAttendance).toFixed(2)
//   );

//   // Make total exactly 100
//   absentPercent = Number(
//     (100 - presentPercent).toFixed(2)
//   );
// }
// console.log("SITE REPORT DATA:", {
//   Date: checkDate,
//   site_id: site.id,
//   StateName: site.cc_state,
//   BranchName: site.site_name,
//   ClientName: site.company_name,
//   SiteCode: site.client_code,
//   SiteName: site.site_name,
//   SiteSupervisor: site.cc_contact_person,
//   TotalManpowerOfSite: totalManpower,
//   P: pCount,
//   A: aStatusCount,
//   Unmarked: unmarkedCount,
//   FinalAbsent: finalAbsentCount,
//   WO: woCount,
//   PresentPercent: presentPercent,
//   AbsentPercent: absentPercent,
// });

// report.push({
//   Date: checkDate,
//     site_id: site.id,
//   StateName: site.cc_state,
//   BranchName: site.site_name,
//   ClientName: site.company_name,
//   SiteCode: site.client_code,
//   SiteName: site.site_name,
//   SiteSupervisor: site.cc_contact_person,
//   TotalManpowerOfSite: totalManpower,
//   P: pCount,
//   A:aStatusCount,
//     Unmarked: unmarkedCount,
//       FinalAbsent: finalAbsentCount,
//   WO: woCount,
//   PresentPercent: presentPercent,
//   AbsentPercent: absentPercent,
// });
// }

// }
// console.log("========== FINAL REPORT ==========");
// console.log("Total Records:", report.length);
// console.table(report);
// return report;}
const getSiteWiseAttendance = async (
  fromDate,
  toDate,
  userId
) => {
  try {
    const pool = await poolPromise;

    // =====================================================
    // EXCLUDED EMPLOYEE STATUS
    // =====================================================

    const excludedStatuses = [
      "pending",
      "verified",
      "rejected",
      "on hold",
      "offer letter not issued",
      "offer letter on hold",
      "readytojoin",
    ];

    // =====================================================
    // VALIDATE USER ID
    // =====================================================

    const loggedInUserId = Number(userId);

    if (!loggedInUserId) {
      throw new Error("Invalid logged-in user ID");
    }

    console.log("====================================");
    console.log("GET SITE WISE ATTENDANCE");
    console.log("====================================");

    console.log("Logged In User ID:", loggedInUserId);
    console.log("From Date:", fromDate);
    console.log("To Date:", toDate);

    // =====================================================
    // GET LOGGED-IN USER
    // =====================================================

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
          site_id,
          client_id,
          company_id,
          branch_id,
          superadmin_status
        FROM users
        WHERE
          id = @userId
          AND active = '0'
      `);

    // =====================================================
    // USER NOT FOUND
    // =====================================================

    if (
      !userResult.recordset ||
      userResult.recordset.length === 0
    ) {
      throw new Error(
        `User not found or inactive. User ID: ${loggedInUserId}`
      );
    }

    const user =
      userResult.recordset[0];

    // =====================================================
    // USER ROLE
    // =====================================================

    const role = String(
      user.role || ""
    )
      .trim()
      .toLowerCase();

    // =====================================================
    // SUPER ADMIN CHECK
    //
    // Your users table:
    //
    // role = SUPER ADMIN
    // superadmin_status = 1
    //
    // Both are handled here.
    // =====================================================

    const isSuperAdmin =
      role === "super admin" ||
      role === "superadmin" ||
      Number(user.superadmin_status) === 1;

    // =====================================================
    // USER DEBUG
    // =====================================================

    console.log("====================================");
    console.log("LOGGED-IN USER");
    console.log("====================================");

    console.log({
      userId: user.id,
      role: user.role,
      normalizedRole: role,
      company_id: user.company_id,
      branch_id: user.branch_id,
      site_id: user.site_id,
      client_id: user.client_id,
      superadmin_status:
        user.superadmin_status,
      isSuperAdmin: isSuperAdmin,
    });

    // =====================================================
    // SITE RESULT
    // =====================================================

    let siteResult;

    // =====================================================
    // 1. SUPER ADMIN
    //
    // SUPER ADMIN CAN SEE ALL COMPANIES
    // =====================================================

    if (isSuperAdmin) {
      console.log(
        "===================================="
      );

      console.log(
        "ACCESS TYPE: SUPER ADMIN"
      );

      console.log(
        "ACCESS: ALL COMPANIES"
      );

      console.log(
        "===================================="
      );

      siteResult =
        await pool
          .request()
          .query(`
            SELECT
              cr.id,
              cr.site_name,
              cr.cc_state,
              cr.client_code,
              cr.cc_contact_person,
              cr.cc_loct_Startdate,
              cr.cc_loct_Enddate,
              cr.cc_total_manpower,

              nc.company_name,
              nc.billing_company_id

            FROM client_rates cr

            INNER JOIN new_client nc
              ON cr.client_id = nc.id

            WHERE
              cr.active = 0
              AND nc.active = 0

            ORDER BY
              nc.company_name,
              cr.site_name
          `);
    }

    // =====================================================
    // 2. ADMIN
    //
    // ADMIN CAN SEE ONLY OWN COMPANY
    //
    // users.company_id
    //       =
    // new_client.billing_company_id
    // =====================================================

    else if (
      role === "admin"
    ) {
      console.log(
        "===================================="
      );

      console.log(
        "ACCESS TYPE: ADMIN"
      );

      console.log(
        "ACCESS: OWN COMPANY ONLY"
      );

      console.log(
        "===================================="
      );

      // ---------------------------------------------------
      // GET ADMIN COMPANY ID
      // ---------------------------------------------------

      const companyId =
        Number(user.company_id);

      console.log(
        "ADMIN COMPANY ID:",
        companyId
      );

      // ---------------------------------------------------
      // COMPANY ID REQUIRED
      // ---------------------------------------------------

      if (!companyId) {
        console.log(
          "ADMIN COMPANY ID NOT FOUND"
        );

        return [];
      }

      // ---------------------------------------------------
      // ADMIN COMPANY QUERY
      // ---------------------------------------------------

      siteResult =
        await pool
          .request()
          .input(
            "companyId",
            sql.Int,
            companyId
          )
          .query(`
            SELECT
              cr.id,
              cr.site_name,
              cr.cc_state,
              cr.client_code,
              cr.cc_contact_person,
              cr.cc_loct_Startdate,
              cr.cc_loct_Enddate,
              cr.cc_total_manpower,

              nc.company_name,
              nc.billing_company_id

            FROM client_rates cr

            INNER JOIN new_client nc
              ON cr.client_id = nc.id

            WHERE
              cr.active = 0
              AND nc.active = 0
              AND nc.billing_company_id = @companyId

            ORDER BY
              nc.company_name,
              cr.site_name
          `);
    }

    // =====================================================
    // 3. NORMAL USER
    //
    // ACCESS USING:
    //
    // users.site_id
    // users.client_id
    // =====================================================

    else {
      console.log(
        "===================================="
      );

      console.log(
        "ACCESS TYPE: NORMAL USER"
      );

      console.log(
        "ACCESS: SITE / CLIENT"
      );

      console.log(
        "===================================="
      );

      // ---------------------------------------------------
      // SITE IDS
      // ---------------------------------------------------

      const siteIds =
        String(
          user.site_id || ""
        )
          .split(",")
          .map(
            (id) =>
              Number(id.trim())
          )
          .filter(
            (id) =>
              Number.isInteger(id) &&
              id > 0
          );

      // ---------------------------------------------------
      // CLIENT IDS
      // ---------------------------------------------------

      const clientIds =
        String(
          user.client_id || ""
        )
          .split(",")
          .map(
            (id) =>
              Number(id.trim())
          )
          .filter(
            (id) =>
              Number.isInteger(id) &&
              id > 0
          );

      // ---------------------------------------------------
      // DEBUG
      // ---------------------------------------------------

      console.log(
        "NORMAL USER SITE IDS:",
        siteIds
      );

      console.log(
        "NORMAL USER CLIENT IDS:",
        clientIds
      );

      // ---------------------------------------------------
      // NO ACCESS
      // ---------------------------------------------------

      if (
        siteIds.length === 0 &&
        clientIds.length === 0
      ) {
        console.log(
          "NO SITE / CLIENT ACCESS"
        );

        return [];
      }

      // ---------------------------------------------------
      // CREATE REQUEST
      // ---------------------------------------------------

      const request =
        pool.request();

      const conditions = [];

      // ---------------------------------------------------
      // SITE FILTER
      // ---------------------------------------------------

      if (
        siteIds.length > 0
      ) {
        const siteParams =
          siteIds
            .map(
              (_, index) =>
                `@site${index}`
            )
            .join(",");

        siteIds.forEach(
          (id, index) => {
            request.input(
              `site${index}`,
              sql.Int,
              id
            );
          }
        );

        conditions.push(
          `cr.id IN (${siteParams})`
        );
      }

      // ---------------------------------------------------
      // CLIENT FILTER
      // ---------------------------------------------------

      if (
        clientIds.length > 0
      ) {
        const clientParams =
          clientIds
            .map(
              (_, index) =>
                `@client${index}`
            )
            .join(",");

        clientIds.forEach(
          (id, index) => {
            request.input(
              `client${index}`,
              sql.Int,
              id
            );
          }
        );

        conditions.push(
          `cr.client_id IN (${clientParams})`
        );
      }

      // ---------------------------------------------------
      // NORMAL USER SITE QUERY
      // ---------------------------------------------------

      siteResult =
        await request
          .query(`
            SELECT
              cr.id,
              cr.site_name,
              cr.cc_state,
              cr.client_code,
              cr.cc_contact_person,
              cr.cc_loct_Startdate,
              cr.cc_loct_Enddate,
              cr.cc_total_manpower,

              nc.company_name,
              nc.billing_company_id

            FROM client_rates cr

            INNER JOIN new_client nc
              ON cr.client_id = nc.id

            WHERE
              cr.active = 0
              AND nc.active = 0

              AND (
                ${conditions.join(" OR ")}
              )

            ORDER BY
              nc.company_name,
              cr.site_name
          `);
    }

    // =====================================================
    // SITE QUERY RESULT
    // =====================================================

    console.log(
      "===================================="
    );

    console.log(
      "SITE QUERY RESULT"
    );

    console.log(
      "===================================="
    );

    console.log(
      "Total Sites:",
      siteResult.recordset.length
    );

    // ---------------------------------------------------
    // SITE TABLE DEBUG
    // ---------------------------------------------------

    console.table(
      siteResult.recordset.map(
        (site) => ({
          SiteId:
            site.id,

          SiteName:
            site.site_name,

          CompanyName:
            site.company_name,

          BillingCompanyId:
            site.billing_company_id,

          TotalManpower:
            site.cc_total_manpower,
        })
      )
    );

    // =====================================================
    // NO SITES
    // =====================================================

    if (
      siteResult.recordset.length === 0
    ) {
      console.log(
        "NO SITES FOUND"
      );

      return [];
    }

    // =====================================================
    // GET SITE IDS
    // =====================================================

    const siteIdArray =
      siteResult.recordset
        .map(
          (site) =>
            Number(site.id)
        )
        .filter(
          (id) =>
            Number.isInteger(id) &&
            id > 0
        );

    console.log(
      "ALLOWED SITE IDS:",
      siteIdArray
    );

    // =====================================================
    // NO VALID SITE IDS
    // =====================================================

    if (
      siteIdArray.length === 0
    ) {
      console.log(
        "NO VALID SITE IDS"
      );

      return [];
    }

    // =====================================================
    // PARAMETERIZED SITE IDS
    //
    // Prevent:
    //
    // IN ()
    //
    // SQL ERROR
    // =====================================================

    const attendanceSiteParams =
      siteIdArray
        .map(
          (_, index) =>
            `@attendanceSite${index}`
        )
        .join(",");

    // =====================================================
    // FINAL REPORT
    // =====================================================

    const report = [];

    // =====================================================
    // DATE VALIDATION
    // =====================================================

    const startDate =
      new Date(fromDate);

    const endDate =
      new Date(toDate);

    if (
      Number.isNaN(
        startDate.getTime()
      ) ||
      Number.isNaN(
        endDate.getTime()
      )
    ) {
      throw new Error(
        "Invalid fromDate or toDate"
      );
    }

    // =====================================================
    // DATE RANGE DEBUG
    // =====================================================

    console.log(
      "===================================="
    );

    console.log(
      "DATE RANGE"
    );

    console.log(
      "===================================="
    );

    console.log(
      "FROM DATE:",
      fromDate
    );

    console.log(
      "TO DATE:",
      toDate
    );

    console.log(
      "START DATE:",
      startDate
    );

    console.log(
      "END DATE:",
      endDate
    );

    // =====================================================
    // DATE LOOP
    // =====================================================

    for (
      let currentDate =
        new Date(startDate);

      currentDate <= endDate;

      currentDate.setDate(
        currentDate.getDate() + 1
      )
    ) {
      // ---------------------------------------------------
      // CURRENT CHECK DATE
      // ---------------------------------------------------

      const checkDate =
        new Date(currentDate);

      console.log(
        "===================================="
      );

      console.log(
        "CHECK DATE:",
        checkDate
      );

      // ===================================================
      // ATTENDANCE REQUEST
      // ===================================================

      const attendanceRequest =
        pool
          .request()
          .input(
            "checkDate",
            sql.Date,
            checkDate
          );

      // ===================================================
      // ADD SITE PARAMETERS
      // ===================================================

      siteIdArray.forEach(
        (id, index) => {
          attendanceRequest.input(
            `attendanceSite${index}`,
            sql.Int,
            id
          );
        }
      );

      // ===================================================
      // ATTENDANCE QUERY
      // ===================================================

      const attendanceResult =
        await attendanceRequest
          .query(`
            SELECT
              site_id,

              SUM(
                CASE
                  WHEN emp_status IN (
                    'P',
                    'PP',
                    'PPP',
                    'PPPP',
                    'PPPPP'
                  )
                  THEN 1
                  ELSE 0
                END
              ) AS total_P,

              SUM(
                CASE
                  WHEN emp_status = 'W'
                  THEN 1
                  ELSE 0
                END
              ) AS total_WO,

              SUM(
                CASE
                  WHEN emp_status = 'A'
                  THEN 1
                  ELSE 0
                END
              ) AS total_A

            FROM emp_attendance

            WHERE
              CAST(
                check_in_date AS DATE
              ) = @checkDate

              AND site_id IN (
                ${attendanceSiteParams}
              )

              AND active = 0

            GROUP BY
              site_id
          `);

      // ===================================================
      // ATTENDANCE MAP
      // ===================================================

      const attendanceData = {};

      attendanceResult.recordset.forEach(
        (row) => {
          attendanceData[
            Number(row.site_id)
          ] = row;
        }
      );

      // ===================================================
      // ATTENDANCE DEBUG
      // ===================================================

      console.log(
        "ATTENDANCE QUERY RESULT:"
      );

      console.table(
        attendanceResult.recordset
      );

      // ===================================================
      // EACH SITE
      // ===================================================

      for (
        const site
        of siteResult.recordset
      ) {
        // ===============================================
        // GET ATTENDANCE
        // ===============================================

        const att =
          attendanceData[
            Number(site.id)
          ] || {
            total_P: 0,
            total_WO: 0,
            total_A: 0,
          };

        // ===============================================
        // TOTAL MANPOWER
        // ===============================================

        const totalManpower =
          Number(
            site.cc_total_manpower || 0
          );

        // ===============================================
        // PRESENT
        // ===============================================

        const pCount =
          Number(
            att.total_P || 0
          );

        // ===============================================
        // WEEK OFF
        // ===============================================

        const woCount =
          Number(
            att.total_WO || 0
          );

        // ===============================================
        // ABSENT STATUS
        // ===============================================

        const aStatusCount =
          Number(
            att.total_A || 0
          );

        // ===============================================
        // UNMARKED EMPLOYEE
        // ===============================================

        const unmarkedResult =
          await pool
            .request()
            .input(
              "siteId",
              sql.Int,
              Number(site.id)
            )
            .input(
              "checkDate",
              sql.Date,
              checkDate
            )
            .query(`
              SELECT
                COUNT(
                  e.employee_code
                ) AS unmarked_count

              FROM employee e

              WHERE
                e.site_id = @siteId

                AND e.active = '0'

                AND LOWER(
                  ISNULL(
                    e.emp_stages,
                    ''
                  )
                ) NOT IN (
                  '${excludedStatuses.join("','")}'
                )

                AND NOT EXISTS (
                  SELECT 1

                  FROM emp_attendance a

                  WHERE
                    a.emp_code =
                      e.employee_code

                    AND CAST(
                      a.check_in_date AS DATE
                    ) = @checkDate

                    AND a.active = '0'
                )
            `);

        // ===============================================
        // UNMARKED COUNT
        // ===============================================

        const unmarkedCount =
          Number(
            unmarkedResult
              .recordset[0]
              ?.unmarked_count || 0
          );

        // ===============================================
        // FINAL ABSENT
        //
        // A STATUS + UNMARKED
        // ===============================================

        const finalAbsentCount =
          aStatusCount +
          unmarkedCount;

        // ===============================================
        // TOTAL ATTENDANCE
        // ===============================================

        const totalAttendance =
          pCount +
          finalAbsentCount;

        // ===============================================
        // PERCENTAGE
        // ===============================================

        let presentPercent = 0;
        let absentPercent = 0;

        if (
          totalAttendance > 0
        ) {
          presentPercent =
            Number(
              (
                (
                  pCount * 100
                ) /
                totalAttendance
              ).toFixed(2)
            );

          absentPercent =
            Number(
              (
                100 -
                presentPercent
              ).toFixed(2)
            );
        }

        // ===============================================
        // SITE DEBUG
        // ===============================================

        console.log(
          "----------- SITE DATA -----------"
        );

        console.log({
          Date:
            checkDate,

          SiteId:
            site.id,

          SiteName:
            site.site_name,

          CompanyName:
            site.company_name,

          BillingCompanyId:
            site.billing_company_id,

          TotalManpower:
            totalManpower,

          Present:
            pCount,

          AbsentStatus:
            aStatusCount,

          Unmarked:
            unmarkedCount,

          FinalAbsent:
            finalAbsentCount,

          WeekOff:
            woCount,

          PresentPercent:
            presentPercent,

          AbsentPercent:
            absentPercent,
        });

        // ===============================================
        // PUSH REPORT
        // ===============================================

        report.push({
          Date:
            checkDate,

          site_id:
            site.id,

          StateName:
            site.cc_state,

          BranchName:
            site.site_name,

          ClientName:
            site.company_name,

          BillingCompanyId:
            site.billing_company_id,

          SiteCode:
            site.client_code,

          SiteName:
            site.site_name,

          SiteSupervisor:
            site.cc_contact_person,

          TotalManpowerOfSite:
            totalManpower,

          P:
            pCount,

          A:
            aStatusCount,

          Unmarked:
            unmarkedCount,

          FinalAbsent:
            finalAbsentCount,

          WO:
            woCount,

          PresentPercent:
            presentPercent,

          AbsentPercent:
            absentPercent,
        });
      }
    }

    // =====================================================
    // FINAL REPORT
    // =====================================================

    console.log(
      "===================================="
    );

    console.log(
      "FINAL REPORT"
    );

    console.log(
      "===================================="
    );

    console.log(
      "TOTAL RECORDS:",
      report.length
    );

    console.table(
      report
    );

    // =====================================================
    // RETURN
    // =====================================================

    return report;

  } catch (error) {

    // =====================================================
    // ERROR
    // =====================================================

    console.error(
      "===================================="
    );

    console.error(
      "SITE WISE ATTENDANCE ERROR"
    );

    console.error(
      "===================================="
    );

    console.error(
      error
    );

    throw error;
  }
};
const  getAttendanceReport= async (fromDate, toDate, user, siteCode = "")=> {
    try {
      const pool = await poolPromise;

      //----------------------------------------------------
      // VARIABLES
      //----------------------------------------------------

      let attendance_count = 0;
      let p_count = 0;
      let p_attendance = 0;

  let siteIds = "";

if (siteCode) {
  // Site Code वरून Site ID मिळवा
  const siteResult = await pool
    .request()
.input("siteCode", sql.NVarChar, siteCode)
    .query(`
      SELECT id
      FROM client_rates
      WHERE client_code = @siteCode
      AND active = 0
    `);

  siteIds = siteResult.recordset.map((x) => x.id).join(",");
} else if ((user.role || "").toLowerCase().trim() === "admin") {
  const siteResult = await pool.request().query(`
      SELECT id
      FROM client_rates
      WHERE active = 0
  `);

  siteIds = siteResult.recordset.map((x) => x.id).join(",");
} else {
  siteIds = user.site_id || "";
}
      //----------------------------------------------------
      // EXCLUDED STATUS
      //----------------------------------------------------

      const excludedStatuses = [
        "pending",
        "verified",
        "rejected",
        "on hold",
        "offer letter not issued",
        "offer letter on hold",
        "readytojoin",
      ];

      //----------------------------------------------------
      // DATE LOOP
      //----------------------------------------------------

      const startDate = new Date(fromDate);
      const endDate = new Date(toDate);

      endDate.setDate(endDate.getDate() + 1);

      const finalReport = [];

      for (
        let currentDate = new Date(startDate);
        currentDate < endDate;
        currentDate.setDate(currentDate.getDate() + 1)
      ) {
        const currDate = currentDate.toISOString().split("T")[0];

        //------------------------------------------------
        // STORE EMPLOYEE CODES
        //------------------------------------------------

        const empCodesFound = [];

        //------------------------------------------------
        // STORE MULTIPLE PUNCHES
        //------------------------------------------------

        const punches = {};

        //------------------------------------------------
        // FETCH PUNCH RECORDS
        //------------------------------------------------

        const punchResult = await pool
          .request()
          .input("checkDate", sql.NVarChar, currDate).query(`
          SELECT *
          FROM emp_attendance
          WHERE check_in_date=@checkDate
          AND site_id IN (${siteIds})
          AND active = 0
        `);

        //------------------------------------------------
        // SAVE PUNCH RECORDS
        //------------------------------------------------

        punchResult.recordset.forEach((row) => {
          attendance_count++;

          if (row.emp_status === "P") {
            p_attendance++;
          }

          empCodesFound.push(row.emp_code);

          if (!punches[row.emp_code]) {
            punches[row.emp_code] = [];
          }

          punches[row.emp_code].push(row);
        });

        //------------------------------------------------
        // UNIQUE EMPLOYEE CODES
        //------------------------------------------------

        const uniqueCodes = [...new Set(empCodesFound)];

        //------------------------------------------------
        // PRESENT EMPLOYEES
        //------------------------------------------------

        if (uniqueCodes.length > 0) {
          const employeeResult = await pool.request().query(`
          SELECT
              id,
              employee_code,
              emp_full_name,
              rank,
              em_status,
              date_of_joining,
              shift_type,
              site_id
          FROM employee
          WHERE employee_code IN (
              ${uniqueCodes.map((code) => `'${code}'`).join(",")}
          ) AND active = 0
        `);

          //------------------------------------------------
          // LOOP EMPLOYEES
          //------------------------------------------------

          for (const employee of employeeResult.recordset) {
            const empCode = employee.employee_code;

            const allPunchesForEmp = punches[empCode] || [];

            //------------------------------------------------
            // LOOP ALL PUNCH RECORDS OF EMPLOYEE
            //------------------------------------------------

            for (const punch of allPunchesForEmp) {
              if ((punch.emp_status || "") === "P") {
                p_count++;
              }
              // console.log(punch);

              finalReport.push({
                // 1 - 13
                DailyAttendanceInOutID: punch.id || "",
                SiteMasterID: punch.site_id || employee.site_id || "",
                SiteCode: punch.client_code || "",
                SiteName: punch.site_name || "",
                ClientName: punch.client_name || "",
                BranchName: punch.branch_name || "",
                DesignationName: employee.rank || "",
                DutyName: "",
                ShiftTitle: employee.shift_type || "",
                EmpType: employee.em_status || "",
                EmpMasterId: employee.id || "",
                EmpCode: empCode || "",
                EmployeeName: punch.emp_name || employee.emp_full_name || "",
                // 14 - 20
                JoiningDate: employee.date_of_joining
                  ? new Date(employee.date_of_joining)
                      .toISOString()
                      .split("T")[0]
                  : "",

                AttendanceDate: currDate,
                AttendanceStatus: punch.emp_status || "P",
                InDate: currDate,
                InTime: punch.check_in_time || "",
                OutDate: punch.check_out_date
                  ? new Date(punch.check_out_date).toISOString().split("T")[0]
                  : "",
                OutTime: punch.check_out_time || "",

                // 21 - 26
             WorkingHour: punch.emp_worked_hours || "00:00",
             OTHours: punch.ot_hours || "0",
              SiteHours: Number(punch.site_hours || 0),

                "CheckIn Longitude": punch.checkin_longitude || "",
                "CheckIn Latitude": punch.checkin_latitude || "",

                "CheckOut Longitude": punch.checkout_longitude || "",
                "CheckOut Latitude": punch.checkout_latitude || "",

                // 27 - 34
                InPunchedThrough: punch.source || "",
           OutPunchedThrough:
  punch.check_out_time && String(punch.check_out_time).trim() !== ""
    ? (punch.checkout_source || "")
    : "",

                Altitude: "",
                AltitudeOut: "",

                RegularizationID_IN: "",
                RegularizationID_OUT: "",

                LeaveID: "",

                AttendanceDescription: "",

                // 35 - 44
                GeoTagged: punch.checkin_latitude ? "Yes" : "No",
                IsOtherDuty: "No",

                RequestDate: punch.check_in_date || "",
                RequesterName: punch.created_by_name || "",

                AttendanceApproverId: "",
                AttendanceActionDate: "",
                AttendanceApproverName: "",
                AttendancePendingName: "",
                AttendanceRejectedName: "",

                AttendanceApprovalStatus: "Approved",

                // 45 - 54
                RegularizationInApproverId: "",
                RegularizationInActionDate: "",
                RegularizationInApproverName: "",

                RegularizationOutApproverId: "",
                RegularizationOutActionDate: "",
                RegularizationOutActionName: "",

                AttendanceRemark: "",
                RegularizationInRemark: "",
                RegularizationOutRemark: "",

                RelievingHours: "",
              });
            }
          }
        }
        //------------------------------------------------
        // ABSENT EMPLOYEE LOGIC
        //------------------------------------------------

        const notInCondition =
          uniqueCodes.length > 0
            ? `AND employee_code NOT IN (${uniqueCodes
                .map((code) => `'${code}'`)
                .join(",")})`
            : "";

        const absentResult = await pool.request().query(`
    SELECT
        e.id,
        e.employee_code,
        e.emp_full_name,
        e.rank,
        e.em_status,
        e.date_of_joining,
        e.shift_type,
        e.site_id,
        e.client_code,
        cr.client_id,
        cr.site_name,
        cr.cc_site_hours,
        cr.cc_branch_name,
        c.company_name,
        c.client_email,
        c.contact_person
    FROM employee e
    LEFT JOIN client_rates cr ON e.site_id = cr.id
    LEFT JOIN new_client c ON cr.client_id = c.id
    WHERE
        e.active = '0'
        AND e.site_id IN (${siteIds})
        ${notInCondition}
     AND (
    (
        e.em_status = 'WORKING'
    
        AND UPPER(ISNULL(e.emp_stages,'')) = 'OFFER LETTER ISSUED'
    )
    OR
    (
        UPPER(ISNULL(e.emp_stages,'')) NOT IN (
            '${excludedStatuses.join("','").toUpperCase()}'
        )
    )
)
`);

        //------------------------------------------------
        // ADD ABSENT EMPLOYEES
        //------------------------------------------------

        for (const employee of absentResult.recordset) {
          // console.log(employee);
          finalReport.push({
            // 1 - 13
            DailyAttendanceInOutID: "",
            BranchName: employee.cc_branch_name || "",
            SiteMasterID: employee.site_id || "",
            SiteCode: employee.client_code || "",
            SiteName: employee.site_name || "",
            ClientName: employee.company_name || "",
            DesignationName: employee.rank || "",
            DutyName: "",
            ShiftTitle: employee.shift_type || "",
            EmpType: employee.em_status || "",
            EmpMasterId: employee.id || "",
            EmpCode: employee.employee_code || "",
            EmployeeName: employee.emp_full_name || "",

            // 14 - 20
            JoiningDate: employee.date_of_joining
              ? new Date(employee.date_of_joining).toISOString().split("T")[0]
              : "",

            AttendanceDate: currDate,
            AttendanceStatus: "A",
            InDate: "",
            InTime: "",
            OutDate: "",
            OutTime: "",

            // 21 - 26
        WorkingHour: "00.00",
         OTHours: "00.00",
            SiteHours: employee.cc_site_hours || 0,

            "CheckIn Longitude": "",
            "CheckIn Latitude": "",

            "CheckOut Longitude": "",
            "CheckOut Latitude": "",

            // 27 - 34
            InPunchedThrough: "",
            OutPunchedThrough: "",

            Altitude: "",
            AltitudeOut: "",

            RegularizationID_IN: "",
            RegularizationID_OUT: "",

            LeaveID: "",

            AttendanceDescription: "",

            // 35 - 44
            GeoTagged: "No",
            IsOtherDuty: "No",

            RequestDate: "",
            RequesterName: "",

            AttendanceApproverId: "",
            AttendanceActionDate: "",
            AttendanceApproverName: "",
            AttendancePendingName: "",
            AttendanceRejectedName: "",

            AttendanceApprovalStatus: "Pending",

            // 45 - 54
            RegularizationInApproverId: "",
            RegularizationInActionDate: "",
            RegularizationInApproverName: "",

            RegularizationOutApproverId: "",
            RegularizationOutActionDate: "",
            RegularizationOutActionName: "",

            AttendanceRemark: "",
            RegularizationInRemark: "",
            RegularizationOutRemark: "",

            RelievingHours: "",
          });
        }
      } // End Date Loop

      //------------------------------------------------
      // DEBUG (OPTIONAL)
      //------------------------------------------------

      console.log("Attendance Count :", attendance_count);
      console.log("Present Punches  :", p_attendance);
      console.log("Present Records  :", p_count);
      console.log("Final Report     :", finalReport.length);

      //------------------------------------------------
      // RETURN REPORT
      //------------------------------------------------

      return finalReport;
    } catch (error) {
      console.error("getAttendanceReport Error:", error);

      throw error;
    }
  }

const getClientSites = async ({ isSuperAdmin, companyId }) => {
  const pool = await poolPromise;
  const request = pool.request();

  let query = `
    SELECT DISTINCT
      nc.id AS client_id,
      nc.company_name,
      cr.id AS site_id,
      cr.site_name
    FROM new_client nc
    INNER JOIN client_rates cr
      ON TRY_CAST(cr.client_id AS BIGINT) = nc.id
    WHERE nc.active = 0
      AND cr.site_name IS NOT NULL
  `;

  if (!isSuperAdmin) {
    request.input(
      "companyId",
      sql.VarChar,
      String(companyId)
    );

    query += `
      AND TRY_CAST(nc.billing_company_id AS BIGINT)
          = TRY_CAST(@companyId AS BIGINT)
    `;
  }

  query += `
    ORDER BY
      nc.company_name,
      cr.site_name
  `;

  const result = await request.query(query);

  return result.recordset;
};


module.exports = {
  getEmployeeDocumentDashboard,
    getEmployeeStageDashboard,
    getSiteWiseAttendance,getClientSiteCount,getEmployeeDocumentSummary,getAttendanceReport,getUserAccess,getClientSites
};
