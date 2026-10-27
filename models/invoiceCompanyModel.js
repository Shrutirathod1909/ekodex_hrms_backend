const sql = require("mssql");
const { poolPromise } = require("../config/db");

// COMPANY DETAILS
const getCompanyByName = async () => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT *
      FROM companies
      WHERE company_name = 'ODS PROTECTIVE SERVICES PVT LTD'
    `);

    return result.recordset;

  } catch (error) {
    throw error;
  }
};

// SUPPLIER DETAILS
const getSupplierByName = async (supplierName) => {
  try {

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("supplier_name", sql.VarChar, supplierName)
      .query(`
        SELECT
          id,
          supplier_name,
          contact_person_name,
          phone,
          email,
          address,
          city,
          state,
          pincode,
          bank_name,
          account_no,
          account_type,
          swift_code,
          micr_no,
          ifsc_code,
          active,
          created_on
        FROM supplier_master
        WHERE supplier_name = @supplier_name
      `);

    return result.recordset;

  } catch (error) {
    throw error;
  }
};

module.exports = {
  getCompanyByName,
  getSupplierByName,
};