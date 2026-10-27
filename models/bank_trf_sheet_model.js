const { sql, poolPromise } = require("../config/db");

// ================= GET BILL INFO =================
const getBillInfo = async (client_id, site_id, month, year) => {
  try {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("client_id", sql.Int, client_id)
      .input("site_id", sql.Int, site_id)
      .input("month", sql.Int, month)
      .input("year", sql.Int, year).query(`
        SELECT *
        FROM bill_details
        WHERE client_id = @client_id
        AND rate_id = @site_id
        AND invoice_month = @month
        AND invoice_year = @year
        AND active = '0'
      `);

    return result.recordset;
  } catch (error) {
    throw error;
  }
};

// ================= GET SALARY BY SITE =================
const getSalaryBySite = async (site_id, month, year) => {
  try {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("site_id", sql.Int, site_id)
      .input("month", sql.Int, month)
      .input("year", sql.Int, year).query(`

        SELECT

          ss.*,

          emp.emp_full_name,
          emp.account_no,
          emp.bank_ifsc,
          emp.bank_name,
          emp.ac_holder_name

        FROM salary_slip ss

        LEFT JOIN employee emp
        ON ss.emp_id = emp.id

        WHERE ss.site_id = @site_id
        AND ss.at_month = @month
        AND ss.at_year = @year

      `);

    return result.recordset;
  } catch (error) {
    throw error;
  }
};

// ================= GET CLIENT DETAIL =================
const getClientDetail = async (client_id) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().input("client_id", sql.Int, client_id)
      .query(`
        SELECT *
        FROM new_client
        WHERE id = @client_id
        AND active = '0'
      `);

    return result.recordset[0];
  } catch (error) {
    throw error;
  }
};

// ================= GET SITE DETAIL =================
const getSiteDetail = async (site_id) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().input("site_id", sql.Int, site_id)
      .query(`
        SELECT *
        FROM client_rates
        WHERE id = @site_id
        AND active = '0'
      `);

    return result.recordset[0];
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getBillInfo,
  getSalaryBySite,
  getClientDetail,
  getSiteDetail,
};
