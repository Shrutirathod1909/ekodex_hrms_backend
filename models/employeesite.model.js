const sql = require("mssql");

const { poolPromise } = require("../config/db");

// ============================
// CHECK EMPLOYEE
// ============================
exports.checkEmployee = async (employee_code, employee_name) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("employee_code", sql.VarChar, String(employee_code).trim())
    .input("employee_name", sql.VarChar, String(employee_name).trim()).query(`
      SELECT TOP 1 *
      FROM employee
      WHERE
      LTRIM(RTRIM(employee_code)) =
      LTRIM(RTRIM(@employee_code))

      AND

      LTRIM(RTRIM(emp_full_name)) =
      LTRIM(RTRIM(@employee_name))
    `);

  return result.recordset[0];
};
exports.getTempEmployeeRows = async () => {
  const pool = await poolPromise;

  const result = await pool.request().query(`
    SELECT
      employee_code,
      emp_full_name,
      client_code,
      site_name
    FROM temp_employee
  `);

  return result.recordset;
};
// ============================
// CHECK SITE
// ============================
exports.checkSite = async (site_code, site_name) => {
  try {
    const pool = await poolPromise;

    const cleanSiteCode = String(site_code ?? "").trim();
    const cleanSiteName = String(site_name ?? "").trim();

    console.log("CHECK SITE CODE =", cleanSiteCode);
    console.log("CHECK SITE NAME =", cleanSiteName);

    const result = await pool.request()
      .input("site_code", sql.VarChar(100), cleanSiteCode)
      .input("site_name", sql.VarChar(255), cleanSiteName)
      .query(`
        SELECT TOP 1
          nc.id AS client_id,
          nc.company_name AS client_name,
          nc.x_client_code AS client_code,
          cr.site_name AS site_name
        FROM client_rates cr
        INNER JOIN new_client nc
          ON LTRIM(RTRIM(CAST(nc.x_client_code AS VARCHAR(100)))) =
             LTRIM(RTRIM(CAST(cr.client_code AS VARCHAR(100))))
        WHERE
          LTRIM(RTRIM(CAST(nc.x_client_code AS VARCHAR(100)))) =
             LTRIM(RTRIM(@site_code))
          AND LTRIM(RTRIM(CAST(cr.site_name AS VARCHAR(255)))) =
             LTRIM(RTRIM(@site_name))
          AND cr.active = 0
      `);

    console.log("CHECK SITE RECORD =", result.recordset);

    const site = result.recordset?.[0];

    if (!site) {
      console.log("SITE NOT FOUND");
      return null;
    }

    console.log("CLIENT ID =", site.client_id);
    console.log("CLIENT NAME =", site.client_name);
    console.log("CLIENT CODE =", site.client_code);
    console.log("SITE NAME =", site.site_name);

    return site;

  } catch (error) {
    console.error("CHECK SITE ERROR =", error);
    throw error;
  }
};
const safeValue = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
};

// ============================
// INSERT TEMP EMPLOYEE
// ============================


exports.insertTempEmployee = async (row) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const employeeCode = String(row.employee_code ?? "").trim();

    if (!employeeCode) {
      throw new Error("Employee code is required");
    }

    const employeeResult = await new sql.Request(transaction)
      .input("employee_code", sql.VarChar(100), employeeCode)
      .query(`
        SELECT TOP 1 company_id, branch_id
        FROM employee
        WHERE LTRIM(RTRIM(CAST(employee_code AS VARCHAR(100)))) =
              LTRIM(RTRIM(@employee_code))
      `);

    const employee = employeeResult.recordset?.[0];

    if (!employee) {
      throw new Error(`Employee not found: ${employeeCode}`);
    }

    const companyId = employee.company_id;
    const branchId = employee.branch_id;

    // Delete old temp data
