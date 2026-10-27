const sql = require("mssql");
const { poolPromise } = require("../config/db");

// =====================================================
// HELPERS
// =====================================================

const toNumber = (value, defaultValue = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
};

const normalizeAttType = (value) => {
  return String(value || "").trim();
};

const normalizeString = (value) => {
  return String(value ?? "").trim();
};

// =====================================================
// GET EMP WAGES BY SITE
// =====================================================

const getEmpWagesBySite = async (
  siteId,
  month,
  year,
  attType
) => {
  const pool = await poolPromise;

  console.log("\n========================================");
  console.log("GET EMP WAGES BY SITE");
  console.log("siteId :", siteId);
  console.log("month  :", month);
  console.log("year   :", year);
  console.log("type   :", attType);
  console.log("========================================");

  const result = await pool
    .request()
    .input("siteId", sql.VarChar, normalizeString(siteId))
    .input("month", sql.VarChar, normalizeString(month))
    .input("year", sql.VarChar, normalizeString(year))
    .input("attType", sql.VarChar, normalizeAttType(attType))
    .query(`
      SELECT *
      FROM emp_wages
      WHERE TRY_CONVERT(DECIMAL(18,2), site_id)
              = TRY_CONVERT(DECIMAL(18,2), @siteId)

        AND TRY_CONVERT(DECIMAL(18,2), at_month)
              = TRY_CONVERT(DECIMAL(18,2), @month)

        AND TRY_CONVERT(INT, at_year)
              = TRY_CONVERT(INT, @year)

        AND LTRIM(RTRIM(ISNULL(at_type, '')))
              = LTRIM(RTRIM(@attType))

      ORDER BY id
    `);

  console.log("emp_wages rows:", result.recordset.length);

  return result.recordset;
};

// =====================================================
// GET SITE DETAIL
// =====================================================

const getSiteDetail = async (siteId) => {
  const pool = await poolPromise;

  console.log("GET SITE DETAIL:", siteId);

  const result = await pool
    .request()
    .input("siteId", sql.VarChar, normalizeString(siteId))
    .query(`
      SELECT *
      FROM client_rates
      WHERE TRY_CONVERT(DECIMAL(18,2), id)
              = TRY_CONVERT(DECIMAL(18,2), @siteId)
    `);

  return result.recordset;
};

// =====================================================
// GET CLIENT DETAIL
// =====================================================

const getClientDetail = async (clientId) => {
  const pool = await poolPromise;

  console.log("GET CLIENT DETAIL:", clientId);

  const result = await pool
    .request()
    .input("clientId", sql.VarChar, normalizeString(clientId))
    .query(`
      SELECT *
      FROM new_client
      WHERE TRY_CONVERT(DECIMAL(18,2), id)
              = TRY_CONVERT(DECIMAL(18,2), @clientId)
    `);

  return result.recordset;
};

// =====================================================
// GET COMPANY DETAIL
// =====================================================

const getCompanyDetail = async (companyId) => {
  const pool = await poolPromise;

  console.log("GET COMPANY DETAIL:", companyId);

  const result = await pool
    .request()
    .input("companyId", sql.VarChar, normalizeString(companyId))
    .query(`
      SELECT *
      FROM companies
      WHERE TRY_CONVERT(DECIMAL(18,2), id)
              = TRY_CONVERT(DECIMAL(18,2), @companyId)
    `);

  return result.recordset;
};

// =====================================================
// MAIN ORDER INFO
// =====================================================

const getEmpWagesForOrderInfo = async (
  siteId,
  month,
  year,
  attType
) => {
  const pool = await poolPromise;

  console.log("GET ORDER INFO");

  const result = await pool
    .request()
    .input("siteId", sql.VarChar, normalizeString(siteId))
    .input("month", sql.VarChar, normalizeString(month))
    .input("year", sql.VarChar, normalizeString(year))
    .input("attType", sql.VarChar, normalizeAttType(attType))
    .query(`
      SELECT
        rank,

        COUNT(*) AS total_nos,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), gross)
          ),
          0
        ) AS gross,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), earned_gross)
          ),
          0
        ) AS earned_gross,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), net_days)
          ),
          0
        ) AS totaldays,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), emp_invoice_amount)
          ),
          0
        ) AS total,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), emp_ctc)
          ),
          0
        ) AS emp_ctc,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), emp_service_charges)
          ),
          0
        ) AS service_charges,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), emp_gst)
          ),
          0
        ) AS gst

      FROM emp_wages

      WHERE TRY_CONVERT(DECIMAL(18,2), site_id)
              = TRY_CONVERT(DECIMAL(18,2), @siteId)

        AND TRY_CONVERT(DECIMAL(18,2), at_month)
              = TRY_CONVERT(DECIMAL(18,2), @month)

        AND TRY_CONVERT(INT, at_year)
              = TRY_CONVERT(INT, @year)

        AND LTRIM(RTRIM(ISNULL(at_type, '')))
              = LTRIM(RTRIM(@attType))

      GROUP BY rank

      ORDER BY rank
    `);

  return result.recordset;
};

