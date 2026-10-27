const sql = require("mssql");
const { poolPromise } = require("../config/db");

const {
  createDirectories,
  generateEmployeePdf,
  generateSitePdf,
} = require("./salaryPdf");

// =====================================================
// HELPERS
// =====================================================

const num = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

const round = (value) => {
  return Math.round(num(value));
};

const getYear = (date) => {
  const d = new Date(date);
  return d.getFullYear();
};

const daysInMonth = (month, year) => {
  return new Date(year, month, 0).getDate();
};

const calculateWorkingDays = (month, year) => {
  const totalDays = daysInMonth(month, year);

  let count = 0;

  for (let day = 1; day <= totalDays; day++) {
    const date = new Date(year, month - 1, day);

    // Sunday excluded
    if (date.getDay() !== 0) {
      count++;
    }
  }

  return count;
};

// =====================================================
// SAFE BIGINT / TEMPLATE ID
// =====================================================

const getTemplateId = (emp) => {
  const templateId = Number(emp?.salary_template_id);

  if (!Number.isInteger(templateId) || templateId <= 0) {
    console.error("INVALID SALARY TEMPLATE:", {
      employee_code: emp?.employee_code,
      employee_id: emp?.id,

      salary_template_id: emp?.salary_template_id,

      salary_template: emp?.salary_template,
    });

    throw new Error(
      `Invalid salary_template_id for employee ${emp?.employee_code}. ` +
        `salary_template_id=${emp?.salary_template_id}, ` +
        `salary_template=${emp?.salary_template}`,
    );
  }

  return templateId;
};

// =====================================================
// OPERATOR CALCULATION
// =====================================================

const calculateOperator = (value, operator, compareValue, amount) => {
  const val = num(value);

  if (!operator) {
    return num(amount);
  }

  switch (String(operator).trim().toLowerCase()) {
    case "equal to":
      return val === num(compareValue) ? num(amount) : 0;

    case "greater than":
      return val > num(compareValue) ? num(amount) : 0;

    case "greater than or equal to":
      return val >= num(compareValue) ? num(amount) : 0;

    case "less than":
      return val < num(compareValue) ? num(amount) : 0;

    case "less than or equal to":
      return val <= num(compareValue) ? num(amount) : 0;

    case "between": {
      const split = String(compareValue || "")
        .split("-")
        .map(Number);

      if (
        split.length === 2 &&
        Number.isFinite(split[0]) &&
        Number.isFinite(split[1])
      ) {
        return val >= split[0] && val <= split[1] ? num(amount) : 0;
      }

      return 0;
    }

    default:
      return num(amount);
  }
};

// =====================================================
// DATE FORMAT
// =====================================================

const formatDate = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().split("T")[0];
};

// =====================================================
// MODEL
// =====================================================

