const { poolPromise, sql } = require("../config/db");

exports.getBillInfo = async (
  month,
  year,
  clientId,
  siteId
) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("month", sql.Int, Number(month))
    .input("year", sql.Int, Number(year))
    .input("clientId", sql.Int, Number(clientId))
    .input("siteId", sql.Int, Number(siteId))
    .query(`
      SELECT *
      FROM bill_details
      WHERE
        invoice_month = @month
        AND invoice_year = @year
        AND client_id = @clientId
        AND rate_id = @siteId
        AND active = '0'
    `);

  return result.recordset;
};

exports.getEmpWagesTotal = async (
  month,
  year,
  clientId,
  siteId
) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("month", sql.Int, Number(month))
    .input("year", sql.Int, Number(year))
    .input("clientId", sql.Int, Number(clientId))
    .input("siteId", sql.Int, Number(siteId))
    .query(`
      SELECT
        COUNT(id) AS total_emp,

        SUM(
          TRY_CAST(emp_invoice_amount AS FLOAT)
        ) AS totalinvoicevalue,

        SUM(
          TRY_CAST(net_take_home AS FLOAT)
        ) AS salary_amount,

        SUM(
          TRY_CAST(emp_pf AS FLOAT)
        ) AS employer_pf_amount,

        SUM(
          TRY_CAST(deduct_pf AS FLOAT)
        ) AS employee_pf_amount,

        SUM(
          TRY_CAST(emp_esic AS FLOAT)
        ) AS employer_esic_amount,

        SUM(
          TRY_CAST(deduct_esic AS FLOAT)
        ) AS employee_esic_amount,

        SUM(
          TRY_CAST(deduct_pt AS FLOAT)
        ) AS pt_amount,

        SUM(
          TRY_CAST(emp_service_charges AS FLOAT)
        ) AS service_amount,

        SUM(
          TRY_CAST(CGST AS FLOAT)
        ) AS CGST,

        SUM(
          TRY_CAST(SGST AS FLOAT)
        ) AS SGST,

        SUM(
          TRY_CAST(IGST AS FLOAT)
        ) AS IGST

      FROM emp_wages
      WHERE
        at_month = @month
        AND at_year = @year
        AND client_id = @clientId
        AND site_id = @siteId
    `);

  return result.recordset[0];
};

exports.getTotalAdvance = async (
  month,
  year,
  clientId,
  siteId
) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("month", sql.Int, Number(month))
    .input("year", sql.Int, Number(year))
    .input("clientId", sql.Int, Number(clientId))
    .input("siteId", sql.Int, Number(siteId))
    .query(`
      SELECT
        SUM(
          TRY_CAST(
            REPLACE(amount, ',', '')
            AS FLOAT
          )
        ) AS totalexpense

      FROM emp_advance

      WHERE
        TRY_CAST(site_id AS INT) = @siteId
        AND MONTH(adv_date) = @month
        AND YEAR(adv_date) = @year

        AND (
          emp_id IS NULL
          OR emp_id = ''
          OR emp_id = 0
          OR emp_id = 'NA'
        )

        AND status = 'Approved'
    `);

  return result.recordset[0];
};

exports.getServiceCharges = async (
  autoNo
) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("autoNo", sql.VarChar, String(autoNo))
    .query(`
      SELECT
        SUM(
          TRY_CAST(total AS FLOAT)
        ) AS service_charges

      FROM orders

      WHERE
        auto_no = @autoNo
        AND type LIKE '%Service%'
    `);

  return result.recordset[0];
};

// const { poolPromise, sql } = require("../config/db");

// // ================= BILL INFO =================

// exports.getBillInfo = async (
//   month,
//   year,
//   clientId,
//   siteId
// ) => {
//   const pool = await poolPromise;

//   const result = await pool
//     .request()
//     .input("month", sql.Int, month)
//     .input("year", sql.Int, year)
//     .input("clientId", sql.Int, clientId)
//     .input("siteId", sql.Int, siteId)

//     .query(`
//       SELECT *
//       FROM bill_details
//       WHERE
//         invoice_month = @month
//         AND invoice_year = @year
//         AND client_id = @clientId
//         AND rate_id = @siteId
//         AND active = '0'
//     `);

//   return result.recordset;
// };

// // ================= EMPLOYEE WAGES =================

// exports.getEmpWagesTotal = async (
//   month,
//   year,
//   clientId,
//   siteId
// ) => {
//   const pool = await poolPromise;

//   const result = await pool
//     .request()
//     .input("month", sql.Int, month)
//     .input("year", sql.Int, year)
//     .input("clientId", sql.Int, clientId)
//     .input("siteId", sql.Int, siteId)

//     .query(`
//       SELECT
//         COUNT(id) AS total_emp,

//         SUM(TRY_CAST(gross AS FLOAT))
//         AS gross_salary,

//         SUM(TRY_CAST(deduct_pf AS FLOAT))
//         AS employee_pf_amount,

//         SUM(TRY_CAST(deduct_esic AS FLOAT))
//         AS employee_esic_amount,

//         SUM(TRY_CAST(deduct_pt AS FLOAT))
//         AS pt_amount,

//         SUM(TRY_CAST(emp_pf AS FLOAT))
//         AS employer_pf_amount,

//         SUM(TRY_CAST(emp_esic AS FLOAT))
//         AS employer_esic_amount,

//         SUM(TRY_CAST(emp_service_charges AS FLOAT))
//         AS service_amount,

//         SUM(TRY_CAST(emp_invoice_amount AS FLOAT))
//         AS totalinvoicevalue,

//         SUM(TRY_CAST(CGST AS FLOAT)) AS CGST,

//         SUM(TRY_CAST(SGST AS FLOAT)) AS SGST,

//         SUM(TRY_CAST(IGST AS FLOAT)) AS IGST

//       FROM emp_wages

//       WHERE
//         at_month = @month
//         AND at_year = @year
//         AND client_id = @clientId
//         AND site_id = @siteId
//     `);

//   return result.recordset[0];
// };

// // ================= TOTAL ADVANCE =================

// exports.getTotalAdvance = async (
//   month,
//   year,
//   clientId,
//   siteId
// ) => {
//   const pool = await poolPromise;

//   const result = await pool
//     .request()
//     .input("month", sql.Int, month)
//     .input("year", sql.Int, year)
//     .input("clientId", sql.Int, clientId)
//     .input("siteId", sql.Int, siteId)

//     .query(`
//       SELECT
//         SUM(
//           TRY_CAST(REPLACE(amount, ',', '') AS FLOAT)
//         ) AS totalexpense

//       FROM emp_advance

//       WHERE
//         MONTH(adv_date) = @month
//         AND YEAR(adv_date) = @year
//         AND TRY_CAST(client_id AS INT) = @clientId
//         AND TRY_CAST(site_id AS INT) = @siteId
//         AND active = '0'
//         AND ISNULL(status, '') != 'Deleted'
//     `);

//   return result.recordset[0];
// };