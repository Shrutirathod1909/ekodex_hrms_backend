
const { sql, poolPromise } = require("../config/db");

const EmployeeLoginCoordinates = {
  // ==========================================
  // GET COORDINATES BY EMPLOYEE CODE
  // ==========================================
  async getByEmpCode(emp_code) {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("emp_code", sql.VarChar, emp_code)
      .query(`
        SELECT *
        FROM employee_login_coordinates
        WHERE emp_code = @emp_code
          AND active = 0
        ORDER BY id ASC
      `);

    return result.recordset;
  },

  // ==========================================
  // CREATE COORDINATES
  // active = 0
  // Save created_by and source_code
  // ==========================================
async create(data) {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("emp_code", sql.VarChar, data.emp_code)
    .input(
      "office_longitude",
      sql.Decimal(10, 7),
      Number(data.office_longitude)
    )
    .input(
      "office_latitude",
      sql.Decimal(10, 7),
      Number(data.office_latitude)
    )
    .input(
      "created_by",
      sql.Int,
      data.created_by ?? null
    )
    .input(
      "created_by_name",
      sql.VarChar(150),
      data.created_by_name ?? null
    )
    .input(
      "source",
      sql.VarChar(50),
      data.source || "WEB"
    )
    .query(`
      INSERT INTO employee_login_coordinates
      (
        emp_code,
        office_longitude,
        office_latitude,
        created_by,
        created_by_name,
        source,
        created_on,
        active
      )
      OUTPUT INSERTED.*
      VALUES
      (
        @emp_code,
        @office_longitude,
        @office_latitude,
        @created_by,
        @created_by_name,
        @source,
        GETDATE(),
        0
      )
    `);

  return result.recordset[0];
},

  // ==========================================
  // UPDATE COORDINATES BY ID
  // Only update active = 0 records
  // ==========================================
async update(id, data) {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("id", sql.Int, Number(id))
    .input(
      "office_longitude",
      sql.Decimal(10, 7),
      Number(data.office_longitude)
    )
    .input(
      "office_latitude",
      sql.Decimal(10, 7),
      Number(data.office_latitude)
    )
    .input(
      "source",
      sql.VarChar(50),
      data.source || "WEB"
    )
    .input(
      "modified_id",
      sql.Int,
      data.modified_id
    )
    .input(
      "modified_by_name",
      sql.VarChar(150),
      data.modified_by_name
    )
    .query(`
      UPDATE employee_login_coordinates
      SET
        office_longitude = @office_longitude,
        office_latitude = @office_latitude,
        source = @source,
        modified_id = @modified_id,
        modified_on = GETDATE(),
        modified_by_name = @modified_by_name
      OUTPUT INSERTED.*
      WHERE id = @id
        AND active = 0
    `);

  return result.recordset[0] || null;
},

  // ==========================================
  // SOFT DELETE
  // active = 1
  // ==========================================

async delete(id, data) {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("id", sql.Int, Number(id))
    .input("deleted_id", sql.Int, data.deleted_id)
    .input("deleted_by_name", sql.VarChar(150), data.deleted_by_name)
    .query(`
      UPDATE employee_login_coordinates
      SET
        active = 1,
        deleted_on = GETDATE(),
        deleted_id = @deleted_id,
        deleted_by_name = @deleted_by_name
      OUTPUT INSERTED.id
      WHERE id = @id
        AND active = 0
    `);

  return result.recordset.length > 0;
},

};

module.exports = EmployeeLoginCoordinates;
