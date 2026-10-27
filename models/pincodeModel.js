const { poolPromise, sql } = require("../config/db");

const getAllPincodes = async () => {
  const pool = await poolPromise;

  const result = await pool.request().query(`
      SELECT
        id,
        pincode,
        area_name,
        city_name,
        state_name,
        state_code,
        country_code
      FROM sample_pincode_list
      ORDER BY id DESC
    `);

  return result.recordset;
};

const searchPincodes = async (search) => {
  const pool = await poolPromise;

  const result = await pool.request().input("search", sql.VarChar, search)
    .query(`
      SELECT TOP 20
        id,
        pincode,
        area_name,
        city_name,
        state_name,
        state_code,
        country_code
      FROM sample_pincode_list
      WHERE pincode LIKE @search + '%'
      ORDER BY pincode
    `);

  return result.recordset;
};

module.exports = {
  getAllPincodes,
  searchPincodes,
};
