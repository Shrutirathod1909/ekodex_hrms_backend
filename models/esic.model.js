const { poolPromise, sql } = require("../config/db");

// ================= ESIC DATA =================
exports.getEsicData = async (month, year) => {
  try {

    const pool = await poolPromise;

    const result = await pool.request()
      .input("month", sql.Int, month)
      .input("year", sql.Int, year)
      .query(`

        SELECT 
          
          ew.emp_code AS IP,

          ew.emp_name AS [INSURED NAME],

          ISNULL(emp.esis_no, '') AS ESIC_NO,

          ew.present_days AS [PRESENT DAYS],

          ew.gross AS GROSS,

          ew.deduct_esic AS [EE CONTRIBUTION]

        FROM emp_wages ew

        LEFT JOIN employee emp
          ON emp.id = ew.emp_id

        WHERE ew.at_month = @month
          AND ew.at_year = @year

      `);

    return result.recordset;

  } catch (error) {

    console.log("MODEL ERROR:", error);

    throw error;
  }
};