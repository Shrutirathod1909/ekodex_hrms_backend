const { sql, poolPromise } = require("../config/db");

// ================== GET ALL CLIENTS ==================
const getAllClients = async () => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT *
      FROM new_client
      WHERE active = '0'
      ORDER BY company_name ASC
    `);

    return result.recordset;
  } catch (error) {
    console.error("getAllClients Error:", error);
    throw error;
  }
};

// ================== GET BILL DETAILS ==================
const getBillByClientAndSite2 = async (client_id, site_id, from_date, to_date) => {
  try {
    if (!client_id || !site_id || !from_date || !to_date) {
      return [];
    }

    const pool = await poolPromise;
    const request = pool.request();

    let query = `
      SELECT *
      FROM bill_details
      WHERE active = '0'
      AND client_id = @client_id
      AND rate_id = @site_id
      AND invoice_date BETWEEN @from_date AND @to_date
    `;

    request.input("client_id", sql.Int, client_id);
    request.input("site_id", sql.Int, site_id);
    request.input("from_date", sql.Date, from_date);
    request.input("to_date", sql.Date, to_date);

    const result = await request.query(query);

    return result.recordset || [];
  } catch (error) {
    console.error("getBillByClientAndSite2 Error:", error);
    throw error;
  }
};

module.exports = {
  getAllClients,
  getBillByClientAndSite2,
};