
const { poolPromise } = require("../config/db");
const jwt = require("jsonwebtoken");
const md5 = require("md5");
const sql = require("mssql");

// ============================================
// HELPER: Parse comma-separated IDs
// Supports: "1", "1,2", '["1","2"]'
// ============================================
const parseIds = (value) => {
  if (value === null || value === undefined) {
    return [];
  }

  return [...new Set(
    String(value)
      .replace(/[\[\]"]/g, "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => /^\d+$/.test(id))
      .map(Number)
      .filter((id) => Number.isSafeInteger(id) && id > 0)
  )];
};

// ============================================
// HELPER: Get active assigned branches
// ============================================

const getActiveBranches = async (pool, branchIds) => {
  if (!branchIds || branchIds.length === 0) {
    return [];
  }

  const request = pool.request();

  branchIds.forEach((id, index) => {
    request.input(`branchId${index}`, sql.Int, id);
  });

  const inClause = branchIds
    .map((_, index) => `@branchId${index}`)
    .join(", ");

  const result = await request.query(`
    SELECT
      id,
      branch_name,
      company_id
    FROM dbo.branch
    WHERE id IN (${inClause})
      AND (
        active = 0
        OR active = '0'
        OR active IS NULL
      )
  `);

  // Preserve the original order of branchIds
  const branchMap = new Map(
    (result.recordset || []).map((branch) => [
      Number(branch.id),
      branch,
    ])
  );

  return branchIds
    .filter((id) => branchMap.has(Number(id)))
    .map((id) => branchMap.get(Number(id)));
};

// ============================================
// LOGIN
// ============================================

const login = async (data) => {
  const pool = await poolPromise;

  const { email, password, company, branch } = data;

  // 1. Get user
  const result = await pool
    .request()
    .input("email", sql.VarChar, String(email || "").trim())
    .query(`
      SELECT TOP 1 *
      FROM dbo.users
      WHERE LOWER(LTRIM(RTRIM(email))) =
            LOWER(LTRIM(RTRIM(@email)))
      ORDER BY id DESC
    `);

  const user = result.recordset[0];

  if (!user) {
    return {
      success: false,
      statusCode: 401,
      message: "Invalid credentials",
    };
  }

  // 2. Account status
  // Assumption: active = 1 means deactivated.
  if (user.active == 1) {
    return {
      success: false,
      statusCode: 403,
      message:
        "Your account has been deactivated. Please contact support.",
    };
  }

  // 3. Role validation
  if (!user.role || !String(user.role).trim()) {
    return {
      success: false,
      statusCode: 401,
      message: "User role not found",
    };
  }

  const role = String(user.role).trim().toUpperCase();

  const isSuperAdmin =
    String(user.superadmin_status ?? "").trim() === "1" ||
    role === "SUPERADMIN" ||
    role === "SUPER ADMIN" ||
    (Number(user.id) === 1 && role === "ADMIN");

  // 4. Password validation
  if (
    !password ||
    md5(password) !== String(user.password || "")
  ) {
    return {
      success: false,
      statusCode: 401,
      message: "Invalid credentials",
    };
  }

  // 5. Company and branch selection
  let selectedCompanyId = null;
  let selectedBranchId = null;

  let activeCompanyName = "";
  let activeBranchName = "";

  if (!isSuperAdmin) {
    const userCompanyIds = parseIds(user.company_id);
    const userBranchIds = parseIds(user.branch_id);

    const autoSelectCompany =
      String(user.login_company ?? "").trim() === "1";

    // 5.1 Get active assigned companies in assignment order
    let activeCompanies = [];

    if (userCompanyIds.length > 0) {
      const companyRequest = pool.request();

      userCompanyIds.forEach((id, index) => {
        companyRequest.input(`companyId${index}`, sql.Int, id);
      });

      const companyInClause = userCompanyIds
        .map((_, index) => `@companyId${index}`)
        .join(", ");

      const companyResult = await companyRequest.query(`
        SELECT id, company_name
        FROM dbo.companies
        WHERE id IN (${companyInClause})
          AND (
            active = 0
            OR active = '0'
            OR active IS NULL
          )
      `);

      const companyMap = new Map(
        (companyResult.recordset || []).map((c) => [
          Number(c.id),
          c,
        ])
      );

      // Preserve the order of IDs in users.company_id
      activeCompanies = userCompanyIds
        .filter((id) => companyMap.has(id))
        .map((id) => companyMap.get(id));
    }

    if (activeCompanies.length === 0) {
      return {
        success: false,
        statusCode: 401,
        message: "No active assigned companies found",
      };
    }

    // 5.2 Get active branches assigned to this user
    const assignedBranches = await getActiveBranches(
      pool,
      userBranchIds
    );

    // 5.3 Decide company and branch
    let requestedCompanyId = company;
    let requestedBranchId = branch;

    if (autoSelectCompany) {
      // Find the first active assigned company
      // that has at least one active assigned branch.
      let foundCompany = null;
      let foundBranch = null;

      for (const currentCompany of activeCompanies) {
        const companyBranches = assignedBranches.filter(
          (b) =>
            Number(b.company_id) === Number(currentCompany.id)
        );

        if (companyBranches.length > 0) {
          foundCompany = currentCompany;
          foundBranch = companyBranches[0];
          break;
        }
      }

      if (!foundCompany || !foundBranch) {
        return {
          success: false,
          statusCode: 400,
          message:
            "No active assigned branch found for any assigned company",
        };
      }

      requestedCompanyId = foundCompany.id;
      requestedBranchId = foundBranch.id;
    }

    // 5.4 Validate selected company
    if (
      requestedCompanyId === null ||
      requestedCompanyId === undefined ||
      String(requestedCompanyId).trim() === ""
    ) {
      return {
        success: false,
        statusCode: 400,
        message: "Please select a company",
      };
    }

    const parsedCompanyId = Number(requestedCompanyId);

    if (
      !Number.isSafeInteger(parsedCompanyId) ||
      parsedCompanyId <= 0 ||
      !userCompanyIds.includes(parsedCompanyId)
    ) {
      return {
        success: false,
        statusCode: 401,
        message: "Selected company is not assigned to your account",
      };
    }

    const compRes = await pool
      .request()
      .input("compId", sql.Int, parsedCompanyId)
      .query(`
        SELECT id, company_name
        FROM dbo.companies
        WHERE id = @compId
          AND (
            active = 0
            OR active = '0'
            OR active IS NULL
          )
      `);

    if (!compRes.recordset[0]) {
      return {
        success: false,
        statusCode: 401,
        message: "Selected company not found or inactive",
      };
    }

    selectedCompanyId = parsedCompanyId;
    activeCompanyName = compRes.recordset[0].company_name;

    // 5.5 Preserve existing single-branch behavior for other users
    if (!autoSelectCompany && userBranchIds.length === 1) {
      requestedBranchId = userBranchIds[0];
    }

    if (
      requestedBranchId === null ||
      requestedBranchId === undefined ||
      String(requestedBranchId).trim() === ""
    ) {
      return {
        success: false,
        statusCode: 400,
        message: "Please select a branch",
      };
    }

    const parsedBranchId = Number(requestedBranchId);

    if (
      !Number.isSafeInteger(parsedBranchId) ||
      parsedBranchId <= 0 ||
      !userBranchIds.includes(parsedBranchId)
    ) {
      return {
        success: false,
        statusCode: 401,
        message: "Selected branch is not assigned to your account",
      };
    }

    // 5.6 Validate branch is active and belongs to selected company
    const brRes = await pool
      .request()
      .input("brId", sql.Int, parsedBranchId)
      .input("compId", sql.Int, selectedCompanyId)
      .query(`
        SELECT id, branch_name, company_id
        FROM dbo.branch
        WHERE id = @brId
          AND company_id = @compId
          AND (
            active = 0
            OR active = '0'
            OR active IS NULL
          )
      `);

    if (!brRes.recordset[0]) {
      return {
        success: false,
        statusCode: 401,
        message:
          "Selected branch not found, inactive, or not assigned to the selected company",
      };
    }

    selectedBranchId = parsedBranchId;
    activeBranchName = brRes.recordset[0].branch_name;
  }

  // 6. JWT token
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.fullname || user.first_name,

      company: activeCompanyName,
      branch: activeBranchName,

      company_id: selectedCompanyId,
      branch_id: selectedBranchId,

      superadmin_status: user.superadmin_status || "0",
      is_superadmin: isSuperAdmin,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 7. Success response
  return {
    success: true,
    token,
    selectedCompanyId,
    selectedBranchId,
    user: {
      id: user.id,
      name: user.fullname || user.first_name,
      email: user.email,
      role: user.role,

      company: activeCompanyName,
      branch: activeBranchName,

      company_id: selectedCompanyId,
      branch_id: selectedBranchId,

      login_company: user.login_company,
      superadmin_status: user.superadmin_status || "0",
      is_superadmin: isSuperAdmin,
    },
  };
};
;

// ============================================
// GET COMPANIES AND BRANCHES BY EMAIL
// ============================================

const getCompaniesByEmail = async (email) => {
  const pool = await poolPromise;

  try {
    // 1. Get user
    const userResult = await pool
      .request()
      .input("email", sql.VarChar, String(email || "").trim())
      .query(`
        SELECT TOP 1
          id,
          email,
          role,
          superadmin_status,
          company_id,
          branch_id,
          login_company,
          active
        FROM dbo.users
        WHERE LOWER(LTRIM(RTRIM(email))) =
              LOWER(LTRIM(RTRIM(@email)))
        ORDER BY id DESC
      `);

    const user = userResult.recordset?.[0];

    if (!user) {
      return {
        user: null,
        isSuperAdmin: false,
        companies: [],
        branches: [],
        selectedCompanyId: null,
        selectedBranchId: null,
        msg: "User not found",
      };
    }

    // 2. Account status
    // Assumption: active = 0 or NULL means active.
    if (
      user.active !== null &&
      user.active !== undefined &&
      String(user.active).trim() !== "" &&
      String(user.active).trim() !== "0"
    ) {
      return {
        user,
        isSuperAdmin: false,
        companies: [],
        branches: [],
        selectedCompanyId: null,
        selectedBranchId: null,
        msg: "User account is inactive",
      };
    }

    // 3. Identify SuperAdmin
    const role = String(user.role || "")
      .trim()
      .toUpperCase();

    const isSuperAdmin =
      role === "SUPERADMIN" ||
      role === "SUPER ADMIN" ||
      String(user.superadmin_status ?? "").trim() === "1" ||
      (Number(user.id) === 1 && role === "ADMIN");

    // 4. SuperAdmin: return all active companies and branches
    if (isSuperAdmin) {
      const companyResult = await pool.request().query(`
        SELECT id, company_name
        FROM dbo.companies
        WHERE active = 0
           OR active = '0'
           OR active IS NULL
        ORDER BY company_name ASC
      `);

      const branchResult = await pool.request().query(`
        SELECT id, branch_name, company_id
        FROM dbo.branch
        WHERE active = 0
           OR active = '0'
           OR active IS NULL
        ORDER BY branch_name ASC
      `);

      return {
        user,
        isSuperAdmin: true,
        companies: companyResult.recordset || [],
        branches: branchResult.recordset || [],
        selectedCompanyId: null,
        selectedBranchId: null,
        msg: "Companies and branches fetched successfully",
      };
    }

    // 5. Parse assigned company and branch IDs
    const companyIds = [
      ...new Set(parseIds(user.company_id).map(Number)),
    ];

    const branchIds = [
      ...new Set(parseIds(user.branch_id).map(Number)),
    ];

    // 6. Fetch active assigned companies
    let companies = [];

    if (companyIds.length > 0) {
      const companyRequest = pool.request();

      companyIds.forEach((id, index) => {
        companyRequest.input(`companyId${index}`, sql.Int, id);
      });

      const companyInClause = companyIds
        .map((_, index) => `@companyId${index}`)
        .join(", ");

      const companyResult = await companyRequest.query(`
        SELECT id, company_name
        FROM dbo.companies
        WHERE id IN (${companyInClause})
          AND (
            active = 0
            OR active = '0'
            OR active IS NULL
          )
      `);

      const companyMap = new Map(
        (companyResult.recordset || []).map((company) => [
          Number(company.id),
          company,
        ])
      );

      // Preserve the order in users.company_id
      companies = companyIds
        .filter((id) => companyMap.has(id))
        .map((id) => companyMap.get(id));
    }

    // 7. Fetch active assigned branches
    const fetchedBranches =
      branchIds.length > 0
        ? await getActiveBranches(pool, branchIds)
        : [];

    const branchMap = new Map(
      (fetchedBranches || []).map((branch) => [
        Number(branch.id),
        branch,
      ])
    );

    // Preserve the order in users.branch_id
    const branches = branchIds
      .filter((id) => branchMap.has(id))
      .map((id) => branchMap.get(id));

    // 8. Determine whether automatic selection is enabled
    const loginCompanyValue = String(
      user.login_company ?? ""
    )
      .trim()
      .toLowerCase();

    const autoSelectCompany =
      user.login_company === true ||
      loginCompanyValue === "1" ||
      loginCompanyValue === "true";

    let selectedCompanyId = null;
    let selectedBranchId = null;

    console.log("BACKEND LOGIN COMPANY =", user.login_company);
    console.log("BACKEND LOGIN COMPANY TYPE =", typeof user.login_company);
    console.log("BACKEND AUTO SELECT COMPANY =", autoSelectCompany);

    // 9. Automatically select the first eligible company and branch
    if (autoSelectCompany) {
      for (const company of companies) {
        const companyId = Number(company.id);

        // Only consider active assigned branches belonging to this company.
        // Supports branch.company_id containing one or multiple IDs.
        const companyBranches = branches.filter((branch) => {
          const branchCompanyIds = parseIds(branch.company_id).map(Number);

          return branchCompanyIds.includes(companyId);
        });

        // Skip this company if no active assigned branch exists.
        if (companyBranches.length === 0) {
          continue;
        }

        selectedCompanyId = companyId;
        selectedBranchId = Number(companyBranches[0].id);

        // First eligible company in assignment order wins.
        break;
      }
    } else {
      // Preserve existing behavior for users without auto-selection.
      selectedBranchId =
        branches.length === 1
          ? Number(branches[0].id)
          : null;
    }

    console.log("ACTIVE ASSIGNED COMPANIES =", companies);
    console.log("ACTIVE ASSIGNED BRANCHES =", branches);
    console.log("SELECTED COMPANY ID =", selectedCompanyId);
    console.log("SELECTED BRANCH ID =", selectedBranchId);

    // 10. Response message
    let msg = "Companies and branches fetched successfully";

    if (companies.length === 0) {
      msg = "No active assigned companies found";
    } else if (branches.length === 0) {
      msg = "No active assigned branches found";
    } else if (
      autoSelectCompany &&
      (selectedCompanyId === null || selectedBranchId === null)
    ) {
      msg =
        "No active assigned branch found for any assigned company";
    }

    // 11. Return data
    return {
      user,
      isSuperAdmin: false,
      companies,
      branches,
      selectedCompanyId,
      selectedBranchId,
      msg,
    };
  } catch (error) {
    console.error(
      "GET COMPANIES BY EMAIL MODEL ERROR:",
      error
    );

    throw error;
  }
};

module.exports = {
  login,
  getCompaniesByEmail,
};