// =====================================================
// ROKADA ORDER INFO
// =====================================================

const getEmpWagesForOrderInfoRokada = async (
  siteId,
  month,
  year,
  attType
) => {
  const pool = await poolPromise;

  console.log("GET ROKADA ORDER INFO");

  const result = await pool
    .request()
    .input("siteId", sql.VarChar, normalizeString(siteId))
    .input("month", sql.VarChar, normalizeString(month))
    .input("year", sql.VarChar, normalizeString(year))
    .input("attType", sql.VarChar, normalizeString(attType))
    .query(`
      SELECT
        rank,

        COUNT(*) AS total_nos,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), gross)
          ),
          0
        ) AS gross,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), earned_gross)
          ),
          0
        ) AS earned_gross,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), net_days)
          ),
          0
        ) AS totaldays,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), emp_invoice_amount)
          ),
          0
        ) AS total,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), emp_ctc)
          ),
          0
        ) AS emp_ctc,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), emp_service_charges)
          ),
          0
        ) AS service_charges

      FROM emp_wages

      WHERE TRY_CONVERT(DECIMAL(18,2), site_id)
              = TRY_CONVERT(DECIMAL(18,2), @siteId)

        AND TRY_CONVERT(DECIMAL(18,2), at_month)
              = TRY_CONVERT(DECIMAL(18,2), @month)

        AND TRY_CONVERT(INT, at_year)
              = TRY_CONVERT(INT, @year)

        AND LTRIM(RTRIM(ISNULL(at_type, '')))
              = LTRIM(RTRIM(@attType))

      GROUP BY rank

      ORDER BY rank
    `);

  return result.recordset;
};

// =====================================================
// PF
// =====================================================

const getEmpWagesPF = async (
  siteId,
  month,
  year,
  attType
) => {
  const pool = await poolPromise;

  console.log("GET PF");

  const result = await pool
    .request()
    .input("siteId", sql.VarChar, normalizeString(siteId))
    .input("month", sql.VarChar, normalizeString(month))
    .input("year", sql.VarChar, normalizeString(year))
    .input("attType", sql.VarChar, normalizeString(attType))
    .query(`
      SELECT

        COUNT(*) AS total_nos,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), emp_pf)
          ),
          0
        ) AS total_pf,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), pf_wages)
          ),
          0
        ) AS total_pf_wages,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), deduct_pf)
          ),
          0
        ) AS total_deduct_pf

      FROM emp_wages

      WHERE TRY_CONVERT(DECIMAL(18,2), site_id)
              = TRY_CONVERT(DECIMAL(18,2), @siteId)

        AND TRY_CONVERT(DECIMAL(18,2), at_month)
              = TRY_CONVERT(DECIMAL(18,2), @month)

        AND TRY_CONVERT(INT, at_year)
              = TRY_CONVERT(INT, @year)

        AND LTRIM(RTRIM(ISNULL(at_type, '')))
              = LTRIM(RTRIM(@attType))
    `);

  return result.recordset;
};

// =====================================================
// PT
// =====================================================

const getEmpWagesPT = async (
  siteId,
  month,
  year,
  attType
) => {
  const pool = await poolPromise;

  console.log("GET PT");

  const result = await pool
    .request()
    .input("siteId", sql.VarChar, normalizeString(siteId))
    .input("month", sql.VarChar, normalizeString(month))
    .input("year", sql.VarChar, normalizeString(year))
    .input("attType", sql.VarChar, normalizeString(attType))
    .query(`
      SELECT

        COUNT(*) AS total_nos,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), deduct_pt)
          ),
          0
        ) AS total_pt

      FROM emp_wages

      WHERE TRY_CONVERT(DECIMAL(18,2), site_id)
              = TRY_CONVERT(DECIMAL(18,2), @siteId)

        AND TRY_CONVERT(DECIMAL(18,2), at_month)
              = TRY_CONVERT(DECIMAL(18,2), @month)

        AND TRY_CONVERT(INT, at_year)
              = TRY_CONVERT(INT, @year)

        AND LTRIM(RTRIM(ISNULL(at_type, '')))
              = LTRIM(RTRIM(@attType))
    `);

  return result.recordset;
};