const salaryModel = {
  // =================================================
  // DELETE OLD SALARY
  // =================================================

  deleteSalaryBySite: async ({ transaction, month, year, site_id }) => {
    const numericMonth = Number(month);
    const numericYear = Number(year);
    const numericSiteId = Number(site_id);

    if (
      !Number.isInteger(numericMonth) ||
      numericMonth < 1 ||
      numericMonth > 12
    ) {
      throw new Error(`Invalid month: ${month}`);
    }

    if (!Number.isInteger(numericYear) || numericYear < 2000) {
      throw new Error(`Invalid year: ${year}`);
    }

    if (!Number.isInteger(numericSiteId) || numericSiteId <= 0) {
      throw new Error(`Invalid site_id: ${site_id}`);
    }

    if (!transaction) {
      throw new Error("Transaction is required in deleteSalaryBySite");
    }

    try {
      console.log("==========================================");
      console.log("DELETE OLD SALARY DATA");
      console.log({
        month: numericMonth,
        year: numericYear,
        site_id: numericSiteId,
      });
      console.log("==========================================");

      // =====================================================
      // GET EXISTING SALARY SLIPS
      // =====================================================

      const salaryRequest = new sql.Request(transaction);

      salaryRequest
        .input("month", sql.Int, numericMonth)
        .input("year", sql.Int, numericYear)
        .input("site_id", sql.BigInt, numericSiteId);

      const salaryResult = await salaryRequest.query(`
                SELECT id
                FROM salary_slip
                WHERE at_month = @month
                  AND at_year = @year
                  AND site_id = @site_id
            `);

      console.log("OLD SALARY SLIPS FOUND:", salaryResult.recordset.length);

      // =====================================================
      // DELETE CHILD DATA
      // =====================================================

      for (const row of salaryResult.recordset) {
        const salarySlipId = Number(row.id);

        // =================================================
        // DELETE EARNINGS
        // =================================================

        await new sql.Request(transaction).input(
          "parent_id",
          sql.BigInt,
          salarySlipId,
        ).query(`
                    DELETE FROM ss_earning
                    WHERE parent_id = @parent_id
                `);

        // =================================================
        // DELETE DEDUCTIONS
        // =================================================

        await new sql.Request(transaction).input(
          "parent_id",
          sql.BigInt,
          salarySlipId,
        ).query(`
                    DELETE FROM ss_deduction
                    WHERE parent_id = @parent_id
                `);

        // =================================================
        // DELETE SALARY SLIP
        // =================================================

        await new sql.Request(transaction).input("id", sql.BigInt, salarySlipId)
          .query(`
                    DELETE FROM salary_slip
                    WHERE id = @id
                `);

        console.log(`Deleted salary slip: ${salarySlipId}`);
      }

      console.log("OLD SALARY DATA DELETE COMPLETED");

      return true;
    } catch (error) {
      console.error("DELETE OLD SALARY DATA ERROR:", error);

      // IMPORTANT:
      // NO rollback here.
      // Outer generateSalaryBySite() will rollback.

      throw error;
    }
  },

  // =================================================
  // GET BILLING COMPANY
  // =================================================

  getBillingCompany: async (siteId) => {
    const pool = await poolPromise;

    const result = await pool
      .request()

      .input("site_id", sql.BigInt, Number(siteId)).query(`

                    SELECT TOP 1

                        cr.id AS site_id,

                        cr.client_code,

                        cr.site_name,

                        cr.client_id,

                        nc.id AS billing_company_id,

                        nc.company_name AS billing_company

                    FROM client_rates cr

                    LEFT JOIN new_client nc

                        ON TRY_CONVERT(
                            BIGINT,
                            nc.id
                        )
                        =
                        TRY_CONVERT(
                            BIGINT,
                            cr.client_id
                        )

                    WHERE TRY_CONVERT(
                        BIGINT,
                        cr.id
                    )
                    =
                    @site_id

                `);

    return result.recordset[0] || null;
  },

  // =================================================
  // GET EMPLOYEES
  // =================================================

  getEmployeesBySite: async (siteId, month, year) => {
    const pool = await poolPromise;

    const result = await pool
      .request()

      .input("site_id", sql.BigInt, Number(siteId))

      .input("month", sql.Int, Number(month))

      .input("year", sql.Int, Number(year)).query(`

                    SELECT DISTINCT

                        e.*

                    FROM employee e

                    INNER JOIN emp_attendance ea

                        ON TRY_CAST(
                            ea.emp_code
                            AS VARCHAR(100)
                        )
                        =
                        TRY_CAST(
                            e.employee_code
                            AS VARCHAR(100)
                        )

                    WHERE TRY_CAST(
                        ea.site_id
                        AS BIGINT
                    )
                    =
                    @site_id

                    AND MONTH(
                        ea.check_in_date
                    )
                    =
                    @month

                    AND YEAR(
                        ea.check_in_date
                    )
                    =
                    @year

                    AND (
                        ea.active = 0
                        OR ea.active IS NULL
                    )

                    AND (
                        e.active = 0
                        OR e.active IS NULL
                    )

                `);

    return result.recordset;
  },

  // =================================================
  // GET EMPLOYEE SITES
  // =================================================

  getEmployeeSites: async (employeeCode, month, year) => {
    const pool = await poolPromise;

    const result = await pool
      .request()

      .input("employee_code", sql.VarChar(100), String(employeeCode))

      .input("month", sql.Int, Number(month))

      .input("year", sql.Int, Number(year)).query(`

                    SELECT DISTINCT

                        ea.site_id,

                        cr.client_code,

                        cr.site_name,

                        cr.client_id,

                        nc.id AS new_client_id,

                        nc.company_name AS nc_company_name,

                        COALESCE(
                            NULLIF(
                                LTRIM(
                                    RTRIM(
                                        nc.company_name
                                    )
                                ),
                                ''
                            ),

                            NULLIF(
                                LTRIM(
                                    RTRIM(
                                        TRY_CONVERT(
                                            VARCHAR(500),
                                            cr.client_name
                                        )
                                    )
                                ),
                                ''
                            ),

                            ''
                        )
                        AS client_name

                    FROM emp_attendance ea

                    LEFT JOIN client_rates cr

                        ON TRY_CONVERT(
                            BIGINT,
                            cr.id
                        )
                        =
                        TRY_CONVERT(
                            BIGINT,
                            ea.site_id
                        )

                    LEFT JOIN new_client nc

                        ON TRY_CONVERT(
                            BIGINT,
                            nc.id
                        )
                        =
                        TRY_CONVERT(
                            BIGINT,
                            cr.client_id
                        )

                    WHERE

                        TRY_CAST(
                            ea.emp_code
                            AS VARCHAR(100)
                        )
                        =
                        @employee_code

                    AND MONTH(
                        ea.check_in_date
                    )
                    =
                    @month

                    AND YEAR(
                        ea.check_in_date
                    )
                    =
                    @year

                    AND (
                        ea.active = 0
                        OR ea.active IS NULL
                    )

                `);

    console.log("GET EMPLOYEE SITES CLIENT DATA:", result.recordset);

    return result.recordset;
  },

  // =================================================
  // ATTENDANCE COUNT
  // =================================================

  // =====================================================
  // GET ATTENDANCE COUNT
  // =====================================================
  getAttendanceCount: async ({
    transaction,
    siteId,
    employeeCode,
    rank,
    month,
    year,
    status,
  }) => {
    if (!transaction) {
      throw new Error("Transaction is required in getAttendanceCount");
    }

    const numericSiteId = Number(siteId);
    const numericMonth = Number(month);
    const numericYear = Number(year);

    if (!Number.isInteger(numericSiteId) || numericSiteId <= 0) {
      throw new Error(`Invalid siteId in getAttendanceCount: ${siteId}`);
    }

    if (
      !Number.isInteger(numericMonth) ||
      numericMonth < 1 ||
      numericMonth > 12
    ) {
      throw new Error(`Invalid month in getAttendanceCount: ${month}`);
    }

    if (!Number.isInteger(numericYear) || numericYear < 2000) {
      throw new Error(`Invalid year in getAttendanceCount: ${year}`);
    }

    const request = transaction.request();

    request
      .input("site_id", sql.BigInt, numericSiteId)
      .input("employee_code", sql.VarChar(100), String(employeeCode))
      .input("month", sql.Int, numericMonth)
      .input("year", sql.Int, numericYear)
      .input("status", sql.VarChar(50), String(status));

    const result = await request.query(`

            SELECT
                COUNT(*) AS total_days

            FROM emp_attendance ea

            INNER JOIN attendance att

                ON TRY_CAST(
                    att.emp_code
                    AS VARCHAR(100)
                )
                =
                TRY_CAST(
                    ea.emp_code
                    AS VARCHAR(100)
                )

                AND TRY_CAST(
                    att.site_id
                    AS BIGINT
                )
                =
                TRY_CAST(
                    ea.site_id
                    AS BIGINT
                )

                AND TRY_CAST(
                    att.at_day
                    AS INT
                )
                =
                DAY(
                    ea.check_in_date
                )

                AND TRY_CAST(
                    att.at_month
                    AS INT
                )
                =
                MONTH(
                    ea.check_in_date
                )

                AND TRY_CAST(
                    att.at_year
                    AS INT
                )
                =
                YEAR(
                    ea.check_in_date
                )

                AND (
                    att.active = 0
                    OR att.active IS NULL
                )

            WHERE TRY_CAST(
                ea.site_id
                AS BIGINT
            ) = @site_id

            AND TRY_CAST(
                ea.emp_code
                AS VARCHAR(100)
            ) = @employee_code

            AND MONTH(
                ea.check_in_date
            ) = @month

            AND YEAR(
                ea.check_in_date
            ) = @year

            AND att.status = @status

            AND (
                ea.active = 0
                OR ea.active IS NULL
            )

        `);

    return num(result.recordset[0]?.total_days);
  },

  // =================================================
  // GET SITE
  // =================================================

  getSite: async (siteId) => {
    const pool = await poolPromise;

    const result = await pool
      .request()

      .input("id", sql.BigInt, Number(siteId)).query(`

                    SELECT TOP 1 *

                    FROM client_rates

                    WHERE TRY_CAST(
                        id AS BIGINT
                    )
                    =
                    @id

                `);

    return result.recordset[0] || null;
  },

  // =================================================
  // GET CLIENT
  // =================================================

  getClient: async (clientId) => {
    const pool = await poolPromise;

    const result = await pool
      .request()

      .input("id", sql.BigInt, Number(clientId)).query(`

                    SELECT TOP 1 *

                    FROM new_client

                    WHERE TRY_CAST(
                        id AS BIGINT
                    )
                    =
                    @id

                `);

    return result.recordset[0] || null;
  },

  // =================================================
  // GET EARNINGS
  // =================================================

  getEarnings: async ({ transaction, templateId }) => {
    const numericTemplateId = Number(templateId);

    if (!Number.isInteger(numericTemplateId) || numericTemplateId <= 0) {
      throw new Error(`Invalid templateId in getEarnings: ${templateId}`);
    }

    if (!transaction) {
      throw new Error("Transaction is required in getEarnings");
    }

    const request = transaction.request();

    const result = await request.input("tmpl_id", sql.BigInt, numericTemplateId)
      .query(`

                SELECT *

                FROM salary_earning

                WHERE TRY_CAST(
                    tmpl_id
                    AS BIGINT
                ) = @tmpl_id

                AND (
                    active = 0
                    OR active IS NULL
                )

                ORDER BY id ASC

            `);

    return result.recordset || [];
  },

  getDeductions: async ({ transaction, templateId }) => {
    const numericTemplateId = Number(templateId);

    if (!Number.isInteger(numericTemplateId) || numericTemplateId <= 0) {
      throw new Error(`Invalid templateId in getDeductions: ${templateId}`);
    }

    if (!transaction) {
      throw new Error("Transaction is required in getDeductions");
    }

    const request = transaction.request();

    const result = await request.input("tmpl_id", sql.BigInt, numericTemplateId)
      .query(`

                SELECT *

                FROM salary_deduction

                WHERE TRY_CAST(
                    tmpl_id
                    AS BIGINT
                ) = @tmpl_id

                AND (
                    active = 0
                    OR active IS NULL
                )

                ORDER BY id ASC

            `);

    return result.recordset || [];
  },

  // =====================================================
  // GET SALARY TEMPLATE
  // =====================================================
  getSalaryTemplate: async ({
    transaction = null,
    employeeId,
    employeeCode,
    month,
    year,
  }) => {
    try {
      // =====================================================
      // REQUEST HELPER
      // =====================================================
      const decimalPoint = 2;
      const createRequest = async () => {
        if (transaction && typeof transaction.request === "function") {
          return transaction.request();
        }

        const pool = await poolPromise;

        return pool.request();
      };

      // =====================================================
      // HELPERS
      // =====================================================

      const toNumber = (value) => {
        if (value === null || value === undefined || value === "") {
          return 0;
        }

        const numberValue = Number(value);

        return Number.isFinite(numberValue) ? numberValue : 0;
      };

      const normalizeName = (value) => {
        return String(value || "")
          .trim()
          .toUpperCase()
          .replace(/[\s._-]+/g, "");
      };

      const normalizeCalculateOn = (value) => {
        return String(value || "")
          .trim()
          .toUpperCase()
          .replace(/[\s._-]+/g, "");
      };

      const roundAmount = (value) => {
        return Number(toNumber(value).toFixed(decimalPoint));
      };

      // =====================================================
      // GET EMPLOYEE
      // =====================================================

      const hasEmployeeId =
        employeeId !== undefined && employeeId !== null && employeeId !== "";

      const hasEmployeeCode =
        employeeCode !== undefined &&
        employeeCode !== null &&
        String(employeeCode).trim() !== "";

      if (!hasEmployeeId && !hasEmployeeCode) {
        throw new Error("employeeId or employeeCode is required");
      }

      const employeeRequest = await createRequest();

      let employeeQuery;

      if (hasEmployeeId) {
        const parsedEmployeeId = Number(employeeId);

        if (!Number.isInteger(parsedEmployeeId) || parsedEmployeeId <= 0) {
          throw new Error(`Invalid employeeId: ${employeeId}`);
        }

        employeeRequest.input("employeeId", sql.BigInt, parsedEmployeeId);

        employeeQuery = `

                SELECT TOP 1

                    id,
                    employee_code,
                    salary_template_id,
                    salary_template

                FROM employee

                WHERE id = @employeeId

                AND (
                    active = 0
                    OR active IS NULL
                )

            `;
      } else {
        const cleanEmployeeCode = String(employeeCode).trim();

        employeeRequest.input(
          "employeeCode",
          sql.VarChar(100),
          cleanEmployeeCode,
        );

        employeeQuery = `

                SELECT TOP 1

                    id,
                    employee_code,
                    salary_template_id,
                    salary_template

                FROM employee

                WHERE employee_code = @employeeCode

                AND (
                    active = 0
                    OR active IS NULL
                )

            `;
      }

      console.log("==========================================");

      console.log("GETTING EMPLOYEE");

      console.log("==========================================");

      const employeeResult = await employeeRequest.query(employeeQuery);

      if (!employeeResult.recordset || employeeResult.recordset.length === 0) {
        throw new Error(
          `Employee not found. ID: ${employeeId}, Code: ${employeeCode}`,
        );
      }

      const employee = employeeResult.recordset[0];

      console.log("EMPLOYEE FOUND:", {
        id: employee.id,
        employee_code: employee.employee_code,
        salary_template_id: employee.salary_template_id,
      });

      // =====================================================
      // TEMPLATE ID
      // =====================================================

      const salaryTemplateId = Number(employee.salary_template_id);

      if (!Number.isInteger(salaryTemplateId) || salaryTemplateId <= 0) {
        throw new Error(
          `Salary template not assigned to employee ${employee.employee_code}`,
        );
      }

      // =====================================================
      // GET SALARY TEMPLATE
      // =====================================================

      const templateRequest = await createRequest();

      templateRequest.input("templateId", sql.BigInt, salaryTemplateId);

      const templateResult = await templateRequest.query(`

                SELECT TOP 1

                    *

                FROM salary_template

                WHERE id = @templateId

                AND (
                    active = 0
                    OR active IS NULL
                )

            `);

      if (!templateResult.recordset || templateResult.recordset.length === 0) {
        throw new Error(`Salary template ${salaryTemplateId} not found`);
      }

      const salaryTemplate = templateResult.recordset[0];

      console.log("SALARY TEMPLATE FOUND:", {
        id: salaryTemplate.id,
        template_name: salaryTemplate.template_name,
        basic_salary: salaryTemplate.basic_salary,
        hra: salaryTemplate.hra,
        gross_salary: salaryTemplate.gross_salary,
      });

      // =====================================================
      // GET EARNINGS
      // =====================================================

      const earningRequest = await createRequest();

      earningRequest.input("templateId", sql.BigInt, salaryTemplateId);

      const earningResult = await earningRequest.query(`

                SELECT *

                FROM salary_earning

                WHERE TRY_CAST(
                    tmpl_id AS BIGINT
                ) = @templateId

                AND (
                    active = 0
                    OR active IS NULL
                )

                ORDER BY id ASC

            `);

      const earnings = earningResult.recordset || [];

      console.log("TOTAL SALARY EARNINGS:", earnings.length);

      // =====================================================
      // GET DEDUCTIONS
      // =====================================================

      const deductionRequest = await createRequest();

      deductionRequest.input("templateId", sql.BigInt, salaryTemplateId);

      const deductionResult = await deductionRequest.query(`

                SELECT *

                FROM salary_deduction

                WHERE TRY_CAST(
                    tmpl_id AS BIGINT
                ) = @templateId

                AND (
                    active = 0
                    OR active IS NULL
                )

                ORDER BY id ASC

            `);

      const deductions = deductionResult.recordset || [];

      console.log("TOTAL SALARY DEDUCTIONS:", deductions.length);

      // =====================================================
      // EARNING MAP
      // =====================================================

      const earningMap = {};

      for (const earning of earnings) {
        const key = normalizeName(earning.earning_name);

        if (!key) {
          continue;
        }

        earningMap[key] = toNumber(earning.earning_amount);
      }

      // =====================================================
      // DEDUCTION MAP
      // =====================================================

      const deductionMap = {};

      for (const deduction of deductions) {
        const key = normalizeName(deduction.deduction_name);

        if (!key) {
          continue;
        }

        deductionMap[key] = deduction;
      }

      // =====================================================
      // GET EARNING
      // =====================================================

      const getEarning = (...names) => {
        for (const name of names) {
          const key = normalizeName(name);

          if (earningMap[key] !== undefined) {
            return toNumber(earningMap[key]);
          }
        }

        return 0;
      };

      // =====================================================
      // GET DEDUCTION RULE
      // =====================================================

      const getDeductionRule = (...names) => {
        for (const name of names) {
          const key = normalizeName(name);

          if (deductionMap[key] !== undefined) {
            return deductionMap[key];
          }
        }

        return null;
      };

      // =====================================================
      // GET DEDUCTION FIXED VALUE
      // =====================================================

      const getDeductionAmount = (...names) => {
        const rule = getDeductionRule(...names);

        if (!rule) {
          return 0;
        }

        return roundAmount(rule.deduction_amount);
      };

      // =====================================================
      // BASIC SALARY
      // =====================================================

      const basicSalary = toNumber(salaryTemplate.basic_salary);

      // =====================================================
      // HRA
      // =====================================================

      const hra = toNumber(salaryTemplate.hra);

      // =====================================================
      // EARNINGS
      // =====================================================

      const vda = getEarning("VDA", "DA", "VARIABLE DEARNESS ALLOWANCE");

      const specialAllow = getEarning("SPECIAL ALLOWANCE", "SPECIAL ALLOW");

      const otherAllow = getEarning("OTHER ALLOWANCE", "OTHER ALLOW");

      const lww = getEarning("LWW", "LEAVE WAGES");

      const bonus = getEarning("BONUS");

      const fixedLeaveWages = getEarning("FIXED LEAVE WAGES");

      const fixedUniformWages = getEarning("FIXED UNIFORM WAGES");

      const anyOther = getEarning("ANY OTHER", "OTHER");

      // =====================================================
      // BASIC + DA
      // =====================================================

      const basicDa = roundAmount(basicSalary + vda);

      // =====================================================
      // CALCULATED GROSS
      // =====================================================

      const calculatedGross = roundAmount(
        basicSalary +
          hra +
          vda +
          specialAllow +
          otherAllow +
          lww +
          bonus +
          fixedLeaveWages +
          fixedUniformWages +
          anyOther,
      );

      // =====================================================
      // TEMPLATE GROSS
      // =====================================================

      const templateGross = toNumber(salaryTemplate.gross_salary);

      const grossSalary =
        templateGross > 0 ? roundAmount(templateGross) : calculatedGross;

      // =====================================================
      // TEMPLATE DEDUCTION CALCULATOR
      // =====================================================

      const calculateTemplateDeduction = ({
        rule,
        basic = 0,
        gross = 0,
        basicDa = 0,
      }) => {
        if (!rule) {
          return 0;
        }

        const calculateOn = normalizeCalculateOn(rule.dd_calculateon);

        const rate = toNumber(rule.deduction_rate);

        const amount = toNumber(rule.deduction_amount);

        let base = 0;

        // =================================================
        // BASIC
        // =================================================

        if (calculateOn === "BASIC") {
          base = toNumber(basic);
        }

        // =================================================
        // BASIC + DA
        // =================================================
        else if (calculateOn === "BASIC+DA" || calculateOn === "BASICDA") {
          base = toNumber(basicDa);
        }

        // =================================================
        // GROSS
        // =================================================
        else if (
          calculateOn === "GROSS" ||
          calculateOn === "GROSSSALARY" ||
          calculateOn === "ONGROSSSALARY"
        ) {
          base = toNumber(gross);
        }

        // =================================================
        // AT ACTUAL
        // =================================================
        else if (calculateOn === "ATACTUAL") {
          return roundAmount(amount);
        }

        // =================================================
        // DEFAULT
        // =================================================
        else {
          base = toNumber(basic);
        }

        // =================================================
        // RATE
        // =================================================

        if (rate > 0) {
          return roundAmount((base * rate) / 100);
        }

        // =================================================
        // FIXED AMOUNT
        // =================================================

        return roundAmount(amount);
      };

      // =====================================================
      // PF RULES
      // =====================================================

      const employeePfRule = getDeductionRule(
        "PF",
        "P.F.",
        "EMPLOYEE PF",
        "EMP PF",
      );

      const employerPfRule = getDeductionRule(
        "EMPLOYER PF",
        "CMP PF",
        "COMPANY PF",
      );

      // =====================================================
      // ESIC RULES
      // =====================================================

      const employeeEsicRule = getDeductionRule(
        "ESIC",
        "EMPLOYEE ESIC",
        "EMP ESIC",
      );

      const employerEsicRule = getDeductionRule(
        "EMPLOYER ESIC",
        "CMP ESIC",
        "COMPANY ESIC",
      );

      // =====================================================
      // LWF RULES
      // =====================================================

      const employeeLwfRule = getDeductionRule(
        "LWF",
        "EMPLOYEE LWF",
        "EMP LWF",
        "MLWF",
      );

      const employerLwfRule = getDeductionRule(
        "EMPLOYER LWF",
        "CMP LWF",
        "EMP LWF",
        "EMPLOYER MLWF",
      );

      // =====================================================
      // PF CALCULATION
      // =====================================================

      const deductPf = calculateTemplateDeduction({
        rule: employeePfRule,
        basic: basicSalary,
        gross: grossSalary,
        basicDa,
      });

      const empPf = calculateTemplateDeduction({
        rule: employerPfRule,
        basic: basicSalary,
        gross: grossSalary,
        basicDa,
      });

      const pfWages = employeePfRule
        ? normalizeCalculateOn(employeePfRule.dd_calculateon) ===
            "GROSSSALARY" ||
          normalizeCalculateOn(employeePfRule.dd_calculateon) ===
            "ONGROSSSALARY"
          ? grossSalary
          : normalizeCalculateOn(employeePfRule.dd_calculateon) === "BASICDA" ||
              normalizeCalculateOn(employeePfRule.dd_calculateon) === "BASIC+DA"
            ? basicDa
            : basicSalary
        : 0;

      // =====================================================
      // ESIC CALCULATION
      // =====================================================

      const deductEsic = calculateTemplateDeduction({
        rule: employeeEsicRule,
        basic: basicSalary,
        gross: grossSalary,
        basicDa,
      });

      const empEsic = calculateTemplateDeduction({
        rule: employerEsicRule,
        basic: basicSalary,
        gross: grossSalary,
        basicDa,
      });

      const esicWages = employeeEsicRule
        ? normalizeCalculateOn(employeeEsicRule.dd_calculateon) ===
            "GROSSSALARY" ||
          normalizeCalculateOn(employeeEsicRule.dd_calculateon) ===
            "ONGROSSSALARY"
          ? grossSalary
          : normalizeCalculateOn(employeeEsicRule.dd_calculateon) ===
                "BASICDA" ||
              normalizeCalculateOn(employeeEsicRule.dd_calculateon) ===
                "BASIC+DA"
            ? basicDa
            : basicSalary
        : 0;

      // =====================================================
      // LWF CALCULATION
      // =====================================================

      const deductLwf = calculateTemplateDeduction({
        rule: employeeLwfRule,
        basic: basicSalary,
        gross: grossSalary,
        basicDa,
      });

      const empLwf = calculateTemplateDeduction({
        rule: employerLwfRule,
        basic: basicSalary,
        gross: grossSalary,
        basicDa,
      });

      // =====================================================
      // PT
      // =====================================================

      const ptRule = getDeductionRule("PT", "P.T.", "PROFESSIONAL TAX");

      const deductPt = calculateTemplateDeduction({
        rule: ptRule,
        basic: basicSalary,
        gross: grossSalary,
        basicDa,
      });

      // =====================================================
      // OTHER DEDUCTIONS
      // =====================================================

      const loanRule = getDeductionRule("LOAN");

      const idRule = getDeductionRule("ID");

      const recoveryRule = getDeductionRule("RECOVERY");

      const installmentRule = getDeductionRule("INSTALLMENT", "INSTALLMENTS");

      const otherDeductionRule = getDeductionRule("OTHER DEDUCTION");

      const uniformRule = getDeductionRule("UNIFORM");

      const deductLoan = loanRule
        ? calculateTemplateDeduction({
            rule: loanRule,
            basic: basicSalary,
            gross: grossSalary,
            basicDa,
          })
        : 0;

      const deductId = idRule
        ? calculateTemplateDeduction({
            rule: idRule,
            basic: basicSalary,
            gross: grossSalary,
            basicDa,
          })
        : 0;

      const deductRecovery = recoveryRule
        ? calculateTemplateDeduction({
            rule: recoveryRule,
            basic: basicSalary,
            gross: grossSalary,
            basicDa,
          })
        : 0;

      const deductInstallment = installmentRule
        ? calculateTemplateDeduction({
            rule: installmentRule,
            basic: basicSalary,
            gross: grossSalary,
            basicDa,
          })
        : 0;

      const deductOther = otherDeductionRule
        ? calculateTemplateDeduction({
            rule: otherDeductionRule,
            basic: basicSalary,
            gross: grossSalary,
            basicDa,
          })
        : 0;

      const deductUniform = uniformRule
        ? calculateTemplateDeduction({
            rule: uniformRule,
            basic: basicSalary,
            gross: grossSalary,
            basicDa,
          })
        : 0;

      // =====================================================
      // TOTAL EMPLOYEE DEDUCTION
      // =====================================================

      const totalDeduction = roundAmount(
        deductPf +
          deductPt +
          deductEsic +
          deductLwf +
          deductLoan +
          deductId +
          deductRecovery +
          deductInstallment +
          deductOther +
          deductUniform,
      );

      // =====================================================
      // NET TAKE HOME
      // =====================================================

      const netTakeHome = roundAmount(grossSalary - totalDeduction);

      // =====================================================
      // EMPLOYER CTC
      // =====================================================

      const empCtc = roundAmount(grossSalary + empPf + empEsic + empLwf);

      // =====================================================
      // DEBUG
      // =====================================================

      console.log("==========================================");

      console.log("🔥 SALARY TEMPLATE CALCULATION");

      console.log("Employee       =", employee.employee_code);

      console.log("Template ID    =", salaryTemplateId);

      console.log("Basic          =", basicSalary);

      console.log("Basic + DA     =", basicDa);

      console.log("Gross          =", grossSalary);

      console.log("------------------------------------------");

      console.log("PF WAGES       =", pfWages);

      console.log("EMP PF         =", deductPf);

      console.log("CMP PF         =", empPf);

      console.log("------------------------------------------");

      console.log("ESIC WAGES     =", esicWages);

      console.log("EMP ESIC       =", deductEsic);

      console.log("CMP ESIC       =", empEsic);

      console.log("------------------------------------------");

      console.log("EMP LWF        =", deductLwf);

      console.log("CMP LWF        =", empLwf);

      console.log("PT             =", deductPt);

      console.log("TOTAL DEDUCT   =", totalDeduction);

      console.log("NET TAKE HOME  =", netTakeHome);

      console.log("EMPLOYER CTC   =", empCtc);

      console.log("==========================================");

      // =====================================================
      // FINAL TEMPLATE
      // =====================================================

      const finalTemplate = {
        ...salaryTemplate,

        employee_id: employee.id,

        employee_code: employee.employee_code,

        salary_template_id: salaryTemplateId,

        // =================================================
        // SALARY
        // =================================================

        basic_salary: basicSalary,

        basic: basicSalary,

        hra,

        vda,

        basic_da: basicDa,

        special_allow: specialAllow,

        special_allowance: specialAllow,

        other_allow: otherAllow,

        other_allowance: otherAllow,

        lww,

        bonus,

        fixed_leave_wages: fixedLeaveWages,

        fixed_uniform_wages: fixedUniformWages,

        any_other: anyOther,

        // =================================================
        // GROSS
        // =================================================

        calculated_gross: calculatedGross,

        gross_salary: grossSalary,

        gross: grossSalary,

        // =================================================
        // PF
        // =================================================

        pf_wages: roundAmount(pfWages),

        deduct_pf: roundAmount(deductPf),

        emp_pf: roundAmount(empPf),

        // =================================================
        // ESIC
        // =================================================

        esic_wages: roundAmount(esicWages),

        deduct_esic: roundAmount(deductEsic),

        emp_esic: roundAmount(empEsic),

        // =================================================
        // LWF
        // =================================================

        deduct_lwf: roundAmount(deductLwf),

        emp_lwf: roundAmount(empLwf),

        // =================================================
        // PT
        // =================================================

        deduct_pt: roundAmount(deductPt),

        // =================================================
        // OTHER DEDUCTIONS
        // =================================================

        deduct_loan: roundAmount(deductLoan),

        deduct_id: roundAmount(deductId),

        deduct_recovery: roundAmount(deductRecovery),

        deduct_installment: roundAmount(deductInstallment),

        deduct_other: roundAmount(deductOther),

        deduct_uniform: roundAmount(deductUniform),

        // =================================================
        // TOTAL
        // =================================================

        total_deduction: roundAmount(totalDeduction),

        net_take_home: roundAmount(netTakeHome),

        emp_ctc: roundAmount(empCtc),

        // =================================================
        // ORIGINAL ARRAYS
        // =================================================

        earnings,

        deductions,
      };

      // =====================================================
      // SUCCESS
      // =====================================================

      console.log("GET SALARY TEMPLATE SUCCESS:", {
        employee: employee.employee_code,

        templateId: salaryTemplateId,

        basic: finalTemplate.basic_salary,

        gross: finalTemplate.gross_salary,

        pfWages: finalTemplate.pf_wages,

        employeePf: finalTemplate.deduct_pf,

        employerPf: finalTemplate.emp_pf,

        esicWages: finalTemplate.esic_wages,

        employeeEsic: finalTemplate.deduct_esic,

        employerEsic: finalTemplate.emp_esic,

        employeeLwf: finalTemplate.deduct_lwf,

        employerLwf: finalTemplate.emp_lwf,

        pt: finalTemplate.deduct_pt,

        totalDeduction: finalTemplate.total_deduction,

        netTakeHome: finalTemplate.net_take_home,

        empCtc: finalTemplate.emp_ctc,
      });

      return [finalTemplate];
    } catch (error) {
      console.error("=================================");

      console.error("GET SALARY TEMPLATE ERROR:", error.message);

      console.error("CODE:", error.code);

      console.error("STACK:", error.stack);

      console.error("=================================");

      throw error;
    }
  },

  // =====================================================
  // PRINT SALARY BY EMPLOYEE
  // Salary Slip + Employee Details + Daily Attendance
  // =====================================================
 getPrintSalaryByEmployee: async ({ employee_id, site_id, month, year }) => {
    try {
      const pool = await poolPromise;

      // =====================================================
      // VALIDATION
      // =====================================================
      if (
        month === undefined ||
        month === null ||
        month === "" ||
        year === undefined ||
        year === null ||
        year === ""
      ) {
        throw new Error("Month and year are required");
      }

      if (!employee_id && !site_id) {
        throw new Error("Either employee_id or site_id is required");
      }

      const monthNumber = Number(month);
      const yearNumber = Number(year);

      if (
        !Number.isInteger(monthNumber) ||
        monthNumber < 1 ||
        monthNumber > 12
      ) {
        throw new Error("Invalid month");
      }

      if (!Number.isInteger(yearNumber) || yearNumber < 2000) {
        throw new Error("Invalid year");
      }

      // =====================================================
      // SALARY REQUEST
      // =====================================================
      const request = pool
        .request()
        .input("month", sql.VarChar, String(monthNumber))
        .input("year", sql.VarChar, String(yearNumber));

      // =====================================================
      // SALARY WHERE CONDITIONS
      // =====================================================
      let whereConditions = `
      CAST(ss.at_month AS VARCHAR) = @month
      AND CAST(ss.at_year AS VARCHAR) = @year
      AND ISNULL(ss.active, 0) = 0
    `;

      // =====================================================
      // EMPLOYEE FILTER
      // =====================================================
      if (employee_id) {
        request.input("employee_id", sql.VarChar, String(employee_id));

        whereConditions += `
        AND CAST(ss.emp_id AS VARCHAR) = @employee_id
      `;
      }

      // =====================================================
      // SITE FILTER
      // =====================================================
      if (site_id) {
        request.input("site_id", sql.VarChar, String(site_id));

        whereConditions += `
        AND CAST(ss.site_id AS VARCHAR) = @site_id
      `;
      }

      // =====================================================
      // GET SALARY + EMPLOYEE DATA
      // =====================================================
      const result = await request.query(`
      SELECT
        ss.*,

        -- =================================================
        -- EMPLOYEE DETAILS
        -- =================================================
        e.emp_full_name AS emp_name,

        e.employee_code AS emp_code,

        e.employee_code,

        e.rank,

        e.date_of_joining,

        e.dob,

        e.uan_no,

        e.pancard_no,

        e.aadhar_no,

        e.esis_no,

        e.pf_no,

        e.pf_applicable,

        e.bank_name,

        e.account_no,

        e.bank_ifsc AS ifsc_code,

        e.ac_holder_name,

        e.card_no,

        e.gross_salary AS employee_gross_salary,

        e.gross_salary_type,

        e.basic_salary,

        e.basic_salary_type,

        -- =================================================
        -- SITE NAME
        -- =================================================
        COALESCE(
          NULLIF(ss.site_name, ''),
          e.site_name
        ) AS final_site_name,

        -- =================================================
        -- CLIENT NAME
        -- =================================================
        COALESCE(
          NULLIF(ss.client_name, ''),
          e.client_name
        ) AS final_client_name

      FROM salary_slip ss

      LEFT JOIN employee e
        ON CAST(e.id AS VARCHAR) =
           CAST(ss.emp_id AS VARCHAR)

      WHERE
        ${whereConditions}

      ORDER BY
        e.emp_full_name ASC
    `);

      const employees = result.recordset || [];

      // =====================================================
      // NO SALARY DATA
      // =====================================================
      if (employees.length === 0) {
        return [];
      }

      // =====================================================
      // MONTH DAYS
      // Example:
      // July 2026 = 31
      // February 2026 = 28
      // =====================================================
      const daysInMonth = new Date(yearNumber, monthNumber, 0).getDate();

      // =====================================================
      // FINAL DATA
      // =====================================================
      const finalData = [];

      for (const employee of employees) {
        // ===================================================
        // SALARY VALUES
        // ===================================================
        const totalEarning = Number(employee.total_earning || 0);

        const totalDeduction = Number(employee.total_deduction || 0);

        const grossSalary = Number(employee.gross_salary || 0);

        // IMPORTANT:
        // Gross Salary itself is Net Payable
        // Do NOT subtract deduction again.
        const netPayable = grossSalary;

        // ===================================================
        // ATTENDANCE REQUEST
        // ===================================================
        const attendanceRequest = pool
          .request()
          .input("attendance_employee_id", sql.VarChar, String(employee.emp_id))
          .input("attendance_site_id", sql.VarChar, String(employee.site_id))
          .input("attendance_month", sql.Int, monthNumber)
          .input("attendance_year", sql.Int, yearNumber);

        // ===================================================
        // DAILY ATTENDANCE
        //
        // Directly from emp_attendance
        //
        // P = Present
        // A = Absent
        // W = Weekly Off
        // Anything else = empty
        //
        // If duplicate records exist for same employee/date,
        // latest ID is selected.
        // ===================================================
        const attendanceResult = await attendanceRequest.query(`
          WITH AttendanceData AS (
            SELECT
              id,
              employee_id,
              emp_code,
              check_in_date,
              emp_status,
              emp_name,
              site_id,
              site_name,
              client_name,
              emp_worked_hours,
              site_hours,
              ot_hours,

              ROW_NUMBER() OVER (
                PARTITION BY
                  CAST(employee_id AS VARCHAR),
                  CAST(TRY_CONVERT(date, check_in_date) AS DATE)

                ORDER BY
                  id DESC
              ) AS rn

            FROM emp_attendance

            WHERE
              CAST(employee_id AS VARCHAR) =
                @attendance_employee_id

              AND CAST(site_id AS VARCHAR) =
                @attendance_site_id

              AND MONTH(
                TRY_CONVERT(date, check_in_date)
              ) = @attendance_month

              AND YEAR(
                TRY_CONVERT(date, check_in_date)
              ) = @attendance_year

              AND ISNULL(active, 0) = 0
          )

          SELECT
            id,
            employee_id,
            emp_code,
            check_in_date,
            emp_status,
            emp_name,
            site_id,
            site_name,
            client_name,
            emp_worked_hours,
            site_hours,
            ot_hours

          FROM AttendanceData

          WHERE rn = 1

          ORDER BY
            TRY_CONVERT(date, check_in_date) ASC
        `);

        const attendanceRows = attendanceResult.recordset || [];
// ===================================================
// EMPLOYEE EARNINGS
// ===================================================
// ===================================================
// EMPLOYEE EARNINGS FROM ss_earning
// ===================================================
const earningResult = await pool
  .request()
  .input("earning_parent_id", sql.Int, Number(employee.id))
  .query(`
    SELECT
      id,
      emp_id,
      parent_id,
      tmpl_id,
      earning_name,
      earning_rate,
      earning_amount,
      calc_amount,
      active,
      source
    FROM ss_earning
    WHERE parent_id = @earning_parent_id
      AND ISNULL(active, 0) = 0
    ORDER BY id
  `);

const earnings = earningResult.recordset || [];

const earningTotal = Number(
  earnings
    .reduce(
      (sum, row) => sum + Number(row.earning_amount || 0),
      0
    )
    .toFixed(2)
);

// ===================================================
// EMPLOYEE DEDUCTIONS FROM ss_deduction
// ===================================================
const deductionResult = await pool
  .request()
  .input("deduction_parent_id", sql.Int, Number(employee.id))
  .query(`
    SELECT
      id,
      emp_id,
      parent_id,
      tmpl_id,
      deduction_name,
      deduction_rate,
      deduction_amount,
      calc_amount,
      active,
      source
    FROM ss_deduction
    WHERE parent_id = @deduction_parent_id
      AND ISNULL(active, 0) = 0
    ORDER BY id
  `);

const deductions = deductionResult.recordset || [];

const deductionTotal = Number(
  deductions
    .reduce(
      (sum, row) => sum + Number(row.deduction_amount || 0),
      0
    )
    .toFixed(2)
);
        // ===================================================
        // ATTENDANCE MAP
        //
        // Example:
        // {
        //   1: "P",
        //   2: "W",
        //   3: "P"
        // }
        // ===================================================
        const attendanceMap = {};

        attendanceRows.forEach((row) => {
          if (!row.check_in_date) {
            return;
          }

          const date = new Date(row.check_in_date);

          const day = date.getDate();

          const status = String(row.emp_status || "")
            .trim()
            .toUpperCase();

          // =================================================
          // ONLY P / A / W
          // OTHERWISE EMPTY
          // =================================================
          let finalStatus = "";

          if (status === "P") {
            finalStatus = "P";
          } else if (status === "A") {
            finalStatus = "A";
          } else if (status === "W") {
            finalStatus = "W";
          } else {
            finalStatus = "";
          }

          attendanceMap[day] = {
            day,
            status: finalStatus,

            // Additional data if frontend needs it
            emp_status: status,
            check_in_date: row.check_in_date,
            emp_worked_hours: row.emp_worked_hours || 0,
            site_hours: row.site_hours || 0,
            ot_hours: row.ot_hours || 0,
          };
        });

        // ===================================================
        // DAILY ATTENDANCE ARRAY
        //
        // Every date of month will be present.
        //
        // No record = empty status
        // ===================================================
        const dailyAttendance = [];

        for (let day = 1; day <= daysInMonth; day++) {
          const attendance = attendanceMap[day];

          dailyAttendance.push({
            day,
            status: attendance?.status || "",
            emp_status: attendance?.emp_status || "",
            check_in_date: attendance?.check_in_date || null,
            emp_worked_hours: attendance?.emp_worked_hours || 0,
            site_hours: attendance?.site_hours || 0,
            ot_hours: attendance?.ot_hours || 0,
          });
        }

        // ===================================================
        // ATTENDANCE SUMMARY
        // ===================================================
        const presentDays = attendanceRows.filter(
          (row) =>
            String(row.emp_status || "")
              .trim()
              .toUpperCase() === "P",
        ).length;

        const absentDays = attendanceRows.filter(
          (row) =>
            String(row.emp_status || "")
              .trim()
              .toUpperCase() === "A",
        ).length;

        const weeklyOffDays = attendanceRows.filter(
          (row) =>
            String(row.emp_status || "")
              .trim()
              .toUpperCase() === "W",
        ).length;

        // ===================================================
        // HOLIDAY
        //
        // We are NOT converting unknown status to H.
        // Current requirement is only P/A/W/empty.
        // ===================================================
        const holidayDays = 0;

        // ===================================================
        // TOTAL ATTENDANCE RECORDS
        // ===================================================
        const totalAttendanceDays = attendanceRows.length;

        // ===================================================
        // FINAL EMPLOYEE OBJECT
        // ===================================================
        finalData.push({
          ...employee,
earnings,
deductions,
earning_total: earningTotal,
deduction_total: deductionTotal,
          // =================================================
          // FRONTEND FRIENDLY EMPLOYEE FIELDS
          // =================================================
          emp_name: employee.emp_name || "-",

          emp_code: employee.employee_code || employee.emp_code || "-",

          site_name: employee.final_site_name || employee.site_name || "-",

          client_name:
            employee.final_client_name || employee.client_name || "-",

          // =================================================
          // SALARY
          // =================================================
          total_earned_gross: totalEarning,

          total_deduction: totalDeduction,

          gross_salary: grossSalary,

          net_take_home: netPayable,

          net_payable: netPayable,

          // =================================================
          // EMPLOYEE OBJECT
          // =================================================
          employee: {
            id: employee.employee_db_id || employee.emp_id,

            emp_id: employee.emp_id,

            employee_code: employee.employee_code || employee.emp_code,

            emp_name: employee.emp_name || "-",

            rank: employee.rank || "",

            date_of_joining: employee.date_of_joining || "",

            dob: employee.dob || "",

            uan_no: employee.uan_no || "",

            pancard_no: employee.pancard_no || "",

            aadhar_no: employee.aadhar_no || "",

            esis_no: employee.esis_no || "",

            pf_no: employee.pf_no || "",

            pf_applicable: employee.pf_applicable,

            bank_name: employee.bank_name || "",

            account_no: employee.account_no || "",

            ifsc_code: employee.ifsc_code || "",

            ac_holder_name: employee.ac_holder_name || "",

            card_no: employee.card_no || "",
          },

          // =================================================
          // SITE OBJECT
          // =================================================
          site: {
            site_id: employee.site_id,

            site_name: employee.final_site_name || employee.site_name || "-",

            client_name:
              employee.final_client_name || employee.client_name || "-",

            client_code: employee.client_code || "",
          },

          // =================================================
          // SALARY OBJECT
          // =================================================
          salary: {
            salary_slip_id: employee.id,

            month: employee.at_month,

            year: employee.at_year,

            basic_salary: Number(employee.basic_rate || 0),

            basic: Number(employee.basic_salary || 0),

            gross_salary: grossSalary,

            total_earning: totalEarning,

            total_deduction: totalDeduction,

            // IMPORTANT:
            // Net Payable = Gross Salary
            net_payable: netPayable,

            net_take_home: netPayable,

            hold_salary: employee.hold_salary || "0",

            no_of_days: employee.no_of_days || "0",
          },

          // =================================================
          // ATTENDANCE OBJECT
          // =================================================
          attendance: {
            total_days: totalAttendanceDays,

            present_days: presentDays,

            absent_days: absentDays,

            weekly_off_days: weeklyOffDays,

            holiday_days: holidayDays,

            days_in_month: daysInMonth,

            // This is what frontend will use
            // for 1 -> 31 attendance display.
            daily: dailyAttendance,
          },
        });
      }

      // =====================================================
      // DEBUG
      // =====================================================
      console.log("==============================================");

      console.log("PRINT SALARY BY EMPLOYEE");

      console.log("Month:", monthNumber);

      console.log("Year:", yearNumber);

      console.log("Employees:", finalData.length);

      console.table(
        finalData.map((employee) => ({
          salary_slip_id: employee.id,

          emp_id: employee.emp_id,

          emp_name: employee.emp_name,

          employee_code: employee.employee_code,

          gross_salary: employee.gross_salary,

          total_earning: employee.total_earning,

          total_deduction: employee.total_deduction,

          net_payable: employee.net_payable,

          present_days: employee.attendance?.present_days,

          absent_days: employee.attendance?.absent_days,

          weekly_off_days: employee.attendance?.weekly_off_days,
        })),
      );

      console.log("==============================================");

      // =====================================================
      // RETURN
      // =====================================================
      return finalData;
    } catch (error) {
      console.error("getPrintSalaryByEmployee MODEL ERROR:", error);

      throw error;
    }
  },

  // =================================================
  // GENERATE SALARY BY SITE
  // =================================================
generateSalaryBySite: async (siteId, month, year, billingDays) => {
  try {
    const result = await salaryModel.generateSalaryFromEmpWages({
      siteId,
      month,
      year,
      billingDays
    });

    return result;
  } catch (error) {
    console.error("Error generating salary:", error);
    throw error;
  }
},
  // generateSalaryBySite: async (siteId, month, year, billingDays) => {
  //   const pool = await poolPromise;

  //   // =====================================================
  //   // CHECK NON COMPLIANCE
  //   // =====================================================

  //   const complianceRequest = pool.request();

  //   complianceRequest.input("site_id", sql.BigInt, Number(siteId));

  //   const complianceResult = await complianceRequest.query(`
  //   SELECT TOP 1
  //     non_compliance,
  //     client_id
  //   FROM client_rates
  //   WHERE TRY_CAST(id AS BIGINT) = @site_id
  //   ORDER BY id DESC
  // `);

  //   const nonCompliance = Number(
  //     complianceResult.recordset?.[0]?.non_compliance ?? 0,
  //   );
  //   const clientId = Number(complianceResult.recordset?.[0]?.client_id ?? 0);

  //   console.log("==========================================");
  //   console.log("SALARY NON COMPLIANCE:", nonCompliance);
  //   console.log("SITE ID:", siteId);
  //   console.log("CLIENT ID:", clientId);
  //   console.log("==========================================");

  //   // =====================================================
  //   // NON COMPLIANCE = 0
  //   // GENERATE SALARY FROM EMP_WAGES
  //   // =====================================================

  //   if (nonCompliance === 0) {
  //     console.log("NON_COMPLIANCE = 0");
  //     console.log("GENERATING SALARY FROM EMP_WAGES...");

  //     return await salaryModel.generateSalaryFromEmpWages({
  //       siteId,
  //       clientId,
  //       month,
  //       year,
  //     });
  //   }

  //   // =====================================================
  //   // NON COMPLIANCE = 1
  //   // CONTINUE EXISTING SALARY TEMPLATE LOGIC
  //   // =====================================================

  //   console.log("NON_COMPLIANCE = 1");
  //   console.log("GENERATING SALARY FROM SALARY TEMPLATE...");

  //   const transaction = new sql.Transaction(pool);

  //   const generatedEmployees = [];

  //   let transactionStarted = false;

  //   try {
  //     // =====================================================
  //     // START TRANSACTION
  //     // =====================================================

  //     await transaction.begin();

  //     transactionStarted = true;

  //     console.log("");
  //     console.log("=====================================================");
  //     console.log("GENERATE SALARY BY SITE START");
  //     console.log("=====================================================");

  //     // =====================================================
  //     // VALIDATION
  //     // =====================================================

  //     const numericSiteId = Number(siteId);

  //     const numericMonth = Number(month);

  //     const numericYear = Number(year);

  //     if (!Number.isInteger(numericSiteId) || numericSiteId <= 0) {
  //       throw new Error(`Invalid Site ID: ${siteId}`);
  //     }

  //     if (
  //       !Number.isInteger(numericMonth) ||
  //       numericMonth < 1 ||
  //       numericMonth > 12
  //     ) {
  //       throw new Error(`Invalid Month: ${month}`);
  //     }

  //     if (!Number.isInteger(numericYear) || numericYear < 2000) {
  //       throw new Error(`Invalid Year: ${year}`);
  //     }

  //     // =====================================================
  //     // BILLING OPTION
  //     // =====================================================

  //     const billingOption = String(billingDays ?? "")
  //       .trim()
  //       .toLowerCase();

  //     let numericBillingDays = 0;

  //     // =====================================================
  //     // NUMERIC BILLING DAYS
  //     // =====================================================

  //     if (
  //       billingDays !== undefined &&
  //       billingDays !== null &&
  //       String(billingDays).trim() !== "" &&
  //       Number.isFinite(Number(billingDays)) &&
  //       Number(billingDays) > 0
  //     ) {
  //       numericBillingDays = Number(billingDays);
  //     }

  //     console.log("");
  //     console.log("=====================================================");
  //     console.log("SALARY INPUT");
  //     console.log("=====================================================");

  //     console.log({
  //       siteId,
  //       month,
  //       year,
  //       billingDays,
  //       billingOption,
  //       numericSiteId,
  //       numericMonth,
  //       numericYear,
  //       numericBillingDays,
  //     });

  //     // =====================================================
  //     // MONTH DAYS
  //     // =====================================================

  //     const monthDays = new Date(numericYear, numericMonth, 0).getDate();

  //     console.log("MONTH DAYS:", monthDays);

  //     // =====================================================
  //     // GET SITE BILLING DAYS
  //     // =====================================================

  //     let dbBillingDays = 0;

  //     const billingRequest = new sql.Request(transaction);

  //     billingRequest.input("site_id", sql.BigInt, numericSiteId);

  //     const billingResult = await billingRequest.query(`

  //               SELECT TOP 1

  //                   id,

  //                   site_name,

  //                   billing_nodays,

  //                   client_id,

  //                   client_code

  //               FROM client_rates

  //               WHERE TRY_CAST(
  //                   id AS BIGINT
  //               ) = @site_id

  //               ORDER BY id DESC

  //           `);

  //     const billingSite = billingResult.recordset?.[0];

  //     if (
  //       billingSite?.billing_nodays !== null &&
  //       billingSite?.billing_nodays !== undefined &&
  //       String(billingSite.billing_nodays).trim() !== "" &&
  //       Number(billingSite.billing_nodays) > 0
  //     ) {
  //       dbBillingDays = Number(billingSite.billing_nodays);
  //     }

  //     console.log("");
  //     console.log("=====================================================");
  //     console.log("DB BILLING DAYS");
  //     console.log("=====================================================");

  //     console.log({
  //       siteId: numericSiteId,

  //       siteName: billingSite?.site_name || "",

  //       dbBillingDays,
  //     });

  //     // =====================================================
  //     // CALCULATE FINAL BILLING DAYS
  //     // =====================================================

  //     if (billingOption === "with sunday") {
  //       numericBillingDays = monthDays;
  //     } else if (billingOption === "without sunday") {
  //       let sundayCount = 0;

  //       for (let day = 1; day <= monthDays; day++) {
  //         const currentDate = new Date(numericYear, numericMonth - 1, day);

  //         if (currentDate.getDay() === 0) {
  //           sundayCount++;
  //         }
  //       }

  //       numericBillingDays = monthDays - sundayCount;

  //       console.log("SUNDAY COUNT:", sundayCount);
  //     } else if (numericBillingDays > 0) {
  //       // Numeric billing days received
  //     } else if (dbBillingDays > 0) {
  //       numericBillingDays = dbBillingDays;
  //     } else {
  //       numericBillingDays = monthDays;
  //     }

  //     // =====================================================
  //     // BILLING DAYS VALIDATION
  //     // =====================================================

  //     if (!Number.isFinite(numericBillingDays) || numericBillingDays <= 0) {
  //       throw new Error(
  //         `Invalid Billing Days. Received: ${billingDays}, DB: ${dbBillingDays}`,
  //       );
  //     }

  //     console.log("");
  //     console.log("=====================================================");
  //     console.log("FINAL BILLING DAYS");
  //     console.log("=====================================================");

  //     console.log({
  //       option: billingDays,

  //       monthDays,

  //       dbBillingDays,

  //       finalBillingDays: numericBillingDays,
  //     });

  //     // =====================================================
  //     // DELETE OLD SALARY
  //     // =====================================================

  //     console.log("DELETING OLD SALARY DATA...");

  //     await salaryModel.deleteSalaryBySite({
  //       transaction,

  //       month: numericMonth,

  //       year: numericYear,

  //       site_id: numericSiteId,
  //     });

  //     console.log("OLD SALARY DATA DELETED");

  //     // =====================================================
  //     // GET EMPLOYEES
  //     // =====================================================

  //     console.log("GETTING EMPLOYEES...");

  //     const employeeRequest = new sql.Request(transaction);

  //     employeeRequest.input("site_id", sql.BigInt, numericSiteId);

  //     employeeRequest.input("month", sql.Int, numericMonth);

  //     employeeRequest.input("year", sql.Int, numericYear);

  //     const employeeResult = await employeeRequest.query(`

  //               SELECT DISTINCT

  //                   e.*

  //               FROM employee e

  //               INNER JOIN emp_attendance ea

  //                   ON TRY_CAST(
  //                       ea.emp_code AS VARCHAR(100)
  //                   )
  //                   =
  //                   TRY_CAST(
  //                       e.employee_code AS VARCHAR(100)
  //                   )

  //               WHERE TRY_CAST(
  //                   ea.site_id AS BIGINT
  //               ) = @site_id

  //               AND MONTH(
  //                   ea.check_in_date
  //               ) = @month

  //               AND YEAR(
  //                   ea.check_in_date
  //               ) = @year

  //               AND (
  //                   ea.active = 0
  //                   OR ea.active IS NULL
  //               )

  //               AND (
  //                   e.active = 0
  //                   OR e.active IS NULL
  //               )

  //           `);

  //     const employees = employeeResult.recordset || [];

  //     console.log("EMPLOYEE COUNT:", employees.length);

  //     if (employees.length === 0) {
  //       throw new Error(
  //         `No employees found for Site ID ${numericSiteId} for ${numericMonth}/${numericYear}`,
  //       );
  //     }

  //     // =====================================================
  //     // GET SITE / CLIENT DATA
  //     // =====================================================

  //     const siteRequest = new sql.Request(transaction);

  //     siteRequest.input("site_id", sql.BigInt, numericSiteId);

  //     const siteResult = await siteRequest.query(`

  //               SELECT TOP 1

  //                   cr.id AS site_id,

  //                   cr.client_id,

  //                   cr.client_code,

  //                   cr.site_name,

  //                   cr.billing_nodays,

  //                   nc.id AS new_client_id,

  //                   nc.company_name AS client_name

  //               FROM client_rates cr

  //               LEFT JOIN new_client nc

  //                   ON TRY_CAST(
  //                       nc.id AS BIGINT
  //                   )
  //                   =
  //                   TRY_CAST(
  //                       cr.client_id AS BIGINT
  //                   )

  //               WHERE TRY_CAST(
  //                   cr.id AS BIGINT
  //               ) = @site_id

  //               ORDER BY cr.id DESC

  //           `);

  //     const site = siteResult.recordset?.[0];

  //     if (!site) {
  //       throw new Error(
  //         `Site information not found for Site ID ${numericSiteId}`,
  //       );
  //     }

  //     // =====================================================
  //     // CLIENT DATA
  //     // =====================================================

  //     const clientId =
  //       site.client_id !== null &&
  //       site.client_id !== undefined &&
  //       String(site.client_id).trim() !== ""
  //         ? Number(site.client_id)
  //         : null;

  //     const clientCode = String(site.client_code || "").trim();

  //     const clientName = String(site.client_name || "").trim();

  //     const siteName = String(site.site_name || "").trim();

  //     if (!clientId || !Number.isInteger(clientId) || clientId <= 0) {
  //       throw new Error(`Client ID not found for Site ID ${numericSiteId}`);
  //     }

  //     console.log("");
  //     console.log("=====================================================");
  //     console.log("SITE / CLIENT DATA");
  //     console.log("=====================================================");

  //     console.log({
  //       siteId: numericSiteId,

  //       siteName,

  //       clientId,

  //       clientCode,

  //       clientName,
  //     });

  //     // =====================================================
  //     // PROCESS EACH EMPLOYEE
  //     // =====================================================

  //     for (const emp of employees) {
  //       try {
  //         console.log("");
  //         console.log("-----------------------------------------------------");

  //         console.log("PROCESSING EMPLOYEE:", emp.employee_code);

  //         console.log("-----------------------------------------------------");

  //         // =================================================
  //         // GET SALARY TEMPLATE
  //         // =================================================

  //         const salaryTemplateData = await salaryModel.getSalaryTemplate({
  //           transaction,

  //           employeeId: emp.id,

  //           employeeCode: emp.employee_code,

  //           month: numericMonth,

  //           year: numericYear,
  //         });

  //         let salaryTemplate = null;

  //         if (Array.isArray(salaryTemplateData)) {
  //           salaryTemplate = salaryTemplateData[0] || null;
  //         } else {
  //           salaryTemplate = salaryTemplateData || null;
  //         }

  //         console.log("SALARY TEMPLATE DATA:", salaryTemplate);

  //         if (!salaryTemplate) {
  //           throw new Error(
  //             `Salary template not found for Employee ${emp.employee_code}`,
  //           );
  //         }

  //         // =================================================
  //         // TEMPLATE ID
  //         // =================================================

  //         const templateId =
  //           salaryTemplate?.salary_template ??
  //           salaryTemplate?.templateId ??
  //           salaryTemplate?.template_id ??
  //           salaryTemplate?.tmpl_id ??
  //           salaryTemplate?.id ??
  //           emp?.salary_template ??
  //           emp?.salary_template_id ??
  //           emp?.template_id ??
  //           null;

  //         if (
  //           templateId === null ||
  //           templateId === undefined ||
  //           String(templateId).trim() === "" ||
  //           !Number.isInteger(Number(templateId)) ||
  //           Number(templateId) <= 0
  //         ) {
  //           throw new Error(
  //             `Invalid salary template for Employee ${emp.employee_code}. salaryTemplateData: ${JSON.stringify(salaryTemplate)}`,
  //           );
  //         }

  //         const numericTemplateId = Number(templateId);

  //         // =================================================
  //         // SALARY VALUES
  //         // =================================================

  //         const grossSalary = Number(
  //           salaryTemplate?.gross_salary ??
  //             salaryTemplate?.grossSalary ??
  //             salaryTemplate?.def_gross_salary ??
  //             emp?.gross_salary ??
  //             emp?.grossSalary ??
  //             0,
  //         );

  //         const basicSalary = Number(
  //           salaryTemplate?.basic_salary ??
  //             salaryTemplate?.basicSalary ??
  //             salaryTemplate?.def_basic_salary ??
  //             emp?.basic_salary ??
  //             emp?.basicSalary ??
  //             0,
  //         );

  //         const grossSalaryType = String(
  //           salaryTemplate?.def_gross_salary_type ??
  //             salaryTemplate?.gross_salary_type ??
  //             salaryTemplate?.grossSalaryType ??
  //             "",
  //         );

  //         const basicSalaryType = String(
  //           salaryTemplate?.def_basic_salary_type ??
  //             salaryTemplate?.basic_salary_type ??
  //             salaryTemplate?.basicSalaryType ??
  //             "",
  //         );

  //         const basicRate = Number(
  //           salaryTemplate?.basic_rate ?? emp?.basic_rate ?? 0,
  //         );

  //         console.log("SALARY basicRate:", {
  //           employeeCode: emp.employee_code,

  //           templateId: numericTemplateId,

  //           grossSalary,

  //           basicSalary,

  //           basicRate,
  //         });

  //         // =================================================
  //         // ATTENDANCE - WEEK OFF
  //         // =================================================

  //         const weekOffCount = await salaryModel.getAttendanceCount({
  //           transaction,

  //           employeeCode: emp.employee_code,

  //           siteId: numericSiteId,

  //           month: numericMonth,

  //           year: numericYear,

  //           status: "W",
  //         });

  //         // =================================================
  //         // ATTENDANCE - PRESENT
  //         // =================================================

  //         const presentCount = await salaryModel.getAttendanceCount({
  //           transaction,

  //           employeeCode: emp.employee_code,

  //           siteId: numericSiteId,

  //           month: numericMonth,

  //           year: numericYear,

  //           status: "P",
  //         });

  //         // =================================================
  //         // ATTENDANCE - PP
  //         // =================================================

  //         const ppCount = await salaryModel.getAttendanceCount({
  //           transaction,

  //           employeeCode: emp.employee_code,

  //           siteId: numericSiteId,

  //           month: numericMonth,

  //           year: numericYear,

  //           status: "PP",
  //         });

  //         // =================================================
  //         // ATTENDANCE - HALF DAY
  //         // =================================================

  //         const halfDayCount = await salaryModel.getAttendanceCount({
  //           transaction,

  //           employeeCode: emp.employee_code,

  //           siteId: numericSiteId,

  //           month: numericMonth,

  //           year: numericYear,

  //           status: "HF",
  //         });

  //         // =================================================
  //         // ATTENDANCE - DOUBLE DAY
  //         // =================================================

  //         const doubleDayCount = await salaryModel.getAttendanceCount({
  //           transaction,

  //           employeeCode: emp.employee_code,

  //           siteId: numericSiteId,

  //           month: numericMonth,

  //           year: numericYear,

  //           status: "DD",
  //         });

  //         const P = Number(presentCount || 0);

  //         const W = Number(weekOffCount || 0);

  //         const PP = Number(ppCount || 0);

  //         const HF = Number(halfDayCount || 0);

  //         const DD = Number(doubleDayCount || 0);

  //         // =================================================
  //         // TOTAL ATTENDANCE
  //         // =================================================

  //         const totalCount = P + W + PP + HF / 2 + DD;

  //         console.log("ATTENDANCE:", {
  //           P,
  //           W,
  //           PP,
  //           HF,
  //           DD,
  //           totalCount,
  //         });

  //         // =================================================
  //         // WORKING DAYS
  //         // =================================================

  //         let workingDays = numericBillingDays;

  //         if (typeof calculateWorkingDays === "function") {
  //           workingDays = await calculateWorkingDays(
  //             numericMonth,

  //             numericYear,

  //             numericBillingDays,
  //           );
  //         }

  //         // =================================================
  //         // OPERATOR
  //         // =================================================

  //         let operator = 0;

  //         if (typeof calculateOperator === "function") {
  //           operator = await calculateOperator(
  //             emp,

  //             totalCount,
  //           );
  //         }

  //         // =================================================
  //         // PAYABLE DAYS
  //         // =================================================

  //         const payableDays = Math.min(
  //           totalCount,

  //           numericBillingDays,
  //         );

  //         // =================================================
  //         // PER DAY SALARY
  //         // =================================================

  //         const perDaySalary =
  //           numericBillingDays > 0 ? grossSalary / numericBillingDays : 0;

  //         // =================================================
  //         // EARNED GROSS
  //         // =================================================

  //         // const earnedGross = perDaySalary * payableDays;

  //         // // =================================================
  //         // // EARNED BASIC
  //         // // =================================================

  //         // const earnedBasic =
  //         //   numericBillingDays > 0
  //         //     ? (basicSalary / numericBillingDays) * payableDays
  //         //     : 0;

  //         // console.log("EARNED SALARY:", {
  //         //   earnedGross,

  //         //   earnedBasic,

  //         //   payableDays,
  //         // });

  //         const earnedGross = perDaySalary * payableDays;

  //         // =================================================
  //         // EARNED BASIC
  //         // =================================================

  //         const earnedBasic =
  //           numericBillingDays > 0
  //             ? (basicSalary / numericBillingDays) * payableDays
  //             : 0;

  //         // =================================================
  //         // DETAILED SALARY CALCULATION LOG
  //         // =================================================

  //         console.log("========== EARNED SALARY CALCULATION ==========");

  //         console.log(
  //           `earnedGross = perDaySalary (${perDaySalary}) * payableDays (${payableDays}) = ${earnedGross}`,
  //         );

  //         console.log(
  //           `earnedBasic = (basicSalary (${basicSalary}) / numericBillingDays (${numericBillingDays})) * payableDays (${payableDays}) = ${earnedBasic}`,
  //         );

  //         console.log("------------------------------------------------");

  //         console.log("VARIABLE VALUES:", {
  //           perDaySalary,
  //           payableDays,
  //           basicSalary,
  //           numericBillingDays,
  //         });

  //         console.log("CALCULATION RESULTS:", {
  //           earnedGross,
  //           earnedBasic,
  //         });

  //         console.log("================================================");

  //         // =================================================
  //         // GET EARNINGS
  //         // =================================================

  //         const earnings = await salaryModel.getEarnings({
  //           transaction,

  //           employeeId: emp.id,

  //           templateId: numericTemplateId,

  //           month: numericMonth,

  //           year: numericYear,
  //         });

  //         console.log("EARNINGS:", earnings);

  //         // =================================================
  //         // GET DEDUCTIONS
  //         // =================================================

  //         const deductions = await salaryModel.getDeductions({
  //           transaction,

  //           employeeId: emp.id,

  //           templateId: numericTemplateId,

  //           month: numericMonth,

  //           year: numericYear,
  //         });

  //         console.log("DEDUCTIONS:", deductions);

  //         // =================================================
  //         // TOTAL EARNINGS
  //         // =================================================

  //         let totalEarnings = 0;

  //         if (Array.isArray(earnings)) {
  //           for (const earning of earnings) {
  //             const earningAmount = Number(
  //               earning.earning_amount ??
  //                 earning.amount ??
  //                 earning.calc_amount ??
  //                 earning.value ??
  //                 0,
  //             );

  //             if (Number.isFinite(earningAmount)) {
  //               totalEarnings += earningAmount;
  //             }
  //           }
  //         }

  //         // =================================================
  //         // TOTAL DEDUCTIONS
  //         // =================================================

  //         let totalDeductions = 0;

  //         if (Array.isArray(deductions)) {
  //           for (const deduction of deductions) {
  //             const deductionAmount = Number(
  //               deduction.deduction_amount ??
  //                 deduction.amount ??
  //                 deduction.calc_amount ??
  //                 deduction.value ??
  //                 0,
  //             );

  //             if (Number.isFinite(deductionAmount)) {
  //               totalDeductions += deductionAmount;
  //             }
  //           }
  //         }

  //         // =================================================
  //         // NET SALARY
  //         // =================================================

  //         // const netSalary = earnedGross + totalEarnings - totalDeductions;

  //         // console.log("TOTAL SALARY:", {
  //         //   earnedGross,

  //         //   totalEarnings,

  //         //   totalDeductions,

  //         //   netSalary,
  //         // });
  //         const netSalary = earnedGross + totalEarnings - totalDeductions;

  //         console.log("========== TOTAL SALARY CALCULATION ==========");

  //         console.log("earnedGross      =", earnedGross);
  //         console.log("totalEarnings    =", totalEarnings);
  //         console.log("totalDeductions  =", totalDeductions);

  //         console.log("----------------------------------------------");

  //         console.log(
  //           "CALCULATION      = earnedGross + totalEarnings - totalDeductions",
  //         );

  //         console.log(
  //           "VALUES            =",
  //           earnedGross,
  //           "+",
  //           totalEarnings,
  //           "-",
  //           totalDeductions,
  //         );

  //         console.log("RESULT            =", netSalary);

  //         console.log("----------------------------------------------");

  //         console.log(
  //           "netSalary        = earnedGross + totalEarnings - totalDeductions",
  //         );

  //         console.log(
  //           "netSalary        =",
  //           earnedGross,
  //           "+",
  //           totalEarnings,
  //           "-",
  //           totalDeductions,
  //           "=",
  //           netSalary,
  //         );

  //         console.log("==============================================");
  //         // =================================================
  //         // EMPLOYEE DATA
  //         // =================================================

  //         const accountHolder = String(
  //           emp.ac_holder_name || emp.account_holder_name || "",
  //         );

  //         const cardNo = String(emp.card_no || emp.account_no || "");

  //         const bankName = String(emp.bank_name || "");

  //         const employeeName = String(
  //           emp.employee_name ||
  //             emp.name ||
  //             `${emp.first_name || ""} ${emp.last_name || ""}`,
  //         ).trim();

  //         // =================================================
  //         // INSERT SALARY SLIP
  //         // =================================================

  //         const salarySlipRequest = new sql.Request(transaction);

  //         salarySlipRequest.input("emp_id", sql.BigInt, Number(emp.id));

  //         salarySlipRequest.input("at_month", sql.Int, numericMonth);

  //         salarySlipRequest.input("at_year", sql.Int, numericYear);

  //         salarySlipRequest.input(
  //           "salary_template",
  //           sql.BigInt,
  //           numericTemplateId,
  //         );

  //         salarySlipRequest.input(
  //           "def_gross_salary",
  //           sql.Decimal(18, 2),
  //           Number.isFinite(grossSalary) ? grossSalary : 0,
  //         );

  //         salarySlipRequest.input(
  //           "def_gross_salary_type",
  //           sql.NVarChar(100),
  //           grossSalaryType,
  //         );

  //         salarySlipRequest.input(
  //           "def_basic_salary",
  //           sql.Decimal(18, 2),
  //           Number.isFinite(basicSalary) ? basicSalary : 0,
  //         );

  //         salarySlipRequest.input(
  //           "def_basic_salary_type",
  //           sql.NVarChar(100),
  //           basicSalaryType,
  //         );

  //         salarySlipRequest.input(
  //           "basic_rate",
  //           sql.Decimal(18, 2),
  //           Number.isFinite(basicRate) ? basicRate : 0,
  //         );

  //         salarySlipRequest.input(
  //           "no_of_days",
  //           sql.Decimal(10, 2),
  //           Number.isFinite(payableDays) ? payableDays : 0,
  //         );

  //         salarySlipRequest.input(
  //           "total_earning",
  //           sql.Decimal(18, 2),
  //           Number.isFinite(totalEarnings) ? totalEarnings : 0,
  //         );

  //         salarySlipRequest.input(
  //           "total_deduction",
  //           sql.Decimal(18, 2),
  //           Number.isFinite(totalDeductions) ? totalDeductions : 0,
  //         );

  //         salarySlipRequest.input("active", sql.Int, 0);

  //         salarySlipRequest.input("site_id", sql.BigInt, numericSiteId);

  //         salarySlipRequest.input("client_code", sql.NVarChar(100), clientCode);

  //         salarySlipRequest.input(
  //           "rank",
  //           sql.NVarChar(100),
  //           String(emp.rank || ""),
  //         );

  //         salarySlipRequest.input(
  //           "gross_salary",
  //           sql.Decimal(18, 2),
  //           Number.isFinite(earnedGross) ? earnedGross : 0,
  //         );

  //         salarySlipRequest.input(
  //           "ac_holder_name",
  //           sql.NVarChar(255),
  //           accountHolder,
  //         );

  //         salarySlipRequest.input("card_no", sql.NVarChar(100), cardNo);

  //         salarySlipRequest.input("bank_name", sql.NVarChar(255), bankName);

  //         salarySlipRequest.input("remark", sql.NVarChar(500), "");

  //         salarySlipRequest.input("hold_salary", sql.Int, 0);

  //         salarySlipRequest.input("site_name", sql.NVarChar(255), siteName);

  //         salarySlipRequest.input("client_name", sql.NVarChar(255), clientName);

  //         salarySlipRequest.input("source", sql.NVarChar(100), "website");

  //         console.log("INSERTING SALARY SLIP...");

  //         const salarySlipResult = await salarySlipRequest.query(`

  //                       INSERT INTO salary_slip
  //                       (
  //                           emp_id,
  //                           at_month,
  //                           at_year,
  //                           salary_template,
  //                           def_gross_salary,
  //                           def_gross_salary_type,
  //                           def_basic_salary,
  //                           def_basic_salary_type,
  //                           basic_rate,
  //                           no_of_days,
  //                           total_earning,
  //                           total_deduction,
  //                           active,
  //                           site_id,
  //                           client_code,
  //                           rank,
  //                           gross_salary,
  //                           ac_holder_name,
  //                           card_no,
  //                           bank_name,
  //                           remark,
  //                           hold_salary,
  //                           site_name,
  //                           client_name,
  //                           source
  //                       )

  //                       OUTPUT INSERTED.id

  //                       VALUES
  //                       (
  //                           @emp_id,
  //                           @at_month,
  //                           @at_year,
  //                           @salary_template,
  //                           @def_gross_salary,
  //                           @def_gross_salary_type,
  //                           @def_basic_salary,
  //                           @def_basic_salary_type,
  //                           @basic_rate,
  //                           @no_of_days,
  //                           @total_earning,
  //                           @total_deduction,
  //                           @active,
  //                           @site_id,
  //                           @client_code,
  //                           @rank,
  //                           @gross_salary,
  //                           @ac_holder_name,
  //                           @card_no,
  //                           @bank_name,
  //                           @remark,
  //                           @hold_salary,
  //                           @site_name,
  //                           @client_name,
  //                           @source
  //                       )

  //                   `);

  //         const salarySlipId = salarySlipResult.recordset?.[0]?.id;

  //         if (!salarySlipId) {
  //           throw new Error(
  //             `Salary slip insert failed for Employee ${emp.employee_code}`,
  //           );
  //         }

  //         console.log("SALARY SLIP ID:", salarySlipId);

  //         // =================================================
  //         // INSERT EARNINGS
  //         // =================================================

  //         if (Array.isArray(earnings)) {
  //           for (const earning of earnings) {
  //             const earningName = String(
  //               earning.earning_name ?? earning.name ?? earning.title ?? "",
  //             );

  //             const earningRate = String(
  //               earning.earning_rate ?? earning.rate ?? "",
  //             );

  //             const earningAmount = Number(
  //               earning.earning_amount ??
  //                 earning.amount ??
  //                 earning.calc_amount ??
  //                 earning.value ??
  //                 0,
  //             );

  //             const calcAmount = Number(
  //               earning.calc_amount ??
  //                 earning.earning_amount ??
  //                 earning.amount ??
  //                 0,
  //             );

  //             const earningRequest = new sql.Request(transaction);

  //             earningRequest.input("emp_id", sql.NVarChar(100), String(emp.id));

  //             earningRequest.input(
  //               "parent_id",
  //               sql.NVarChar(100),
  //               String(salarySlipId),
  //             );

  //             earningRequest.input(
  //               "tmpl_id",
  //               sql.NVarChar(100),
  //               String(numericTemplateId),
  //             );

  //             earningRequest.input(
  //               "earning_name",
  //               sql.NVarChar(255),
  //               earningName,
  //             );

  //             earningRequest.input(
  //               "earning_rate",
  //               sql.NVarChar(100),
  //               earningRate,
  //             );

  //             earningRequest.input(
  //               "earning_amount",
  //               sql.NVarChar(100),
  //               Number.isFinite(earningAmount) ? String(earningAmount) : "0",
  //             );

  //             earningRequest.input(
  //               "calc_amount",
  //               sql.NVarChar(100),
  //               Number.isFinite(calcAmount) ? String(calcAmount) : "0",
  //             );

  //             earningRequest.input("active", sql.NVarChar(50), "0");

  //             earningRequest.input("source", sql.NVarChar(100), "website");

  //             await earningRequest.query(`

  //                           INSERT INTO ss_earning
  //                           (
  //                               emp_id,
  //                               parent_id,
  //                               tmpl_id,
  //                               earning_name,
  //                               earning_rate,
  //                               earning_amount,
  //                               calc_amount,
  //                               active,
  //                               source
  //                           )

  //                           VALUES
  //                           (
  //                               @emp_id,
  //                               @parent_id,
  //                               @tmpl_id,
  //                               @earning_name,
  //                               @earning_rate,
  //                               @earning_amount,
  //                               @calc_amount,
  //                               @active,
  //                               @source
  //                           )

  //                       `);
  //           }
  //         }

  //         // =================================================
  //         // INSERT DEDUCTIONS
  //         // =================================================

  //         if (Array.isArray(deductions)) {
  //           for (const deduction of deductions) {
  //             const deductionName = String(
  //               deduction.deduction_name ??
  //                 deduction.name ??
  //                 deduction.title ??
  //                 "",
  //             );

  //             const deductionRate = String(
  //               deduction.deduction_rate ?? deduction.rate ?? "",
  //             );

  //             const deductionAmount = Number(
  //               deduction.deduction_amount ??
  //                 deduction.amount ??
  //                 deduction.calc_amount ??
  //                 deduction.value ??
  //                 0,
  //             );

  //             const calcAmount = Number(
  //               deduction.calc_amount ??
  //                 deduction.deduction_amount ??
  //                 deduction.amount ??
  //                 0,
  //             );

  //             const deductionRequest = new sql.Request(transaction);

  //             deductionRequest.input(
  //               "emp_id",
  //               sql.NVarChar(100),
  //               String(emp.id),
  //             );

  //             deductionRequest.input(
  //               "parent_id",
  //               sql.NVarChar(100),
  //               String(salarySlipId),
  //             );

  //             deductionRequest.input(
  //               "tmpl_id",
  //               sql.NVarChar(100),
  //               String(numericTemplateId),
  //             );

  //             deductionRequest.input(
  //               "deduction_name",
  //               sql.NVarChar(255),
  //               deductionName,
  //             );

  //             deductionRequest.input(
  //               "deduction_rate",
  //               sql.NVarChar(100),
  //               deductionRate,
  //             );

  //             deductionRequest.input(
  //               "deduction_amount",
  //               sql.NVarChar(100),
  //               Number.isFinite(deductionAmount)
  //                 ? String(deductionAmount)
  //                 : "0",
  //             );

  //             deductionRequest.input(
  //               "calc_amount",
  //               sql.NVarChar(100),
  //               Number.isFinite(calcAmount) ? String(calcAmount) : "0",
  //             );

  //             deductionRequest.input("active", sql.NVarChar(50), "0");

  //             deductionRequest.input("source", sql.NVarChar(100), "website");

  //             await deductionRequest.query(`

  //                           INSERT INTO ss_deduction
  //                           (
  //                               emp_id,
  //                               parent_id,
  //                               tmpl_id,
  //                               deduction_name,
  //                               deduction_rate,
  //                               deduction_amount,
  //                               calc_amount,
  //                               active,
  //                               source
  //                           )

  //                           VALUES
  //                           (
  //                               @emp_id,
  //                               @parent_id,
  //                               @tmpl_id,
  //                               @deduction_name,
  //                               @deduction_rate,
  //                               @deduction_amount,
  //                               @calc_amount,
  //                               @active,
  //                               @source
  //                           )

  //                       `);
  //           }
  //         }

  //         // =================================================
  //         // GENERATED EMPLOYEE DATA
  //         // =================================================

  //         generatedEmployees.push({
  //           salarySlipId: Number(salarySlipId),

  //           employeeId: Number(emp.id),

  //           employeeCode: String(emp.employee_code || ""),

  //           employeeName,

  //           siteId: numericSiteId,

  //           siteName,

  //           clientId,

  //           clientCode,

  //           clientName,

  //           rank: String(emp.rank || ""),

  //           templateId: numericTemplateId,

  //           month: numericMonth,

  //           year: numericYear,

  //           billingDays: numericBillingDays,

  //           monthDays,

  //           workingDays,

  //           operator,

  //           presentDays: P,

  //           weekoffDays: W,

  //           halfDays: HF,

  //           doubleDays: DD,

  //           ppDays: PP,

  //           totalAttendance: totalCount,

  //           payableDays,

  //           grossSalary,

  //           basicSalary,

  //           basicRate,

  //           perDaySalary,

  //           earnedBasic,

  //           earnedGross,

  //           totalEarnings,

  //           totalDeductions,

  //           netSalary,

  //           bankName,

  //           cardNo,

  //           accountHolder,

  //           // Keep complete earning / deduction
  //           // data for PDF

  //           earnings: Array.isArray(earnings) ? earnings : [],

  //           deductions: Array.isArray(deductions) ? deductions : [],
  //         });

  //         console.log("EMPLOYEE SALARY GENERATED:", emp.employee_code);
  //       } catch (employeeError) {
  //         console.error("");
  //         console.error(
  //           "=====================================================",
  //         );

  //         console.error("EMPLOYEE SALARY ERROR");

  //         console.error("EMPLOYEE:", emp.employee_code);

  //         console.error("MESSAGE:", employeeError.message);

  //         console.error("STACK:", employeeError.stack);

  //         console.error(
  //           "=====================================================",
  //         );

  //         throw employeeError;
  //       }
  //     }

  //     // =====================================================
  //     // COMMIT TRANSACTION
  //     // =====================================================

  //     console.log("ALL EMPLOYEES PROCESSED");

  //     await transaction.commit();

  //     transactionStarted = false;

  //     console.log("TRANSACTION COMMITTED");

  //     // =====================================================
  //     // EMPLOYEE SALARY PDF
  //     // GENERATE PDF
  //     // SAVE URL IN salary_slip
  //     // =====================================================

  //     const employeePdfResults = [];

  //     for (const employee of generatedEmployees) {
  //       try {
  //         console.log("GENERATING EMPLOYEE PDF:", employee.employeeCode);

  //         // =================================================
  //         // GENERATE PDF
  //         // =================================================

  //         const pdfResult = await generateEmployeePdf(employee);

  //         console.log("EMPLOYEE PDF RESULT:", pdfResult);

  //         if (!pdfResult || pdfResult.success === false) {
  //           throw new Error(
  //             pdfResult?.error ||
  //               `PDF generation failed for ${employee.employeeCode}`,
  //           );
  //         }

  //         // =================================================
  //         // SAVE PDF URL TO salary_slip
  //         // TRANSACTION ALREADY COMMITTED
  //         // USE pool.request()
  //         // =================================================

  //         const pdfDbRequest = pool.request();

  //         pdfDbRequest.input(
  //           "salary_slip_id",
  //           sql.BigInt,
  //           Number(employee.salarySlipId),
  //         );

  //         pdfDbRequest.input(
  //           "salary_slip_img_path",
  //           sql.NVarChar(sql.MAX),
  //           String(pdfResult.relativePath || ""),
  //         );

  //         pdfDbRequest.input(
  //           "salary_slip_url",
  //           sql.NVarChar(sql.MAX),
  //           String(pdfResult.salary_slip_url || ""),
  //         );

  //         await pdfDbRequest.query(`

  //                   UPDATE salary_slip

  //                   SET

  //                       salary_slip_img_path =
  //                           @salary_slip_img_path,

  //                       salary_slip_url =
  //                           @salary_slip_url

  //                   WHERE id =
  //                       @salary_slip_id

  //               `);

  //         console.log("=====================================================");

  //         console.log("EMPLOYEE PDF URL SAVED");

  //         console.log({
  //           salarySlipId: employee.salarySlipId,

  //           employeeCode: employee.employeeCode,

  //           relativePath: pdfResult.relativePath,

  //           salary_slip_url: pdfResult.salary_slip_url,
  //         });

  //         console.log("=====================================================");

  //         // =================================================
  //         // ADD PDF RESULT
  //         // =================================================

  //         employeePdfResults.push({
  //           success: true,

  //           employeeId: employee.employeeId,

  //           employeeCode: employee.employeeCode,

  //           employeeName: employee.employeeName,

  //           salarySlipId: employee.salarySlipId,

  //           pdf: pdfResult,
  //         });
  //       } catch (pdfError) {
  //         console.error("EMPLOYEE PDF ERROR:", {
  //           employeeCode: employee.employeeCode,

  //           salarySlipId: employee.salarySlipId,

  //           error: pdfError.message,
  //         });

  //         employeePdfResults.push({
  //           success: false,

  //           employeeId: employee.employeeId,

  //           employeeCode: employee.employeeCode,

  //           employeeName: employee.employeeName,

  //           salarySlipId: employee.salarySlipId,

  //           pdf: null,

  //           error: pdfError.message,
  //         });
  //       }
  //     }

  //     // =====================================================
  //     // SITE SALARY PDF
  //     // =====================================================

  //     let sitePdfResult = null;

  //     try {
  //       console.log("GENERATING SITE SALARY PDF...");

  //       sitePdfResult = await generateSitePdf({
  //         siteId: numericSiteId,

  //         siteName,

  //         clientId,

  //         clientCode,

  //         clientName,

  //         month: numericMonth,

  //         year: numericYear,

  //         billingDays: numericBillingDays,

  //         monthDays,

  //         workingDays:
  //           generatedEmployees?.[0]?.workingDays || numericBillingDays,

  //         employees: generatedEmployees,
  //       });

  //       console.log("SITE PDF GENERATED:", sitePdfResult);
  //     } catch (sitePdfError) {
  //       console.error("SITE PDF ERROR:", sitePdfError.message);

  //       sitePdfResult = {
  //         success: false,

  //         error: sitePdfError.message,
  //       };
  //     }

  //     // =====================================================
  //     // FINAL PDF COUNTS
  //     // =====================================================

  //     const successfulEmployeePdfs = employeePdfResults.filter(
  //       (item) => item.success === true,
  //     ).length;

  //     const failedEmployeePdfs = employeePdfResults.filter(
  //       (item) => item.success === false,
  //     ).length;

  //     // =====================================================
  //     // FINAL RESPONSE
  //     // =====================================================

  //     console.log("");
  //     console.log("=====================================================");
  //     console.log("GENERATE SALARY BY SITE COMPLETE");
  //     console.log("=====================================================");

  //     console.log({
  //       siteId: numericSiteId,

  //       siteName,

  //       clientId,

  //       clientName,

  //       month: numericMonth,

  //       year: numericYear,

  //       billingDays: numericBillingDays,

  //       employeeCount: generatedEmployees.length,

  //       employeePdfs: successfulEmployeePdfs,

  //       failedEmployeePdfs,

  //       sitePdf: sitePdfResult?.success !== false,
  //     });

  //     return {
  //       success: true,

  //       message: `Salary generated successfully for Site ID ${numericSiteId}`,

  //       siteId: numericSiteId,

  //       siteName,

  //       clientId,

  //       clientCode,

  //       clientName,

  //       month: numericMonth,

  //       year: numericYear,

  //       billingOption: billingDays,

  //       monthDays,

  //       billingDays: numericBillingDays,

  //       workingDays: generatedEmployees?.[0]?.workingDays || numericBillingDays,

  //       employeeCount: generatedEmployees.length,

  //       generated: generatedEmployees,

  //       salaryPdf: {
  //         success: successfulEmployeePdfs > 0,

  //         count: employeePdfResults.length,

  //         successful: successfulEmployeePdfs,

  //         failed: failedEmployeePdfs,

  //         files: employeePdfResults,
  //       },

  //       sitePdf: {
  //         success: sitePdfResult?.success !== false,

  //         file: sitePdfResult,
  //       },
  //     };
  //   } catch (error) {
  //     console.error("");
  //     console.error("=====================================================");

  //     console.error("GENERATE SALARY ERROR");

  //     console.error("MESSAGE:", error.message);

  //     console.error("STACK:", error.stack);

  //     console.error("=====================================================");

  //     // =====================================================
  //     // ROLLBACK ONLY IF TRANSACTION STARTED
  //     // =====================================================

  //     if (transactionStarted) {
  //       try {
  //         await transaction.rollback();

  //         transactionStarted = false;

  //         console.log("TRANSACTION ROLLED BACK");
  //       } catch (rollbackError) {
  //         console.error("ROLLBACK ERROR:", rollbackError.message);
  //       }
  //     }

  //     throw error;
  //   }
  // },

  getSiteWiseSalary: async ({ month, year, site_id = "", client_id = "" }) => {
    const pool = await poolPromise;

    const request = pool.request();

    // =====================================================
    // NORMALIZE INPUT
    // =====================================================

    const numericMonth = Number.parseInt(String(month), 10);

    const numericYear = Number.parseInt(String(year).replace(".00", ""), 10);

    // =====================================================
    // VALIDATION
    // =====================================================

    if (
      !Number.isInteger(numericMonth) ||
      numericMonth < 1 ||
      numericMonth > 12
    ) {
      throw new Error(`Invalid month: ${month}`);
    }

    if (
      !Number.isInteger(numericYear) ||
      numericYear < 2000 ||
      numericYear > 2100
    ) {
      throw new Error(`Invalid year: ${year}`);
    }

    // =====================================================
    // BASE QUERY
    // =====================================================

    let query = `
        SELECT

            ew.site_id,

            ew.client_id,
            ew.client_name,
            ew.client_code,

            ew.at_month,
            ew.at_year,

            COUNT(DISTINCT ew.emp_id) AS total_employees,


            -- =============================================
            -- SALARY
            -- =============================================

            SUM(
                TRY_CONVERT(
                    decimal(18,2),
                    NULLIF(
                        LTRIM(RTRIM(CONVERT(varchar(100), ew.earned_gross))),
                        ''
                    )
                )
            ) AS total_earned_gross,


            SUM(
                TRY_CONVERT(
                    decimal(18,2),
                    NULLIF(
                        LTRIM(RTRIM(CONVERT(varchar(100), ew.total_deduction))),
                        ''
                    )
                )
            ) AS total_deduction,


            SUM(
                TRY_CONVERT(
                    decimal(18,2),
                    NULLIF(
                        LTRIM(RTRIM(CONVERT(varchar(100), ew.net_take_home))),
                        ''
                    )
                )
            ) AS total_net_take_home,


            SUM(
                TRY_CONVERT(
                    decimal(18,2),
                    NULLIF(
                        LTRIM(RTRIM(CONVERT(varchar(100), ew.salary_payable))),
                        ''
                    )
                )
            ) AS total_salary_payable,


            -- =============================================
            -- PF
            -- =============================================

            SUM(
                TRY_CONVERT(
                    decimal(18,2),
                    NULLIF(
                        LTRIM(RTRIM(CONVERT(varchar(100), ew.deduct_pf))),
                        ''
                    )
                )
            ) AS total_pf,


            -- =============================================
            -- ESIC
            -- =============================================

            SUM(
                TRY_CONVERT(
                    decimal(18,2),
                    NULLIF(
                        LTRIM(RTRIM(CONVERT(varchar(100), ew.deduct_esic))),
                        ''
                    )
                )
            ) AS total_esic,


            -- =============================================
            -- ADVANCE
            -- =============================================

            SUM(
                TRY_CONVERT(
                    decimal(18,2),
                    NULLIF(
                        LTRIM(RTRIM(CONVERT(varchar(100), ew.deduct_advance))),
                        ''
                    )
                )
            ) AS total_advance,


            -- =============================================
            -- PT
            -- =============================================

            SUM(
                TRY_CONVERT(
                    decimal(18,2),
                    NULLIF(
                        LTRIM(RTRIM(CONVERT(varchar(100), ew.deduct_pt))),
                        ''
                    )
                )
            ) AS total_pt,


            -- =============================================
            -- UNIFORM
            -- =============================================

            SUM(
                TRY_CONVERT(
                    decimal(18,2),
                    NULLIF(
                        LTRIM(RTRIM(CONVERT(varchar(100), ew.deduct_uniform))),
                        ''
                    )
                )
            ) AS total_uniform,


            -- =============================================
            -- OTHER
            -- =============================================

            SUM(
                TRY_CONVERT(
                    decimal(18,2),
                    NULLIF(
                        LTRIM(RTRIM(CONVERT(varchar(100), ew.deduct_other))),
                        ''
                    )
                )
            ) AS total_other,


            -- =============================================
            -- OT
            -- =============================================

            SUM(
                TRY_CONVERT(
                    decimal(18,2),
                    NULLIF(
                        LTRIM(RTRIM(CONVERT(varchar(100), ew.earned_ot_wages))),
                        ''
                    )
                )
            ) AS total_ot_wages,


            -- =============================================
            -- EMPLOYER COST
            -- =============================================

            SUM(
                TRY_CONVERT(
                    decimal(18,2),
                    NULLIF(
                        LTRIM(RTRIM(CONVERT(varchar(100), ew.emp_ctc))),
                        ''
                    )
                )
            ) AS total_emp_ctc,


            SUM(
                TRY_CONVERT(
                    decimal(18,2),
                    NULLIF(
                        LTRIM(RTRIM(CONVERT(varchar(100), ew.emp_service_charges))),
                        ''
                    )
                )
            ) AS total_service_charges,


            -- =============================================
            -- GST
            -- =============================================

            SUM(
                TRY_CONVERT(
                    decimal(18,2),
                    NULLIF(
                        LTRIM(RTRIM(CONVERT(varchar(100), ew.CGST))),
                        ''
                    )
                )
            ) AS total_cgst,


            SUM(
                TRY_CONVERT(
                    decimal(18,2),
                    NULLIF(
                        LTRIM(RTRIM(CONVERT(varchar(100), ew.SGST))),
                        ''
                    )
                )
            ) AS total_sgst,


            SUM(
                TRY_CONVERT(
                    decimal(18,2),
                    NULLIF(
                        LTRIM(RTRIM(CONVERT(varchar(100), ew.IGST))),
                        ''
                    )
                )
            ) AS total_igst,


            -- =============================================
            -- INVOICE
            -- =============================================

            SUM(
                TRY_CONVERT(
                    decimal(18,2),
                    NULLIF(
                        LTRIM(RTRIM(CONVERT(varchar(100), ew.emp_invoice_amount))),
                        ''
                    )
                )
            ) AS total_invoice_amount


        FROM emp_wages ew

        WHERE 1 = 1
    `;

    // =====================================================
    // MONTH
    // =====================================================

    query += `
        AND TRY_CONVERT(
            INT,
            TRY_CONVERT(
                DECIMAL(10,2),
                NULLIF(
                    LTRIM(RTRIM(CONVERT(varchar(100), ew.at_month))),
                    ''
                )
            )
        ) = @month
    `;

    request.input("month", sql.Int, numericMonth);

    // =====================================================
    // YEAR
    // =====================================================

    query += `
        AND TRY_CONVERT(
            INT,
            TRY_CONVERT(
                DECIMAL(10,2),
                NULLIF(
                    LTRIM(RTRIM(CONVERT(varchar(100), ew.at_year))),
                    ''
                )
            )
        ) = @year
    `;

    request.input("year", sql.Int, numericYear);

    // =====================================================
    // SITE
    // =====================================================

    if (
      site_id !== undefined &&
      site_id !== null &&
      String(site_id).trim() !== ""
    ) {
      query += `
            AND CONVERT(varchar(100), ew.site_id) = @site_id
        `;

      request.input("site_id", sql.VarChar(100), String(site_id).trim());
    }

    // =====================================================
    // CLIENT
    // =====================================================

    if (
      client_id !== undefined &&
      client_id !== null &&
      String(client_id).trim() !== ""
    ) {
      query += `
            AND CONVERT(varchar(100), ew.client_id) = @client_id
        `;

      request.input("client_id", sql.VarChar(100), String(client_id).trim());
    }

    // =====================================================
    // GROUP BY
    // =====================================================

    query += `

        GROUP BY

            ew.site_id,
            ew.client_id,
            ew.client_name,
            ew.client_code,
            ew.at_month,
            ew.at_year

        ORDER BY

            ew.client_name,
            ew.site_id

    `;

    // =====================================================
    // DEBUG
    // =====================================================

    console.log("==========================================");
    console.log("SITE WISE SALARY");
    console.log("MONTH:", numericMonth);
    console.log("YEAR:", numericYear);
    console.log("SITE ID:", site_id);
    console.log("CLIENT ID:", client_id);
    console.log("==========================================");

    // =====================================================
    // EXECUTE
    // =====================================================

    const result = await request.query(query);

    // =====================================================
    // RESULT
    // =====================================================

    console.log("SITE WISE SALARY COUNT:", result.recordset.length);

    return result.recordset;
  },

  // =====================================================
  // SITE EMPLOYEE SALARY
  // =====================================================

  getSiteSalaryEmployees: async ({ site_id, month, year }) => {
    const pool = await poolPromise;

    const request = pool.request();

    // =====================================================
    // NORMALIZE INPUT
    // =====================================================

    const numericMonth = Number.parseInt(String(month), 10);

    const numericYear = Number.parseInt(String(year).replace(".00", ""), 10);

    // =====================================================
    // VALIDATION
    // =====================================================

    if (
      !Number.isInteger(numericMonth) ||
      numericMonth < 1 ||
      numericMonth > 12
    ) {
      throw new Error(`Invalid month: ${month}`);
    }

    if (
      !Number.isInteger(numericYear) ||
      numericYear < 2000 ||
      numericYear > 2100
    ) {
      throw new Error(`Invalid year: ${year}`);
    }

    // =====================================================
    // PARAMETERS
    // =====================================================

    request.input("site_id", sql.VarChar(100), String(site_id).trim());

    request.input("month", sql.Int, numericMonth);

    request.input("year", sql.Int, numericYear);

    // =====================================================
    // QUERY
    // =====================================================

    const result = await request.query(`

        SELECT

            id,

            site_id,
            client_id,

            client_name,
            client_code,

            at_month,
            at_year,

            emp_id,
            emp_code,
            emp_name,
            rank,

            basic,
            vda,
            basic_vda,

            special_allow,
            hra,
            other_allow,
            lww,
            bonus,

            gross,

            ot_rate,

            fixed_leave_wages,
            per_day_rate,

            month_days,
            present_days,
            paid_holiday,

            net_days,
            ot_days,

            earned_basic,
            earned_da,
            earned_basic_da,

            earned_special_allow,
            earned_hra,
            earned_other_allow,

            earned_lww,
            earned_bonus,

            earned_ot_wages,

            earned_gross,

            pf_wages,
            esic_wages,

            deduct_pf,
            deduct_pt,
            deduct_esic,
            deduct_lwf,
            deduct_other,
            deduct_advance,
            deduct_loan,
            deduct_uniform,
            deduct_id,
            deduct_recovery,
            deduct_installment,

            total_deduction,

            net_take_home,

            arrears_payable,
            salary_payable,

            emp_pf,
            emp_esic,
            emp_lwf,
            emp_gratuty,

            emp_ctc,
            emp_service_charges,
            emp_ictc,

            emp_gst,
            emp_invoice_amount,

            billing_type

        FROM emp_wages

        WHERE

            CONVERT(varchar(100), site_id) = @site_id

            AND TRY_CONVERT(
                INT,
                TRY_CONVERT(
                    DECIMAL(10,2),
                    NULLIF(
                        LTRIM(RTRIM(
                            CONVERT(varchar(100), at_month)
                        )),
                        ''
                    )
                )
            ) = @month

            AND TRY_CONVERT(
                INT,
                TRY_CONVERT(
                    DECIMAL(10,2),
                    NULLIF(
                        LTRIM(RTRIM(
                            CONVERT(varchar(100), at_year)
                        )),
                        ''
                    )
                )
            ) = @year

        ORDER BY
            emp_name

    `);

    // =====================================================
    // LOG
    // =====================================================

    console.log("==========================================");
    console.log("SITE SALARY EMPLOYEES");
    console.log("SITE ID:", site_id);
    console.log("MONTH:", numericMonth);
    console.log("YEAR:", numericYear);
    console.log("EMPLOYEE COUNT:", result.recordset.length);
    console.log("==========================================");

    return result.recordset;
  },

  getEmployeeWiseSalary: async ({
    month,
    year,
    site_id,
    client_id,
    client_name,
    site_name,
    employee_name,
    employee_code,
  }) => {
    try {
      const pool = await poolPromise;

      // =====================================================
      // MAIN REQUEST
      // =====================================================

      const request = pool.request();

      request
        .input("month", sql.VarChar, String(month))
        .input("year", sql.VarChar, String(year));

      // =====================================================
      // WHERE CONDITIONS
      // =====================================================

      let whereConditions = `
      CAST(ss.at_month AS VARCHAR) = @month
      AND CAST(ss.at_year AS VARCHAR) = @year
      AND ISNULL(ss.active, 0) = 0
    `;

      // =====================================================
      // SITE ID FILTER
      // =====================================================

      if (site_id) {
        request.input("site_id", sql.VarChar, String(site_id));

        whereConditions += `
        AND CAST(ss.site_id AS VARCHAR) = @site_id
      `;
      }

      // =====================================================
      // CLIENT ID FILTER
      // employee.client_id
      // =====================================================

      if (client_id) {
        request.input("client_id", sql.VarChar, String(client_id));

        whereConditions += `
        AND CAST(e.client_id AS VARCHAR) = @client_id
      `;
      }

      // =====================================================
      // CLIENT NAME FILTER
      // salary_slip.client_name OR employee.client_name
      // =====================================================

      if (client_name) {
        request.input("client_name", sql.VarChar, `%${client_name}%`);

        whereConditions += `
        AND (
          ss.client_name LIKE @client_name
          OR e.client_name LIKE @client_name
        )
      `;
      }

      // =====================================================
      // SITE NAME FILTER
      // salary_slip.site_name OR employee.site_name
      // =====================================================

      if (site_name) {
        request.input("site_name", sql.VarChar, `%${site_name}%`);

        whereConditions += `
        AND (
          ss.site_name LIKE @site_name
          OR e.site_name LIKE @site_name
        )
      `;
      }

      // =====================================================
      // EMPLOYEE NAME FILTER
      // =====================================================

      if (employee_name) {
        request.input("employee_name", sql.VarChar, `%${employee_name}%`);

        whereConditions += `
        AND e.emp_full_name LIKE @employee_name
      `;
      }

      // =====================================================
      // EMPLOYEE CODE FILTER
      // =====================================================

      if (employee_code) {
        request.input("employee_code", sql.VarChar, `%${employee_code}%`);

        whereConditions += `
        AND e.employee_code LIKE @employee_code
      `;
      }

      // =====================================================
      // GET SALARY SLIP
      //
      // salary_slip = MAIN TABLE
      // employee     = ONLY EMPLOYEE DETAILS
      //
      // IMPORTANT:
      // No client_rates JOIN
      // No new_client JOIN
      // No salary earning/deduction JOIN
      // =====================================================

      const result = await request.query(`
      SELECT
        ss.*,

        -- =================================================
        -- EMPLOYEE DETAILS
        -- =================================================

        e.emp_full_name AS emp_name,

        e.employee_code AS emp_code,

        e.employee_code,

        e.rank,

        e.date_of_joining,

        e.uan_no,

        e.pancard_no,

        e.aadhar_no,

        e.bank_name,

        e.account_no,

        e.bank_ifsc AS ifsc_code,

        e.ac_holder_name,

        e.card_no,

        e.dob,

        e.esis_no,

        e.pf_no,

        e.pf_applicable,

        e.gross_salary AS employee_gross_salary,

        e.gross_salary_type,

        e.basic_salary,

        e.basic_salary_type,

        -- =================================================
        -- SITE NAME
        -- salary_slip first, employee second
        -- =================================================

        COALESCE(
          NULLIF(ss.site_name, ''),
          e.site_name
        ) AS final_site_name,

        -- =================================================
        -- CLIENT NAME
        -- salary_slip first, employee second
        -- =================================================

        COALESCE(
          NULLIF(ss.client_name, ''),
          e.client_name
        ) AS company_name

      FROM salary_slip ss

      LEFT JOIN employee e
        ON CAST(e.id AS VARCHAR) =
           CAST(ss.emp_id AS VARCHAR)

      WHERE
        ${whereConditions}

      ORDER BY
        e.emp_full_name ASC
    `);

      const employees = result.recordset;

      // =====================================================
      // DEBUG - RAW RESULT
      // =====================================================

      console.log("==============================================");
      console.log("SALARY SLIP RAW RESULT");
      console.log("Month:", month);
      console.log("Year:", year);
      console.log("Total Salary Slip Rows:", employees.length);

      console.table(
        employees.map((employee) => ({
          salary_slip_id: employee.id,
          emp_id: employee.emp_id,
          emp_name: employee.emp_name,
          employee_code: employee.employee_code,
          gross_salary: employee.gross_salary,
          total_earning: employee.total_earning,
          total_deduction: employee.total_deduction,
          month: employee.at_month,
          year: employee.at_year,
          site_id: employee.site_id,
        })),
      );

      console.log("==============================================");

      // =====================================================
      // FINAL EMPLOYEE DATA
      //
      // No extra DB query required.
      // Everything comes from salary_slip + employee.
      // =====================================================

      const finalData = employees.map((employee) => {
        const totalEarning = Number(employee.total_earning || 0);

        const totalDeduction = Number(employee.total_deduction || 0);

        const grossSalary = Number(employee.gross_salary || 0);

        // Net Payable = Gross Salary - Deduction
        const netPayable = grossSalary;

        return {
          ...employee,

          // ================================================
          // FRONTEND FRIENDLY FIELDS
          // ================================================

          emp_name: employee.emp_name || "-",

          emp_code: employee.employee_code || "-",

          site_name: employee.final_site_name || employee.site_name || "-",

          // ================================================
          // SALARY VALUES
          // ================================================

          total_earned_gross: totalEarning,

          total_deduction: totalDeduction,

          gross_salary: grossSalary,

          net_take_home: netPayable,

          net_payable: netPayable,
        };
      });

      // =====================================================
      // SUMMARY
      // =====================================================

      const totalEmployees = finalData.length;

      const totalEarning = finalData.reduce(
        (sum, employee) => sum + Number(employee.total_earning || 0),
        0,
      );

      const totalDeduction = finalData.reduce(
        (sum, employee) => sum + Number(employee.total_deduction || 0),
        0,
      );

      const grossSalary = finalData.reduce(
        (sum, employee) => sum + Number(employee.gross_salary || 0),
        0,
      );

      // =====================================================
      // NET PAYABLE
      // Gross Salary - Total Deduction
      // =====================================================

      const netPayable = grossSalary;

      // =====================================================
      // SUMMARY OBJECT
      // =====================================================

      const summary = {
        total_employees: totalEmployees,

        total_earning: totalEarning,

        total_deduction: totalDeduction,

        gross_salary: grossSalary,

        net_payable: netPayable,

        // Existing frontend field names
        total_earned_gross: totalEarning,

        total_net_take_home: netPayable,
      };

      // =====================================================
      // DEBUG - FINAL RESPONSE
      // =====================================================

      console.log("==============================================");
      console.log("EMPLOYEE-WISE SALARY FINAL RESPONSE");
      console.log("Month:", month);
      console.log("Year:", year);

      console.log("Total Employees:", summary.total_employees);

      console.log("Total Earning:", summary.total_earning);

      console.log("Total Deduction:", summary.total_deduction);

      console.log("Gross Salary:", summary.gross_salary);

      console.log("Net Payable:", summary.net_payable);

      console.table(
        finalData.map((employee) => ({
          salary_slip_id: employee.id,

          emp_id: employee.emp_id,

          emp_name: employee.emp_name,

          employee_code: employee.employee_code,

          gross_salary: employee.gross_salary,

          total_earning: employee.total_earning,

          total_deduction: employee.total_deduction,

          net_payable: employee.net_payable,
        })),
      );

      console.log("==============================================");

      // =====================================================
      // RETURN DATA + SUMMARY
      // =====================================================
      console.log("Total Employees:", summary.total_employees);
      console.log("Total Earning:", summary.total_earning);
      console.log("Total Deduction:", summary.total_deduction);
      console.log("Gross Salary:", summary.gross_salary);
      console.log("Net Payable:", summary.net_payable);
      console.log("Employee data:", finalData);

      return {
        data: finalData,

        summary: summary,
      };
    } catch (error) {
      console.error("getEmployeeWiseSalary MODEL ERROR:", error);

      throw error;
    }
  },

  //   getEmployeeWiseSalary: async ({
  //   month,
  //   year,
  //   site_id,
  //   client_id,
  //   client_name,
  //   site_name,
  //   employee_name,
  //   employee_code,
  // }) => {
  //   try {
  //     const pool = await poolPromise;

  //     const request = pool.request();

  //     request
  //       .input("month", sql.VarChar, String(month))
  //       .input("year", sql.VarChar, String(year));

  //     let whereConditions = `
  //       CAST(ss.at_month AS VARCHAR) = @month
  //       AND CAST(ss.at_year AS VARCHAR) = @year
  //       AND ISNULL(ss.active, 0) = 0
  //     `;

  //     // ============================================
  //     // SITE ID FILTER
  //     // ============================================

  //     if (site_id) {
  //       request.input("site_id", sql.VarChar, String(site_id));

  //       whereConditions += `
  //         AND CAST(ss.site_id AS VARCHAR) = @site_id
  //       `;
  //     }

  //     // ============================================
  //     // CLIENT ID FILTER
  //     // ============================================

  //     if (client_id) {
  //       request.input("client_id", sql.VarChar, String(client_id));

  //       whereConditions += `
  //         AND CAST(e.client_id AS VARCHAR) = @client_id
  //       `;
  //     }

  //     // ============================================
  //     // CLIENT NAME FILTER
  //     // ============================================

  //     if (client_name) {
  //       request.input(
  //         "client_name",
  //         sql.VarChar,
  //         `%${client_name}%`
  //       );

  //       whereConditions += `
  //         AND (
  //           ss.client_name LIKE @client_name
  //           OR e.client_name LIKE @client_name
  //         )
  //       `;
  //     }

  //     // ============================================
  //     // SITE NAME FILTER
  //     // ============================================

  //     if (site_name) {
  //       request.input(
  //         "site_name",
  //         sql.VarChar,
  //         `%${site_name}%`
  //       );

  //       whereConditions += `
  //         AND (
  //           ss.site_name LIKE @site_name
  //           OR e.site_name LIKE @site_name
  //           OR s.site_name LIKE @site_name
  //         )
  //       `;
  //     }

  //     // ============================================
  //     // EMPLOYEE NAME FILTER
  //     // ============================================

  //     if (employee_name) {
  //       request.input(
  //         "employee_name",
  //         sql.VarChar,
  //         `%${employee_name}%`
  //       );

  //       whereConditions += `
  //         AND e.emp_full_name LIKE @employee_name
  //       `;
  //     }

  //     // ============================================
  //     // EMPLOYEE CODE FILTER
  //     // ============================================

  //     if (employee_code) {
  //       request.input(
  //         "employee_code",
  //         sql.VarChar,
  //         `%${employee_code}%`
  //       );

  //       whereConditions += `
  //         AND e.employee_code LIKE @employee_code
  //       `;
  //     }

  //     // ============================================
  //     // GET SALARY SLIPS
  //     // ============================================

  //     const result = await request.query(`
  //       SELECT
  //         ss.*,

  //         -- ========================================
  //         -- EMPLOYEE DETAILS
  //         -- ========================================

  //         e.emp_full_name AS emp_name,
  //         e.employee_code,
  //         e.rank,
  //         e.date_of_joining,
  //         e.uan_no,
  //         e.pancard_no,
  //         e.aadhar_no,

  //         e.bank_name,
  //         e.account_no,
  //         e.bank_ifsc AS ifsc_code,

  //         e.ac_holder_name,
  //         e.card_no,

  //         -- ========================================
  //         -- SITE DETAILS
  //         -- ========================================

  //         COALESCE(
  //           NULLIF(ss.site_name, ''),
  //           e.site_name,
  //           s.site_name
  //         ) AS site_name,

  //         -- ========================================
  //         -- CLIENT DETAILS
  //         -- ========================================

  //         COALESCE(
  //           NULLIF(ss.client_name, ''),
  //           e.client_name
  //         ) AS company_name

  //       FROM salary_slip ss

  //       -- ==========================================
  //       -- EMPLOYEE JOIN
  //       -- ==========================================

  //       LEFT JOIN employee e
  //         ON CAST(e.id AS VARCHAR)
  //         =
  //         CAST(ss.emp_id AS VARCHAR)

  //       -- ==========================================
  //       -- SITE JOIN
  //       -- ==========================================

  //       LEFT JOIN client_rates s
  //         ON CAST(s.id AS VARCHAR)
  //         =
  //         CAST(ss.site_id AS VARCHAR)

  //       -- ==========================================
  //       -- IMPORTANT:
  //       -- new_client JOIN REMOVED
  //       -- because it was creating duplicate rows
  //       -- ==========================================

  //       WHERE
  //         ${whereConditions}

  //       ORDER BY
  //         e.emp_full_name ASC
  //     `);

  //     const employees = result.recordset;

  //     // ============================================
  //     // DEBUG LOG - RAW SALARY SLIP DATA
  //     // ============================================

  //     console.log("==============================================");
  //     console.log("SALARY SLIP RAW RESULT");
  //     console.log("Month:", month);
  //     console.log("Year:", year);
  //     console.log("Total Salary Slip Rows:", employees.length);

  //     console.table(
  //       employees.map((employee) => ({
  //         salary_slip_id: employee.id,
  //         emp_id: employee.emp_id,
  //         emp_name: employee.emp_name,
  //         employee_code: employee.employee_code,
  //         month: employee.at_month,
  //         year: employee.at_year,
  //         site_id: employee.site_id,
  //       }))
  //     );

  //     console.log("==============================================");

  //     // ============================================
  //     // GET EARNINGS + DEDUCTIONS
  //     // ============================================

  //     const finalData = await Promise.all(
  //       employees.map(async (employee) => {

  //         // ========================================
  //         // EARNINGS
  //         // ========================================

  //         const earningsResult = await pool
  //           .request()
  //           .input(
  //             "emp_id",
  //             sql.VarChar,
  //             String(employee.emp_id)
  //           )
  //           .query(`
  //             SELECT
  //               id,
  //               emp_id,
  //               tmpl_id,
  //               earning_name,
  //               earning_rate,
  //               earning_amount,
  //               active,
  //               source

  //             FROM emp_salary_earning

  //             WHERE
  //               CAST(emp_id AS VARCHAR) = @emp_id

  //               AND ISNULL(active, 0) = 0
  //           `);

  //         // ========================================
  //         // DEDUCTIONS
  //         // ========================================

  //         const deductionsResult = await pool
  //           .request()
  //           .input(
  //             "emp_id",
  //             sql.VarChar,
  //             String(employee.emp_id)
  //           )
  //           .query(`
  //             SELECT
  //               id,
  //               emp_id,
  //               tmpl_id,
  //               deduction_name,
  //               deduction_rate,
  //               deduction_amount,
  //               active,
  //               source

  //             FROM emp_salary_deduction

  //             WHERE
  //               CAST(emp_id AS VARCHAR) = @emp_id

  //               AND ISNULL(active, 0) = 0
  //           `);

  //         // ========================================
  //         // RETURN EMPLOYEE SALARY DATA
  //         // ========================================

  //         return {
  //           ...employee,

  //           earnings: earningsResult.recordset,

  //           deductions: deductionsResult.recordset,

  //           // ======================================
  //           // TOTAL EARNING
  //           // ======================================

  //           total_earned_gross:
  //             Number(employee.total_earning || 0),

  //           // ======================================
  //           // TOTAL DEDUCTION
  //           // ======================================

  //           total_deduction:
  //             Number(employee.total_deduction || 0),

  //           // ======================================
  //           // NET SALARY
  //           // ======================================

  //           net_take_home:
  //             Number(employee.total_earning || 0) -
  //             Number(employee.total_deduction || 0),
  //         };
  //       })
  //     );

  //     // ============================================
  //     // DEBUG LOG - FINAL RESPONSE
  //     // ============================================

  //     console.log("==============================================");
  //     console.log("EMPLOYEE-WISE SALARY FINAL RESPONSE");
  //     console.log("Month:", month);
  //     console.log("Year:", year);
  //     console.log("Total Employees:", finalData.length);

  //     console.table(
  //       finalData.map((employee) => ({
  //         salary_slip_id: employee.id,
  //         emp_id: employee.emp_id,
  //         emp_name: employee.emp_name,
  //         employee_code: employee.employee_code,
  //         total_earning: employee.total_earned_gross,
  //         total_deduction: employee.total_deduction,
  //         net_salary: employee.net_take_home,
  //       }))
  //     );

  //     console.log("==============================================");

  //     return finalData;

  //   } catch (error) {
  //     console.error(
  //       "getEmployeeWiseSalary MODEL ERROR:",
  //       error
  //     );

  //     throw error;
  //   }
  // },

  // getEmployeeWiseSalary: async ({
  //   month,
  //   year,
  //   site_id,
  //   client_id,
  //   client_name,
  //   site_name,
  //   employee_name,
  //   employee_code,
  // }) => {
  //   try {
  //     const pool = await poolPromise;

  //     const request = pool.request();

  //     request
  //       .input("month", sql.VarChar, String(month))
  //       .input("year", sql.VarChar, String(year));

  //     let whereConditions = `
  //     CAST(ss.at_month AS VARCHAR) = @month

  //     AND

  //     CAST(ss.at_year AS VARCHAR) = @year

  //     AND

  //     ISNULL(ss.active, 0) = 0
  //   `;

  //     // ============================================
  //     // SITE ID FILTER
  //     // ============================================

  //     if (site_id) {
  //       request.input("site_id", sql.VarChar, String(site_id));

  //       whereConditions += `

  //       AND CAST(ss.site_id AS VARCHAR) = @site_id
  //     `;
  //     }

  //     // ============================================
  //     // CLIENT ID FILTER
  //     // ============================================

  //     if (client_id) {
  //       request.input("client_id", sql.VarChar, String(client_id));

  //       whereConditions += `

  //       AND CAST(ss.client_code AS VARCHAR) = @client_id
  //     `;
  //     }

  //     // ============================================
  //     // CLIENT NAME FILTER
  //     // ============================================

  //     if (client_name) {
  //       request.input("client_name", sql.VarChar, `%${client_name}%`);

  //       whereConditions += `

  //       AND c.client_name LIKE @client_name
  //     `;
  //     }

  //     // ============================================
  //     // SITE NAME FILTER
  //     // ============================================

  //     if (site_name) {
  //       request.input("site_name", sql.VarChar, `%${site_name}%`);

  //       whereConditions += `

  //       AND s.site_name LIKE @site_name
  //     `;
  //     }

  //     // ============================================
  //     // EMPLOYEE NAME FILTER
  //     // ============================================

  //     if (employee_name) {
  //       request.input("employee_name", sql.VarChar, `%${employee_name}%`);

  //       whereConditions += `

  //       AND e.emp_name LIKE @employee_name
  //     `;
  //     }

  //     // ============================================
  //     // EMPLOYEE CODE FILTER
  //     // ============================================

  //     if (employee_code) {
  //       request.input("employee_code", sql.VarChar, `%${employee_code}%`);

  //       whereConditions += `

  //       AND e.emp_code LIKE @employee_code
  //     `;
  //     }

  //     // ============================================
  //     // GET SALARY SLIPS
  //     // ============================================

  //     const result = await request.query(`

  //     SELECT

  //       ss.*,

  //       e.emp_name,
  //       e.employee_code,

  //       e.rank,
  //       e.date_of_joining,
  //       e.uan_no,
  //       e.pancard_no,
  //       e.aadhar_no,
  //       e.bank_name,
  //       e.account_no,
  //       e.ifsc_code,

  //       s.site_name,

  //       c.company_name

  //     FROM salary_slip ss

  //     LEFT JOIN employee e

  //       ON CAST(e.id AS VARCHAR)
  //       =
  //       CAST(ss.emp_id AS VARCHAR)

  //     LEFT JOIN client_rates s

  //       ON CAST(s.id AS VARCHAR)
  //       =
  //       CAST(ss.site_id AS VARCHAR)

  //     LEFT JOIN new_client c

  //       ON CAST(c.client_code AS VARCHAR)
  //       =
  //       CAST(ss.client_code AS VARCHAR)

  //     WHERE

  //       ${whereConditions}

  //     ORDER BY

  //       e.emp_name ASC

  //   `);

  //     const employees = result.recordset;

  //     // ============================================
  //     // GET EARNINGS + DEDUCTIONS
  //     // ============================================

  //     const finalData = await Promise.all(
  //       employees.map(async (employee) => {
  //         // ========================================
  //         // EARNINGS
  //         // ========================================

  //         const earningsResult = await pool
  //           .request()

  //           .input("emp_id", sql.VarChar, String(employee.emp_id)).query(`

  //             SELECT

  //               id,
  //               emp_id,
  //               tmpl_id,

  //               earning_name,
  //               earning_rate,
  //               earning_amount,

  //               active,
  //               source

  //             FROM emp_salary_earning

  //             WHERE

  //               CAST(emp_id AS VARCHAR)
  //               =
  //               @emp_id

  //             AND

  //               ISNULL(active, 0) = 0

  //           `);

  //         // ========================================
  //         // DEDUCTIONS
  //         // ========================================

  //         const deductionsResult = await pool
  //           .request()

  //           .input("emp_id", sql.VarChar, String(employee.emp_id)).query(`

  //             SELECT

  //               id,
  //               emp_id,
  //               tmpl_id,

  //               deduction_name,
  //               deduction_rate,
  //               deduction_amount,

  //               active,
  //               source

  //             FROM emp_salary_deduction

  //             WHERE

  //               CAST(emp_id AS VARCHAR)
  //               =
  //               @emp_id

  //             AND

  //               ISNULL(active, 0) = 0

  //           `);

  //         // ========================================
  //         // RETURN DATA
  //         // ========================================

  //         return {
  //           ...employee,

  //           earnings: earningsResult.recordset,

  //           deductions: deductionsResult.recordset,

  //           // ==============================
  //           // TOTAL EARNING
  //           // ==============================

  //           total_earned_gross: Number(employee.total_earning || 0),

  //           // ==============================
  //           // TOTAL DEDUCTION
  //           // ==============================

  //           total_deduction: Number(employee.total_deduction || 0),

  //           // ==============================
  //           // NET SALARY
  //           // ==============================

  //           net_take_home:
  //             Number(employee.total_earning || 0) -
  //             Number(employee.total_deduction || 0),
  //         };
  //       }),
  //     );

  //     return finalData;
  //   } catch (error) {
  //     console.error("getEmployeeWiseSalary MODEL ERROR:", error);

  //     throw error;
  //   }
  // },

  // =====================================================
  // GENERATE SALARY FROM EMP_WAGES
  // InvoiceModel salary generation logic
  // =====================================================

  // generateSalaryFromEmpWages: async ({ siteId, clientId, month, year }) => {
  //   let transaction;

  //   try {
  //     console.log("\n======================================================");
  //     console.log("           GENERATE SALARY FROM EMP_WAGES");
  //     console.log("======================================================");
  //     console.log("SITE ID   :", siteId);
  //     console.log("CLIENT ID :", clientId);
  //     console.log("MONTH     :", month);
  //     console.log("YEAR      :", year);
  //     console.log("======================================================\n");

  //     // =================================================
  //     // GET DATABASE POOL
  //     // =================================================

  //     const pool = await poolPromise;

  //     // =================================================
  //     // START TRANSACTION
  //     // =================================================

  //     transaction = new sql.Transaction(pool);

  //     await transaction.begin();

  //     console.log("TRANSACTION STARTED");

  //     // =================================================
  //     // GET EMP_WAGES
  //     // =================================================

  //     const wagesResult = await new sql.Request(transaction)
  //       .input("site_id", sql.Int, Number(siteId))
  //       .input("client_id", sql.Int, Number(clientId))
  //       .input("at_month", sql.VarChar(20), String(month))
  //       .input("at_year", sql.Int, Number(year)).query(`
  //       SELECT *
  //       FROM emp_wages
  //       WHERE TRY_CONVERT(DECIMAL(18,2), site_id) =
  //             TRY_CONVERT(DECIMAL(18,2), @site_id)

  //         AND TRY_CONVERT(DECIMAL(18,2), client_id) =
  //             TRY_CONVERT(DECIMAL(18,2), @client_id)

  //         AND TRY_CONVERT(INT, at_month) =
  //             TRY_CONVERT(INT, @at_month)

  //         AND TRY_CONVERT(DECIMAL(18,2), at_year) =
  //             TRY_CONVERT(DECIMAL(18,2), @at_year)
  //     `);

  //     const empWages = wagesResult.recordset || [];

  //     console.log("\n======================================================");
  //     console.log("              EMP_WAGES RESULT");
  //     console.log("======================================================");
  //     console.log("EMP_WAGES FOUND :", empWages.length);
  //     console.log("======================================================\n");

  //     // =================================================
  //     // NO DATA
  //     // =================================================

  //     if (empWages.length === 0) {
  //       await transaction.commit();

  //       console.log("NO EMP_WAGES FOUND");
  //       console.log("TRANSACTION COMMITTED");

  //       return {
  //         generated: 0,
  //         skipped: 0,
  //         employees: [],
  //         message: "No employee wage data found",
  //       };
  //     }

  //     // =================================================
  //     // COUNTERS
  //     // =================================================

  //     let generated = 0;
  //     let skipped = 0;

  //     const employees = [];

  //     // =================================================
  //     // LOOP EMP_WAGES
  //     // =================================================

  //     for (const wage of empWages) {
  //       console.log("\n======================================================");
  //       console.log("                 PROCESSING EMPLOYEE");
  //       console.log("======================================================");
  //       console.log("EMP ID   :", wage.emp_id);
  //       console.log("EMP CODE :", wage.emp_code);
  //       console.log("NAME     :", wage.emp_name);
  //       console.log("SITE ID  :", wage.site_id);
  //       console.log("MONTH    :", month);
  //       console.log("YEAR     :", year);
  //       console.log("======================================================");

  //       // =================================================
  //       // VALIDATE EMPLOYEE ID
  //       // =================================================

  //       if (!wage.emp_id) {
  //         console.log("SKIPPED - EMPLOYEE ID NOT FOUND");

  //         skipped++;

  //         employees.push({
  //           emp_id: null,
  //           emp_code: wage.emp_code || "",
  //           emp_name: wage.emp_name || "",
  //           status: "Skipped",
  //           reason: "Employee ID not found",
  //         });

  //         continue;
  //       }

  //       // =================================================
  //       // CHECK EXISTING SALARY SLIP
  //       // =================================================

  //       console.log("\n------------------------------------------------------");
  //       console.log("CHECKING EXISTING SALARY SLIP");
  //       console.log("------------------------------------------------------");
  //       console.log("EMP ID   :", wage.emp_id);
  //       console.log("SITE ID  :", wage.site_id);
  //       console.log("MONTH    :", month);
  //       console.log("YEAR     :", year);
  //       console.log("------------------------------------------------------");

  //       const salarySlipCheck = await new sql.Request(transaction)
  //         .input("emp_id", sql.Int, Number(wage.emp_id))
  //         .input("site_id", sql.Int, Number(wage.site_id))
  //         .input("at_month", sql.VarChar(20), String(month))
  //         .input("at_year", sql.Int, Number(year)).query(`
  //         SELECT
  //           id,
  //           emp_id,
  //           at_month,
  //           at_year,
  //           salary_template,
  //           def_gross_salary,
  //           def_gross_salary_type,
  //           def_basic_salary,
  //           def_basic_salary_type,
  //           basic_rate,
  //           no_of_days,
  //           total_earning,
  //           total_deduction,
  //           active,
  //           site_id,
  //           client_code,
  //           rank,
  //           gross_salary,
  //           ac_holder_name,
  //           card_no,
  //           bank_name,
  //           remark,
  //           hold_salary,
  //           site_name,
  //           client_name,
  //           source
  //         FROM salary_slip
  //         WHERE emp_id = @emp_id
  //           AND site_id = @site_id
  //           AND at_month = @at_month
  //           AND at_year = @at_year
  //           AND (active = 0 OR active IS NULL)
  //           AND (source = 'Invoice' OR source IS NULL)
  //       `);

  //       console.log(
  //         "EXISTING SALARY SLIP COUNT :",
  //         salarySlipCheck.recordset.length,
  //       );

  //       if (salarySlipCheck.recordset.length > 0) {
  //         console.log("EXISTING SALARY SLIP DATA :");

  //         console.log(JSON.stringify(salarySlipCheck.recordset, null, 2));
  //       } else {
  //         console.log("NO EXISTING SALARY SLIP FOUND");
  //       }

  //       // =================================================
  //       // DELETE OLD SALARY SLIP
  //       // =================================================

  //       if (salarySlipCheck.recordset.length > 0) {
  //         console.log(
  //           "\n------------------------------------------------------",
  //         );
  //         console.log("DELETING OLD SALARY SLIP");
  //         console.log("------------------------------------------------------");

  //         const deleteSalarySlipResult = await new sql.Request(transaction)
  //           .input("emp_id", sql.Int, Number(wage.emp_id))
  //           .input("site_id", sql.Int, Number(wage.site_id))
  //           .input("at_month", sql.VarChar(20), String(month))
  //           .input("at_year", sql.Int, Number(year)).query(`
  //             DELETE FROM salary_slip
  //             WHERE emp_id = @emp_id
  //               AND site_id = @site_id
  //               AND at_month = @at_month
  //               AND at_year = @at_year
  //               AND (active = 0 OR active IS NULL)
  //               AND (source = 'Invoice' OR source IS NULL)
  //           `);

  //         console.log("OLD SALARY SLIP DELETED");

  //         console.log("EMP ID       :", wage.emp_id);

  //         console.log("ROWS DELETED :", deleteSalarySlipResult.rowsAffected[0]);
  //       } else {
  //         console.log("NO OLD SALARY SLIP TO DELETE");
  //       }

  //       // =================================================
  //       // PREPARE NEW SALARY SLIP DATA
  //       // =================================================
  //       //
  //       // IMPORTANT:
  //       //
  //       // def_gross_salary = MONTHLY GROSS
  //       // def_basic_salary = MONTHLY BASIC
  //       // basic_rate       = EARNED BASIC
  //       //
  //       // No salary calculation is happening here.
  //       // Values are directly taken from emp_wages.
  //       // =================================================

  //       const salarySlipData = {
  //         emp_id: Number(wage.emp_id),

  //         at_month: String(month),

  //         at_year: Number(year),

  //         salary_template: 0,

  //         gross_salary:
  //           Number(wage.earned_gross || 0) - Number(wage.total_deduction || 0),

  //         def_gross_salary_type: "FIXED",

  //         // MONTHLY BASIC
  //         def_basic_salary: Number(wage.basic || 0),

  //         def_basic_salary_type: "FIXED",

  //         // EARNED BASIC
  //         basic_rate: Number(wage.earned_basic || 0),

  //         // EARNED / ACTUAL DAYS
  //         no_of_days: Number(wage.net_days || wage.month_days || 0),

  //         // EARNED GROSS
  //         total_earning: Number(wage.earned_gross || 0),

  //         // TOTAL DEDUCTION
  //         total_deduction: Number(wage.total_deduction || 0),

  //         active: 0,

  //         site_id: Number(wage.site_id),

  //         client_code: wage.client_code || "",

  //         rank: wage.rank || "",

  //         gross_salary:
  // Number(wage.earned_gross || 0) -
  // Number(wage.total_deduction || 0),

  //         ac_holder_name: "",

  //         card_no: "",

  //         bank_name: "",

  //         remark: "",

  //         hold_salary: 0,

  //         site_name: wage.site_name || "",

  //         client_name: wage.client_name || "",

  //         source: "Invoice",
  //       };

  //       // =================================================
  //       // LOG EXACT SALARY SLIP DATA
  //       // =================================================

  //       console.log("\n======================================================");
  //       console.log("             NEW SALARY SLIP INSERT DATA");
  //       console.log("======================================================");

  //       console.log(JSON.stringify(salarySlipData, null, 2));

  //       console.log("======================================================");

  //       console.log("MONTHLY GROSS       :", salarySlipData.def_gross_salary);

  //       console.log("MONTHLY BASIC       :", salarySlipData.def_basic_salary);

  //       console.log("EARNED BASIC        :", salarySlipData.basic_rate);

  //       console.log("EARNED GROSS        :", salarySlipData.total_earning);

  //       console.log("TOTAL DEDUCTION     :", salarySlipData.total_deduction);

  //       console.log("NO OF DAYS          :", salarySlipData.no_of_days);

  //       console.log("======================================================\n");

  //       // =================================================
  //       // INSERT NEW SALARY SLIP
  //       // =================================================

  //       console.log("INSERTING NEW SALARY SLIP...");

  //       await new sql.Request(transaction)
  //         .input("emp_id", sql.Int, salarySlipData.emp_id)
  //         .input("at_month", sql.VarChar(20), salarySlipData.at_month)
  //         .input("at_year", sql.Int, salarySlipData.at_year)
  //         .input("salary_template", sql.Int, salarySlipData.salary_template)
  //         .input(
  //           "def_gross_salary",
  //           sql.Decimal(18, 2),
  //           salarySlipData.def_gross_salary,
  //         )
  //         .input(
  //           "def_gross_salary_type",
  //           sql.NVarChar(50),
  //           salarySlipData.def_gross_salary_type,
  //         )
  //         .input(
  //           "def_basic_salary",
  //           sql.Decimal(18, 2),
  //           salarySlipData.def_basic_salary,
  //         )
  //         .input(
  //           "def_basic_salary_type",
  //           sql.NVarChar(50),
  //           salarySlipData.def_basic_salary_type,
  //         )
  //         .input("basic_rate", sql.Decimal(18, 2), salarySlipData.basic_rate)
  //         .input("no_of_days", sql.Decimal(18, 2), salarySlipData.no_of_days)
  //         .input(
  //           "total_earning",
  //           sql.Decimal(18, 2),
  //           salarySlipData.total_earning,
  //         )
  //         .input(
  //           "total_deduction",
  //           sql.Decimal(18, 2),
  //           salarySlipData.total_deduction,
  //         )
  //         .input("site_id", sql.Int, salarySlipData.site_id)
  //         .input("client_code", sql.NVarChar(100), salarySlipData.client_code)
  //         .input("rank", sql.NVarChar(100), salarySlipData.rank)
  //         .input(
  //           "gross_salary",
  //           sql.Decimal(18, 2),
  //           salarySlipData.gross_salary,
  //         )
  //         .input(
  //           "ac_holder_name",
  //           sql.NVarChar(255),
  //           salarySlipData.ac_holder_name,
  //         )
  //         .input("card_no", sql.NVarChar(100), salarySlipData.card_no)
  //         .input("bank_name", sql.NVarChar(255), salarySlipData.bank_name)
  //         .input("remark", sql.NVarChar(500), salarySlipData.remark)
  //         .input("hold_salary", sql.Int, salarySlipData.hold_salary)
  //         .input("site_name", sql.NVarChar(255), salarySlipData.site_name)
  //         .input("client_name", sql.NVarChar(255), salarySlipData.client_name)
  //         .input("source", sql.NVarChar(100), salarySlipData.source).query(`
  //         INSERT INTO salary_slip
  //         (
  //           emp_id,
  //           at_month,
  //           at_year,
  //           salary_template,
  //           def_gross_salary,
  //           def_gross_salary_type,
  //           def_basic_salary,
  //           def_basic_salary_type,
  //           basic_rate,
  //           no_of_days,
  //           total_earning,
  //           total_deduction,
  //           active,
  //           site_id,
  //           client_code,
  //           rank,
  //           gross_salary,
  //           ac_holder_name,
  //           card_no,
  //           bank_name,
  //           remark,
  //           hold_salary,
  //           site_name,
  //           client_name,
  //           source
  //         )
  //         VALUES
  //         (
  //           @emp_id,
  //           @at_month,
  //           @at_year,
  //           @salary_template,
  //           @def_gross_salary,
  //           @def_gross_salary_type,
  //           @def_basic_salary,
  //           @def_basic_salary_type,
  //           @basic_rate,
  //           @no_of_days,
  //           @total_earning,
  //           @total_deduction,
  //           0,
  //           @site_id,
  //           @client_code,
  //           @rank,
  //           @gross_salary,
  //           @ac_holder_name,
  //           @card_no,
  //           @bank_name,
  //           @remark,
  //           @hold_salary,
  //           @site_name,
  //           @client_name,
  //           @source
  //         )
  //       `);

  //       console.log("\n======================================================");
  //       console.log("             SALARY SLIP INSERTED");
  //       console.log("======================================================");
  //       console.log("EMP ID          :", salarySlipData.emp_id);
  //       console.log("MONTH           :", salarySlipData.at_month);
  //       console.log("YEAR            :", salarySlipData.at_year);
  //       console.log("MONTHLY GROSS   :", salarySlipData.def_gross_salary);
  //       console.log("MONTHLY BASIC   :", salarySlipData.def_basic_salary);
  //       console.log("EARNED BASIC    :", salarySlipData.basic_rate);
  //       console.log("EARNED GROSS    :", salarySlipData.total_earning);
  //       console.log("TOTAL DEDUCTION :", salarySlipData.total_deduction);
  //       console.log("STATUS          : SUCCESS");
  //       console.log("======================================================\n");

  //       // =================================================
  //       // DELETE OLD EARNINGS
  //       // =================================================

  //       console.log("DELETING OLD EARNINGS :", wage.emp_id);

  //       const deleteEarningsResult = await new sql.Request(transaction).input(
  //         "emp_id",
  //         sql.Int,
  //         Number(wage.emp_id),
  //       ).query(`
  //           DELETE FROM emp_salary_earning
  //           WHERE emp_id = @emp_id
  //             AND source = 'Invoice'
  //         `);

  //       console.log(
  //         "OLD EARNINGS DELETED :",
  //         deleteEarningsResult.rowsAffected[0],
  //       );

  //       // =================================================
  //       // EARNINGS
  //       // =================================================

  //       const earnings = [
  //         {
  //           name: "BASIC",
  //           amount: wage.earned_basic,
  //         },
  //         {
  //           name: "VDA",
  //           amount: wage.earned_da,
  //         },
  //         {
  //           name: "HRA",
  //           amount: wage.earned_hra,
  //         },
  //         {
  //           name: "SPECIAL ALLOWANCE",
  //           amount: wage.earned_special_allow,
  //         },
  //         {
  //           name: "OTHER ALLOWANCE",
  //           amount: wage.earned_other_allow,
  //         },
  //         {
  //           name: "LWW",
  //           amount: wage.earned_lww,
  //         },
  //         {
  //           name: "BONUS",
  //           amount: wage.earned_bonus,
  //         },
  //         {
  //           name: "OT WAGES",
  //           amount: wage.earned_ot_wages,
  //         },
  //         {
  //           name: "LEAVE WAGES",
  //           amount: wage.earned_leave_wages,
  //         },
  //         {
  //           name: "UNIFORM WAGES",
  //           amount: wage.earned_uniform_wages,
  //         },
  //         {
  //           name: "ANY OTHER",
  //           amount: wage.earned_any_other,
  //         },
  //         {
  //           name: "HOLIDAY PAY",
  //           amount: wage.earned_holiday_pay,
  //         },
  //         {
  //           name: "INCENTIVE",
  //           amount: wage.earned_incentive,
  //         },
  //         {
  //           name: "NIGHT ALLOWANCE",
  //           amount: wage.earned_night_allow,
  //         },
  //       ];

  //       // =================================================
  //       // INSERT EARNINGS
  //       // =================================================

  //       console.log("\nINSERTING NEW EARNINGS...");

  //       for (const earning of earnings) {
  //         const amount = Number(earning.amount || 0);

  //         // Zero amount is not inserted
  //         if (amount === 0) {
  //           continue;
  //         }

  //         await new sql.Request(transaction)
  //           .input("emp_id", sql.Int, Number(wage.emp_id))
  //           .input("tmpl_id", sql.Int, 0)
  //           .input("earning_name", sql.NVarChar(255), earning.name)
  //           .input("earning_rate", sql.Decimal(18, 2), 0)
  //           .input("earning_amount", sql.Decimal(18, 2), amount)
  //           .input("source", sql.NVarChar(100), "Invoice").query(`
  //           INSERT INTO emp_salary_earning
  //           (
  //             emp_id,
  //             tmpl_id,
  //             earning_name,
  //             earning_rate,
  //             earning_amount,
  //             active,
  //             source
  //           )
  //           VALUES
  //           (
  //             @emp_id,
  //             @tmpl_id,
  //             @earning_name,
  //             @earning_rate,
  //             @earning_amount,
  //             0,
  //             @source
  //           )
  //         `);

  //         console.log("EARNING INSERTED :", earning.name, amount);
  //       }

  //       // =================================================
  //       // DELETE OLD DEDUCTIONS
  //       // =================================================

  //       console.log("\nDELETING OLD DEDUCTIONS :", wage.emp_id);

  //       const deleteDeductionsResult = await new sql.Request(transaction).input(
  //         "emp_id",
  //         sql.Int,
  //         Number(wage.emp_id),
  //       ).query(`
  //           DELETE FROM emp_salary_deduction
  //           WHERE emp_id = @emp_id
  //             AND source = 'Invoice'
  //         `);

  //       console.log(
  //         "OLD DEDUCTIONS DELETED :",
  //         deleteDeductionsResult.rowsAffected[0],
  //       );

  //       // =================================================
  //       // DEDUCTIONS
  //       // =================================================

  //       const deductions = [
  //         {
  //           name: "PF",
  //           amount: wage.deduct_pf,
  //         },
  //         {
  //           name: "PT",
  //           amount: wage.deduct_pt,
  //         },
  //         {
  //           name: "ESIC",
  //           amount: wage.deduct_esic,
  //         },
  //         {
  //           name: "LWF",
  //           amount: wage.deduct_lwf,
  //         },
  //         {
  //           name: "OTHER DEDUCTION",
  //           amount: wage.deduct_other,
  //         },
  //         {
  //           name: "ADVANCE",
  //           amount: wage.deduct_advance,
  //         },
  //         {
  //           name: "LOAN",
  //           amount: wage.deduct_loan,
  //         },
  //         {
  //           name: "UNIFORM",
  //           amount: wage.deduct_uniform,
  //         },
  //         {
  //           name: "ID",
  //           amount: wage.deduct_id,
  //         },
  //         {
  //           name: "RECOVERY",
  //           amount: wage.deduct_recovery,
  //         },
  //         {
  //           name: "INSTALLMENT",
  //           amount: wage.deduct_installment,
  //         },
  //       ];

  //       // =================================================
  //       // INSERT DEDUCTIONS
  //       // =================================================

  //       console.log("\nINSERTING NEW DEDUCTIONS...");

  //       for (const deduction of deductions) {
  //         const amount = Number(deduction.amount || 0);

  //         // Zero amount is not inserted
  //         if (amount === 0) {
  //           continue;
  //         }

  //         await new sql.Request(transaction)
  //           .input("emp_id", sql.Int, Number(wage.emp_id))
  //           .input("tmpl_id", sql.Int, 0)
  //           .input("deduction_name", sql.NVarChar(255), deduction.name)
  //           .input("deduction_rate", sql.Decimal(18, 2), 0)
  //           .input("deduction_amount", sql.Decimal(18, 2), amount)
  //           .input("source", sql.NVarChar(100), "Invoice").query(`
  //           INSERT INTO emp_salary_deduction
  //           (
  //             emp_id,
  //             tmpl_id,
  //             deduction_name,
  //             deduction_rate,
  //             deduction_amount,
  //             active,
  //             source
  //           )
  //           VALUES
  //           (
  //             @emp_id,
  //             @tmpl_id,
  //             @deduction_name,
  //             @deduction_rate,
  //             @deduction_amount,
  //             0,
  //             @source
  //           )
  //         `);

  //         console.log("DEDUCTION INSERTED :", deduction.name, amount);
  //       }

  //       // =================================================
  //       // EMPLOYEE SUCCESS
  //       // =================================================

  //       generated++;

  //       employees.push({
  //         emp_id: Number(wage.emp_id),
  //         emp_code: wage.emp_code || "",
  //         emp_name: wage.emp_name || "",
  //         status: "Generated",

  //         gross_salary:
  // Number(wage.earned_gross || 0) -
  // Number(wage.total_deduction || 0),

  //         // EARNED GROSS
  //         earned_gross: Number(wage.earned_gross || 0),

  //         // TOTAL DEDUCTION
  //         total_deduction: Number(wage.total_deduction || 0),
  //       });

  //       console.log("\n======================================================");
  //       console.log("          EMPLOYEE SALARY DATA COMPLETED");
  //       console.log("======================================================");
  //       console.log("EMP ID          :", wage.emp_id);
  //       console.log("EMP CODE        :", wage.emp_code);
  //       console.log("NAME            :", wage.emp_name);
  //       console.log("MONTHLY GROSS   :", wage.gross);
  //       console.log("MONTHLY BASIC   :", wage.basic);
  //       console.log("EARNED BASIC    :", wage.earned_basic);
  //       console.log("EARNED GROSS    :", wage.earned_gross);
  //       console.log("TOTAL DEDUCTION :", wage.total_deduction);
  //       console.log("STATUS          : GENERATED");
  //       console.log("======================================================\n");
  //     }

  //     // =================================================
  //     // COMMIT
  //     // =================================================

  //     await transaction.commit();

  //     console.log("\n======================================================");
  //     console.log("          SALARY GENERATION COMMITTED");
  //     console.log("======================================================");
  //     console.log("GENERATED :", generated);
  //     console.log("SKIPPED   :", skipped);
  //     console.log("======================================================\n");

  //     return {
  //       generated,
  //       skipped,
  //       employees,
  //       message: "Salary generated successfully",
  //     };
  //   } catch (error) {
  //     // =================================================
  //     // ROLLBACK
  //     // =================================================

  //     console.error("\n======================================================");
  //     console.error("          GENERATE SALARY MODEL ERROR");
  //     console.error("======================================================");

  //     console.error("MESSAGE :", error?.message);
  //     console.error("NUMBER  :", error?.number);
  //     console.error("STATE   :", error?.state);
  //     console.error("CLASS   :", error?.class);
  //     console.error("LINE    :", error?.line);
  //     console.error("STACK   :", error?.stack);

  //     console.error("======================================================");

  //     if (transaction) {
  //       try {
  //         await transaction.rollback();

  //         console.error("TRANSACTION ROLLED BACK");
  //       } catch (rollbackError) {
  //         console.error("ROLLBACK ERROR :", rollbackError?.message);
  //       }
  //     }

  //     throw error;
  //   }
  // },


generateSalaryFromEmpWages: async ({ siteId, clientId, month, year }) => {
  let transaction;
  let transactionStarted = false;

  try {
    const pool = await poolPromise;

    // =================================================
    // FETCH CLIENT DETAILS FROM new_client
    // =================================================



const clientResult = await pool.request()
  .input("site_id", sql.Int, Number(siteId))
  .query(`
    SELECT TOP 1
      cr.client_id,
      nc.x_client_code,
      nc.company_id,
      nc.branch_id
    FROM client_rates cr
    INNER JOIN new_client nc
      ON nc.id = cr.client_id
    WHERE cr.id = @site_id
  `);

if (clientResult.recordset.length === 0) {
  throw new Error(
    `Client not found for site ID: ${siteId}`
  );
}

const clientData = clientResult.recordset[0];

const fetchedClientId = Number(clientData.client_id);
const fetchedClientCode = clientData.client_code || "";
const fetchedCompanyId = Number(clientData.company_id || 0);
const fetchedBranchId = Number(clientData.branch_id || 0);

console.log("CLIENT ID  :", fetchedClientId);
console.log("CLIENT CODE:", fetchedClientCode);
console.log("COMPANY ID :", fetchedCompanyId);
console.log("BRANCH ID  :", fetchedBranchId);





    // =================================================
    // START TRANSACTION
    // =================================================

    transaction = new sql.Transaction(pool);
    await transaction.begin();
    transactionStarted = true;

    let generated = 0;
    let skipped = 0;

    const employees = [];
    const generatedEmployees = [];
    const employeePdfResults = [];

    // =================================================
    // GET EMP_WAGES
    // =================================================

    const wagesResult = await new sql.Request(transaction)
      .input("site_id", sql.Int, Number(siteId))
      .input("client_id", sql.Int, fetchedClientId)
      .input("at_month", sql.VarChar(20), String(month))
      .input("at_year", sql.Int, Number(year))
      .query(`
        SELECT *
        FROM emp_wages
        WHERE TRY_CONVERT(INT, site_id) = @site_id
          AND TRY_CONVERT(INT, client_id) = @client_id
          AND TRY_CONVERT(INT, at_month) = TRY_CONVERT(INT, @at_month)
          AND TRY_CONVERT(INT, at_year) = @at_year
      `);

    const empWages = wagesResult.recordset || [];

    if (empWages.length === 0) {
      await transaction.commit();
      transactionStarted = false;

      return {
        generated: 0,
        skipped: 0,
        employees: [],
        employeePdfs: [],
        sitePdf: null,
        message: "No employee wage data found",
      };
    }

    // =================================================
    // PROCESS EACH EMPLOYEE
    // =================================================

    for (const wage of empWages) {
      const empId = Number(wage.emp_id);
      const wageSiteId = Number(wage.site_id || siteId);

      if (!empId) {
        skipped++;

        employees.push({
          emp_id: null,
          emp_code: wage.emp_code || "",
          emp_name: wage.emp_name || "",
          status: "Skipped",
          reason: "Employee ID not found",
        });

        continue;
      }

      // =================================================
      // CHECK EXISTING SALARY SLIP
      // =================================================

      const existingResult = await new sql.Request(transaction)
        .input("emp_id", sql.Int, empId)
        .input("site_id", sql.Int, wageSiteId)
        .input("at_month", sql.VarChar(20), String(month))
        .input("at_year", sql.Int, Number(year))
        .query(`
          SELECT id
          FROM salary_slip
          WHERE emp_id = @emp_id
            AND site_id = @site_id
            AND at_month = @at_month
            AND at_year = @at_year
            AND (active = 0 OR active IS NULL)
            AND (source = 'Invoice' OR source IS NULL)
        `);

      // =================================================
      // DELETE OLD CHILD RECORDS USING PARENT ID
      // =================================================

      for (const oldSlip of existingResult.recordset || []) {
        await new sql.Request(transaction)
          .input("parent_id", sql.Int, oldSlip.id)
          .input("source", sql.NVarChar(100), "Invoice")
          .query(`
            DELETE FROM ss_earning
            WHERE parent_id = @parent_id
              AND source = @source
          `);

        await new sql.Request(transaction)
          .input("parent_id", sql.Int, oldSlip.id)
          .input("source", sql.NVarChar(100), "Invoice")
          .query(`
            DELETE FROM ss_deduction
            WHERE parent_id = @parent_id
              AND source = @source
          `);
      }

      // =================================================
      // DELETE OLD SALARY SLIP
      // =================================================

      if (existingResult.recordset.length > 0) {
        await new sql.Request(transaction)
          .input("emp_id", sql.Int, empId)
          .input("site_id", sql.Int, wageSiteId)
          .input("at_month", sql.VarChar(20), String(month))
          .input("at_year", sql.Int, Number(year))
          .query(`
            DELETE FROM salary_slip
            WHERE emp_id = @emp_id
              AND site_id = @site_id
              AND at_month = @at_month
              AND at_year = @at_year
              AND (active = 0 OR active IS NULL)
              AND (source = 'Invoice' OR source IS NULL)
          `);
      }

      // =================================================
      // PREPARE SALARY SLIP DATA
      // =================================================

      const earnedGross = Number(wage.earned_gross || 0);
      const totalDeduction = Number(wage.total_deduction || 0);
      const netSalary = earnedGross - totalDeduction;

      const salarySlipData = {
        emp_id: empId,
        at_month: String(month),
        at_year: Number(year),
        salary_template: 0,

        def_gross_salary: Number(wage.gross || wage.basic || 0),
        def_gross_salary_type: "FIXED",

        def_basic_salary: Number(wage.basic || 0),
        def_basic_salary_type: "FIXED",

        basic_rate: Number(wage.earned_basic || 0),
        no_of_days: Number(wage.net_days || wage.month_days || 0),

        total_earning: earnedGross,
        total_deduction: totalDeduction,
        gross_salary: netSalary,

        site_id: wageSiteId,

        // Values fetched from new_client
        client_id: fetchedClientId,
        client_code: fetchedClientCode,
        company_id: fetchedCompanyId,
        branch_id: fetchedBranchId,

        rank: wage.rank || "",
        ac_holder_name: wage.ac_holder_name || "",
        card_no: wage.card_no || "",
        bank_name: wage.bank_name || "",
        remark: "",
        hold_salary: 0,

        site_name: wage.site_name || "",
        client_name: wage.client_name || "",
        source: "Invoice",
      };

      // =================================================
      // INSERT SALARY SLIP
      // =================================================

      const slipResult = await new sql.Request(transaction)
        .input("emp_id", sql.Int, salarySlipData.emp_id)
        .input("at_month", sql.VarChar(20), salarySlipData.at_month)
        .input("at_year", sql.Int, salarySlipData.at_year)
        .input("salary_template", sql.Int, salarySlipData.salary_template)
        .input("def_gross_salary", sql.Decimal(18, 2), salarySlipData.def_gross_salary)
        .input("def_gross_salary_type", sql.NVarChar(50), salarySlipData.def_gross_salary_type)
        .input("def_basic_salary", sql.Decimal(18, 2), salarySlipData.def_basic_salary)
        .input("def_basic_salary_type", sql.NVarChar(50), salarySlipData.def_basic_salary_type)
        .input("basic_rate", sql.Decimal(18, 2), salarySlipData.basic_rate)
        .input("no_of_days", sql.Decimal(18, 2), salarySlipData.no_of_days)
        .input("total_earning", sql.Decimal(18, 2), salarySlipData.total_earning)
        .input("total_deduction", sql.Decimal(18, 2), salarySlipData.total_deduction)
        .input("gross_salary", sql.Decimal(18, 2), salarySlipData.gross_salary)
        .input("site_id", sql.Int, salarySlipData.site_id)
        .input("client_id", sql.Int, salarySlipData.client_id)
        .input("client_code", sql.NVarChar(100), salarySlipData.client_code)
        .input("company_id", sql.Int, salarySlipData.company_id)
        .input("branch_id", sql.Int, salarySlipData.branch_id)
        .input("rank", sql.NVarChar(100), salarySlipData.rank)
        .input("ac_holder_name", sql.NVarChar(255), salarySlipData.ac_holder_name)
        .input("card_no", sql.NVarChar(100), salarySlipData.card_no)
        .input("bank_name", sql.NVarChar(255), salarySlipData.bank_name)
        .input("remark", sql.NVarChar(500), salarySlipData.remark)
        .input("hold_salary", sql.Int, salarySlipData.hold_salary)
        .input("site_name", sql.NVarChar(255), salarySlipData.site_name)
        .input("client_name", sql.NVarChar(255), salarySlipData.client_name)
        .input("source", sql.NVarChar(100), salarySlipData.source)
        .query(`
          INSERT INTO salary_slip (
            emp_id, at_month, at_year, salary_template,
            def_gross_salary, def_gross_salary_type,
            def_basic_salary, def_basic_salary_type,
            basic_rate, no_of_days, total_earning, total_deduction,
            active, site_id, client_id, client_code,
            company_id, branch_id, rank, gross_salary,
            ac_holder_name, card_no, bank_name, remark,
            hold_salary, site_name, client_name, source
          )
          OUTPUT INSERTED.id
          VALUES (
            @emp_id, @at_month, @at_year, @salary_template,
            @def_gross_salary, @def_gross_salary_type,
            @def_basic_salary, @def_basic_salary_type,
            @basic_rate, @no_of_days, @total_earning, @total_deduction,
            0, @site_id, @client_id, @client_code,
            @company_id, @branch_id, @rank, @gross_salary,
            @ac_holder_name, @card_no, @bank_name, @remark,
            @hold_salary, @site_name, @client_name, @source
          )
        `);

      const salarySlipId = slipResult.recordset[0].id;

      // =================================================
      // EARNINGS
      // =================================================

      const earnings = [
        { name: "BASIC", amount: wage.earned_basic },
        { name: "VDA", amount: wage.earned_da },
        { name: "HRA", amount: wage.earned_hra },
        { name: "SPECIAL ALLOWANCE", amount: wage.earned_special_allow },
        { name: "OTHER ALLOWANCE", amount: wage.earned_other_allow },
        { name: "LWW", amount: wage.earned_lww },
        { name: "BONUS", amount: wage.earned_bonus },
        { name: "OT WAGES", amount: wage.earned_ot_wages },
        { name: "LEAVE WAGES", amount: wage.earned_leave_wages },
        { name: "UNIFORM WAGES", amount: wage.earned_uniform_wages },
        { name: "ANY OTHER", amount: wage.earned_any_other },
        { name: "HOLIDAY PAY", amount: wage.earned_holiday_pay },
        { name: "INCENTIVE", amount: wage.earned_incentive },
        { name: "NIGHT ALLOWANCE", amount: wage.earned_night_allow },
      ];

      for (const earning of earnings) {
        const amount = Number(earning.amount || 0);
        if (amount === 0) continue;

        await new sql.Request(transaction)
          .input("emp_id", sql.Int, empId)
          .input("parent_id", sql.Int, salarySlipId)
          .input("tmpl_id", sql.Int, 0)
          .input("earning_name", sql.NVarChar(255), earning.name)
          .input("earning_rate", sql.Decimal(18, 2), 0)
          .input("earning_amount", sql.Decimal(18, 2), amount)
          .input("calc_amount", sql.Decimal(18, 2), amount)
          .input("client_id", sql.Int, fetchedClientId)
          .input("client_code", sql.NVarChar(100), fetchedClientCode)
          .input("company_id", sql.Int, fetchedCompanyId)
          .input("branch_id", sql.Int, fetchedBranchId)
          .input("source", sql.NVarChar(100), "Invoice")
          .query(`
            INSERT INTO ss_earning (
              emp_id, parent_id, tmpl_id,
              earning_name, earning_rate, earning_amount,
              calc_amount, active, source
            )
            VALUES (
              @emp_id, @parent_id, @tmpl_id,
              @earning_name, @earning_rate, @earning_amount,
              @calc_amount, 0, @source
            )
          `);
      }

      // =================================================
      // DEDUCTIONS
      // =================================================

      const deductions = [
        { name: "PF", amount: wage.deduct_pf },
        { name: "PT", amount: wage.deduct_pt },
        { name: "ESIC", amount: wage.deduct_esic },
        { name: "LWF", amount: wage.deduct_lwf },
        { name: "OTHER DEDUCTION", amount: wage.deduct_other },
        { name: "ADVANCE", amount: wage.deduct_advance },
        { name: "LOAN", amount: wage.deduct_loan },
        { name: "UNIFORM", amount: wage.deduct_uniform },
        { name: "ID", amount: wage.deduct_id },
        { name: "RECOVERY", amount: wage.deduct_recovery },
        { name: "INSTALLMENT", amount: wage.deduct_installment },
      ];

      for (const deduction of deductions) {
        const amount = Number(deduction.amount || 0);
        if (amount === 0) continue;

        await new sql.Request(transaction)
          .input("emp_id", sql.Int, empId)
          .input("parent_id", sql.Int, salarySlipId)
          .input("tmpl_id", sql.Int, 0)
          .input("deduction_name", sql.NVarChar(255), deduction.name)
          .input("deduction_rate", sql.Decimal(18, 2), 0)
          .input("deduction_amount", sql.Decimal(18, 2), amount)
          .input("calc_amount", sql.Decimal(18, 2), amount)
          .input("client_id", sql.Int, fetchedClientId)
          .input("client_code", sql.NVarChar(100), fetchedClientCode)
          .input("company_id", sql.Int, fetchedCompanyId)
          .input("branch_id", sql.Int, fetchedBranchId)
          .input("source", sql.NVarChar(100), "Invoice")
          .query(`
            INSERT INTO ss_deduction (
              emp_id, parent_id, tmpl_id,
              deduction_name, deduction_rate, deduction_amount,
              calc_amount, active, source
            )
            VALUES (
              @emp_id, @parent_id, @tmpl_id,
              @deduction_name, @deduction_rate, @deduction_amount,
              @calc_amount, 0, @source
            )
          `);
      }

      // =================================================
      // EMPLOYEE RESPONSE
      // =================================================

      generated++;

      employees.push({
        emp_id: empId,
        emp_code: wage.emp_code || "",
        emp_name: wage.emp_name || "",
        status: "Generated",
        gross_salary: netSalary,
        earned_gross: earnedGross,
        total_deduction: totalDeduction,
      });

      // =================================================
      // PDF DATA
      // =================================================

      generatedEmployees.push({
        employeeId: empId,
        employeeCode: wage.emp_code || "",
        employeeName: wage.emp_name || "",

        month: Number(month),
        year: Number(year),

        siteId: wageSiteId,
        siteName: wage.site_name || "",

        clientId: fetchedClientId,
        clientCode: fetchedClientCode,
        clientName: wage.client_name || "",

        companyId: fetchedCompanyId,
        branchId: fetchedBranchId,

        rank: wage.rank || "",
        designation: wage.rank || "",

        companyName: wage.company_name || wage.client_name || "",
        companyAddress:
          wage.company_address || wage.site_address || wage.address || "",

        doj: wage.doj || wage.date_of_joining || "",
        uan: wage.uan || "",
        dob: wage.dob || "",
        pan: wage.pan || "",
        aadhaar: wage.aadhaar || wage.aadhaar_no || wage.aadhar_no || "",

        bankName: wage.bank_name || "",
        accountNo: wage.account_no || wage.account_number || "",
        ifscCode: wage.ifsc_code || "",
        insuranceNo: wage.insurance_no || "",

        monthDays: Number(wage.month_days || 0),
        payableDays: Number(wage.net_days || wage.payable_days || 0),
        presentDays: Number(wage.present_days || wage.total_present || 0),
        workDays: Number(wage.work_days || wage.month_days || 0),
        weeklyOffs: Number(wage.weekly_offs || wage.week_offs || wage.total_wo || 0),
        paidHoliday: Number(wage.paid_holiday || 0),
        paidLeave: Number(wage.paid_leave || 0),
        absentDays: Number(wage.absent_days || wage.total_absent || 0),

        pl: Number(wage.pl || wage.PL || 0),
        sl: Number(wage.sl || wage.SL || 0),
        cl: Number(wage.cl || wage.CL || 0),
        otDays: Number(wage.ot_days || 0),

        dailyAttendance:
          wage.dailyAttendance ||
          wage.attendanceDetails ||
          wage.attendance ||
          [],

        basicSalary: Number(wage.basic || 0),
        basicVda: Number(wage.basic || 0),
        earnedBasicDa: Number(wage.earned_basic || 0),
        basicEarned: Number(wage.earned_basic || 0),

        specialAllowance: Number(wage.earned_special_allow || 0),
        specialAllowanceEarned: Number(wage.earned_special_allow || 0),
        hra: Number(wage.earned_hra || 0),
        hraEarned: Number(wage.earned_hra || 0),

        earnedBasic: Number(wage.earned_basic || 0),
        earnedVda: Number(wage.earned_da || 0),
        earnedHra: Number(wage.earned_hra || 0),
        earnedSpecialAllowance: Number(wage.earned_special_allow || 0),
        earnedOtherAllowance: Number(wage.earned_other_allow || 0),
        earnedLww: Number(wage.earned_lww || 0),
        earnedBonus: Number(wage.earned_bonus || 0),
        earnedOtWages: Number(wage.earned_ot_wages || 0),
        earnedLeaveWages: Number(wage.earned_leave_wages || 0),
        earnedUniformWages: Number(wage.earned_uniform_wages || 0),
        earnedAnyOther: Number(wage.earned_any_other || 0),
        earnedHolidayPay: Number(wage.earned_holiday_pay || 0),
        earnedIncentive: Number(wage.earned_incentive || 0),
        earnedNightAllowance: Number(wage.earned_night_allow || 0),

        gross: earnedGross,
        grossSalary: netSalary,
        totalEarning: earnedGross,
        totalEarnings: earnedGross,
        totalDeduction,
        netSalary,
        netTakeHome: netSalary,
        netAmount: netSalary,
        salaryPayable: netSalary,

        salary: Number(wage.basic || 0),
        other: Number(wage.earned_other_allow || 0),
        advance: Number(wage.deduct_advance || 0),
        pf: Number(wage.deduct_pf || 0),
        esic: Number(wage.deduct_esic || 0),
        pt: Number(wage.deduct_pt || 0),
        unf: Number(wage.deduct_uniform || 0),
        rc: Number(wage.deduct_recovery || 0),
        fine: Number(wage.deduct_fine || 0),
        installment: Number(wage.deduct_installment || 0),

        accountHolder: wage.ac_holder_name || wage.account_holder_name || "",
        cardNo: wage.card_no || "",

        earnings,
        deductions,
      });
    }

    // =================================================
    // COMMIT TRANSACTION
    // =================================================

    await transaction.commit();
    transactionStarted = false;

    // =================================================
    // GENERATE EMPLOYEE PDFS
    // =================================================

    for (const employee of generatedEmployees) {
      try {
        const pdfResult = await generateEmployeePdf(employee);

        if (!pdfResult || pdfResult.success === false) {
          throw new Error(
            pdfResult?.error || "Employee PDF generation failed"
          );
        }

        await pool.request()
          .input("emp_id", sql.Int, Number(employee.employeeId))
          .input("site_id", sql.Int, Number(employee.siteId))
          .input("at_month", sql.VarChar(20), String(employee.month))
          .input("at_year", sql.Int, Number(employee.year))
          .input(
            "salary_slip_img_path",
            sql.NVarChar(sql.MAX),
            String(pdfResult.relativePath || "")
          )
          .input("source", sql.NVarChar(100), "Invoice")
          .query(`
            UPDATE salary_slip
            SET salary_slip_img_path = @salary_slip_img_path
            WHERE emp_id = @emp_id
              AND site_id = @site_id
              AND at_month = @at_month
              AND at_year = @at_year
              AND (active = 0 OR active IS NULL)
              AND source = @source
          `);

        employeePdfResults.push({
          success: true,
          employeeId: employee.employeeId,
          employeeCode: employee.employeeCode,
          employeeName: employee.employeeName,
          pdf: pdfResult,
        });
      } catch (pdfError) {
        console.error(
          "EMPLOYEE PDF ERROR:",
          employee.employeeId,
          pdfError.message
        );

        employeePdfResults.push({
          success: false,
          employeeId: employee.employeeId,
          employeeCode: employee.employeeCode,
          employeeName: employee.employeeName,
          pdf: null,
          error: pdfError.message,
        });
      }
    }

    // =================================================
    // GENERATE SITE PDF
    // =================================================

    let sitePdfResult = null;

    try {
      const firstEmployee = generatedEmployees[0] || {};
      const firstWage = empWages[0] || {};

      sitePdfResult = await generateSitePdf({
        siteId: Number(siteId),
        siteName: firstEmployee.siteName || firstWage.site_name || "",

        clientId: fetchedClientId,
        clientCode: fetchedClientCode,
        clientName: firstEmployee.clientName || firstWage.client_name || "",

        companyId: fetchedCompanyId,
        branchId: fetchedBranchId,

        month: Number(month),
        year: Number(year),
        billingDays: 0,

        monthDays: Number(
          firstEmployee.monthDays || firstWage.month_days || 0
        ),

        workingDays: Number(
          firstEmployee.workDays || firstEmployee.payableDays || 0
        ),

        employees: generatedEmployees,
      });
    } catch (sitePdfError) {
      console.error("SITE PDF ERROR:", sitePdfError.message);

      sitePdfResult = {
        success: false,
        error: sitePdfError.message,
      };
    }

    // =================================================
    // FINAL RESPONSE
    // =================================================

    return {
      generated,
      skipped,
      employees,
      employeePdfs: employeePdfResults,
      sitePdf: sitePdfResult,

      client: {
        clientId: fetchedClientId,
        clientCode: fetchedClientCode,
        companyId: fetchedCompanyId,
        branchId: fetchedBranchId,
      },

      message: "Salary generated successfully",
    };
  } catch (error) {
    if (transaction && transactionStarted) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Rollback error:", rollbackError.message);
      }
    }

    console.error("generateSalaryFromEmpWages error:", error);
    throw error;
  }
},

};

module.exports = salaryModel;
