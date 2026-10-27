const { sql, poolPromise } = require("../config/db");

// // ======================================================
// // NEW CODE
// // EMP_WAGES + EMPLOYEE JOIN
// // ======================================================

// const getSalaryWages = async (site_id, month, year) => {
//   const pool = await poolPromise;

//   const result = await pool
//     .request()
//     .input("site_id", sql.Int, site_id)
//     .input("month", sql.Int, month)
//     .input("year", sql.Int, year)
//     .query(`
//       SELECT
//         ew.*,

//         -- Employee Details
//         e.employee_code AS employee_master_code,
//         e.aadhar_no,
//         e.pancard_no,
//         e.date_of_joining,
//         e.emp_full_name AS employee_full_name

//       FROM emp_wages ew

//       LEFT JOIN employee e
//         ON e.id = ew.emp_id

//       WHERE ew.site_id = @site_id
//         AND ew.at_month = @month
//         AND ew.at_year = @year

//       ORDER BY ew.id ASC
//     `);

//   return result.recordset;
// };


// module.exports = {
//   getSalaryWages,
// };  


const getBillByClientAndSite = async (client_id, site_id, month, year) => {
  const pool = await poolPromise;

  const result = await pool.request()
    .input("client_id", sql.Int, client_id)
    .input("site_id", sql.Int, site_id)
    .input("month", sql.Int, month)
    .input("year", sql.Int, year)
    .query(`
      SELECT *
      FROM bill_details
      WHERE client_id = @client_id
        AND rate_id = @site_id
        AND invoice_month = @month
        AND invoice_year = @year
        AND active = '0'
    `);

  return result.recordset;
};
// ================= GET SALARY BY SITE =================

// const getSalaryBySite = async (site_id, month, year) => {
//   const pool = await poolPromise;

//   const result = await pool.request()
//     .input("site_id", sql.Int, site_id)
//     .input("month", sql.Int, month)
//     .input("year", sql.Int, year)
//     .query(`
//       SELECT *
//       FROM emp_wages
//       WHERE site_id = @site_id
//         AND at_month = @month
//         AND at_year = @year 
//     `);

//   return result.recordset;
// };

const getSalaryBySite = async (site_id, month, year) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("site_id", sql.Int, site_id)
    .input("month", sql.Int, month)
    .input("year", sql.Int, year)
    .query(`
      SELECT
        ws.*,

        e.emp_full_name AS employee_full_name,
        e.dob AS employee_dob,
        e.phone1 AS employee_mobile_no,
        e.aadhar_no AS employee_aadhar_no,
        e.bank_ifsc AS employee_ifsc,
        e.pancard_no AS employee_pan,
        e.bank_name AS employee_bank_name,
        e.account_no AS employee_account_no,
        e.date_of_joining AS employee_doj,
        e.rank AS employee_designation,
        e.employee_code AS employee_code_master,
        e.pf_no AS employee_pf_no,
        e.uan_no AS employee_uan_no,
        e.esis_no AS employee_esis_no

      FROM emp_wages ws

      LEFT JOIN employee e
        ON e.id = ws.emp_id

      WHERE ws.site_id = @site_id
        AND ws.at_month = @month
        AND ws.at_year = @year
    `);


  return result.recordset;
};


// ================= CLIENT DETAIL =================

const getClientDetail = async (client_id) => {
  const pool = await poolPromise;

  const result = await pool.request()
    .input("client_id", sql.Int, client_id)
    .query(`
      SELECT *
      FROM new_client
      WHERE id = @client_id
        AND active = '0'
    `);

  return result.recordset;
};


// ================= CLIENT RATES =================

const getClientRates = async (site_id) => {
  const pool = await poolPromise;

  const result = await pool.request()
    .input("site_id", sql.Int, site_id)
    .query(`
      SELECT *
      FROM client_rates
      WHERE id = @site_id
        AND active = '0'
    `);

  return result.recordset;
};

module.exports = {
  getBillByClientAndSite,
  getSalaryBySite,
  getClientDetail,
  getClientRates,
};