// =====================================================
// OT
// =====================================================

const getEmpWagesOT = async (
  siteId,
  month,
  year,
  attType
) => {
  const pool = await poolPromise;

  console.log("GET OT");

  const result = await pool
    .request()
    .input("siteId", sql.VarChar, normalizeString(siteId))
    .input("month", sql.VarChar, normalizeString(month))
    .input("year", sql.VarChar, normalizeString(year))
    .input("attType", sql.VarChar, normalizeString(attType))
    .query(`
      SELECT

        COUNT(*) AS total_nos,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), ot_days)
          ),
          0
        ) AS total_ot_days,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), earned_ot_wages)
          ),
          0
        ) AS total_ot,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), ot_rate)
          ),
          0
        ) AS total_ot_rate

      FROM emp_wages

      WHERE TRY_CONVERT(DECIMAL(18,2), site_id)
              = TRY_CONVERT(DECIMAL(18,2), @siteId)

        AND TRY_CONVERT(DECIMAL(18,2), at_month)
              = TRY_CONVERT(DECIMAL(18,2), @month)

        AND TRY_CONVERT(INT, at_year)
              = TRY_CONVERT(INT, @year)

        AND LTRIM(RTRIM(ISNULL(at_type, '')))
              = LTRIM(RTRIM(@attType))
    `);

  return result.recordset;
};

// =====================================================
// ESIC
// =====================================================

const getEmpWagesESIC = async (
  siteId,
  month,
  year,
  attType
) => {
  const pool = await poolPromise;

  console.log("GET ESIC");

  const result = await pool
    .request()
    .input("siteId", sql.VarChar, normalizeString(siteId))
    .input("month", sql.VarChar, normalizeString(month))
    .input("year", sql.VarChar, normalizeString(year))
    .input("attType", sql.VarChar, normalizeString(attType))
    .query(`
      SELECT

        COUNT(*) AS total_nos,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), emp_esic)
          ),
          0
        ) AS total_esic,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), esic_wages)
          ),
          0
        ) AS total_esic_wages,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), deduct_esic)
          ),
          0
        ) AS total_deduct_esic

      FROM emp_wages

      WHERE TRY_CONVERT(DECIMAL(18,2), site_id)
              = TRY_CONVERT(DECIMAL(18,2), @siteId)

        AND TRY_CONVERT(DECIMAL(18,2), at_month)
              = TRY_CONVERT(DECIMAL(18,2), @month)

        AND TRY_CONVERT(INT, at_year)
              = TRY_CONVERT(INT, @year)

        AND LTRIM(RTRIM(ISNULL(at_type, '')))
              = LTRIM(RTRIM(@attType))
    `);

  return result.recordset;
};

// =====================================================
// BONUS
// =====================================================

const getEmpWagesBonus = async (
  siteId,
  month,
  year,
  attType
) => {
  const pool = await poolPromise;

  console.log("GET BONUS");

  const result = await pool
    .request()
    .input("siteId", sql.VarChar, normalizeString(siteId))
    .input("month", sql.VarChar, normalizeString(month))
    .input("year", sql.VarChar, normalizeString(year))
    .input("attType", sql.VarChar, normalizeString(attType))
    .query(`
      SELECT

        COUNT(*) AS total_nos,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), earned_bonus)
          ),
          0
        ) AS total_bonus,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), bonus)
          ),
          0
        ) AS total_bonus_rate

      FROM emp_wages

      WHERE TRY_CONVERT(DECIMAL(18,2), site_id)
              = TRY_CONVERT(DECIMAL(18,2), @siteId)

        AND TRY_CONVERT(DECIMAL(18,2), at_month)
              = TRY_CONVERT(DECIMAL(18,2), @month)

        AND TRY_CONVERT(INT, at_year)
              = TRY_CONVERT(INT, @year)

        AND LTRIM(RTRIM(ISNULL(at_type, '')))
              = LTRIM(RTRIM(@attType))
    `);

  return result.recordset;
};

// =====================================================
// SERVICE CHARGES
// =====================================================

