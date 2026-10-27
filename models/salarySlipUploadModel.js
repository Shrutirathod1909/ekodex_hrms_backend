// ===============================
// models/salarySlipUploadModel.js
// ===============================

const {
  sql,
  poolPromise,
} = require(
  "../config/db"
);

const saveSalarySlip =
  async (
    emp_id,
    month,
    year,
    filePath
  ) => {

    const pool =
      await poolPromise;

    // ======================
    // CHECK RECORD
    // ======================

    const checkRecord =
      await pool
        .request()
        .input(
          "emp_id",
          sql.Int,
          emp_id
        )
        .input(
          "month",
          sql.Int,
          month
        )
        .input(
          "year",
          sql.Int,
          year
        )
        .query(`
          SELECT id
          FROM salary_slip

          WHERE emp_id = @emp_id
          AND at_month = @month
          AND at_year = @year
        `);

    // ======================
    // UPDATE
    // ======================

    if (
      checkRecord.recordset
        .length > 0
    ) {

      await pool
        .request()
        .input(
          "emp_id",
          sql.Int,
          emp_id
        )
        .input(
          "month",
          sql.Int,
          month
        )
        .input(
          "year",
          sql.Int,
          year
        )
        .input(
          "path",
          sql.VarChar,
          filePath
        )
        .query(`
          UPDATE salary_slip

          SET
            salary_slip_img_path =
              @path

          WHERE emp_id = @emp_id
          AND at_month = @month
          AND at_year = @year
        `);

    }

    // ======================
    // INSERT
    // ======================

    else {

      await pool
        .request()
        .input(
          "emp_id",
          sql.Int,
          emp_id
        )
        .input(
          "month",
          sql.Int,
          month
        )
        .input(
          "year",
          sql.Int,
          year
        )
        .input(
          "path",
          sql.VarChar,
          filePath
        )
        .query(`
          INSERT INTO salary_slip (

            emp_id,
            at_month,
            at_year,
            salary_slip_img_path

          )

          VALUES (

            @emp_id,
            @month,
            @year,
            @path

          )
        `);
    }

    return true;
  };
const getSalarySlipByEmpMonthYear = async (emp_id, month, year) => {
  const pool = await poolPromise;

  const result = await pool.request()
    .input("emp_id", sql.Int, emp_id)
    .input("month", sql.Int, month)
    .input("year", sql.Int, year)
    .query(`
      SELECT salary_slip_img_path
      FROM salary_slip
      WHERE emp_id = @emp_id
      AND at_month = @month
      AND at_year = @year
    `);

  return result.recordset;
};
module.exports = {
  saveSalarySlip, getSalarySlipByEmpMonthYear,
};