const sql = require("mssql");
const { poolPromise } = require("../config/db");

// EMPLOYEES
const getEmployees = async () => {
  const pool = await poolPromise;

  const result = await pool.request().query(`
    SELECT employee_code, emp_full_name
    FROM employee
    WHERE active = 0
  `);

  return result.recordset;
};

// UNIFORM DATA (WITH FILTER)
const getAllUniformData = async (filters) => {
  const pool = await poolPromise;
  const request = pool.request();

  let query = `
    SELECT 
      id,
      item_name,
      sku_code,
      color,
      hsn_code,
      qty,
      mrp,
      sale_price,
      employee_name,
      employee_code,
      issue_date,
      size,
      type_issued,
      transfer_by,
      remarks,
      created_by,
      created_by_name,
      created_on,
      attachment,
      client_id,
      client_name,
      site_id,
      site_name
    FROM uniform_master
    where 1=1
  `;

  // ================= FILTER: EMPLOYEE =================
  if (filters.employee_code) {
    query += ` AND employee_code = @employee_code`;
    request.input("employee_code", sql.VarChar, filters.employee_code);
  }

  // ================= FILTER: DATE RANGE =================
  if (filters.from_date && filters.to_date) {
    query += `
      AND CAST(created_on AS DATE)
      BETWEEN @from_date AND @to_date
    `;

    request.input("from_date", sql.Date, filters.from_date);
    request.input("to_date", sql.Date, filters.to_date);
  }

  query += ` ORDER BY id DESC`;

  const result = await request.query(query);
  return result.recordset;
};

module.exports = {
  getEmployees,
  getAllUniformData,
};