const getEmpWagesServiceCharges = async (
  siteId,
  month,
  year,
  attType
) => {
  const pool = await poolPromise;

  console.log("GET SERVICE CHARGES");

  const result = await pool
    .request()
    .input("siteId", sql.VarChar, normalizeString(siteId))
    .input("month", sql.VarChar, normalizeString(month))
    .input("year", sql.VarChar, normalizeString(year))
    .input("attType", sql.VarChar, normalizeString(attType))
    .query(`
      SELECT

        COUNT(*) AS total_nos,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), emp_service_charges)
          ),
          0
        ) AS total_service_charge,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), emp_ictc)
          ),
          0
        ) AS total_ictc

      FROM emp_wages

      WHERE TRY_CONVERT(DECIMAL(18,2), site_id)
              = TRY_CONVERT(DECIMAL(18,2), @siteId)

        AND TRY_CONVERT(DECIMAL(18,2), at_month)
              = TRY_CONVERT(DECIMAL(18,2), @month)

        AND TRY_CONVERT(INT, at_year)
              = TRY_CONVERT(INT, @year)

        AND LTRIM(RTRIM(ISNULL(at_type, '')))
              = LTRIM(RTRIM(@attType))
    `);

  return result.recordset;
};

// =====================================================
// ACTUAL CHARGES
// =====================================================

const getActualChargesBySite = async (
  siteId,
  month,
  year,
  attType
) => {
  const pool = await poolPromise;

  console.log("\n========================================");
  console.log("GET ACTUAL CHARGES");
  console.log("siteId :", siteId);
  console.log("month  :", month);
  console.log("year   :", year);
  console.log("type   :", attType);
  console.log("========================================");

  const result = await pool
    .request()
    .input("siteId", sql.VarChar, normalizeString(siteId))
    .input("month", sql.VarChar, normalizeString(month))
    .input("year", sql.VarChar, normalizeString(year))
    .input("attType", sql.VarChar, normalizeString(attType))
    .query(`
      SELECT

        id,

        site_id,

        client_id,

        client_code,

        at_month,

        at_year,

        at_type,

        charges_type,

        TRY_CONVERT(
          DECIMAL(18,2),
          total_nos
        ) AS total_nos,

        TRY_CONVERT(
          DECIMAL(18,2),
          cost_per_head
        ) AS cost_per_head,

        TRY_CONVERT(
          DECIMAL(18,2),
          total
        ) AS total,

        source

      FROM at_actual_charges

      WHERE TRY_CONVERT(DECIMAL(18,2), site_id)
              = TRY_CONVERT(DECIMAL(18,2), @siteId)

        AND TRY_CONVERT(DECIMAL(18,2), at_month)
              = TRY_CONVERT(DECIMAL(18,2), @month)

        AND TRY_CONVERT(INT, at_year)
              = TRY_CONVERT(INT, @year)

        AND LTRIM(RTRIM(ISNULL(at_type, '')))
              = LTRIM(RTRIM(@attType))

      ORDER BY id
    `);

  console.log(
    "Actual charges rows:",
    result.recordset.length
  );

  console.table(result.recordset);

  return result.recordset;
};

// =====================================================
// WITHOUT RANK
// =====================================================

const getEmpWagesForBillingWithoutRank = async (
  siteId,
  month,
  year,
  attType
) => {
  const pool = await poolPromise;

  console.log("GET BILLING WITHOUT RANK");

  const result = await pool
    .request()
    .input("siteId", sql.VarChar, normalizeString(siteId))
    .input("month", sql.VarChar, normalizeString(month))
    .input("year", sql.VarChar, normalizeString(year))
    .input("attType", sql.VarChar, normalizeString(attType))
    .query(`
      SELECT

        COUNT(*) AS total_nos,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), gross)
          ),
          0
        ) AS gross,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), earned_gross)
          ),
          0
        ) AS earned_gross,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), net_days)
          ),
          0
        ) AS totaldays,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), emp_invoice_amount)
          ),
          0
        ) AS total,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), emp_ctc)
          ),
          0
        ) AS emp_ctc,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), emp_service_charges)
          ),
          0
        ) AS service_charges,

        ISNULL(
          SUM(
            TRY_CONVERT(DECIMAL(18,2), emp_gst)
          ),
          0
        ) AS gst

      FROM emp_wages

      WHERE TRY_CONVERT(DECIMAL(18,2), site_id)
              = TRY_CONVERT(DECIMAL(18,2), @siteId)

        AND TRY_CONVERT(DECIMAL(18,2), at_month)
              = TRY_CONVERT(DECIMAL(18,2), @month)

        AND TRY_CONVERT(INT, at_year)
              = TRY_CONVERT(INT, @year)

        AND LTRIM(RTRIM(ISNULL(at_type, '')))
              = LTRIM(RTRIM(@attType))
    `);

  return result.recordset;
};