await new sql.Request(transaction)
  .input("created_by", sql.Int, row.created_by ?? null)
  .query(`
    DELETE FROM temp_employee
    WHERE created_by = @created_by
       OR created_by IS NULL
  `);

    // Insert new record with logged-in user ID
    await new sql.Request(transaction)
      .input("employee_code", sql.VarChar(100), employeeCode)
      .input("client_code", sql.VarChar(100), safeValue(row.client_code))
      .input("site_name", sql.VarChar(255), safeValue(row.site_name))
      .input("emp_full_name", sql.VarChar(255), safeValue(row.employee_name))
      .input("company_id", sql.Int, companyId ?? null)
      .input("branch_id", sql.Int, branchId ?? null)
      .input("created_by", sql.Int, row.created_by)
      .query(`
        INSERT INTO temp_employee (
          employee_code,
          client_code,
          site_name,
          emp_full_name,
          company_id,
          branch_id,
          created_by,
          error
        )
        VALUES (
          @employee_code,
          @client_code,
          @site_name,
          @emp_full_name,
          @company_id,
          @branch_id,
          @created_by,
          ''
        )
      `);

    await transaction.commit();

    return {
      success: true,
      employee_code: employeeCode,
      company_id: companyId,
      branch_id: branchId,
      created_by: row.created_by
    };

  } catch (err) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error("ROLLBACK ERROR =", rollbackError.message);
    }

    console.error("INSERT TEMP EMPLOYEE ERROR =", err.message);
    throw err;
  }
};
// ============================
// UPDATE EMPLOYEE SITE
// ============================

