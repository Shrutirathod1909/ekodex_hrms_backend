const { sql, poolPromise } = require("../config/db");

class AttendanceInvoiceModel {
  // Get employee list for a site/month/year
  static async getAttendanceDataByEmpSite(siteId, month, year, attType) {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("siteId", sql.Int, siteId)
      .input("month", sql.Int, month)
      .input("year", sql.Int, year)
      .input("attType", sql.VarChar, attType).query(`
        SELECT
            site_id,
            client_code,
            emp_name,
            emp_code,
            rank,
            at_month,
            at_year,
            att_type
        FROM attendance
        WHERE
            site_id = @siteId
            AND at_month = @month
            AND at_year = @year
            AND att_type = @attType
            AND active = 0
        GROUP BY
            site_id,
            client_code,
            emp_name,
            emp_code,
            rank,
            at_month,
            at_year,
            att_type
      `);

    return result.recordset;
  }

  // Count attendance days by status
  static async getTotalDaysByStatusEmp(
    status,
    siteId,
    month,
    year,
    empCode,
    rank,
    attType,
  ) {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("status", sql.VarChar, status)
      .input("siteId", sql.Int, siteId)
      .input("month", sql.Int, month)
      .input("year", sql.Int, year)
      .input("empCode", sql.VarChar, empCode)
      .input("rank", sql.VarChar, rank)
      .input("attType", sql.VarChar, attType).query(`
        SELECT
            COUNT(id) AS total_days
        FROM attendance
        WHERE
            status = @status
            AND site_id = @siteId
            AND at_month = @month
            AND at_year = @year
            AND active = 0
            AND emp_code = @empCode
            AND rank = @rank
            AND att_type = @attType
      `);

    return result.recordset[0];
  }
}

module.exports = AttendanceInvoiceModel;