// =====================================================
// EMPLOYEE DETAILS
// =====================================================

const getEmpWagesDetails = async (
  siteId,
  month,
  year,
  attType
) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("siteId", sql.VarChar, normalizeString(siteId))
    .input("month", sql.VarChar, normalizeString(month))
    .input("year", sql.VarChar, normalizeString(year))
    .input("attType", sql.VarChar, normalizeString(attType))
    .query(`
      SELECT
        id,
        site_id,
        client_id,
        client_name,
        client_code,
        at_month,
        at_year,
        at_type,
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
        total_deduction,

        net_take_home,
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

        billing_type,

        CGST,
        SGST,
        IGST

      FROM emp_wages

      WHERE TRY_CONVERT(DECIMAL(18,2), site_id)
              = TRY_CONVERT(DECIMAL(18,2), @siteId)

        AND TRY_CONVERT(DECIMAL(18,2), at_month)
              = TRY_CONVERT(DECIMAL(18,2), @month)

        AND TRY_CONVERT(INT, at_year)
              = TRY_CONVERT(INT, @year)

        AND LTRIM(RTRIM(ISNULL(at_type, '')))
              = LTRIM(RTRIM(@attType))

      ORDER BY emp_name
    `);

  return result.recordset;
};

// =====================================================
// CUSTOMIZE WAGES TOTAL
// =====================================================

const getCustomizeWagesTotal = async (
  tableName,
  itemDesc,
  quantity,
  rate,
  totalAmount
) => {

  // ---------------------------------------------------
  // TABLE NAME VALIDATION
  // ---------------------------------------------------

  if (!/^[A-Za-z0-9_]+$/.test(tableName)) {
    throw new Error("Invalid wages table name");
  }

  const pool = await poolPromise;

  const qtyColumn =
    quantity || "total_nos";

  const rateColumn =
    rate || "rate";

  const totalColumn =
    totalAmount || "total";

  const descColumn =
    itemDesc || "item_desc";

  // ---------------------------------------------------
  // COLUMN VALIDATION
  // ---------------------------------------------------

  if (!/^[A-Za-z0-9_]+$/.test(qtyColumn)) {
    throw new Error("Invalid quantity column");
  }

  if (!/^[A-Za-z0-9_]+$/.test(rateColumn)) {
    throw new Error("Invalid rate column");
  }

  if (!/^[A-Za-z0-9_]+$/.test(totalColumn)) {
    throw new Error("Invalid total column");
  }

  if (!/^[A-Za-z0-9_]+$/.test(descColumn)) {
    throw new Error("Invalid description column");
  }

  // ---------------------------------------------------
  // QUERY
  // ---------------------------------------------------

  const query = `
    SELECT

      ISNULL(
        SUM(
          TRY_CONVERT(
            DECIMAL(18,2),
            ${qtyColumn}
          )
        ),
        0
      ) AS total_nos,

      ISNULL(
        SUM(
          TRY_CONVERT(
            DECIMAL(18,2),
            gross
          )
        ),
        0
      ) AS gross,

      ISNULL(
        SUM(
          TRY_CONVERT(
            DECIMAL(18,2),
            totaldays
          )
        ),
        0
      ) AS totaldays,

      ISNULL(
        SUM(
          TRY_CONVERT(
            DECIMAL(18,2),
            ${totalColumn}
          )
        ),
        0
      ) AS total

    FROM ${tableName}

    WHERE ${descColumn} = @itemDesc
  `;

  const result = await pool
    .request()
    .input(
      "itemDesc",
      sql.VarChar,
      String(itemDesc)
    )
    .query(query);

  return result.recordset;
};

// =====================================================
// EXPORT
// =====================================================

module.exports = {
  getEmpWagesBySite,

  getSiteDetail,

  getClientDetail,

  getCompanyDetail,

  getCustomizeWagesTotal,

  getEmpWagesForOrderInfo,

  getEmpWagesForOrderInfoRokada,

  getEmpWagesPF,

  getEmpWagesPT,

  getEmpWagesOT,

  getEmpWagesESIC,

  getEmpWagesBonus,

  getEmpWagesServiceCharges,

  getActualChargesBySite,

  getEmpWagesForBillingWithoutRank,

  getEmpWagesDetails,
};