exports.updateEmployeeSite = async (employee_code, site) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // 1. Get existing employee data
    const employeeRequest = new sql.Request(transaction);

    const employeeResult = await employeeRequest
      .input(
        "employee_code",
        sql.VarChar(100),
        String(employee_code).trim()
      )
      .query(`
        SELECT TOP 1 *
        FROM employee
        WHERE LTRIM(RTRIM(employee_code)) =
              LTRIM(RTRIM(@employee_code))
      `);

    const employee = employeeResult.recordset[0];

    if (!employee) {
      throw new Error("Employee not found");
    }

    // 2. Validate site data from checkSite()
    if (
      !site ||
      site.client_id == null ||
      site.client_name == null ||
      !String(site.client_code ?? "").trim() ||
      !String(site.site_name ?? "").trim()
    ) {
      throw new Error(
        "Invalid site data: client_id, client_name, client_code and site_name are required"
      );
    }

    // 3. Insert old employee data into employee_log
    const logRequest = new sql.Request(transaction);

    await logRequest
      .input(
        "employee_code",
        sql.VarChar(100),
        employee.employee_code
      )
      .input(
        "initial",
        sql.VarChar(50),
        employee.initial ?? ""
      )
      .input(
        "first_name",
        sql.VarChar(255),
        employee.first_name ?? ""
      )
      .input(
        "middle_name",
        sql.VarChar(255),
        employee.middle_name ?? ""
      )
      .input(
        "last_name",
        sql.VarChar(255),
        employee.last_name ?? ""
      )
      .input(
        "gender",
        sql.VarChar(50),
        employee.gender ?? ""
      )
      .input(
        "dob",
        sql.DateTime,
        employee.dob ?? null
      )
      .input(
        "date_of_joining",
        sql.DateTime,
        employee.date_of_joining ?? null
      )
      .input(
        "address",
        sql.VarChar(500),
        employee.address ?? ""
      )
      .input(
        "city",
        sql.VarChar(100),
        employee.city ?? ""
      )
      .input(
        "state",
        sql.VarChar(100),
        employee.state ?? ""
      )
      .input(
        "pincode",
        sql.VarChar(20),
        employee.pincode ?? ""
      )
      .input(
        "country",
        sql.VarChar(100),
        employee.country ?? ""
      )
      .input(
        "phone1",
        sql.VarChar(50),
        employee.phone1 ?? ""
      )
      .input(
        "phone2",
        sql.VarChar(50),
        employee.phone2 ?? ""
      )
      .input(
        "email_id",
        sql.VarChar(255),
        employee.email_id ?? ""
      )
      .input(
        "client_id",
        sql.Int,
        employee.client_id ?? null
      )
      .input(
        "client_name",
        sql.VarChar(255),
        employee.client_name ?? ""
      )
      .input(
        "client_code",
        sql.VarChar(100),
        employee.client_code ?? ""
      )
      .input(
        "site_name",
        sql.VarChar(255),
        employee.site_name ?? ""
      )
      .input(
        "emp_full_name",
        sql.VarChar(255),
        employee.emp_full_name ?? ""
      )
      .input(
        "activity_id",
        sql.Int,
        employee.id
      )
      .input(
        "activity_remark",
        sql.VarChar(255),
        "Employee Site Updated"
      )
      .query(`
        INSERT INTO employee_log (
          employee_code,
          initial,
          first_name,
          middle_name,
          last_name,
          gender,
          dob,
          date_of_joining,
          address,
          city,
          state,
          pincode,
          country,
          phone1,
          phone2,
          email_id,
          client_id,
          client_name,
          client_code,
          site_name,
          emp_full_name,
          activity_id,
          activity_remark
        )
        VALUES (
          @employee_code,
          @initial,
          @first_name,
          @middle_name,
          @last_name,
          @gender,
          @dob,
          @date_of_joining,
          @address,
          @city,
          @state,
          @pincode,
          @country,
          @phone1,
          @phone2,
          @email_id,
          @client_id,
          @client_name,
          @client_code,
          @site_name,
          @emp_full_name,
          @activity_id,
          @activity_remark
        )
      `);

    // 4. Update employee with new_client values
    const updateRequest = new sql.Request(transaction);
    const newClientId = Number(site.client_id);
    const newClientName = String(site.client_name ?? "").trim();
    const newClientCode = String(site.client_code ?? "").trim();
    const newSiteName = String(site.site_name ?? "").trim();
    const cleanEmployeeCode = String(employee_code ?? "").trim();

    console.log("EMPLOYEE CODE =", cleanEmployeeCode);
    console.log("NEW CLIENT ID =", newClientId);
    console.log("NEW CLIENT NAME =", newClientName);
    console.log("NEW CLIENT CODE =", newClientCode);
    console.log("NEW SITE NAME =", newSiteName);
    console.log("BEFORE UPDATE");
    const updateResult = await updateRequest
      .input(
        "employee_code",
        sql.VarChar(100),
        String(employee_code).trim()
      )
      .input(
        "client_id",
        sql.Int,
        site.client_id
      )
      .input(
        "client_name",
        sql.VarChar(255),
        String(site.client_name).trim()
      )
      .input(
        "client_code",
        sql.VarChar(100),
        String(site.client_code).trim()
      )
      .input(
        "site_name",
        sql.VarChar(255),
        String(site.site_name).trim()
      )
      .query(`
        UPDATE employee
        SET
          client_id = @client_id,
          client_name = @client_name,
          client_code = @client_code,
          site_name = @site_name
        WHERE LTRIM(RTRIM(employee_code)) =
              LTRIM(RTRIM(@employee_code))
      `);
console.log("AFTER UPDATE");
console.log("UPDATE ROWS AFFECTED =", updateResult.rowsAffected);
console.log("UPDATE RESULT =", updateResult.recordset);
    if (!updateResult.rowsAffected[0]) {
      throw new Error("Employee update failed");
    }

    // 5. Commit transaction
    await transaction.commit();

    return updateResult;

  } catch (err) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "ROLLBACK ERROR =>",
        rollbackError.message
      );
    }

    throw err;
  }
};
exports.deleteTempEmployeeRow = async (employeeCode) => {
  return await pool
    .request()
    .input("employee_code", sql.VarChar, employeeCode)
    .query(`
      DELETE FROM temp_employee
      WHERE employee_code = @employee_code
    `);
};