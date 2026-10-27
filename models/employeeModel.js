const { poolPromise, DOC_BASE_URL, sql } = require("../config/db");
const logger = require("../utils/logger");
const md5 = require("md5");

// const checkEmailExists = async (email) => {
//   const pool = await sql.connect(dbConfig);
//   const result = await pool.request().input("email", sql.VarChar, email).query(`
//       SELECT CASE
//         WHEN EXISTS (SELECT 1 FROM employee WHERE email_id = @email)
//              OR EXISTS (SELECT 1 FROM users WHERE email = @email)
//         THEN 1 ELSE 0
//       END AS existsInDb
//     `);

//   return result.recordset[0].existsInDb === 1;
// };

const deleteTempEmployeeByUser = async (userId) => {
  const pool = await poolPromise;

  await pool.request().input("created_by", sql.BigInt, userId).query(`
      DELETE FROM temp_employee
      WHERE created_by = @created_by
    `);
};

const checkEmailExists = async (email) => {
  const pool = await await poolPromise;
  const result = await pool.request().input("email", sql.VarChar, email).query(`
      SELECT CASE 
        WHEN EXISTS (SELECT 1 FROM employee WHERE email_id = @email) 
             OR EXISTS (SELECT 1 FROM users WHERE email = @email) 
        THEN 1 ELSE 0 
      END AS existsInDb
    `);

  return result.recordset[0].existsInDb === 1;
};

const saveCardId = async (id, cardPath) => {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    console.log("cardPath", cardPath);
    request.input("id", sql.Int, id);
    request.input("emp_id_card", sql.NVarChar(sql.MAX), cardPath);

    const result = await request.query(`
      UPDATE employee
      SET emp_id_card = @emp_id_card
      WHERE id = @id
    `);

    return result.rowsAffected[0] > 0;
  } catch (err) {
    logger.error("saveCardId Error:", err);
    throw err;
  }
};

const deleteEmployeeDocument = async (documentId) => {
  const pool = await poolPromise;

  const request = pool.request();

  request.input(
    "id",
    sql.Int,
    documentId
  );

  await request.query(`
update  emp_docs set active=1
    WHERE id = @id
  `);
};
const getEmployeesDropdown = async ({
  userId,
  userRole,
  userEmpId,
  userEmpCode
}) => {

  try {

    const pool = await poolPromise;

    const normalizedRole =
      String(userRole || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");

    const isAdmin =
      normalizedRole === "admin" ||
      normalizedRole === "superadmin";

    const request =
      pool.request();

    // =====================================================
    // LOGIN USER DETAILS
    // =====================================================

    request.input(
      "user_id",
      sql.Int,
      userId ? Number(userId) : null
    );

    request.input(
      "emp_id",
      sql.Int,
      userEmpId ? Number(userEmpId) : null
    );

    request.input(
      "emp_code",
      sql.VarChar(100),
      userEmpCode
        ? String(userEmpCode)
        : null
    );


    // =====================================================
    // ADMIN / SUPERADMIN
    // → ALL EMPLOYEES
    // =====================================================

    if (isAdmin) {

      const result =
        await request.query(`

          SELECT
            id,
            employee_code,
            initial,
            first_name,
            middle_name,
            last_name,
            emp_full_name,
            active,
            company_id,
            branch_id

          FROM employee

          WHERE ISNULL(active, 0) = 0

          ORDER BY
            CASE
              WHEN emp_full_name IS NOT NULL
                   AND LTRIM(RTRIM(emp_full_name)) <> ''
              THEN emp_full_name

              ELSE
                LTRIM(RTRIM(
                  ISNULL(first_name, '') + ' ' +
                  ISNULL(middle_name, '') + ' ' +
                  ISNULL(last_name, '')
                ))

            END ASC

        `);

      return result.recordset;
    }


    // =====================================================
    // NORMAL USER
    // → ONLY LOGGED-IN EMPLOYEE
    // =====================================================

    const result =
      await request.query(`

        SELECT
          id,
          employee_code,
          initial,
          first_name,
          middle_name,
          last_name,
          emp_full_name,
          active,
          company_id,
          branch_id

        FROM employee

        WHERE ISNULL(active, 0) = 0

        AND (

          (
            @emp_id IS NOT NULL
            AND id = @emp_id
          )

          OR

          (
            @emp_id IS NULL
            AND @emp_code IS NOT NULL
            AND employee_code = @emp_code
          )

        )

        ORDER BY
          id DESC

      `);

    return result.recordset;

  } catch (error) {

    console.error(
      "EMPLOYEE MODEL - GET DROPDOWN ERROR:",
      error
    );

    throw error;
  }
};

const verifyEmployeeData2 = async (employee) => {
  const pool = await poolPromise;

  try {
    console.log("=================================");
    console.log("VERIFY EMPLOYEE START");
    console.log("TEMP ID:", employee.id);
    console.log("EMPLOYEE CODE:", employee.employee_code);
    console.log("=================================");

    // =====================================
    // CLEAN EMPLOYEE CODE
    // =====================================

    const employeeCode = String(
      employee.employee_code ?? ""
    ).trim();

    if (!employeeCode) {
      return {
        success: false,
        message: "Employee Code is missing",
      };
    }

    // =====================================
    // FIRST CHECK EMPLOYEE EXISTS
    // =====================================

    const checkResult = await pool
      .request()
      .input(
        "employee_code",
        sql.NVarChar,
        employeeCode
      )
      .query(`
        SELECT id, employee_code
        FROM employee
        WHERE LTRIM(RTRIM(employee_code))
              =
              @employee_code
      `);

    console.log(
      "EMPLOYEE FOUND:",
      checkResult.recordset
    );

    // =====================================
    // EMPLOYEE NOT FOUND
    // =====================================

    if (checkResult.recordset.length === 0) {

      const errorMessage =
        `Employee Code ${employeeCode} not found`;

      await pool
        .request()
        .input(
          "id",
          sql.BigInt,
          Number(employee.id)
        )
        .input(
          "error",
          sql.NVarChar(sql.MAX),
          errorMessage
        )
        .query(`
          UPDATE temp_employee
          SET error = @error
          WHERE id = @id
        `);

      return {
        success: false,
        message: errorMessage,
      };
    }

    // =====================================
    // UPDATE EMPLOYEE
    // =====================================

    const updateResult = await pool
      .request()

      .input(
        "employee_code",
        sql.NVarChar,
        employeeCode
      )

      .input(
        "first_name",
        sql.NVarChar,
        String(employee.first_name ?? "")
      )

      .input(
        "middle_name",
        sql.NVarChar,
        String(employee.middle_name ?? "")
      )

      .input(
        "last_name",
        sql.NVarChar,
        String(employee.last_name ?? "")
      )

      .input(
        "gender",
        sql.NVarChar,
        String(employee.gender ?? "")
      )

      .input(
        "dob",
        sql.NVarChar,
        String(employee.dob ?? "")
      )

      .input(
        "date_of_joining",
        sql.NVarChar,
        String(employee.date_of_joining ?? "")
      )

      .input(
        "email_id",
        sql.NVarChar,
        String(employee.email_id ?? "")
      )

      .input(
        "rank",
        sql.NVarChar,
        String(employee.rank ?? "")
      )

      .input(
        "phone1",
        sql.NVarChar,
        String(employee.phone1 ?? "")
      )

      .input(
        "pancard_no",
        sql.NVarChar,
        String(employee.pancard_no ?? "")
      )

      .input(
        "aadhar_no",
        sql.NVarChar,
        String(employee.aadhar_no ?? "")
      )

      .input(
        "passport_no",
        sql.NVarChar,
        String(employee.passport_no ?? "")
      )

      .input(
        "passport_valid_date",
        sql.NVarChar,
        String(employee.passport_valid_date ?? "")
      )

      .input(
        "pf_no",
        sql.NVarChar,
        String(employee.pf_no ?? "")
      )

      .input(
        "esis_no",
        sql.NVarChar,
        String(employee.esis_no ?? "")
      )

      .input(
        "uan_no",
        sql.NVarChar,
        String(employee.uan_no ?? "")
      )

      .input(
        "father_name",
        sql.NVarChar,
        String(employee.father_name ?? "")
      )

      .input(
        "esis_date",
        sql.NVarChar,
        String(employee.esis_date ?? "")
      )

      .input(
        "uan_date",
        sql.NVarChar,
        String(employee.uan_date ?? "")
      )

      .input(
        "basic_salary",
        sql.NVarChar,
        String(employee.basic_salary ?? "")
      )

      .input(
        "account_no",
        sql.NVarChar,
        String(employee.account_no ?? "")
      )

      .input(
        "bank_ifsc",
        sql.NVarChar,
        String(employee.bank_ifsc ?? "")
      )

      .input(
        "address",
        sql.NVarChar,
        String(employee.address ?? "")
      )

      .input(
        "city",
        sql.NVarChar,
        String(employee.city ?? "")
      )

      .input(
        "state",
        sql.NVarChar,
        String(employee.state ?? "")
      )

      .input(
        "pincode",
        sql.NVarChar,
        String(employee.pincode ?? "")
      )

      .input(
        "country",
        sql.NVarChar,
        String(employee.country ?? "")
      )

      .input(
        "modified_by",
        sql.BigInt,
        Number(employee.created_by ?? 0)
      )

      .query(`
        UPDATE employee
        SET
          first_name = @first_name,
          middle_name = @middle_name,
          last_name = @last_name,
          gender = @gender,
          dob = @dob,
          date_of_joining = @date_of_joining,
          email_id = @email_id,
          rank = @rank,
          phone1 = @phone1,
          pancard_no = @pancard_no,
          aadhar_no = @aadhar_no,
          passport_no = @passport_no,
          passport_valid_date = @passport_valid_date,
          pf_no = @pf_no,
          esis_no = @esis_no,
          uan_no = @uan_no,
          father_name = @father_name,
          esis_date = @esis_date,
          uan_date = @uan_date,
          basic_salary = @basic_salary,
          account_no = @account_no,
          bank_ifsc = @bank_ifsc,
          address = @address,
          city = @city,
          state = @state,
          pincode = @pincode,
          country = @country,
          modified_by = @modified_by,
          modified_on = DATEADD(MINUTE, 330, GETUTCDATE())

        WHERE LTRIM(RTRIM(employee_code))
              =
              @employee_code
      `);

    console.log(
      "UPDATE ROWS AFFECTED:",
      updateResult.rowsAffected
    );

    // =====================================
    // UPDATE FAILED
    // =====================================

    if (
      !updateResult.rowsAffected ||
      updateResult.rowsAffected[0] === 0
    ) {

      const errorMessage =
        `Employee Code ${employeeCode} update failed`;

      await pool
        .request()
        .input(
          "id",
          sql.BigInt,
          Number(employee.id)
        )
        .input(
          "error",
          sql.NVarChar(sql.MAX),
          errorMessage
        )
        .query(`
          UPDATE temp_employee
          SET error = @error
          WHERE id = @id
        `);

      return {
        success: false,
        message: errorMessage,
      };
    }

    // =====================================
    // DELETE TEMP RECORD
    // =====================================

    await pool
      .request()
      .input(
        "id",
        sql.BigInt,
        Number(employee.id)
      )
      .query(`
        DELETE FROM temp_employee
        WHERE id = @id
      `);

    console.log(
      "SUCCESSFULLY UPDATED:",
      employeeCode
    );

    return {
      success: true,
      message: "Employee updated successfully",
    };

  } catch (error) {

    console.error(
      "VERIFY EMPLOYEE ERROR:",
      error
    );

    return {
      success: false,
      message: error.message,
    };
  }
};

// const addTempEmployeeLog = async (rows) => {
//   const pool = await poolPromise;

//   for (const row of rows) {
//     await pool
//       .request()

//       .input("employee_code", sql.NVarChar, row.employee_code)
//       .input("client_code", sql.NVarChar, row.client_code)
//       .input("initial", sql.NVarChar, row.initial)
//       .input("first_name", sql.NVarChar, row.first_name)
//       .input("middle_name", sql.NVarChar, row.middle_name)
//       .input("last_name", sql.NVarChar, row.last_name)
//       .input("gender", sql.NVarChar, row.gender)
//       .input("dob", sql.NVarChar, row.dob)
//       .input("date_of_joining", sql.NVarChar, row.date_of_joining)
//       .input("email_id", sql.NVarChar, row.email_id)

//       .input("rank", sql.NVarChar, row.rank)
//       .input("department", sql.NVarChar, row.department)

//       .input("client_id", sql.BigInt, row.client_id)
//       .input("site_id", sql.BigInt, row.site_id)

//       .input("reporting_manager", sql.NVarChar, row.reporting_manager)
//       .input("reporting_user", sql.NVarChar, row.reporting_user)
//       .input("gang_name", sql.NVarChar, row.gang_name)

//       .input("address", sql.NVarChar, row.address)
//       .input("city", sql.NVarChar, row.city)
//       .input("state", sql.NVarChar, row.state)
//       .input("pincode", sql.NVarChar, row.pincode)
//       .input("country", sql.NVarChar, row.country)
//       .input("phone1", sql.NVarChar, row.phone1)
//       .input("phone2", sql.NVarChar, row.phone2)

//       .input("contact_person", sql.NVarChar, row.contact_person)
//       .input("contact_mobile", sql.NVarChar, row.contact_mobile)

//       .input("p_address", sql.NVarChar, row.p_address)
//       .input("p_city", sql.NVarChar, row.p_city)
//       .input("p_state", sql.NVarChar, row.p_state)
//       .input("p_pincode", sql.NVarChar, row.p_pincode)
//       .input("p_country", sql.NVarChar, row.p_country)
//       .input("p_phone1", sql.NVarChar, row.p_phone1)
//       .input("p_phone2", sql.NVarChar, row.p_phone2)

//       .input("contact_relation", sql.NVarChar, row.contact_relation)
//       .input("contact_email", sql.NVarChar, row.contact_email)

//       .input("marital_status", sql.NVarChar, row.marital_status)
//       .input("mrg_date", sql.NVarChar, row.mrg_date)

//       .input("cast", sql.NVarChar, row.cast)
//       .input("category", sql.NVarChar, row.category)
//       .input("native_place", sql.NVarChar, row.native_place)
//       .input("blood_group", sql.NVarChar, row.blood_group)

//       .input("driving_license", sql.NVarChar, row.driving_license)
//       .input("pancard_no", sql.NVarChar, row.pancard_no)
//       .input("aadhar_no", sql.NVarChar, row.aadhar_no)

//       .input("passport_no", sql.NVarChar, row.passport_no)
//       .input("passport_valid_date", sql.NVarChar, row.passport_valid_date)

//       .input("pf_no", sql.NVarChar, row.pf_no)
//       .input("esis_no", sql.NVarChar, row.esis_no)
//       .input("uan_no", sql.NVarChar, row.uan_no)

//       .input("lang1", sql.NVarChar, row.lang1)
//       .input("lang2", sql.NVarChar, row.lang2)
//       .input("lang3", sql.NVarChar, row.lang3)
//       .input("lang4", sql.NVarChar, row.lang4)
//       .input("lang5", sql.NVarChar, row.lang5)

//       .input("hobby1", sql.NVarChar, row.hobby1)
//       .input("hobby2", sql.NVarChar, row.hobby2)
//       .input("hobby3", sql.NVarChar, row.hobby3)
//       .input("hobby4", sql.NVarChar, row.hobby4)

//       .input("doc_type", sql.NVarChar, row.doc_type)
//       .input("passing_year", sql.NVarChar, row.passing_year)
//       .input("doc_name", sql.NVarChar, row.doc_name)
//       .input("doc_image", sql.NVarChar, row.doc_image)
//       .input("doc_status", sql.NVarChar, row.doc_status)
//       .input("doc_remark", sql.NVarChar, row.doc_remark)

//       .input("f_initial", sql.NVarChar, row.f_initial)
//       .input("f_relative_name", sql.NVarChar, row.f_relative_name)
//       .input("f_gender", sql.NVarChar, row.f_gender)
//       .input("f_relation", sql.NVarChar, row.f_relation)
//       .input("f_dob", sql.NVarChar, row.f_dob)
//       .input("f_age", sql.NVarChar, row.f_age)
//       .input("f_minor", sql.NVarChar, row.f_minor)
//       .input("f_guardian", sql.NVarChar, row.f_guardian)
//       .input("f_address", sql.NVarChar, row.f_address)
//       .input("f_contact", sql.NVarChar, row.f_contact)
//       .input("f_email", sql.NVarChar, row.f_email)
//       .input("f_sharepf", sql.NVarChar, row.f_sharepf)
//       .input("f_shareesic", sql.NVarChar, row.f_shareesic)

//       .input("emp_company_name", sql.NVarChar, row.emp_company_name)
//       .input("emp_designation", sql.NVarChar, row.emp_designation)
//       .input("emp_address", sql.NVarChar, row.emp_address)
//       .input("emp_city", sql.NVarChar, row.emp_city)
//       .input("emp_state", sql.NVarChar, row.emp_state)
//       .input("emp_country", sql.NVarChar, row.emp_country)
//       .input("emp_pincode", sql.NVarChar, row.emp_pincode)
//       .input("emp_joined_date", sql.NVarChar, row.emp_joined_date)
//       .input("last_working_date", sql.NVarChar, row.last_working_date)
//       .input("annual_ctc", sql.NVarChar, row.annual_ctc)
//       .input("monthly_ctc", sql.NVarChar, row.monthly_ctc)
//       .input("reporting_to", sql.NVarChar, row.reporting_to)
//       .input(
//         "reporting_to_designation",
//         sql.NVarChar,
//         row.reporting_to_designation,
//       )
//       .input("reporting_to_email", sql.NVarChar, row.reporting_to_email)
//       .input("reporting_to_contact", sql.NVarChar, row.reporting_to_contact)
//       .input("gross_income", sql.NVarChar, row.gross_income)
//       .input("gross_tds", sql.NVarChar, row.gross_tds)
//       .input("gross_pt", sql.NVarChar, row.gross_pt)
//       .input("total_pt", sql.NVarChar, row.total_pt)

//       .input("bank_name", sql.NVarChar, row.bank_name)
//       .input("account_no", sql.NVarChar, row.account_no)
//       .input("bank_address", sql.NVarChar, row.bank_address)
//       .input("bank_city", sql.NVarChar, row.bank_city)
//       .input("bank_state", sql.NVarChar, row.bank_state)
//       .input("bank_ifsc", sql.NVarChar, row.bank_ifsc)
//       .input("bank_micr", sql.NVarChar, row.bank_micr)
//       .input("cancelled_cheque_image", sql.NVarChar, row.cancelled_cheque_image)

//       .input("separation_type", sql.NVarChar, row.separation_type)
//       .input("separate_reason", sql.NVarChar, row.separate_reason)
//       .input("date_of_separation", sql.NVarChar, row.date_of_separation)
//       .input("notice_period", sql.NVarChar, row.notice_period)
//       .input("last_working_date_sp", sql.NVarChar, row.last_working_date_sp)
//       .input("handover_given_to", sql.NVarChar, row.handover_given_to)

//       .input("created_by", sql.BigInt, row.created_by).query(`
//         INSERT INTO temp_employee_log
//         (
//           employee_code, client_code, initial, first_name, middle_name,
//           last_name, gender, dob, date_of_joining, email_id,
//           rank, department, client_id, site_id,
//           reporting_manager, reporting_user, gang_name,
//           address, city, state, pincode, country,
//           phone1, phone2,
//           contact_person, contact_mobile,
//           p_address, p_city, p_state, p_pincode,
//           p_country, p_phone1, p_phone2,
//           contact_relation, contact_email,
//           marital_status, mrg_date,
//           cast, category, native_place, blood_group,
//           driving_license, pancard_no, aadhar_no,
//           passport_no, passport_valid_date,
//           pf_no, esis_no, uan_no,
//           lang1, lang2, lang3, lang4, lang5,
//           hobby1, hobby2, hobby3, hobby4,
//           doc_type, passing_year, doc_name, doc_image,
//           doc_status, doc_remark,
//           f_initial, f_relative_name, f_gender, f_relation,
//           f_dob, f_age, f_minor, f_guardian,
//           f_address, f_contact, f_email,
//           f_sharepf, f_shareesic,
//           emp_company_name, emp_designation,
//           emp_address, emp_city, emp_state,
//           emp_country, emp_pincode,
//           emp_joined_date, last_working_date,
//           annual_ctc, monthly_ctc,
//           reporting_to, reporting_to_designation,
//           reporting_to_email, reporting_to_contact,
//           gross_income, gross_tds, gross_pt, total_pt,
//           bank_name, account_no, bank_address,
//           bank_city, bank_state, bank_ifsc, bank_micr,
//           cancelled_cheque_image,
//           separation_type, separate_reason,
//           date_of_separation, notice_period,
//           last_working_date_sp, handover_given_to,
//           created_by, created_on
//         )
//         VALUES
//         (
//           @employee_code,@client_code,@initial,@first_name,@middle_name,
//           @last_name,@gender,@dob,@date_of_joining,@email_id,
//           @rank,@department,@client_id,@site_id,
//           @reporting_manager,@reporting_user,@gang_name,
//           @address,@city,@state,@pincode,@country,
//           @phone1,@phone2,
//           @contact_person,@contact_mobile,
//           @p_address,@p_city,@p_state,@p_pincode,
//           @p_country,@p_phone1,@p_phone2,
//           @contact_relation,@contact_email,
//           @marital_status,@mrg_date,
//           @cast,@category,@native_place,@blood_group,
//           @driving_license,@pancard_no,@aadhar_no,
//           @passport_no,@passport_valid_date,
//           @pf_no,@esis_no,@uan_no,
//           @lang1,@lang2,@lang3,@lang4,@lang5,
//           @hobby1,@hobby2,@hobby3,@hobby4,
//           @doc_type,@passing_year,@doc_name,@doc_image,
//           @doc_status,@doc_remark,
//           @f_initial,@f_relative_name,@f_gender,@f_relation,
//           @f_dob,@f_age,@f_minor,@f_guardian,
//           @f_address,@f_contact,@f_email,
//           @f_sharepf,@f_shareesic,
//           @emp_company_name,@emp_designation,
//           @emp_address,@emp_city,@emp_state,
//           @emp_country,@emp_pincode,
//           @emp_joined_date,@last_working_date,
//           @annual_ctc,@monthly_ctc,
//           @reporting_to,@reporting_to_designation,
//           @reporting_to_email,@reporting_to_contact,
//           @gross_income,@gross_tds,@gross_pt,@total_pt,
//           @bank_name,@account_no,@bank_address,
//           @bank_city,@bank_state,@bank_ifsc,@bank_micr,
//           @cancelled_cheque_image,
//           @separation_type,@separate_reason,
//           @date_of_separation,@notice_period,
//           @last_working_date_sp,@handover_given_to,
//           @created_by,DATEADD(MINUTE, 330, GETUTCDATE())
//         )
//       `);
//   }
// };


const addTempEmployee = async (rows) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    if (!rows || rows.length === 0) {
      return {
        success: true,
        insertedCount: 0,
      };
    }

    // Logged-in user ID
    const createdBy = Number(rows[0]?.created_by);

    if (!Number.isSafeInteger(createdBy) || createdBy <= 0) {
      throw new Error("Valid created_by user ID is required");
    }

    await transaction.begin();

    // 1. Delete old records for same created_by
    //    Also delete records where created_by IS NULL
    await new sql.Request(transaction)
      .input("created_by", sql.BigInt, createdBy)
      .query(`
        DELETE FROM temp_employee
        WHERE created_by = @created_by
           OR created_by IS NULL
      `);

    // 2. Insert new Excel records
    for (const row of rows) {
      await new sql.Request(transaction)
        .input("employee_code", sql.NVarChar, String(row?.employee_code || ""))
        .input("first_name", sql.NVarChar, row?.first_name || "")
        .input("middle_name", sql.NVarChar, row?.middle_name || "")
        .input("last_name", sql.NVarChar, row?.last_name || "")
        .input("dob", sql.NVarChar, String(row?.dob || ""))
        .input("gender", sql.NVarChar, row?.gender || "")
        .input("date_of_joining", sql.NVarChar, String(row?.date_of_joining || ""))
        .input("rank", sql.NVarChar, row?.rank || "")
        .input("phone1", sql.NVarChar, String(row?.phone1 || ""))
        .input("email_id", sql.NVarChar, row?.email_id || "")
        .input("pancard_no", sql.NVarChar, row?.pancard_no || "")
        .input("aadhar_no", sql.NVarChar, String(row?.aadhar_no || ""))
        .input("esis_no", sql.NVarChar, row?.esis_no || "")
        .input("uan_no", sql.NVarChar, row?.uan_no || "")
        .input("basic_salary", sql.NVarChar, String(row?.basic_salary ?? ""))
        .input("account_no", sql.NVarChar, String(row?.account_no || ""))
        .input("bank_ifsc", sql.NVarChar, row?.bank_ifsc || "")
        .input("father_name", sql.NVarChar, row?.father_name || "")
        .input("esis_date", sql.NVarChar, String(row?.esis_date || ""))
        .input("uan_date", sql.NVarChar, String(row?.uan_date || ""))
        .input("address", sql.NVarChar, row?.address || "")
        .input("city", sql.NVarChar, row?.city || "")
        .input("state", sql.NVarChar, row?.state || "")
        .input("pincode", sql.NVarChar, String(row?.pincode || ""))
        .input("country", sql.NVarChar, row?.country || "")
        .input("company_id", sql.Int, Number(row.company_id))
        .input("branch_id", sql.Int, Number(row.branch_id))
        .input("created_by", sql.BigInt, createdBy)
        .query(`
          INSERT INTO temp_employee (
            employee_code,
            first_name,
            middle_name,
            last_name,
            dob,
            gender,
            date_of_joining,
            rank,
            phone1,
            email_id,
            pancard_no,
            aadhar_no,
            esis_no,
            uan_no,
            basic_salary,
            account_no,
            bank_ifsc,
            father_name,
            esis_date,
            uan_date,
            address,
            city,
            state,
            pincode,
            country,
            company_id,
            branch_id,
            created_by,
            created_on
          )
          VALUES (
            @employee_code,
            @first_name,
            @middle_name,
            @last_name,
            @dob,
            @gender,
            @date_of_joining,
            @rank,
            @phone1,
            @email_id,
            @pancard_no,
            @aadhar_no,
            @esis_no,
            @uan_no,
            @basic_salary,
            @account_no,
            @bank_ifsc,
            @father_name,
            @esis_date,
            @uan_date,
            @address,
            @city,
            @state,
            @pincode,
            @country,
            @company_id,
            @branch_id,
            @created_by,
            DATEADD(MINUTE, 330, GETUTCDATE())
          )
        `);
    }

    await transaction.commit();

    return {
      success: true,
      insertedCount: rows.length,
      created_by: createdBy,
    };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error("ROLLBACK ERROR:", rollbackError.message);
    }

    console.error("addTempEmployee Error:", error);
    throw error;
  }
};

const getEmployeeToDownload = async ({ role, companyId }) => {
  try {
    const pool = await poolPromise;
    const request = pool.request();

    let query = `
      SELECT
        employee_code,
        first_name,
        middle_name,
        last_name,
        dob,
        gender,
        date_of_joining,
        rank,
        phone1,
        email_id,
        pancard_no,
        aadhar_no,
        esis_no,
        uan_no,
        basic_salary,
        account_no,
        bank_ifsc,
        father_name,
        esis_date,
        uan_date,
        address,
        city,
        state,
        pincode,
        country
      FROM employee
      WHERE emp_stages = 'OFFER LETTER ISSUED'
    `;

    if (role === "admin") {
      request.input("companyId", companyId);

      query += ` AND company_id = @companyId`;
    } else if (role !== "superadmin") {
      throw new Error("Invalid role");
    }

    query += ` ORDER BY id DESC`;

    const result = await request.query(query);

    return result.recordset;
  } catch (error) {
    console.error("getEmployeeToDownload Error:", error);
    throw error;
  }
};
const addEmpCodeInAllEmpTables = async (empId, employeeCode) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      // Use parameters with .input()
      .input("empCode", employeeCode)
      .input("id", empId).query(`
        UPDATE emp_docs 
        SET emp_code = @empCode
        WHERE id = @id
      `);

    // Return the number of rows affected to verify the update
    return result.rowsAffected[0];
  } catch (error) {
    console.error("Database Error:", error);
    throw error; // Rethrow to handle it in the calling function
  }
};

const getTempEmployeeData = async (companyIds, branchIds) => {
  const pool = await poolPromise;

  const companyIdList = String(companyIds ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const branchIdList = String(branchIds ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (!companyIdList.length || !branchIdList.length) {
    return [];
  }

  const result = await pool
    .request()
    .input("company_ids", sql.NVarChar(sql.MAX), companyIdList.join(","))
    .input("branch_ids", sql.NVarChar(sql.MAX), branchIdList.join(","))
    .query(`
      SELECT te.*
      FROM dbo.temp_employee AS te
      WHERE
        EXISTS (
          SELECT 1
          FROM STRING_SPLIT(
            CAST(te.company_id AS NVARCHAR(MAX)), ','
          ) AS tc
          INNER JOIN STRING_SPLIT(@company_ids, ',') AS uc
            ON TRY_CONVERT(BIGINT, LTRIM(RTRIM(tc.value))) =
               TRY_CONVERT(BIGINT, LTRIM(RTRIM(uc.value)))
        )
        AND EXISTS (
          SELECT 1
          FROM STRING_SPLIT(
            CAST(te.branch_id AS NVARCHAR(MAX)), ','
          ) AS tb
          INNER JOIN STRING_SPLIT(@branch_ids, ',') AS ub
            ON TRY_CONVERT(BIGINT, LTRIM(RTRIM(tb.value))) =
               TRY_CONVERT(BIGINT, LTRIM(RTRIM(ub.value)))
        )
      ORDER BY te.id ASC;
    `);

  return result.recordset;
};

// const verifyEmployeeData = async (employee) => {
//   const pool = await poolPromise;
//   const transaction = new sql.Transaction(pool);
//   // console.log(employee);
//   try {
//     let errors = [];

//     // Employee Code Exists

//     const empExists = await pool
//       .request()
//       .input("employee_code", sql.NVarChar, employee.employee_code).query(`
//             SELECT id
//             FROM employee
//             WHERE employee_code=@employee_code
//         `);

//     if (empExists.recordset.length > 0) {
//       errors.push("Employee code already exists");
//     }

//     // Client Code Validation

//     const clientExists = await pool
//       .request()
//       .input("client_code", sql.NVarChar, employee.client_code).query(`
//             SELECT id
//             FROM client_rates
//             WHERE client_code=@client_code
//         `);

//     if (clientExists.recordset.length === 0) {
//       errors.push("Client code did not match");
//     }

//     // Required Fields

//     if (!employee.first_name) errors.push("First Name is Required");

//     if (!employee.last_name) errors.push("Last Name is Required");

//     if (!employee.rank) errors.push("Employee Designation is Required");

//     // Validation Failed

//     if (errors.length > 0) {
//       await pool
//         .request()
//         .input("id", sql.BigInt, employee.id)
//         .input("error", sql.NVarChar(sql.MAX), errors.join(". ")).query(`
//                     UPDATE temp_employee
//                     SET error=@error
//                     WHERE id=@id
//                 `);

//       return {
//         success: false,
//         error: errors.join(". "),
//       };
//     }

//     await transaction.begin();

//     const request = new sql.Request(transaction);

//     // INSERT EMPLOYEE

//     const employeeInsert = await request
//       .input("employee_code", sql.NVarChar, employee.employee_code)
//       .input("initial", sql.NVarChar, employee.initial)
//       .input("first_name", sql.NVarChar, employee.first_name)
//       .input("middle_name", sql.NVarChar, employee.middle_name)
//       .input("last_name", sql.NVarChar, employee.last_name)
//       .input("gender", sql.NVarChar, employee.gender)
//       .input("dob", sql.NVarChar, employee.dob)
//       .input("date_of_joining", sql.NVarChar, employee.date_of_joining)
//       .input("address", sql.NVarChar, employee.address)
//       .input("city", sql.NVarChar, employee.city)
//       .input("state", sql.NVarChar, employee.state)
//       .input("pincode", sql.NVarChar, employee.pincode)
//       .input("country", sql.NVarChar, employee.country)
//       .input("phone1", sql.NVarChar, employee.phone1)
//       .input("phone2", sql.NVarChar, employee.phone2)
//       .input("email_id", sql.NVarChar, employee.email_id)
//       .input("contact_person", sql.NVarChar, employee.contact_person)
//       .input("contact_mobile", sql.NVarChar, employee.contact_mobile)
//       .input("p_address", sql.NVarChar, employee.p_address)
//       .input("p_city", sql.NVarChar, employee.p_city)
//       .input("p_state", sql.NVarChar, employee.p_state)
//       .input("p_pincode", sql.NVarChar, employee.p_pincode)
//       .input("p_country", sql.NVarChar, employee.p_country)
//       .input("p_phone1", sql.NVarChar, employee.p_phone1)
//       .input("p_phone2", sql.NVarChar, employee.p_phone2)
//       .input("contact_relation", sql.NVarChar, employee.contact_relation)
//       .input("contact_email", sql.NVarChar, employee.contact_email)
//       .input("marital_status", sql.NVarChar, employee.marital_status)
//       .input("mrg_date", sql.NVarChar, employee.mrg_date)
//       .input("cast", sql.NVarChar, employee.cast)
//       .input("category", sql.NVarChar, employee.category)
//       .input("native_place", sql.NVarChar, employee.native_place)
//       .input("blood_group", sql.NVarChar, employee.blood_group)
//       .input("driving_license", sql.NVarChar, employee.driving_license)
//       .input("pancard_no", sql.NVarChar, employee.pancard_no)
//       .input("aadhar_no", sql.NVarChar, employee.aadhar_no)
//       .input("passport_no", sql.NVarChar, employee.passport_no)
//       .input("passport_valid_date", sql.NVarChar, employee.passport_valid_date)
//       .input("pf_no", sql.NVarChar, employee.pf_no)
//       .input("esis_no", sql.NVarChar, employee.esis_no)
//       .input("uan_no", sql.NVarChar, employee.uan_no)
//       .input("lang1", sql.NVarChar, employee.lang1)
//       .input("lang2", sql.NVarChar, employee.lang2)
//       .input("lang3", sql.NVarChar, employee.lang3)
//       .input("lang4", sql.NVarChar, employee.lang4)
//       .input("lang5", sql.NVarChar, employee.lang5)
//       .input("hobby1", sql.NVarChar, employee.hobby1)
//       .input("hobby2", sql.NVarChar, employee.hobby2)
//       .input("hobby3", sql.NVarChar, employee.hobby3)
//       .input("hobby4", sql.NVarChar, employee.hobby4)
//       .input("bank_name", sql.NVarChar, employee.bank_name)
//       .input("account_no", sql.NVarChar, employee.account_no)
//       .input("bank_address", sql.NVarChar, employee.bank_address)
//       .input("bank_city", sql.NVarChar, employee.bank_city)
//       .input("bank_state", sql.NVarChar, employee.bank_state)
//       .input("bank_ifsc", sql.NVarChar, employee.bank_ifsc)
//       .input("bank_micr", sql.NVarChar, employee.bank_micr)
//       .input(
//         "cancelled_cheque_image",
//         sql.NVarChar,
//         employee.cancelled_cheque_image,
//       )
//       .input("rank", sql.NVarChar, employee.rank)
//       .input("department", sql.NVarChar, employee.department)
//       .input("client_id", sql.BigInt, employee.client_id)
//       .input("site_id", sql.BigInt, employee.site_id)
//       .input("reporting_manager", sql.NVarChar, employee.reporting_manager)
//       .input("reporting_user", sql.NVarChar, employee.reporting_user)
//       .input("separation_type", sql.NVarChar, employee.separation_type)
//       .input("separate_reason", sql.NVarChar, employee.separate_reason)
//       .input("date_of_separation", sql.NVarChar, employee.date_of_separation)
//       .input("notice_period", sql.NVarChar, employee.notice_period)
//       .input(
//         "last_working_date_sp",
//         sql.NVarChar,
//         employee.last_working_date_sp,
//       )
//       .input("handover_given_to", sql.NVarChar, employee.handover_given_to)
//       .input("sal_from_date", sql.NVarChar, employee.sal_from_date)
//       .input("sal_to_date", sql.NVarChar, employee.sal_to_date)
//       .input("gang_name", sql.NVarChar, employee.gang_name)
//       .input("created_by", sql.BigInt, employee.created_by)
//       .input("created_on", sql.DateTime, new Date()).query(`
//         INSERT INTO employee
//         (
//             employee_code,
//             initial,
//             first_name,
//             middle_name,
//             last_name,
//             gender,
//             dob,
//             date_of_joining,
//             address,
//             city,
//             state,
//             pincode,
//             country,
//             phone1,
//             phone2,
//             email_id,
//             contact_person,
//             contact_mobile,
//             p_address,
//             p_city,
//             p_state,
//             p_pincode,
//             p_country,
//             p_phone1,
//             p_phone2,
//             contact_relation,
//             contact_email,
//             marital_status,
//             mrg_date,
//             cast,
//             category,
//             native_place,
//             blood_group,
//             driving_license,
//             pancard_no,
//             aadhar_no,
//             passport_no,
//             passport_valid_date,
//             pf_no,
//             esis_no,
//             uan_no,
//             lang1,
//             lang2,
//             lang3,
//             lang4,
//             lang5,
//             hobby1,
//             hobby2,
//             hobby3,
//             hobby4,
//             bank_name,
//             account_no,
//             bank_address,
//             bank_city,
//             bank_state,
//             bank_ifsc,
//             bank_micr,
//             cancelled_cheque_image,
//             rank,
//             department,
//             client_id,
//             site_id,
//             reporting_manager,
//             reporting_user,
//             separation_type,
//             separate_reason,
//             date_of_separation,
//             notice_period,
//             last_working_date_sp,
//             handover_given_to,
//             sal_from_date,
//             sal_to_date,
//             gang_name,
//             created_by,
//             created_on
//         )
//         OUTPUT INSERTED.id
//         VALUES
//         (
//             @employee_code,
//             @initial,
//             @first_name,
//             @middle_name,
//             @last_name,
//             @gender,
//             @dob,
//             @date_of_joining,
//             @address,
//             @city,
//             @state,
//             @pincode,
//             @country,
//             @phone1,
//             @phone2,
//             @email_id,
//             @contact_person,
//             @contact_mobile,
//             @p_address,
//             @p_city,
//             @p_state,
//             @p_pincode,
//             @p_country,
//             @p_phone1,
//             @p_phone2,
//             @contact_relation,
//             @contact_email,
//             @marital_status,
//             @mrg_date,
//             @cast,
//             @category,
//             @native_place,
//             @blood_group,
//             @driving_license,
//             @pancard_no,
//             @aadhar_no,
//             @passport_no,
//             @passport_valid_date,
//             @pf_no,
//             @esis_no,
//             @uan_no,
//             @lang1,
//             @lang2,
//             @lang3,
//             @lang4,
//             @lang5,
//             @hobby1,
//             @hobby2,
//             @hobby3,
//             @hobby4,
//             @bank_name,
//             @account_no,
//             @bank_address,
//             @bank_city,
//             @bank_state,
//             @bank_ifsc,
//             @bank_micr,
//             @cancelled_cheque_image,
//             @rank,
//             @department,
//             @client_id,
//             @site_id,
//             @reporting_manager,
//             @reporting_user,
//             @separation_type,
//             @separate_reason,
//             @date_of_separation,
//             @notice_period,
//             @last_working_date_sp,
//             @handover_given_to,
//             @sal_from_date,
//             @sal_to_date,
//             @gang_name,
//             @created_by,
//             @created_on
//         )
//     `);

//     const empId = employeeInsert.recordset[0].id;

//     // EMP DOC

//     await new sql.Request(transaction)
//       .input("emp_id", sql.BigInt, empId)
//       .input("doc_type", sql.NVarChar, employee.doc_type)
//       .input("passing_year", sql.NVarChar, employee.passing_year)
//       .input("doc_name", sql.NVarChar, employee.doc_name)
//       .input("doc_status", sql.NVarChar, employee.doc_status)
//       .input("doc_remark", sql.NVarChar, employee.doc_remark).query(`
//                 INSERT INTO emp_doc
//                 (
//                     emp_id,
//                     doc_type,
//                     passing_year,
//                     doc_name,
//                     doc_status,
//                     doc_remark
//                 )
//                 VALUES
//                 (
//                     @emp_id,
//                     @doc_type,
//                     @passing_year,
//                     @doc_name,
//                     @doc_status,
//                     @doc_remark
//                 )
//             `);

//     // EMP NOMINEE

//     await new sql.Request(transaction)
//       .input("emp_id", sql.BigInt, empId)
//       .input("f_relative_name", sql.NVarChar, employee.f_relative_name)
//       .input("f_relation", sql.NVarChar, employee.f_relation).query(`
//                 INSERT INTO emp_nominee
//                 (
//                     emp_id,
//                     f_relative_name,
//                     f_relation
//                 )
//                 VALUES
//                 (
//                     @emp_id,
//                     @f_relative_name,
//                     @f_relation
//                 )
//             `);

//     // EMP EXPERIENCE

//     await new sql.Request(transaction)
//       .input("emp_id", sql.BigInt, empId)
//       .input("emp_company_name", sql.NVarChar, employee.emp_company_name)
//       .input("emp_designation", sql.NVarChar, employee.emp_designation).query(`
//                 INSERT INTO emp_experience
//                 (
//                     emp_id,
//                     emp_company_name,
//                     emp_designation
//                 )
//                 VALUES
//                 (
//                     @emp_id,
//                     @emp_company_name,
//                     @emp_designation
//                 )
//             `);

//     // DELETE TEMP RECORD

//     await new sql.Request(transaction).input("id", sql.BigInt, employee.id)
//       .query(`
//                 DELETE FROM temp_employee
//                 WHERE id=@id
//             `);

//     await transaction.commit();

//     return {
//       success: true,
//     };
//   } catch (error) {
//     if (transaction._aborted === false) {
//       await transaction.rollback();
//     }

//     console.error("VERIFY EMPLOYEE:", error);

//     return {
//       success: false,
//       error: error.message,
//     };
//   }
// };

// ======================================================
// VERIFY EMPLOYEE DATA
// ======================================================

const verifyEmployeeData = async (employee) => {
  const pool = await poolPromise;

  console.log("\n======================================");
  console.log("EMPLOYEE VERIFICATION START");
  console.log("TEMP ID       :", employee.id);
  console.log("EMPLOYEE CODE :", employee.employee_code);
  console.log("CLIENT CODE   :", employee.client_code);
  console.log("FIRST NAME    :", employee.first_name);
  console.log("LAST NAME     :", employee.last_name);
  console.log("RANK          :", employee.rank);
  console.log("======================================");

  // ==================================================
// FULL NAME
// ==================================================

const emp_full_name =
  `${employee.first_name || ""} ${employee.middle_name || ""} ${employee.last_name || ""}`
    .replace(/\s+/g, " ")
    .trim();


    console.log(emp_full_name,"emp full name ----------------------------------------------------------------------------------------------------------------------")

  const transaction = new sql.Transaction(pool);

  try {
    let errors = [];

    // ==================================================
    // EMPLOYEE CODE EXISTS
    // ==================================================

    const empExists = await pool
      .request()
      .input("employee_code", sql.NVarChar, employee.employee_code).query(`
          SELECT id
          FROM employee
          WHERE employee_code=@employee_code
        `);

    if (empExists.recordset.length > 0) {
      errors.push("Employee code already exists");
    }

    // ==================================================
    // CLIENT CODE VALIDATION
    // ==================================================

    const clientExists = await pool
      .request()
      .input("client_code", sql.NVarChar, employee.client_code).query(`
          SELECT id
          FROM client_rates
          WHERE client_code=@client_code
        `);

    if (clientExists.recordset.length === 0) {
      errors.push("Client code did not match");
    }

    // ==================================================
    // REQUIRED FIELDS
    // ==================================================

    if (!employee.first_name) {
      errors.push("First Name is Required");
    }

    if (!employee.last_name) {
      errors.push("Last Name is Required");
    }

    if (!employee.rank) {
      errors.push("Employee Designation is Required");
    }

    // ==================================================
    // IF ERROR UPDATE TEMP TABLE
    // ==================================================

    // if (errors.length > 0) {
    //   await pool
    //     .request()
    //     .input("id", sql.BigInt, employee.id)
    //     .input("error", sql.NVarChar(sql.MAX), errors.join(", ")).query(`
    //       UPDATE temp_employee
    //       SET
    //         error=@error,
    //         em_status='FAILED'
    //       WHERE id=@id
    //     `);

    //   return {
    //     success: false,
    //     error: errors.join(", "),
    //   };
    // }
    if (errors.length > 0) {

  const errorMessage = errors.join(", ");

  console.log("\n======================================");
  console.log("EMPLOYEE VALIDATION FAILED");
  console.log("TEMP ID       :", employee.id);
  console.log("EMPLOYEE CODE :", employee.employee_code);
  console.log("CLIENT CODE   :", employee.client_code);
  console.log("ERROR         :", errorMessage);
  console.log("ERROR LENGTH  :", errorMessage.length);
  console.log("======================================");

  try {

    const updateResult = await pool
      .request()
      .input("id", sql.BigInt, employee.id)
      .input("error", sql.NVarChar(sql.MAX), errorMessage)
      .query(`
        UPDATE temp_employee
        SET
          error = @error,
          em_status = 'FAILED'
        WHERE id = @id
      `);

    console.log(
      "TEMP EMPLOYEE ERROR SAVED:",
      updateResult.rowsAffected
    );

  } catch (saveError) {

    console.error("\n======================================");
    console.error("FAILED TO SAVE ERROR IN TEMP_EMPLOYEE");
    console.error("TEMP ID :", employee.id);
    console.error("ERROR   :", saveError);
    console.error("MESSAGE :", saveError.message);
    console.error("STACK   :", saveError.stack);
    console.error("======================================");

  }

  return {
    success: false,
    error: errorMessage,
  };
}

    // ==================================================
    // START TRANSACTION
    // ==================================================

    await transaction.begin();

    const request = new sql.Request(transaction);

    // ==================================================
    // INSERT EMPLOYEE
    // ==================================================

    const empResult = await request
      .input("employee_code", sql.NVarChar, employee.employee_code)
      .input("client_code", sql.NVarChar, employee.client_code)
      .input("initial", sql.NVarChar, employee.initial)
      .input("first_name", sql.NVarChar, employee.first_name)
      .input("middle_name", sql.NVarChar, employee.middle_name)
      .input("last_name", sql.NVarChar, employee.last_name)
      .input("emp_full_name", sql.NVarChar, emp_full_name)
      .input("gender", sql.NVarChar, employee.gender)
      .input("dob", sql.NVarChar, employee.dob)
      .input("date_of_joining", sql.NVarChar, employee.date_of_joining)

      .input("address", sql.NVarChar, employee.address)
      .input("city", sql.NVarChar, employee.city)
      .input("state", sql.NVarChar, employee.state)
      .input("pincode", sql.NVarChar, employee.pincode)
      .input("country", sql.NVarChar, employee.country)

      .input("phone1", sql.NVarChar, employee.phone1)
      .input("phone2", sql.NVarChar, employee.phone2)
      .input("email_id", sql.NVarChar, employee.email_id)

      .input("contact_person", sql.NVarChar, employee.contact_person)
      .input("contact_mobile", sql.NVarChar, employee.contact_mobile)
      .input("contact_relation", sql.NVarChar, employee.contact_relation)
      .input("contact_email", sql.NVarChar, employee.contact_email)

      .input("p_address", sql.NVarChar, employee.p_address)
      .input("p_city", sql.NVarChar, employee.p_city)
      .input("p_state", sql.NVarChar, employee.p_state)
      .input("p_pincode", sql.NVarChar, employee.p_pincode)
      .input("p_country", sql.NVarChar, employee.p_country)
      .input("p_phone1", sql.NVarChar, employee.p_phone1)
      .input("p_phone2", sql.NVarChar, employee.p_phone2)

      .input("marital_status", sql.NVarChar, employee.marital_status)
      .input("mrg_date", sql.NVarChar, employee.mrg_date)
      .input("cast", sql.NVarChar, employee.cast)
      .input("category", sql.NVarChar, employee.category)
      .input("native_place", sql.NVarChar, employee.native_place)
      .input("blood_group", sql.NVarChar, employee.blood_group)

      .input("driving_license", sql.NVarChar, employee.driving_license)
      .input("pancard_no", sql.NVarChar, employee.pancard_no)
      .input("aadhar_no", sql.NVarChar, employee.aadhar_no)
      .input("passport_no", sql.NVarChar, employee.passport_no)
      .input("uan_no", sql.NVarChar, employee.uan_no)
      .input("passport_valid_date", sql.NVarChar, employee.passport_valid_date)

      .input("lang1", sql.NVarChar, employee.lang1)
      .input("lang2", sql.NVarChar, employee.lang2)
      .input("lang3", sql.NVarChar, employee.lang3)
      .input("lang4", sql.NVarChar, employee.lang4)
      .input("lang5", sql.NVarChar, employee.lang5)

      .input("hobby1", sql.NVarChar, employee.hobby1)
      .input("hobby2", sql.NVarChar, employee.hobby2)
      .input("hobby3", sql.NVarChar, employee.hobby3)
      .input("hobby4", sql.NVarChar, employee.hobby4)

      .input("bank_name", sql.NVarChar, employee.bank_name)
      .input("account_no", sql.NVarChar, employee.account_no)
      .input("bank_address", sql.NVarChar, employee.bank_address)
      .input("bank_city", sql.NVarChar, employee.bank_city)
      .input("bank_state", sql.NVarChar, employee.bank_state)
      .input("bank_ifsc", sql.NVarChar, employee.bank_ifsc)
      .input("bank_micr", sql.NVarChar, employee.bank_micr)

      .input(
        "cancelled_cheque_image",
        sql.NVarChar,
        employee.cancelled_cheque_image,
      )

      .input("active", sql.Int, employee.active || 1)
      .input("emp_stages", sql.NVarChar, "PENDING")
   .input("branch_id", sql.NVarChar(sql.MAX), String(employee.branch_id ?? ""))
.input("company_id", sql.NVarChar(sql.MAX), String(employee.company_id ?? ""))

      .input("rank", sql.NVarChar, employee.rank)
      .input("department", sql.NVarChar, employee.department)
      .input("client_id", sql.BigInt, employee.client_id)
      .input("site_id", sql.BigInt, employee.site_id)

      .input("reporting_manager", sql.NVarChar, employee.reporting_manager)
      .input("reporting_user", sql.NVarChar, employee.reporting_user)

      .input("separation_type", sql.NVarChar, employee.separation_type)
      .input("separate_reason", sql.NVarChar, employee.separate_reason)
      .input("date_of_separation", sql.NVarChar, employee.date_of_separation)

      .input("notice_period", sql.NVarChar, employee.notice_period)
      .input(
        "last_working_date_sp",
        sql.NVarChar,
        employee.last_working_date_sp,
      )
      .input("handover_given_to", sql.NVarChar, employee.handover_given_to)

      .input("gross_salary", sql.Decimal(18, 2), employee.gross_income || 0)
      .input("monthly_ctc", sql.Decimal(18, 2), employee.monthly_ctc || 0)
      .input("annual_ctc", sql.Decimal(18, 2), employee.annual_ctc || 0)

      .input("created_by", sql.BigInt, employee.created_by)
      .input("created_on", sql.DateTime, new Date()).query(`
INSERT INTO employee
(
  employee_code, client_code, initial,
  first_name, middle_name, last_name,emp_full_name,
  gender, dob, date_of_joining,

  address, city, state, pincode, country,
  phone1, phone2, email_id,

  contact_person, contact_mobile, contact_relation, contact_email,

  p_address, p_city, p_state, p_pincode, p_country,
  p_phone1, p_phone2,

  marital_status, mrg_date, cast, category,
  native_place, blood_group,

  driving_license, pancard_no, aadhar_no,
  passport_no, uan_no, passport_valid_date,

  lang1, lang2, lang3, lang4, lang5,
  hobby1, hobby2, hobby3, hobby4,

  bank_name, account_no, bank_address,
  bank_city, bank_state, bank_ifsc, bank_micr,
  cancelled_cheque_image,

  active,  emp_stages,branch_id, company_id,

  rank, department, client_id, site_id,

  reporting_manager, reporting_user,

  separation_type, separate_reason,
  date_of_separation,

  notice_period, last_working_date_sp, handover_given_to,



  created_by, created_on
)
VALUES
(
  @employee_code, @client_code, @initial,
  @first_name, @middle_name, @last_name,@emp_full_name,
  @gender, @dob, @date_of_joining,

  @address, @city, @state, @pincode, @country,
  @phone1, @phone2, @email_id,

  @contact_person, @contact_mobile, @contact_relation, @contact_email,

  @p_address, @p_city, @p_state, @p_pincode, @p_country,
  @p_phone1, @p_phone2,

  @marital_status, @mrg_date, @cast, @category,
  @native_place, @blood_group,

  @driving_license, @pancard_no, @aadhar_no,
  @passport_no, @uan_no, @passport_valid_date,

  @lang1, @lang2, @lang3, @lang4, @lang5,
  @hobby1, @hobby2, @hobby3, @hobby4,

  @bank_name, @account_no, @bank_address,
  @bank_city, @bank_state, @bank_ifsc, @bank_micr,
  @cancelled_cheque_image,

  @active,@emp_stages, @branch_id, @company_id,

  @rank, @department, @client_id, @site_id,

  @reporting_manager, @reporting_user,

  @separation_type, @separate_reason,
  @date_of_separation,

  @notice_period, @last_working_date_sp, @handover_given_to,



  @created_by, @created_on
);

SELECT SCOPE_IDENTITY() AS id;
`);
    const empId = empResult.recordset[0].id;

    // ==================================================
    // INSERT EMP DOC
    // ==================================================
    await new sql.Request(transaction)
      .input("emp_id", sql.BigInt, empId)

      .input("f_initial", sql.NVarChar, employee.f_initial)
      .input("f_relative_name", sql.NVarChar, employee.f_relative_name)
      .input("f_gender", sql.NVarChar, employee.f_gender)
      .input("f_relation", sql.NVarChar, employee.f_relation)
      .input("f_dob", sql.NVarChar, employee.f_dob)
      .input("f_age", sql.NVarChar, employee.f_age)
      .input("f_minor", sql.NVarChar, employee.f_minor)
      .input("f_guardian", sql.NVarChar, employee.f_guardian)
      .input("f_address", sql.NVarChar, employee.f_address)
      .input("f_contact", sql.NVarChar, employee.f_contact)
      .input("f_email", sql.NVarChar, employee.f_email)
      .input("f_sharepf", sql.NVarChar, employee.f_sharepf)
      .input("f_shareesic", sql.NVarChar, employee.f_shareesic)
      .input("source", sql.NVarChar, employee.source)
      .input("created_by", sql.BigInt, employee.created_by)
      .input("created_on", sql.DateTime, new Date()).query(`
    INSERT INTO emp_nominee
    (
      emp_id,
      f_initial,
      f_relative_name,
      f_gender,
      f_relation,
      f_dob,
      f_age,
      f_minor,
      f_guardian,
      f_address,
      f_contact,
      f_email,
      f_sharepf,
      f_shareesic,
      source,
      created_by,
      created_on
    )
    VALUES
    (
      @emp_id,
      @f_initial,
      @f_relative_name,
      @f_gender,
      @f_relation,
      @f_dob,
      @f_age,
      @f_minor,
      @f_guardian,
      @f_address,
      @f_contact,
      @f_email,
      @f_sharepf,
      @f_shareesic,
      @source,
      @created_by,
      @created_on
    )
  `);
    await new sql.Request(transaction)
      .input("emp_id", sql.BigInt, empId)

      .input("emp_company_name", sql.NVarChar, employee.emp_company_name)
      .input("emp_designation", sql.NVarChar, employee.emp_designation)
      .input("emp_address", sql.NVarChar, employee.emp_address)
      .input("emp_city", sql.NVarChar, employee.emp_city)
      .input("emp_state", sql.NVarChar, employee.emp_state)
      .input("emp_country", sql.NVarChar, employee.emp_country)
      .input("emp_pincode", sql.NVarChar, employee.emp_pincode)

      .input("emp_joined_date", sql.NVarChar, employee.emp_joined_date)
      .input("last_working_date", sql.NVarChar, employee.last_working_date)

      .input("annual_ctc", sql.Decimal(18, 2), employee.annual_ctc || 0)
      .input("monthly_ctc", sql.Decimal(18, 2), employee.monthly_ctc || 0)

      .input("reporting_to", sql.NVarChar, employee.reporting_to)
      .input(
        "reporting_to_designation",
        sql.NVarChar,
        employee.reporting_to_designation,
      )
      .input("reporting_to_email", sql.NVarChar, employee.reporting_to_email)
      .input(
        "reporting_to_contact",
        sql.NVarChar,
        employee.reporting_to_contact,
      )

      .input("gross_income", sql.Decimal(18, 2), employee.gross_income || 0)
      .input("gross_tds", sql.Decimal(18, 2), employee.gross_tds || 0)
      .input("gross_pt", sql.Decimal(18, 2), employee.gross_pt || 0)
      .input("total_pt", sql.Decimal(18, 2), employee.total_pt || 0)

      .input("source", sql.NVarChar, employee.source)
      .input("created_by", sql.BigInt, employee.created_by)
      .input("created_on", sql.DateTime, new Date()).query(`
    INSERT INTO emp_experience
    (
      emp_id,
      emp_company_name,
      emp_designation,
      emp_address,
      emp_city,
      emp_state,
      emp_country,
      emp_pincode,

      emp_joined_date,
      last_working_date,

      annual_ctc,
      monthly_ctc,

      reporting_to,
      reporting_to_designation,
      reporting_to_email,
      reporting_to_contact,

      gross_income,
      gross_tds,
      gross_pt,
      total_pt,

      source,
      created_by,
      created_on
    )
    VALUES
    (
      @emp_id,
      @emp_company_name,
      @emp_designation,
      @emp_address,
      @emp_city,
      @emp_state,
      @emp_country,
      @emp_pincode,

      @emp_joined_date,
      @last_working_date,

      @annual_ctc,
      @monthly_ctc,

      @reporting_to,
      @reporting_to_designation,
      @reporting_to_email,
      @reporting_to_contact,

      @gross_income,
      @gross_tds,
      @gross_pt,
      @total_pt,

      @source,
      @created_by,
      @created_on
    )
  `);
    await new sql.Request(transaction)

      .input("emp_id", sql.BigInt, empId)

      .input("doc_type", sql.NVarChar, employee.doc_type)

      .input("doc_name", sql.NVarChar, employee.doc_name)

      .input("doc_status", sql.NVarChar, employee.doc_status)

      .input("doc_remark", sql.NVarChar, employee.doc_remark).query(`
        INSERT INTO emp_docs
        (
          emp_id,
          doc_type,
         
          doc_name,
          doc_status,
          doc_remark
        )

        VALUES
        (
          @emp_id,
          @doc_type,
     
          @doc_name,
          @doc_status,
          @doc_remark
        )
      `);

    // ==================================================
    // UPDATE TEMP TABLE SUCCESS
    // ==================================================
    await new sql.Request(transaction)
      .input("emp_id", sql.BigInt, empId)

      .input("employee_code", sql.NVarChar, employee.employee_code)
      .input("client_code", sql.NVarChar, employee.client_code)
      .input("initial", sql.NVarChar, employee.initial)
      .input("first_name", sql.NVarChar, employee.first_name)
      .input("middle_name", sql.NVarChar, employee.middle_name)
      .input("last_name", sql.NVarChar, employee.last_name)
      .input("gender", sql.NVarChar, employee.gender)
      .input("dob", sql.NVarChar, employee.dob)
      .input("date_of_joining", sql.NVarChar, employee.date_of_joining)

      .input("email_id", sql.NVarChar, employee.email_id)
      .input("phone1", sql.NVarChar, employee.phone1)
      .input("phone2", sql.NVarChar, employee.phone2)

      .input("address", sql.NVarChar, employee.address)
      .input("city", sql.NVarChar, employee.city)
      .input("state", sql.NVarChar, employee.state)
      .input("pincode", sql.NVarChar, employee.pincode)
      .input("country", sql.NVarChar, employee.country)

      .input("rank", sql.NVarChar, employee.rank)
      .input("department", sql.NVarChar, employee.department)
      .input("client_id", sql.BigInt, employee.client_id)
      .input("site_id", sql.BigInt, employee.site_id)

      .input("bank_name", sql.NVarChar, employee.bank_name)
      .input("account_no", sql.NVarChar, employee.account_no)
      .input("bank_ifsc", sql.NVarChar, employee.bank_ifsc)

      .input("gross_salary", sql.Decimal(18, 2), employee.gross_salary || 0)

      .input("activity_remark", sql.NVarChar, "INSERT")
      .input("created_on", sql.DateTime, new Date()).query(`
    INSERT INTO employee_log
    (
      
      employee_code,
      client_code,
      initial,
      first_name,
      middle_name,
      last_name,
      gender,
      dob,
      date_of_joining,

      email_id,
      phone1,
      phone2,

      address,
      city,
      state,
      pincode,
      country,

      rank,
      department,
      client_id,
      site_id,

      bank_name,
      account_no,
      bank_ifsc,

    

      activity_remark,
      created_on
    )
    VALUES
    (
   
      @employee_code,
      @client_code,
      @initial,
      @first_name,
      @middle_name,
      @last_name,
      @gender,
      @dob,
      @date_of_joining,

      @email_id,
      @phone1,
      @phone2,

      @address,
      @city,
      @state,
      @pincode,
      @country,

      @rank,
      @department,
      @client_id,
      @site_id,

      @bank_name,
      @account_no,
      @bank_ifsc,


      @activity_remark,
      @created_on
    )
  `);
    await new sql.Request(transaction).input("id", sql.BigInt, employee.id)
      .query(`
        UPDATE temp_employee
        SET
          em_status='SUCCESS',
          error=NULL
        WHERE id=@id
      `);

    await transaction.commit();

    return {
      success: true,
    };
  } catch (error) {
    if (transaction._aborted === false) {
      await transaction.rollback();
    }

    // ==================================================
    // SAVE ERROR IN TEMP TABLE
    // ==================================================

    await pool
      .request()
      .input("id", sql.BigInt, employee.id)
      .input("error", sql.NVarChar(sql.MAX), error.message).query(`
        UPDATE temp_employee
        SET
          error=@error,
          em_status='FAILED'
        WHERE id=@id
      `);

    console.error("VERIFY EMPLOYEE:", error);

    return {
      success: false,
      error: error.message,
    };
  }
};

const getFailedTempEmployees = async (companyIds, branchIds) => {
  const pool = await poolPromise;

  const companyIdList = String(companyIds ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id));

  const branchIdList = String(branchIds ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id));

  if (!companyIdList.length || !branchIdList.length) {
    return [];
  }

  const result = await pool
    .request()
    .input("company_ids", sql.NVarChar(sql.MAX), companyIdList.join(","))
    .input("branch_ids", sql.NVarChar(sql.MAX), branchIdList.join(","))
    .query(`
      SELECT
        te.id,
        te.employee_code,
        te.client_code,
        te.initial,
        te.first_name,
        te.middle_name,
        te.last_name,
        te.emp_full_name,
        te.gender,
        te.dob,
        te.date_of_joining,
        te.email_id,
        te.phone1,
        te.phone2,
        te.address,
        te.city,
        te.state,
        te.pincode,
        te.country,
        te.rank,
        te.department,
        te.company_id,
        te.branch_id,
        te.client_id,
        te.site_id,
        te.error,
        te.em_status
      FROM dbo.temp_employee AS te
     WHERE (
  UPPER(LTRIM(RTRIM(COALESCE(te.em_status, '')))) = 'FAILED'
  OR NULLIF(LTRIM(RTRIM(COALESCE(te.error, ''))), '') IS NOT NULL
)
        AND EXISTS (
          SELECT 1
          FROM STRING_SPLIT(
            CAST(te.company_id AS NVARCHAR(MAX)), ','
          ) AS tc
          INNER JOIN STRING_SPLIT(@company_ids, ',') AS uc
            ON TRY_CONVERT(BIGINT, LTRIM(RTRIM(tc.value))) =
               TRY_CONVERT(BIGINT, LTRIM(RTRIM(uc.value)))
        )
        AND EXISTS (
          SELECT 1
          FROM STRING_SPLIT(
            CAST(te.branch_id AS NVARCHAR(MAX)), ','
          ) AS tb
          INNER JOIN STRING_SPLIT(@branch_ids, ',') AS ub
            ON TRY_CONVERT(BIGINT, LTRIM(RTRIM(tb.value))) =
               TRY_CONVERT(BIGINT, LTRIM(RTRIM(ub.value)))
        )
      ORDER BY te.id ASC;
    `);

  return result.recordset;
};
  
// ======================================================
// DOWNLOAD ERROR CSV
// ======================================================

const downloadEmployeeErrors = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
            SELECT *
            FROM temp_employee
            WHERE
              em_status='FAILED'
              OR error IS NOT NULL
          `);

    const errorData = result.recordset;

    if (errorData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No failed records found",
      });
    }

    // ==========================================
    // CREATE EXCEL
    // ==========================================

    const worksheet = xlsx.utils.json_to_sheet(errorData);

    const workbook = xlsx.utils.book_new();

    xlsx.utils.book_append_sheet(workbook, worksheet, "Employee Errors");

    const buffer = xlsx.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    // ==========================================
    // RESPONSE
    // ==========================================

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=employee_errors.xlsx",
    );

    return res.send(buffer);
  } catch (error) {
    console.error("DOWNLOAD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// EXPORT
// ======================================================

const checkEmployeeCode = async (employeeCode, excludeId = null) => {
  const pool = await poolPromise;
  let query = `
    SELECT TOP 1 id
    FROM employee
    WHERE employee_code = @employeeCode
  `;
  const request = pool.request().input("employeeCode", sql.NVarChar, employeeCode);
  if (excludeId) {
    query += ` AND id != @excludeId`;
    request.input("excludeId", sql.Int, excludeId);
  }
  const result = await request.query(query);
  return result.recordset[0] || null;
};

const getClientRateByCode = async (clientCode) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("clientCode", sql.NVarChar, clientCode).query(`
      SELECT TOP 1
        id,
        client_id
      FROM client_rates
      WHERE client_code = @clientCode
    `);

  return result.recordset[0] || null;
};

// const bulkInsertTempEmployees = async (rows, userId) => {
//   const pool = await poolPromise;

//   const transaction = new sql.Transaction(pool);

//   try {
//     await transaction.begin();

//     await new sql.Request(transaction).input("userId", sql.NVarChar, userId)
//       .query(`
//         DELETE FROM temp_employee
//         WHERE created_by=@userId
//       `);

//     for (const row of rows) {
//       const request = new sql.Request(transaction);

//       Object.entries(row).forEach(([key, value]) => {
//         request.input(key, value);
//       });

//       await request.query(`
//         INSERT INTO temp_employee
//         (
//           employee_code,
//           client_code,
//           initial,
//           first_name,
//           middle_name,
//           last_name,
//           gender,
//           dob,
//           date_of_joining,
//           email_id,
//           rank,
//           department,
//           client_id,
//           site_id,
//           created_by,
//           created_on
//         )
//         VALUES
//         (
//           @employee_code,
//           @client_code,
//           @initial,
//           @first_name,
//           @middle_name,
//           @last_name,
//           @gender,
//           @dob,
//           @date_of_joining,
//           @email_id,
//           @rank,
//           @department,
//           @client_id,
//           @site_id,
//           @created_by,
//           @created_on
//         )
//       `);
//     }

//     await transaction.commit();

//     return true;
//   } catch (error) {
//     await transaction.rollback();
//     throw error;
//   }
// };

// ==========================================
// GET NEXT EMPLOYEE CODE
// ==========================================
// =========================================
// BULK INSERT TEMP EMPLOYEE
// =========================================
const getUserCompanyBranch = async (userId) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("userId", sql.BigInt, Number(userId))
    .query(`
      SELECT
        id,
        company_id,
        branch_id
      FROM users
      WHERE id = @userId
    `);

  if (!result.recordset.length) {
    return null;
  }

  return result.recordset[0];
};



const bulkInsertTempEmployees = async (rows, companyId, branchId) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("No employee records provided");
  }

  // Parse comma-separated IDs and remove duplicates.
  const parseIds = (value) => {
    const ids = String(value ?? "")
      .split(",")
      .map((id) => id.trim());

    if (
      ids.length === 0 ||
      ids.some(
        (id) => !/^\d+$/.test(id) ||
          !Number.isSafeInteger(Number(id)) ||
          Number(id) <= 0
      )
    ) {
      throw new Error("Invalid company_id or branch_id");
    }

    return [...new Set(ids.map(Number))];
  };

  const companyIds = parseIds(companyId);
  const branchIds = parseIds(branchId);

  const companyIdString = companyIds.join(",");
  const branchIdString = branchIds.join(",");

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // 1. Get actual temp_employee table columns.
    const schemaRequest = new sql.Request(transaction);

    const schemaResult = await schemaRequest.query(`
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_NAME = 'temp_employee'
    `);

    const dbColumns = new Set(
      schemaResult.recordset.map((item) =>
        item.COLUMN_NAME.toLowerCase()
      )
    );

    const columnTypes = new Map(
      schemaResult.recordset.map((item) => [
        item.COLUMN_NAME.toLowerCase(),
        item.DATA_TYPE.toLowerCase(),
      ])
    );

    if (dbColumns.size === 0) {
      throw new Error(
        "Could not find columns for dbo.temp_employee"
      );
    }

    // 2. Validate company_id and branch_id column types.
    for (const column of ["company_id", "branch_id"]) {
      if (!dbColumns.has(column)) {
        throw new Error(
          `Column ${column} does not exist in dbo.temp_employee`
        );
      }

      const type = columnTypes.get(column);

      if (
        !["varchar", "nvarchar", "char", "nchar"].includes(type)
      ) {
        throw new Error(
          `dbo.temp_employee.${column} must be VARCHAR/NVARCHAR ` +
          `to store comma-separated IDs. Current type: ${type}`
        );
      }
    }

    // 3. Delete existing temporary rows if any exact company ID
    // AND any exact branch ID matches the user's accessible IDs.
    const deleteRequest = new sql.Request(transaction);

    deleteRequest.input(
      "companyIds",
      sql.NVarChar(sql.MAX),
      companyIdString
    );

    deleteRequest.input(
      "branchIds",
      sql.NVarChar(sql.MAX),
      branchIdString
    );

    const deleteResult = await deleteRequest.query(`
      DELETE FROM dbo.temp_employee
      WHERE EXISTS (
        SELECT 1
        FROM STRING_SPLIT(
          COALESCE(company_id, ''),
          ','
        ) AS storedCompany
        INNER JOIN STRING_SPLIT(@companyIds, ',') AS allowedCompany
          ON TRY_CONVERT(
            BIGINT,
            LTRIM(RTRIM(storedCompany.value))
          ) = TRY_CONVERT(
            BIGINT,
            LTRIM(RTRIM(allowedCompany.value))
          )
      )
      AND EXISTS (
        SELECT 1
        FROM STRING_SPLIT(
          COALESCE(branch_id, ''),
          ','
        ) AS storedBranch
        INNER JOIN STRING_SPLIT(@branchIds, ',') AS allowedBranch
          ON TRY_CONVERT(
            BIGINT,
            LTRIM(RTRIM(storedBranch.value))
          ) = TRY_CONVERT(
            BIGINT,
            LTRIM(RTRIM(allowedBranch.value))
          )
      )
    `);

    const deletedRecords =
      deleteResult.rowsAffected?.[0] || 0;

    console.log("Deleted old temporary records:", {
      companyId: companyIdString,
      branchId: branchIdString,
      deletedRecords,
    });

    // 4. Insert employee records.
    let insertedCount = 0;
    const ignoredHeaders = new Set();

    for (let index = 0; index < rows.length; index++) {
      const originalRow = rows[index] || {};

      // Do not trust company_id or branch_id coming from Excel.
      const sourceRow = {
        ...originalRow,
        company_id: companyIdString,
        branch_id: branchIdString,
      };

      const cleanedRow = {};

      for (const [excelHeader, value] of Object.entries(sourceRow)) {
        const normalizedHeader = String(excelHeader)
          .replace(/^\uFEFF/, "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_]+/g, "_")
          .replace(/^_+|_+$/g, "");

        if (!dbColumns.has(normalizedHeader)) {
          ignoredHeaders.add(String(excelHeader));
          continue;
        }

        cleanedRow[normalizedHeader] =
          value === undefined ? null : value;
      }

      // Force the authenticated user's allowed IDs.
      cleanedRow.company_id = companyIdString;
      cleanedRow.branch_id = branchIdString;

      const columns = Object.keys(cleanedRow);

      if (columns.length === 0) {
        throw new Error(
          `No matching database columns in Excel row ${index + 2}`
        );
      }

      const request = new sql.Request(transaction);

      for (const [key, value] of Object.entries(cleanedRow)) {
        // Use explicit NVARCHAR(MAX) for comma-separated IDs.
        if (key === "company_id" || key === "branch_id") {
          request.input(
            key,
            sql.NVarChar(sql.MAX),
            String(value)
          );
        } else {
          request.input(
            key,
            value === undefined ? null : value
          );
        }
      }

      const columnNames = columns
        .map((column) => `[${column}]`)
        .join(", ");

      const parameterNames = columns
        .map((column) => `@${column}`)
        .join(", ");

      await request.query(`
        INSERT INTO dbo.temp_employee (${columnNames})
        VALUES (${parameterNames})
      `);

      insertedCount++;
    }

    // 5. Commit all changes together.
    await transaction.commit();

    console.log("Temporary employee upload successful:", {
      companyId: companyIdString,
      branchId: branchIdString,
      deletedRecords,
      insertedCount,
      ignoredHeaders: [...ignoredHeaders],
    });

    return {
      success: true,
      company_id: companyIdString,
      branch_id: branchIdString,
      deletedRecords,
      insertedRecords: insertedCount,
      ignoredHeaders: [...ignoredHeaders],
    };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "Transaction rollback failed:",
        rollbackError
      );
    }

    console.error("bulkInsertTempEmployees error:", error);
    throw error;
  }
};


// const getNextEmployeeCode = async () => {
//   const pool = await poolPromise;

//   const result = await pool.request().query(`

//     SELECT ISNULL(MAX(employee_code),0) + 1 AS nextId
//     FROM employee

//   `);

//   return result.recordset[0].nextId;
// };

const getNextEmployeeCode = async () => {
  const pool = await poolPromise;

  const result = await pool.request().query(`
    SELECT employee_code FROM employee WHERE employee_code IS NOT NULL AND employee_code != ''
  `);

  let maxNumber = 0;
  for (let row of result.recordset) {
    const code = row.employee_code || "";
    const matches = code.match(/\d+/g);
    if (matches && matches.length > 0) {
      const num = parseInt(matches[matches.length - 1], 10);
      if (num > maxNumber) {
        maxNumber = num;
      }
    }
  }

  return (maxNumber + 1).toString();
};

const safeString = (val) => {
  if (val === null || val === undefined) return null;

  if (typeof val === "object") {
    return val.value.toUpperCase() || val.label || null;
  }

  return String(val).toUpperCase();
};
// ==========================================
// CREATE EMPLOYEE
// ==========================================

const createEmployee = async (data) => {
  const pool = await poolPromise;

  const request = pool.request();

  // ==========================================
  // LOOP ALL INPUTS
  // ==========================================

  Object.keys(data).forEach((key) => {
    console.log(key, data[key]);
    if (data[key] !== undefined) {
      if (key === 'password' && data[key]) {
        request.input(key, md5(data[key]));
      } else {
        request.input(key, data[key]);
      }
    }
  });

  // ==========================================
  // INSERT QUERY
  // ==========================================

  const result = await request.query(`

    INSERT INTO employee (

      employee_code,
      initial,
      first_name,
      middle_name,
      last_name,
      emp_full_name,
      gender,
      dob,
      date_of_joining,
      reg_date,

      address,
      city,
      state,
      pincode,
      country,

      phone1,
      phone2,
      email_id,

      contact_person,
      contact_mobile,
      contact_relation,
      contact_email,

      p_address,
      p_city,
      p_state,
      p_pincode,
      p_country,
      p_phone1,
      p_phone2,

      marital_status,
      mrg_date,

      cast,
      category,
      native_place,
      blood_group,
      father_name,

      native_address,
      native_city,
      native_state,
      native_pincode,
      native_country,

      driving_license,
      pancard_no,
      aadhar_no,
      passport_no,
      uan_no,
      passport_valid_date,
      pf_no,
      esis_no,
      esis_date,
      uan_date,

      lang1,
      lang2,
      lang3,
      lang4,
      lang5,

      hobby1,
      hobby2,
      hobby3,
      hobby4,

      bank_name,
      account_no,
      bank_address,
      bank_city,
      bank_state,
      bank_ifsc,
      bank_micr,
      cancelled_cheque_image,
      ac_holder_name,
      card_no,

      branch_id,
      company_id,
      client_id,
      site_id,
      site_name,
      client_name,

      department,
      rank,
      reporting_manager,
      reporting_user,

      salary_template,
      gross_salary,
      gross_salary_type,
      basic_salary,
      basic_salary_type,
      sal_from_date,
      sal_to_date,
      pf_applicable,
      da_term,
      basic_term,
      gang_name,
      perday_salary,
      migrant_status,

      separation_type,
      separate_reason,
      date_of_separation,
      notice_period,
      last_working_date_sp,
      handover_given_to,

      password,
      employee_logo,
      user_id,
      doc_name,
      client_code,

      active,
      em_status,
      emp_stages,
      created_by,
      created_by_name,
      created_on

    )

    OUTPUT INSERTED.id, INSERTED.employee_code

    VALUES (

      @employee_code,
      @initial,
      @first_name,
      @middle_name,
      @last_name,
      @emp_full_name,
      @gender,
      @dob,
      @date_of_joining,
      @reg_date,

      @address,
      @city,
      @state,
      @pincode,
      @country,

      @phone1,
      @phone2,
      @email_id,

      @contact_person,
      @contact_mobile,
      @contact_relation,
      @contact_email,

      @p_address,
      @p_city,
      @p_state,
      @p_pincode,
      @p_country,
      @p_phone1,
      @p_phone2,

      @marital_status,
      @mrg_date,

      @cast,
      @category,
      @native_place,
      @blood_group,
      @father_name,

      @native_address,
      @native_city,
      @native_state,
      @native_pincode,
      @native_country,

      @driving_license,
      @pancard_no,
      @aadhar_no,
      @passport_no,
      @uan_no,
      @passport_valid_date,
      @pf_no,
      @esis_no,
      @esis_date,
      @uan_date,

      @lang1,
      @lang2,
      @lang3,
      @lang4,
      @lang5,

      @hobby1,
      @hobby2,
      @hobby3,
      @hobby4,

      @bank_name,
      @account_no,
      @bank_address,
      @bank_city,
      @bank_state,
      @bank_ifsc,
      @bank_micr,
      @cancelled_cheque_image,
      @ac_holder_name,
      @card_no,

      @branch_id,
      @company_id,
      @client_id,
      @site_id,
      @site_name,
      @client_name,

      @department,
      @rank,
      @reporting_manager,
      @reporting_user,

      @salary_template,
      @gross_salary,
      @gross_salary_type,
      @basic_salary,
      @basic_salary_type,
      @sal_from_date,
      @sal_to_date,
      @pf_applicable,
      @da_term,
      @basic_term,
      @gang_name,
      @perday_salary,
      @migrant_status,

      @separation_type,
      @separate_reason,
      @date_of_separation,
      @notice_period,
      @last_working_date_sp,
      @handover_given_to,

      @password,
      @employee_logo,
      @user_id,
      @doc_name,
      @client_code,

      @active,
      @em_status,
      @emp_stages,
      @created_by,
      @created_by_name,
      FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss')

    )
  `);

  return result.recordset[0];
};

// ==========================================
// GET ALL EMPLOYEES
// ==========================================



const getAllEmployees = async (filters = {}) => {
  const pool = await poolPromise;
  const request = pool.request();

  // ==========================================
  // USER ACCESS INFORMATION
  // ==========================================

  const userRole = String(filters.userRole || "")
    .trim()
    .toLowerCase();

  const userCompanyId =
    filters.userCompanyId != null
      ? String(filters.userCompanyId).trim()
      : "";

  const userEmployeeId =
    filters.userEmployeeId != null
      ? String(filters.userEmployeeId).trim()
      : "";

  const isSuperAdmin = [
    "superadmin",
    "super admin",
    "super_admin",
  ].includes(userRole);

  console.log("GET ALL EMPLOYEES FILTERS:", filters);

  // ==========================================
  // SEARCH FIELD MAP
  // ==========================================

  const fieldMap = {
    firstName: "e.first_name",
    middleName: "e.middle_name",
    lastName: "e.last_name",
    employeeCode: "e.employee_code",
    email: "e.email_id",
    emailId: "e.email_id",
    mobile: "e.phone1",
    department: "e.department",
    designation: "e.rank",
    clientName: "e.client_name",
    client_name: "e.client_name",
    clientCode: "e.client_code",
    client_code: "e.client_code",
    company: "e.client_name",
    companyName: "e.client_name",
    site: "e.site_name",
    company_id: "e.company_id",
    branch_id: "e.branch_id",
    branchName: "b.branch_name",
    panCardNo: "e.pan_card_no",
    uanNo: "e.uan_no",
    esisNo: "e.esis_no",
  };

  // ==========================================
  // BASE QUERY
  // ==========================================

  let query = `
    SELECT
      e.*,
      cr.client_code AS fetched_client_code,
      b.branch_name
    FROM employee e

    LEFT JOIN client_rates cr
      ON TRY_CONVERT(
        BIGINT,
        NULLIF(
          LTRIM(RTRIM(CONVERT(NVARCHAR(100), e.site_id))),
          ''
        )
      ) = cr.id

    LEFT JOIN branch b
      ON TRY_CONVERT(
        INT,
        NULLIF(
          LTRIM(RTRIM(CONVERT(NVARCHAR(100), e.branch_id))),
          ''
        )
      ) = b.id

    WHERE 1 = 1
  `;

  // ==========================================
  // HIDE SUPERADMIN EMPLOYEES
  // Non-superadmins cannot view superadmin rows.
  // ==========================================

  if (!isSuperAdmin) {
    query += `
      AND ISNULL(e.superadmin_status, 0) <> 1
    `;
  }

  // ==========================================
  // ROLE-BASED ACCESS CONTROL
  // ==========================================

  if (isSuperAdmin) {
    // Super Admin can view all employees.
  } else if (userRole === "admin") {
    if (!userCompanyId) {
      throw new Error(
        "Company ID not found for logged-in Admin"
      );
    }

    const parsedCompanyId = Number(userCompanyId);

    if (
      !Number.isInteger(parsedCompanyId) ||
      parsedCompanyId <= 0
    ) {
      throw new Error(
        "Invalid logged-in user's company ID"
      );
    }

    request.input(
      "userCompanyId",
      sql.Int,
      parsedCompanyId
    );

    query += `
      AND EXISTS (
        SELECT 1
        FROM STRING_SPLIT(
          ISNULL(
            CONVERT(NVARCHAR(MAX), e.company_id),
            ''
          ),
          ','
        ) AS adminCompany
        WHERE TRY_CONVERT(
          INT,
          LTRIM(RTRIM(adminCompany.value))
        ) = @userCompanyId
      )
    `;
  } else if (userRole === "employee") {
    if (!userEmployeeId) {
      throw new Error(
        "Employee ID not found for logged-in Employee"
      );
    }

    const parsedEmployeeId = Number(userEmployeeId);

    if (
      !Number.isSafeInteger(parsedEmployeeId) ||
      parsedEmployeeId <= 0
    ) {
      throw new Error(
        "Invalid logged-in user's employee ID"
      );
    }

    request.input(
      "userEmployeeId",
      sql.BigInt,
      parsedEmployeeId
    );

    query += `
      AND TRY_CONVERT(BIGINT, e.id) = @userEmployeeId
    `;
  } else {
    throw new Error(
      "Invalid or unauthorized user role"
    );
  }

  // ==========================================
  // PARSE SINGLE OR MULTIPLE IDs
  // ==========================================

  const parseIds = (value, fieldName) => {
    if (
      value == null ||
      String(value).trim() === ""
    ) {
      return [];
    }

    const rawIds = String(value)
      .split(",")
      .map((id) => id.trim());

    if (
      rawIds.some(
        (id) =>
          !/^\d+$/.test(id) ||
          !Number.isSafeInteger(Number(id)) ||
          Number(id) <= 0
      )
    ) {
      throw new Error(`Invalid ${fieldName}`);
    }

    return [...new Set(rawIds.map(Number))];
  };

  // ==========================================
  // COMPANY / BRANCH FILTER
  // OR LOGIC:
  // Company OR branch match is sufficient.
  // ==========================================

  const companyIds = parseIds(
    filters.company_id,
    "company_id"
  );

  const branchIds = parseIds(
    filters.branch_id,
    "branch_id"
  );

  const filterConditions = [];

  companyIds.forEach((id, index) => {
    const paramName = `filterCompanyId${index}`;

    request.input(paramName, sql.Int, id);

    filterConditions.push(`
      EXISTS (
        SELECT 1
        FROM STRING_SPLIT(
          ISNULL(
            CONVERT(NVARCHAR(MAX), e.company_id),
            ''
          ),
          ','
        ) AS companyFilter
        WHERE TRY_CONVERT(
          INT,
          LTRIM(RTRIM(companyFilter.value))
        ) = @${paramName}
      )
    `);
  });

  branchIds.forEach((id, index) => {
    const paramName = `filterBranchId${index}`;

    request.input(paramName, sql.Int, id);

    filterConditions.push(`
      EXISTS (
        SELECT 1
        FROM STRING_SPLIT(
          ISNULL(
            CONVERT(NVARCHAR(MAX), e.branch_id),
            ''
          ),
          ','
        ) AS branchFilter
        WHERE TRY_CONVERT(
          INT,
          LTRIM(RTRIM(branchFilter.value))
        ) = @${paramName}
      )
    `);
  });

  if (filterConditions.length > 0) {
    query += `
      AND (
        ${filterConditions.join("\n OR ")}
      )
    `;
  }

  // ==========================================
  // SEARCH FILTERS
  // ==========================================

  let searchFields = filters.searchFields || [];

  if (typeof searchFields === "string") {
    try {
      searchFields = JSON.parse(searchFields);
    } catch {
      throw new Error("Invalid searchFields JSON");
    }
  }

  if (!Array.isArray(searchFields)) {
    throw new Error("searchFields must be an array");
  }

  searchFields.forEach((item, index) => {
    if (!item) return;

    const field = String(item.field || "").trim();
    const keyword = String(item.keyword || "").trim();

    if (!keyword) return;

    // Global search
    if (!field || field === "global") {
      const words = keyword
        .split(/\s+/)
        .filter(Boolean);

      // Every word must match at least one searchable column.
      words.forEach((word, wordIndex) => {
        const paramName = `global_${index}_${wordIndex}`;

        request.input(
          paramName,
          sql.NVarChar,
          `%${word}%`
        );

        query += `
          AND (
            e.emp_full_name LIKE @${paramName}
            OR e.first_name LIKE @${paramName}
            OR e.middle_name LIKE @${paramName}
            OR e.last_name LIKE @${paramName}
            OR e.employee_code LIKE @${paramName}
            OR e.email_id LIKE @${paramName}
            OR e.phone1 LIKE @${paramName}
            OR e.client_name LIKE @${paramName}
            OR e.client_code LIKE @${paramName}
            OR e.site_name LIKE @${paramName}
            OR e.department LIKE @${paramName}
            OR e.rank LIKE @${paramName}
            OR b.branch_name LIKE @${paramName}
            OR CONVERT(
              NVARCHAR(MAX), e.company_id
            ) LIKE @${paramName}
            OR CONVERT(
              NVARCHAR(MAX), e.branch_id
            ) LIKE @${paramName}
          )
        `;
      });

      return;
    }

    const dbField = fieldMap[field];

    if (!dbField) {
      console.warn(
        "Unknown search field ignored:",
        field
      );
      return;
    }

    const paramName = `search_${index}`;

    request.input(
      paramName,
      sql.NVarChar,
      `%${keyword}%`
    );

    query += `
      AND CONVERT(NVARCHAR(255), ${dbField})
          LIKE @${paramName}
    `;
  });

  // ==========================================
  // DATE FILTERS
  // ==========================================

  if (filters.fromDate || filters.toDate) {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (
      (filters.fromDate &&
        !datePattern.test(filters.fromDate)) ||
      (filters.toDate &&
        !datePattern.test(filters.toDate))
    ) {
      throw new Error(
        "Dates must use YYYY-MM-DD format"
      );
    }

    if (
      filters.fromDate &&
      filters.toDate &&
      filters.fromDate > filters.toDate
    ) {
      throw new Error(
        "fromDate cannot be after toDate"
      );
    }

    if (filters.fromDate) {
      request.input(
        "fromDate",
        sql.Date,
        filters.fromDate
      );

      query += `
        AND TRY_CONVERT(date, e.created_on, 105)
            >= @fromDate
      `;
    }

    if (filters.toDate) {
      request.input(
        "toDate",
        sql.Date,
        filters.toDate
      );

      query += `
        AND TRY_CONVERT(date, e.created_on, 105)
            <= @toDate
      `;
    }
  }

  // ==========================================
  // ORDER BY
  // ==========================================

  query += `
    ORDER BY e.id DESC
  `;

  console.log("FINAL EMPLOYEE QUERY:", query);

  // ==========================================
  // EXECUTE EMPLOYEE QUERY
  // ==========================================

  const result = await request.query(query);
  const employees = result.recordset || [];

  console.log("EMPLOYEE RECORDS:", employees.length);

  // ==========================================
  // FETCH EMPLOYEE DOCUMENTS
  // ==========================================

  if (employees.length > 0) {
    const empIds = [
      ...new Set(
        employees
          .map((emp) => Number(emp.id))
          .filter(
            (id) =>
              Number.isSafeInteger(id) && id > 0
          )
      ),
    ];

    if (empIds.length > 0) {
      const docRequest = pool.request();

      const docParams = empIds.map((id, index) => {
        const paramName = `empId${index}`;

        docRequest.input(
          paramName,
          sql.BigInt,
          id
        );

        return `@${paramName}`;
      });

      // Assumes emp_docs.active = 0 means documents to return.
      const docQuery = `
        SELECT *
        FROM emp_docs
        WHERE emp_id IN (${docParams.join(", ")})
          AND active = 0
      `;

      console.log("DOCUMENT QUERY:", docQuery);

      const docResult = await docRequest.query(docQuery);
      const docs = docResult.recordset || [];

      employees.forEach((emp) => {
        if (
          emp.client_code == null ||
          String(emp.client_code).trim() === ""
        ) {
          emp.client_code = emp.fetched_client_code;
        }

        emp.documents = docs
          .filter(
            (doc) =>
              Number(doc.emp_id) === Number(emp.id)
          )
          .map((doc) => {
            if (
              doc.doc_name &&
              !String(doc.doc_name).startsWith("http")
            ) {
              return {
                ...doc,
                doc_name:
                  `${DOC_BASE_URL}${String(doc.doc_name)
                    .replace(/^\/?api\//, "")}`,
              };
            }

            return doc;
          });
      });
    }
  }

  // ==========================================
  // RETURN
  // ==========================================

  return {
    data: employees,
    query,
  };
};



// ==========================================
// GET EMPLOYEE BY ID
// ==========================================

const getEmployeeById = async (employeeId) => {
  const pool = await poolPromise;

  const employee = await pool
    .request()
    .input("id", sql.Int, employeeId)
    .query(`
      SELECT e.*, 
             b.branch_name, 
             c.company_name,
             cr.site_name
      FROM employee e
      LEFT JOIN branch b ON TRY_CAST(e.branch_id AS BIGINT) = b.id
      LEFT JOIN new_client c ON TRY_CAST(e.company_id AS BIGINT) = c.id
      LEFT JOIN client_rates cr ON TRY_CAST(e.site_id AS BIGINT) = cr.id
      WHERE e.id = @id
    `);

  const experience = await pool
    .request()
    .input("emp_id", sql.Int, employeeId)
    .query(`SELECT * FROM emp_experience WHERE emp_id = @emp_id  AND active = 0`);

  const documents = await pool
    .request()
    .input("emp_id", sql.Int, employeeId)
    .query(`SELECT * FROM emp_docs WHERE emp_id = @emp_id  AND active = 0`);

  const nominees = await pool
    .request()
    .input("emp_id", sql.Int, employeeId)
    .query(`SELECT * FROM emp_nominee WHERE emp_id = @emp_id  AND active = 0`);

  // =========================
  // FULL LOGGING (DEBUG)
  // =========================
  logger.log("=======================================");
  logger.log("ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Â¥ EMPLOYEE FULL DATA");
  logger.log("=======================================");
  logger.log("EMPLOYEE:", JSON.stringify(employee.recordset, null, 2));

  logger.log("=======================================");
  logger.log("ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã¢â‚¬Å¾ EXPERIENCE DATA");
  logger.log("=======================================");
  logger.log(JSON.stringify(experience.recordset, null, 2));

  logger.log("=======================================");
  logger.log("ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã‚Â DOCUMENTS DATA");
  logger.log("=======================================");
  logger.log(JSON.stringify(documents.recordset, null, 2));

  logger.log("=======================================");
  logger.log("Ã°Å¸â€˜Â¨Ã¢â‚¬ÂÃ°Å¸â€˜Â©Ã¢â‚¬ÂÃ°Å¸â€˜Â§ NOMINEE DATA");
  logger.log("=======================================");
  logger.log(JSON.stringify(nominees.recordset, null, 2));

  const formattedDocs = documents.recordset.map((doc) => {
    if (doc.doc_name && !doc.doc_name.startsWith("http")) {
      return { ...doc, doc_name: `${DOC_BASE_URL}${doc.doc_name.replace(/^\/?api\//, "")}` };
    }
    return doc;
  });

  return {
    employee: employee.recordset[0] || null,
    experience: experience.recordset,
    documents: formattedDocs,
    nominees: nominees.recordset,
  };
};

// ==========================================
// UPDATE EMPLOYEE
// ==========================================

const updateEmployee = async (employeeId, data, userId, modifiedByName) => {
  const pool = await poolPromise;
  // console.log(data);
  // ======================================
  // SAFE DATE
  // ======================================

  const safeDate = (val) => {
    return val && val !== "" ? new Date(val) : null;
  };

  // Using flat fields from data

  // ======================================
  // FULL NAME
  // ======================================

  const emp_full_name =
    `${toUpper(data.first_name) || ""} ${toUpper(data.middle_name) || ""} ${toUpper(data.last_name) || ""}`.trim();

  // ======================================
  // SQL REQUEST
  // ======================================

  const request = pool.request();

  request.input("id", sql.Int, employeeId);

  // ======================================
  // BASIC
  // ======================================

  request.input("initial", sql.NVarChar, data.initial || null);
  request.input("first_name", sql.NVarChar, toUpper(data.first_name) || null);
  request.input("middle_name", sql.NVarChar, toUpper(data.middle_name) || null);
  request.input("last_name", sql.NVarChar, toUpper(data.last_name) || null);
  request.input("emp_full_name", sql.NVarChar, emp_full_name);
  request.input("gender", sql.NVarChar, toUpper(data.gender) || null);
  request.input("gang_name", sql.NVarChar, toUpper(data.gang_name) || null);
  request.input("rank", sql.NVarChar, toUpper(data.rank) || null);
  request.input("dob", sql.Date, safeDate(data.dob));
  request.input("date_of_joining", sql.Date, safeDate(data.date_of_joining));
  request.input("reg_date", sql.Date, safeDate(data.reg_date));
  // ======================================
  // ADDRESS
  // ======================================

  request.input("address", sql.NVarChar, toUpper(data.address) || null);
  request.input("city", sql.NVarChar, toUpper(data.city) || null);
  request.input("state", sql.NVarChar, toUpper(data.state) || null);
  request.input("pincode", sql.NVarChar, toUpper(data.pincode) || null);
  request.input("country", sql.NVarChar, toUpper(data.country) || null);
  // ======================================
  // NATIVE ADDRESS
  // ======================================

  request.input(
    "native_address",
    sql.NVarChar,
    toUpper(data.native_address) || null,
  );
  request.input("native_city", sql.NVarChar, toUpper(data.native_city) || null);
  request.input(
    "native_state",
    sql.NVarChar,
    toUpper(data.native_state) || null,
  );
  request.input(
    "native_pincode",
    sql.NVarChar,
    toUpper(data.native_pincode) || null,
  );
  request.input(
    "native_country",
    sql.NVarChar,
    toUpper(data.native_country) || null,
  );
  // ======================================
  // CONTACT
  // ======================================

  request.input("phone1", sql.NVarChar, data.phone1 || null);
  request.input("phone2", sql.NVarChar, data.phone2 || null);
  request.input("email_id", sql.NVarChar, data.email_id || null);
  request.input("contact_person", sql.NVarChar, data.contact_person || null);
  request.input("contact_mobile", sql.NVarChar, data.contact_mobile || null);
  request.input("contact_relation", sql.NVarChar, toUpper(data.contact_relation) || null);
  request.input("contact_email", sql.NVarChar, toUpper(data.contact_email) || null);

  // ======================================
  // PERMANENT ADDRESS
  // ======================================

  request.input("p_address", sql.NVarChar, toUpper(data.p_address) || null);
  request.input("p_city", sql.NVarChar, toUpper(data.p_city) || null);
  request.input("p_state", sql.NVarChar, toUpper(data.p_state) || null);
  request.input("p_pincode", sql.NVarChar, toUpper(data.p_pincode) || null);
  request.input("p_country", sql.NVarChar, toUpper(data.p_country) || null);
  request.input("p_phone1", sql.NVarChar, toUpper(data.p_phone1) || null);
  request.input("p_phone2", sql.NVarChar, toUpper(data.p_phone2) || null);
  // ======================================
  // PERSONAL
  // ======================================

  request.input(
    "marital_status",
    sql.NVarChar,
    toUpper(data.marital_status) || null,
  );
  request.input("mrg_date", sql.Date, safeDate(data.mrg_date));
  request.input("cast", sql.NVarChar, toUpper(data.cast) || null);
  request.input("category", sql.NVarChar, toUpper(data.category) || null);
  request.input(
    "native_place",
    sql.NVarChar,
    toUpper(data.native_place) || null,
  );
  request.input("blood_group", sql.NVarChar, toUpper(data.blood_group) || null);
  request.input("father_name", sql.NVarChar, toUpper(data.father_name) || null);
  // ======================================
  // DOCUMENTS
  // ======================================

  request.input(
    "driving_license",
    sql.NVarChar,
    toUpper(data.driving_license) || null,
  );
  request.input("pancard_no", sql.NVarChar, data.pancard_no || null);
  request.input("aadhar_no", sql.NVarChar, data.aadhar_no || null);
  request.input("passport_no", sql.NVarChar, data.passport_no || null);
  request.input("uan_no", sql.NVarChar, data.uan_no || null);
  request.input(
    "passport_valid_date",
    sql.Date,
    safeDate(data.passport_valid_date),
  );

  request.input("pf_no", sql.NVarChar, data.pf_no || null);

  request.input("esis_no", sql.NVarChar, data.esis_no || null);

  request.input("esis_date", sql.Date, safeDate(data.esis_date));

  request.input("uan_date", sql.Date, safeDate(data.uan_date));

  // ======================================
  // LANGUAGE
  // ======================================

  for (let i = 1; i <= 5; i++) {
    request.input(`lang${i}`, sql.NVarChar, toUpper(data[`lang${i}`]) || null);
  }

  // ======================================
  // HOBBY
  // ======================================

  for (let i = 1; i <= 4; i++) {
    request.input(
      `hobby${i}`,
      sql.NVarChar,
      toUpper(data[`hobby${i}`]) || null,
    );
  }

  // ======================================
  // BANK
  // ======================================

  request.input("bank_name", sql.NVarChar, toUpper(data.bank_name) || null);
  request.input("account_no", sql.NVarChar, toUpper(data.account_no) || null);
  request.input(
    "bank_address",
    sql.NVarChar,
    toUpper(data.bank_address) || null,
  );
  request.input("bank_city", sql.NVarChar, toUpper(data.city) || null);
  request.input("bank_state", sql.NVarChar, toUpper(data.state) || null);
  request.input("bank_ifsc", sql.NVarChar, toUpper(data.bank_ifsc) || null);
  request.input("bank_micr", sql.NVarChar, toUpper(data.bank_micr) || null);
  request.input(
    "ac_holder_name",
    sql.NVarChar,
    safeString(data.ac_holder_name),
  );

  request.input("card_no", sql.NVarChar, safeString(data.card_no));

  request.input(
    "cancelled_cheque_image",
    sql.NVarChar,
    data.cancelled_cheque_image || null,
  );

  // ======================================
  // COMPANY
  // ======================================

  request.input("branch_id", sql.NVarChar, toUpper(data.branch_id) || null);
  request.input("company_id", sql.NVarChar, data.company_id || null);
  request.input("client_id", sql.NVarChar, data.client_id || null);
  request.input("client_code", sql.NVarChar, data.client_code || null);
  request.input("site_id", sql.NVarChar, data.site_id || null);
  request.input("site_name", sql.NVarChar, toUpper(data.site_name) || null);
  request.input("client_name", sql.NVarChar, toUpper(data.client_name) || null);
  request.input("department", sql.NVarChar, toUpper(data.department) || null);
  request.input(
    "reporting_manager",
    sql.NVarChar,
    data.reporting_manager || null,
  );

  request.input("reporting_user", sql.NVarChar, data.reporting_user || null);

  // ======================================
  // SALARY
  // ======================================

  request.input("salary_template", sql.NVarChar, data.salary_template || null);
  request.input("gross_salary", sql.NVarChar, data.gross_salary || null);
  request.input(
    "gross_salary_type",
    sql.NVarChar,
    data.gross_salary_type || null,
  );
  request.input("basic_salary", sql.NVarChar, data.basic_salary || null);
  request.input(
    "basic_salary_type",
    sql.NVarChar,
    data.basic_salary_type || null,
  );

  request.input(
    "sal_from_date",
    sql.NVarChar,
    data.sal_from_date ? String(data.sal_from_date) : null,
  );

  request.input(
    "sal_to_date",
    sql.NVarChar,
    data.sal_to_date ? String(data.sal_to_date) : null,
  );

  request.input("pf_applicable", sql.NVarChar, data.pf_applicable || null);
  request.input("da_term", sql.NVarChar, data.da_term || null);
  request.input("basic_term", sql.NVarChar, data.basic_term || null);
  request.input("perday_salary", sql.NVarChar, data.perday_salary || null);
  request.input("migrant_status", sql.NVarChar, data.migrant_status || null);
  // ======================================
  // SEPARATION
  // ======================================

  request.input("separation_type", sql.NVarChar, toUpper(data.separation_type) || null);
  request.input("separate_reason", sql.NVarChar, toUpper(data.separate_reason) || null);
  request.input(
    "date_of_separation",
    sql.Date,
    safeDate(data.date_of_separation),
  );
  request.input("notice_period", sql.NVarChar, data.notice_period || null);
  request.input(
    "last_working_date_sp",
    sql.Date,
    safeDate(data.last_working_date_sp),
  );
  request.input(
    "handover_given_to",
    sql.NVarChar,
    toUpper(data.handover_given_to) || null,
  );

  // ======================================
  // LOGIN
  // ======================================

  request.input("doc_name", sql.NVarChar, toUpper(data.doc_name) || null);
  request.input("password", sql.NVarChar, data.password ? md5(data.password) : null);
  request.input("employee_logo", sql.NVarChar, data.employee_logo || null);
  request.input("user_id", sql.NVarChar, data.user_id || null);

  // ======================================
  // MODIFIED
  // ======================================

  request.input("modified_by", sql.NVarChar, String(userId));
  request.input("modified_by_name", sql.NVarChar, String(modifiedByName));

  // ======================================
  // UPDATE QUERY
  // ======================================
  const result = await request.query(`
    UPDATE employee
    SET
      initial=@initial,
      first_name=@first_name,
      middle_name=@middle_name,
      last_name=@last_name,
      emp_full_name=@emp_full_name,
      gender=@gender,
      gang_name=@gang_name,
      rank=@rank,
      dob=@dob,
      date_of_joining=@date_of_joining,
      reg_date=@reg_date,

      address=@address,
      city=@city,
      state=@state,
      pincode=@pincode,
      country=@country,

      native_address=@native_address,
      native_city=@native_city,
      native_state=@native_state,
      native_pincode=@native_pincode,
      native_country=@native_country,

      phone1=@phone1,
      phone2=@phone2,
      email_id=@email_id,

      contact_person=@contact_person,
      contact_mobile=@contact_mobile,
      contact_relation=@contact_relation,
      contact_email=@contact_email,

      p_address=@p_address,
      p_city=@p_city,
      p_state=@p_state,
      p_pincode=@p_pincode,
      p_country=@p_country,
      p_phone1=@p_phone1,
      p_phone2=@p_phone2,

      marital_status=@marital_status,
      mrg_date=@mrg_date,
      cast=@cast,
      category=@category,
      native_place=@native_place,
      blood_group=@blood_group,
      father_name=@father_name,
      migrant_status=@migrant_status,

      driving_license=@driving_license,
      pancard_no=@pancard_no,
      aadhar_no=@aadhar_no,
      passport_no=@passport_no,
      uan_no=@uan_no,
      passport_valid_date=@passport_valid_date,
      pf_no=@pf_no,
      esis_no=@esis_no,
      esis_date=@esis_date,
      uan_date=@uan_date,

      lang1=@lang1,
      lang2=@lang2,
      lang3=@lang3,
      lang4=@lang4,
      lang5=@lang5,

      hobby1=@hobby1,
      hobby2=@hobby2,
      hobby3=@hobby3,
      hobby4=@hobby4,

      bank_name=@bank_name,
      account_no=@account_no,
      bank_address=@bank_address,
      bank_city=@bank_city,
      bank_state=@bank_state,
      bank_ifsc=@bank_ifsc,
      bank_micr=@bank_micr,
      ac_holder_name=@ac_holder_name,
      card_no=@card_no,
      cancelled_cheque_image=@cancelled_cheque_image,

      branch_id=@branch_id,
      company_id=@company_id,
      client_id=@client_id,
      client_code=@client_code,
      site_id=@site_id,
      site_name=@site_name,
      client_name=@client_name,
      department=@department,
      reporting_manager=@reporting_manager,
      reporting_user=@reporting_user,

      salary_template=@salary_template,
      gross_salary=@gross_salary,
      gross_salary_type=@gross_salary_type,
      basic_salary=@basic_salary,
      basic_salary_type=@basic_salary_type,
      sal_from_date=@sal_from_date,
      sal_to_date=@sal_to_date,
      pf_applicable=@pf_applicable,
      da_term=@da_term,
      basic_term=@basic_term,
      perday_salary=@perday_salary,

      separation_type=@separation_type,
      separate_reason=@separate_reason,
      date_of_separation=@date_of_separation,
      notice_period=@notice_period,
      last_working_date_sp=@last_working_date_sp,
      handover_given_to=@handover_given_to,

      doc_name=@doc_name,
      password=COALESCE(@password, password),
      employee_logo=COALESCE(@employee_logo, employee_logo),
      user_id=@user_id,
      modified_by=@modified_by,
      modified_by_name=@modified_by_name,
      modified_on=FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss')

    WHERE id=@id

  `);

  return result;
};
// ==========================================
// UPDATE EMPLOYEE STATUS
// ==========================================

const updateEmployeeStatus = async (
  employeeId,
  status,
  userId,
  modifiedByName
) => {
  const pool = await poolPromise;
  const request = pool.request();

  request.input("id", sql.Int, employeeId);
  request.input("status", sql.NVarChar, status);
  request.input("modified_by", sql.NVarChar, String(userId));
  request.input("modified_by_name", sql.NVarChar, String(modifiedByName));

  const result = await request.query(`
    UPDATE employee
    SET
      em_status = @status,
      modified_by = @modified_by,
      modified_by_name = @modified_by_name,
      modified_on = CONVERT(VARCHAR(19), GETDATE(), 120)
    WHERE id = @id
  `);

  return result;
};
// ==========================================
// UPDATE EMPLOYEE SALARY
// ==========================================

const updateEmployeeSalary = async (employeeId, monthlySalary, userId) => {
  const pool = await poolPromise;

  const request = pool.request();

  // ======================================
  // INPUTS
  // ======================================

  request.input("id", sql.Int, employeeId);

  request.input("monthlySalary", sql.NVarChar, monthlySalary);

  request.input("modified_by", sql.NVarChar, String(userId));

  request.input(
    "modified_on",
    sql.DateTime,
    new Date(),
  );

  // ======================================
  // QUERY
  // ======================================

  const result = await request.query(`

      UPDATE employee

      SET

        perday_salary = @monthlySalary,

        modified_by = @modified_by,

        modified_on = @modified_on

      WHERE id = @id

    `);

  return result;
};

// ==========================================
// DELETE / DISABLE EMPLOYEE
// ==========================================


const deleteEmployee = async (
  employeeId,
  userId,
  disabledByName,
  superadminStatus
) => {
  const pool = await poolPromise;
  const request = pool.request();

  // INPUTS
  request.input("id", sql.Int, employeeId);

  request.input(
    "disabled_by",
    sql.NVarChar,
    String(userId)
  );

  request.input(
    "disabled_by_name",
    sql.NVarChar,
    String(disabledByName)
  );

  request.input(
    "disabled_on",
    sql.DateTime,
    new Date()
  );

  request.input("active", sql.NVarChar, "1");

  request.input(
    "superadmin_status",
    sql.Int,
    superadminStatus
  );

  // UPDATE EMPLOYEE
  const result = await request.query(`
    UPDATE employee
    SET
      active = @active,
      disabled_by = @disabled_by,
      disabled_by_name = @disabled_by_name,
      disabled_on = @disabled_on,
      superadmin_status = @superadmin_status
    WHERE id = @id
  `);

  return result;
};


// ==========================================
// RESTORE EMPLOYEE
// ==========================================

const restoreEmployee = async (employeeId) => {
  const pool = await poolPromise;
  const request = pool.request();
  request.input("id", sql.Int, employeeId);
  request.input("active", sql.Bit, 0);

  const result = await request.query(`
    UPDATE employee
    SET
      active = @active,
      disabled_by = NULL,
      disabled_by_name = NULL,
      disabled_on = NULL
    WHERE id = @id
  `);

  return result.rowsAffected[0] > 0;
};

// ==========================================
// EXPORT EMPLOYEES TO EXCEL
// ==========================================

const exportEmployeesToExcel = async (queryParams) => {
  const pool = await poolPromise;

  const { searchFields, fromDate, toDate } = queryParams;

  const request = pool.request();

  const fieldMap = {
    firstName: "e.first_name",
    middleName: "e.middle_name",
    lastName: "e.last_name",
    employeeCode: "e.employee_code",
    email: "e.email_id",
    mobile: "e.phone1",
    department: "e.department",
    designation: "e.rank",
    company: "c.company_name",
    site: "c.site_name",
  };

  let query = `
SELECT
    e.*,
    cr.site_name,
    cr.client_code,
    nc.company_name AS client_name

FROM employee e

LEFT JOIN client_rates cr
    ON TRY_CAST(e.client_id AS BIGINT) = cr.client_id

LEFT JOIN new_client nc
    ON TRY_CAST(e.client_id AS BIGINT) = nc.id

WHERE 1=1
`;

  // ======================================
  // SEARCH FILTERS
  // ======================================

  if (searchFields) {
    const fields = JSON.parse(searchFields);

    fields.forEach((item, index) => {
      const dbField = fieldMap[item.field];

      if (dbField && item.keyword) {
        query += `
          AND ${dbField}
          LIKE @search${index}
        `;

        request.input(`search${index}`, sql.NVarChar, `%${item.keyword}%`);
      }
    });
  }

  // ======================================
  // DATE FILTER
  // ======================================

  if (fromDate && toDate) {
    query += `
      AND TRY_CONVERT(datetime, e.created_on, 105)
          BETWEEN @fromDate AND @toDate
    `;

    request.input("fromDate", sql.DateTime, `${fromDate} 00:00:00`);

    request.input("toDate", sql.DateTime, `${toDate} 23:59:59`);
  }

  // ======================================
  // ORDER
  // ======================================

  query += `
    ORDER BY TRY_CONVERT(datetime, e.created_on, 105) DESC
  `;

  console.log("EXPORT QUERY:");
  console.log(query);

  const result = await request.query(query);

  return result.recordset;
};

// =========================
// GET USER BY ID
// =========================

const getUserById = async (userId) => {
  const pool = await poolPromise;

  const result = await pool.request().input("userId", sql.Int, userId).query(`
        SELECT
          id,
          first_name
        FROM users
        WHERE id = @userId
      `);

  return result.recordset[0];
};

// =========================
// VERIFY EMPLOYEE
// =========================

const verifyEmployee = async (data) => {
  logger.log("MODEL DATA =", data);

  const pool = await poolPromise;

  // =====================================================
  // HELPER
  // Single:
  //     1
  //     "1"
  //
  // Multiple:
  //     "1,2"
  //     "1,2,3"
  //     ["1", "2"]
  //     [1, 2]
  //
  // DB INT column असल्यामुळे FIRST valid ID save होईल.
  // =====================================================

  const getFirstValidId = (value) => {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      return null;
    }

    let values = [];

    // Array
    if (Array.isArray(value)) {
      values = value;
    }

    // String / Number
    else {
      values = String(value).split(",");
    }

    const validIds = values
      .map((item) => String(item).trim())
      .filter((item) => item !== "")
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0);

    return validIds.length > 0
      ? validIds[0]
      : null;
  };

  // =====================================================
  // CLIENT ID
  // =====================================================

  const clientId = getFirstValidId(data.client_id);

  // =====================================================
  // SITE ID
  // =====================================================

  const siteId = getFirstValidId(data.site_id);

  logger.log("ORIGINAL CLIENT ID =", data.client_id);
  logger.log("NORMALIZED CLIENT ID =", clientId);

  logger.log("ORIGINAL SITE ID =", data.site_id);
  logger.log("NORMALIZED SITE ID =", siteId);

  // =====================================================
  // SQL
  // =====================================================

  const result = await pool
    .request()

    .input(
      "id",
      sql.Int,
      data.employeeId
    )

    .input(
      "verification_remark",
      sql.VarChar(sql.MAX),
      data.verification_remark || ""
    )

    .input(
      "verified_by",
      sql.Int,
      data.verifiedBy
    )

    .input(
      "verify_name",
      sql.VarChar(200),
      data.verifyName || ""
    )

    .input(
      "emp_stages",
      sql.VarChar(100),
      data.status || "VERIFIED"
    )

    .input(
      "client_id",
      sql.Int,
      clientId
    )

    .input(
      "site_id",
      sql.Int,
      siteId
    )

    .query(`
      UPDATE employee
      SET
        Verify_remarks = @verification_remark,
        verify_by = @verified_by,
        verify_name = @verify_name,

        verify_on = FORMAT(
          DATEADD(MINUTE, 330, GETUTCDATE()),
          'yyyy-MM-dd HH:mm:ss'
        ),

        emp_stages = @emp_stages,

        client_id = @client_id,
        site_id = @site_id

      WHERE id = @id
    `);

  logger.log("ROWS AFFECTED =", result.rowsAffected);

  return result;
};

// =========================
// UPDATE OFFER STATUS
// =========================



const updateOfferStatus = async (data) => {
  const pool = await poolPromise;

  try {
    // 1. Validate employee ID
    const employeeId = Number(data.id);

    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      throw new Error("Invalid employee ID");
    }

    // 2. Allowed employee statuses
    const allowedStatuses = [
      "OFFER LETTER ISSUED",
      "ON HOLD",
      "REJECT",
    ];

    // 3. Normalize status and handle empty values
    const rawStatus = data.verification_status;

    const normalizedStatus = String(rawStatus ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();

    const status =
      normalizedStatus || "OFFER LETTER ISSUED";

    console.log("Employee ID:", employeeId);
    console.log("Incoming status:", JSON.stringify(rawStatus));
    console.log("Final status:", JSON.stringify(status));

    // 4. Validate status
    if (!allowedStatuses.includes(status)) {
      throw new Error(
        `Invalid employee status: "${status}". Allowed values: ${allowedStatuses.join(", ")}`
      );
    }

    // 5. Generate password only when required
    const md5Password = data.password
      ? md5(data.password)
      : md5("12345");

    // 6. Update employee
    const updateResult = await pool
      .request()
      .input("id", sql.Int, employeeId)
      .input(
        "client_id",
        sql.Int,
        data.client_id ? Number(data.client_id) : null
      )
      .input(
        "site_id",
        sql.Int,
        data.site_id ? Number(data.site_id) : null
      )
      .input(
        "site_hours",
        sql.NVarChar,
        data.working_hours != null
          ? String(data.working_hours)
          : null
      )
      .input(
        "shift_type",
        sql.NVarChar,
        data.shift_type || null
      )
      .input(
        "employee_code",
        sql.NVarChar,
        data.employee_code || null
      )
      .input(
        "branch_id",
        sql.Int,
        data.branch_id ? Number(data.branch_id) : null
      )
      .input("password", sql.NVarChar, md5Password)
      .input("emp_stages", sql.NVarChar, status)
      .query(`
        UPDATE employee
        SET
          client_id = @client_id,
          site_id = @site_id,
          shift_type = @shift_type,
          site_hours = @site_hours,
          emp_stages = @emp_stages,
          employee_code = @employee_code,
          password = ISNULL(password, @password),
          login_from_date = FORMAT(
            CAST(date_of_joining AS DATE),
            'yyyy-MM-dd'
          ),
          login_to_date = FORMAT(
            DATEADD(
              YEAR,
              5,
              CAST(date_of_joining AS DATE)
            ),
            'yyyy-MM-dd'
          )
        WHERE id = @id;

        SELECT @@ROWCOUNT AS affectedRows;
      `);

    // 7. Check whether employee was updated
    if (!updateResult.recordset[0]?.affectedRows) {
      throw new Error(
        `Employee not found or not updated. ID: ${employeeId}`
      );
    }

    // 8. Fetch updated employee
    const result = await pool
      .request()
      .input("id", sql.Int, employeeId)
      .query(`
        SELECT
          e.*,
          nc.company_name AS fetched_client_name,
          cr.site_name AS fetched_site_name,
          cr.client_code AS fetched_client_code,
          b.branch_name AS fetched_branch_name
        FROM employee e
        LEFT JOIN new_client nc
          ON TRY_CAST(e.client_id AS BIGINT) = nc.id
        LEFT JOIN client_rates cr
          ON TRY_CAST(e.site_id AS BIGINT) = cr.id
        LEFT JOIN branch b
          ON TRY_CAST(e.branch_id AS BIGINT) = b.id
        WHERE e.id = @id
      `);

    const row = result.recordset[0];

    if (!row) {
      throw new Error("Employee not found after update");
    }

    // 9. Add display fields
    row.client_name = row.fetched_client_name;
    row.site_name = row.fetched_site_name;
    row.client_code = row.fetched_client_code;
    row.branch_name = row.fetched_branch_name;

    return row;
  } catch (error) {
    console.error(
      "updateOfferStatus error:",
      error.message
    );

    throw error;
  }
};


const saveEmployeeLoginCoordinates = async ({
  employee_code,
  coordinates,
  user,
}) => {
  const pool = await poolPromise;

  if (!employee_code) {
    throw new Error("Employee code is required");
  }

  if (!Array.isArray(coordinates)) {
    throw new Error("Coordinates must be an array");
  }

  for (const item of coordinates) {
    const latitude = Number(item.office_latitude);
    const longitude = Number(item.office_longitude);

    if (
      item.office_latitude == null ||
      item.office_longitude == null ||
      item.office_latitude === "" ||
      item.office_longitude === "" ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new Error("Invalid office latitude or longitude");
    }

    await pool
      .request()
      .input("emp_code", sql.NVarChar, employee_code)
      .input("office_longitude", sql.Decimal(18, 8), longitude)
      .input("office_latitude", sql.Decimal(18, 8), latitude)
      .input("created_by", sql.Int, user?.id || null)
      .input(
        "created_by_name",
        sql.NVarChar,
        user?.first_name || user?.fullname || user?.name || null
      )
      .input("source", sql.NVarChar, "WEB")
      .query(`
        INSERT INTO employee_login_coordinates (
          emp_code,
          office_longitude,
          office_latitude,
          created_by,
          created_on,
          active,
          source,
          created_by_name
        )
        VALUES (
          @emp_code,
          @office_longitude,
          @office_latitude,
          @created_by,
          GETDATE(),
          0,
          @source,
          @created_by_name
        )
      `);
  }

  return {
    success: true,
    inserted: coordinates.length,
  };
};


// ======================================
// CREATE EMPLOYEE NOMINEE
// ======================================
const createEmployeeNominee = async (d) => {
  const pool = await poolPromise;

  // ======================================
  // VALIDATION
  // ======================================

  if (!d.emp_id || !d.f_relative_name || !d.f_relation) {
    return null;
  }

  // ======================================
  // CHECK EMPTY DATA
  // ======================================

  const hasValidData = [
    d.f_initial,
    d.f_relative_name,
    d.f_gender,
    d.f_relation,
    d.f_dob,
    d.f_age,
    d.f_minor,
    d.f_guardian,
    d.f_address,
    d.f_contact,
    d.f_email,
    d.f_sharepf,
    d.f_shareesic,
  ].some((x) => x !== null && x !== undefined && String(x).trim() !== "");

  // ======================================
  // IF ALL FIELDS EMPTY
  // ======================================

  if (!hasValidData) {
    return null;
  }

  // ======================================
  // CHECK EXISTING NOMINEE
  // ======================================

  const existingQuery = `
    SELECT TOP 1 id
    FROM emp_nominee
    WHERE
      emp_id = @emp_id
      AND f_relative_name = @f_relative_name
      AND f_relation = @f_relation
  `;

  const existingResult = await pool
    .request()

    .input("emp_id", sql.Int, d.emp_id)

    .input("f_relative_name", sql.VarChar, d.f_relative_name || "")

    .input("f_relation", sql.VarChar, d.f_relation || "")

    .query(existingQuery);

  // ======================================
  // UPDATE
  // ======================================

  if (existingResult.recordset.length > 0) {
    const nomineeId = existingResult.recordset[0].id;

    const updateQuery = `
      UPDATE emp_nominee
      SET
        f_initial       = @f_initial,
        f_gender        = @f_gender,
        f_dob           = @f_dob,
        f_age           = @f_age,
        f_minor         = @f_minor,
        f_guardian      = @f_guardian,
        f_address       = @f_address,
        f_contact       = @f_contact,
        f_email         = @f_email,
        f_sharepf       = @f_sharepf,
        f_shareesic     = @f_shareesic,
        source          = @source,
        active          = @active
      WHERE id = @id
    `;

    await pool
      .request()

      .input("id", sql.Int, nomineeId)

      .input("f_initial", sql.VarChar, d.f_initial || "")

      .input("f_gender", sql.VarChar, d.f_gender || "")

      .input("f_dob", sql.Date, d.f_dob || null)

      .input("f_age", sql.Int, d.f_age || null)

      .input("f_minor", sql.VarChar, d.f_minor || "")

      .input("f_guardian", sql.VarChar, d.f_guardian || "")

      .input("f_address", sql.VarChar, d.f_address || "")

      .input("f_contact", sql.VarChar, d.f_contact || "")

      .input("f_email", sql.VarChar, d.f_email || "")

      .input("f_sharepf", sql.VarChar, d.f_sharepf || "")

      .input("f_shareesic", sql.VarChar, d.f_shareesic || "")

      .input("active", sql.Bit, 1)

      .input("source", sql.VarChar, d.source || "WEB")

      .query(updateQuery);

    return nomineeId;
  }

  // ======================================
  // INSERT
  // ======================================

  const insertQuery = `
    INSERT INTO emp_nominee
    (
      emp_id,
      f_initial,
      f_relative_name,
      f_gender,
      f_relation,
      f_dob,
      f_age,
      f_minor,
      f_guardian,
      f_address,
      f_contact,
      f_email,
      f_sharepf,
      f_shareesic,
      active,
      source
    )

    VALUES
    (
      @emp_id,
      @f_initial,
      @f_relative_name,
      @f_gender,
      @f_relation,
      @f_dob,
      @f_age,
      @f_minor,
      @f_guardian,
      @f_address,
      @f_contact,
      @f_email,
      @f_sharepf,
      @f_shareesic,
      @active,
      @source
    );

    SELECT SCOPE_IDENTITY() AS nominee_id;
  `;

  const result = await pool
    .request()

    .input("emp_id", sql.Int, d.emp_id)

    .input("f_initial", sql.VarChar, d.f_initial || "")

    .input("f_relative_name", sql.VarChar, d.f_relative_name || "")

    .input("f_gender", sql.VarChar, d.f_gender || "")

    .input("f_relation", sql.VarChar, d.f_relation || "")

    .input("f_dob", sql.Date, d.f_dob || null)

    .input("f_age", sql.Int, d.f_age || null)

    .input("f_minor", sql.VarChar, d.f_minor || "")

    .input("f_guardian", sql.VarChar, d.f_guardian || "")

    .input("f_address", sql.VarChar, d.f_address || "")

    .input("f_contact", sql.VarChar, d.f_contact || "")

    .input("f_email", sql.VarChar, d.f_email || "")

    .input("f_sharepf", sql.VarChar, d.f_sharepf || "")

    .input("f_shareesic", sql.VarChar, d.f_shareesic || "")

    .input("active", sql.Bit, 0)

    .input("source", sql.VarChar, d.source || "WEB")

    .query(insertQuery);

  return result.recordset[0].nominee_id;
};

const updateEmployeeNominee = async (id, d) => {
  const pool = await poolPromise;

  // ======================================
  // CHECK NOMINEE EXISTS
  // ======================================

  const checkResult = await pool
    .request()
    .input("id", sql.Int, id)
    .query(`
      SELECT id
      FROM emp_nominee
      WHERE id = @id
    `);

  if (checkResult.recordset.length === 0) {
    return {
      success: false,
      message: "Nominee not found",
    };
  }

  // ======================================
  // UPDATE
  // ======================================

  const updateQuery = `
    UPDATE emp_nominee
    SET
      f_initial       = @f_initial,
      f_relative_name = @f_relative_name,
      f_gender        = @f_gender,
      f_relation      = @f_relation,
      f_dob           = @f_dob,
      f_age           = @f_age,
      f_minor         = @f_minor,
      f_guardian      = @f_guardian,
      f_address       = @f_address,
      f_contact       = @f_contact,
      f_email         = @f_email,
      f_sharepf       = @f_sharepf,
      f_shareesic     = @f_shareesic,
      source          = @source
    WHERE id = @id
  `;

  await pool
    .request()
    .input("id", sql.Int, id)
    .input("f_initial", sql.VarChar, d.f_initial || "")
    .input("f_relative_name", sql.VarChar, d.f_relative_name || "")
    .input("f_gender", sql.VarChar, d.f_gender || "")
    .input("f_relation", sql.VarChar, d.f_relation || "")
    .input("f_dob", sql.Date, d.f_dob || null)
    .input("f_age", sql.Int, d.f_age || null)
    .input("f_minor", sql.VarChar, d.f_minor || "")
    .input("f_guardian", sql.VarChar, d.f_guardian || "")
    .input("f_address", sql.VarChar, d.f_address || "")
    .input("f_contact", sql.VarChar, d.f_contact || "")
    .input("f_email", sql.VarChar, d.f_email || "")
    .input("f_sharepf", sql.VarChar, d.f_sharepf || "")
    .input("f_shareesic", sql.VarChar, d.f_shareesic || "")
    .input("source", sql.VarChar, d.source || "WEB")
    .query(updateQuery);

  return {
    success: true,
    nominee_id: id,
  };
};

const deleteEmployeeNominee = async (id) => {
  const pool = await poolPromise;

  // ======================================
  // CHECK NOMINEE
  // ======================================

  const checkResult = await pool
    .request()
    .input("id", sql.Int, id)
    .query(`
      SELECT id
      FROM emp_nominee
      WHERE id = @id
      AND active = 0
    `);

  if (checkResult.recordset.length === 0) {
    return {
      success: false,
      message: "Nominee not found or already deleted",
    };
  }

  // ======================================
  // SOFT DELETE
  // ======================================

  await pool
    .request()
    .input("id", sql.Int, id)
    .query(`
      UPDATE emp_nominee
      SET active = 1
      WHERE id = @id
    `);

  return {
    success: true,
    nominee_id: id,
  };
};
// ======================================
// GET EMPLOYEE DOCUMENTS
// ======================================
const updateOfferLetterPath = async (id, appointmentPath, offerRefNo) => {
  const pool = await poolPromise;

  return await pool
    .request()

    .input("id", sql.Int, id)

    .input("appointment_letter_img_path", sql.VarChar, appointmentPath)

    .input("offer_letter_ref_no", sql.VarChar, offerRefNo).query(`

        UPDATE employee

        SET

          appointment_letter_img_path =
            @appointment_letter_img_path,

          offer_letter_ref_no =
            @offer_letter_ref_no

        WHERE id = @id

      `);
};

const getEmployeeDocuments = async (employeeId) => {
  const pool = await poolPromise;

  const query = `
      SELECT
        id,
        emp_id,
        emp_code,
        doc_type,
        doc_name,
        source,
        doc_status,
        doc_remark,
        created_by,
        created_on,
        active

      FROM emp_docs

      WHERE emp_id = @emp_id
AND active=0
      ORDER BY id DESC
    `;

  const result = await pool
    .request()
    .input("emp_id", sql.Int, employeeId)
    .query(query);

  const documents = result.recordset.map((doc) => {
    let fullDocUrl = doc.doc_name || "";
    if (fullDocUrl && !fullDocUrl.startsWith("http")) {
      fullDocUrl = `${DOC_BASE_URL}${fullDocUrl.replace(/^\/?api\//, "")}`;
    }
    return {
      ...doc,
      doc_name: fullDocUrl,
    };
  });

  return documents;
};

// ======================================
// CREATE EMPLOYEE EXPERIENCE
// ======================================

const createEmployeeExperience = async (d) => {
  const pool = await poolPromise;

  // ======================================
  // VALIDATION
  // ======================================

  if (!d.emp_id || !d.emp_company_name) {
    return null;
  }

  // ======================================
  // CHECK EMPTY DATA
  // ======================================

  const hasValidData = [
    d.emp_company_name,
    d.emp_designation,
    d.emp_address,
    d.emp_city,
    d.emp_state,
    d.emp_country,
    d.emp_pincode,
    d.emp_joined_date,
    d.last_working_date,
    d.annual_ctc,
    d.monthly_ctc,
    d.reporting_to,
    d.reporting_to_designation,
    d.reporting_to_email,
    d.reporting_to_contact,
    d.gross_income,
    d.gross_tds,
    d.gross_pt,
    d.total_pt,
  ].some((x) => x !== null && x !== undefined && String(x).trim() !== "");

  // ======================================
  // IF ALL EMPTY
  // ======================================

  if (!hasValidData) {
    return null;
  }

  // ======================================
  // CHECK EXISTING EXPERIENCE
  // ======================================

  let existingResult = { recordset: [] };
  if (d.id) {
    const existingQuery = `
      SELECT TOP 1 id
      FROM emp_experience
      WHERE id = @id
    `;
    existingResult = await pool
      .request()
      .input("id", sql.Int, d.id)
      .query(existingQuery);
  } else {
    const existingQuery = `
      SELECT TOP 1 id
      FROM emp_experience
      WHERE
        emp_id = @emp_id
        AND emp_company_name = @emp_company_name
    `;

    existingResult = await pool
      .request()
      .input("emp_id", sql.Int, d.emp_id)
      .input("emp_company_name", sql.VarChar(200), d.emp_company_name || "")
      .query(existingQuery);
  }

  // ======================================
  // UPDATE
  // ======================================

  if (existingResult.recordset.length > 0) {
    const expId = existingResult.recordset[0].id;

    await pool
      .request()

      .input("id", sql.Int, expId)

      .input("emp_designation", sql.VarChar(200), d.emp_designation || "")

      .input("emp_address", sql.VarChar(sql.MAX), d.emp_address || "")

      .input("emp_city", sql.VarChar(100), d.emp_city || "")

      .input("emp_state", sql.VarChar(100), d.emp_state || "")

      .input("emp_country", sql.VarChar(100), d.emp_country || "")

      .input("emp_pincode", sql.VarChar(20), d.emp_pincode || "")

      .input("emp_joined_date", sql.Date, d.emp_joined_date || null)

      .input("last_working_date", sql.Date, d.last_working_date || null)

      .input("annual_ctc", sql.Decimal(18, 2), d.annual_ctc || 0)

      .input("monthly_ctc", sql.Decimal(18, 2), d.monthly_ctc || 0)

      .input("reporting_to", sql.VarChar(200), d.reporting_to || "")

      .input(
        "reporting_to_designation",
        sql.VarChar(200),
        d.reporting_to_designation || "",
      )

      .input("reporting_to_email", sql.VarChar(200), d.reporting_to_email || "")

      .input(
        "reporting_to_contact",
        sql.VarChar(20),
        d.reporting_to_contact || "",
      )

      .input("gross_income", sql.Decimal(18, 2), d.gross_income || 0)

      .input("gross_tds", sql.Decimal(18, 2), d.gross_tds || 0)

      .input("gross_pt", sql.Decimal(18, 2), d.gross_pt || 0)

      .input("total_pt", sql.Decimal(18, 2), d.total_pt || 0)

      .input("active", sql.Bit, 1)

      .input("source", sql.VarChar(100), d.source || "WEB").query(`

        UPDATE emp_experience
        SET
          emp_designation = @emp_designation,
          emp_address = @emp_address,
          emp_city = @emp_city,
          emp_state = @emp_state,
          emp_country = @emp_country,
          emp_pincode = @emp_pincode,
          emp_joined_date = @emp_joined_date,
          last_working_date = @last_working_date,
          annual_ctc = @annual_ctc,
          monthly_ctc = @monthly_ctc,
          reporting_to = @reporting_to,
          reporting_to_designation = @reporting_to_designation,
          reporting_to_email = @reporting_to_email,
          reporting_to_contact = @reporting_to_contact,
          gross_income = @gross_income,
          gross_tds = @gross_tds,
          gross_pt = @gross_pt,
          total_pt = @total_pt,
          active = @active,
          source = @source
        WHERE id = @id
      `);

    return expId;
  }

  // ======================================
  // INSERT
  // ======================================

  const result = await pool
    .request()

    .input("emp_id", sql.Int, d.emp_id)

    .input("emp_company_name", sql.VarChar(200), d.emp_company_name || "")

    .input("emp_designation", sql.VarChar(200), d.emp_designation || "")

    .input("emp_address", sql.VarChar(sql.MAX), d.emp_address || "")

    .input("emp_city", sql.VarChar(100), d.emp_city || "")

    .input("emp_state", sql.VarChar(100), d.emp_state || "")

    .input("emp_country", sql.VarChar(100), d.emp_country || "")

    .input("emp_pincode", sql.VarChar(20), d.emp_pincode || "")

    .input("emp_joined_date", sql.Date, d.emp_joined_date || null)

    .input("last_working_date", sql.Date, d.last_working_date || null)

    .input("annual_ctc", sql.Decimal(18, 2), d.annual_ctc || 0)

    .input("monthly_ctc", sql.Decimal(18, 2), d.monthly_ctc || 0)

    .input("reporting_to", sql.VarChar(200), d.reporting_to || "")

    .input(
      "reporting_to_designation",
      sql.VarChar(200),
      d.reporting_to_designation || "",
    )

    .input("reporting_to_email", sql.VarChar(200), d.reporting_to_email || "")

    .input(
      "reporting_to_contact",
      sql.VarChar(20),
      d.reporting_to_contact || "",
    )

    .input("gross_income", sql.Decimal(18, 2), d.gross_income || 0)

    .input("gross_tds", sql.Decimal(18, 2), d.gross_tds || 0)

    .input("gross_pt", sql.Decimal(18, 2), d.gross_pt || 0)

    .input("total_pt", sql.Decimal(18, 2), d.total_pt || 0)

    .input("active", sql.Bit, 1)

    .input("source", sql.VarChar(100), d.source || "WEB").query(`

      INSERT INTO emp_experience
      (
        emp_id,
        emp_company_name,
        emp_designation,
        emp_address,
        emp_city,
        emp_state,
        emp_country,
        emp_pincode,
        emp_joined_date,
        last_working_date,
        annual_ctc,
        monthly_ctc,
        reporting_to,
        reporting_to_designation,
        reporting_to_email,
        reporting_to_contact,
        gross_income,
        gross_tds,
        gross_pt,
        total_pt,
        active,
        source
      )

      VALUES
      (
        @emp_id,
        @emp_company_name,
        @emp_designation,
        @emp_address,
        @emp_city,
        @emp_state,
        @emp_country,
        @emp_pincode,
        @emp_joined_date,
        @last_working_date,
        @annual_ctc,
        @monthly_ctc,
        @reporting_to,
        @reporting_to_designation,
        @reporting_to_email,
        @reporting_to_contact,
        @gross_income,
        @gross_tds,
        @gross_pt,
        @total_pt,
        @active,
        @source
      );

      SELECT SCOPE_IDENTITY() AS exp_id;
    `);

  return result.recordset[0].exp_id;
};

// ======================================
// UPDATE EMPLOYEE DOCUMENTS
// ======================================


const updateEmployeeDocuments = async ({
  emp_id,
  documents = [],
  files = [],
  cancelledChequeFile,
}) => {
  const pool = await poolPromise;
  const savedDocumentIds = [];

  // Find the uploaded file using the frontend's fileIndex.
  const getDocumentFile = (doc, index) => {
    if (
      doc.fileIndex !== null &&
      doc.fileIndex !== undefined &&
      Number.isInteger(Number(doc.fileIndex))
    ) {
      return files[Number(doc.fileIndex)] || null;
    }

    // Backward compatibility for requests without fileIndex.
    return files[index] || null;
  };

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];

    if (
      !doc.documentType ||
      !doc.documentType.trim()
    ) {
      logger.log("Skipped empty document type:", i);
      continue;
    }

    const file = getDocumentFile(doc, i);
    let filePath = doc.imagePath || "";

    if (file && file.originalname !== "empty.txt") {
      filePath = `emp_docs/${file.filename}`;
    } else if (filePath.includes("/emp_docs/")) {
      filePath = `emp_docs/${filePath.split("/emp_docs/").pop()}`;
    } else if (filePath && !filePath.startsWith("emp_docs/")) {
      filePath = `emp_docs/${filePath}`;
    }

    const existingResult = await pool
      .request()
      .input("emp_id", sql.Int, emp_id)
      .input("doc_type", sql.VarChar(100), doc.documentType)
      .query(`
        SELECT TOP 1 id
        FROM emp_docs
        WHERE emp_id = @emp_id
          AND doc_type = @doc_type
        ORDER BY id DESC
      `);

    let documentId;

    if (existingResult.recordset.length > 0) {
      documentId = existingResult.recordset[0].id;

      await pool
        .request()
        .input("id", sql.Int, documentId)
        .input("doc_name", sql.VarChar(200), filePath)
        .input("doc_status", sql.VarChar(100), doc.status || "PENDING")
        .input("doc_remark", sql.VarChar(sql.MAX), doc.remark || "")
        .input("source", sql.VarChar(500), "WEB")
        .query(`
          UPDATE emp_docs
          SET
            doc_name = @doc_name,
            doc_status = @doc_status,
            doc_remark = @doc_remark,
            source = @source
          WHERE id = @id
        `);

      logger.log("UPDATED DOCUMENT:", {
        documentId,
        documentType: doc.documentType,
        filePath,
      });
    } else {
      const insertResult = await pool
        .request()
        .input("emp_id", sql.Int, emp_id)
        .input("doc_type", sql.VarChar(100), doc.documentType)
        .input("doc_name", sql.VarChar(200), filePath)
        .input("doc_status", sql.VarChar(100), doc.status || "PENDING")
        .input("doc_remark", sql.VarChar(sql.MAX), doc.remark || "")
        .input("source", sql.VarChar(500), "WEB")
        .query(`
          INSERT INTO emp_docs
            (emp_id, doc_type, doc_name, doc_status, doc_remark, source)
          OUTPUT INSERTED.id
          VALUES
            (@emp_id, @doc_type, @doc_name, @doc_status, @doc_remark, @source)
        `);

      documentId = insertResult.recordset[0]?.id;

      logger.log("INSERTED DOCUMENT:", {
        documentId,
        documentType: doc.documentType,
        filePath,
      });
    }

    if (documentId != null) {
      savedDocumentIds.push(documentId);
    }
  }

  // Cancelled cheque
  if (cancelledChequeFile) {
    const chequePath = `emp_docs/${cancelledChequeFile.filename}`;

    const existingCheque = await pool
      .request()
      .input("emp_id", sql.Int, emp_id)
      .input("doc_type", sql.VarChar(100), "CANCELLED CHEQUE")
      .query(`
        SELECT TOP 1 id
        FROM emp_docs
        WHERE emp_id = @emp_id
          AND doc_type = @doc_type
        ORDER BY id DESC
      `);

    if (existingCheque.recordset.length > 0) {
      const chequeId = existingCheque.recordset[0].id;

      await pool
        .request()
        .input("id", sql.Int, chequeId)
        .input("doc_name", sql.VarChar(200), chequePath)
        .input("doc_status", sql.VarChar(100), "APPROVED")
        .input("doc_remark", sql.VarChar(sql.MAX), "CANCELLED CHEQUE")
        .input("source", sql.VarChar(500), "WEB")
        .query(`
          UPDATE emp_docs
          SET
            doc_name = @doc_name,
            doc_status = @doc_status,
            doc_remark = @doc_remark,
            source = @source
          WHERE id = @id
        `);

      savedDocumentIds.push(chequeId);
    } else {
      const chequeResult = await pool
        .request()
        .input("emp_id", sql.Int, emp_id)
        .input("doc_type", sql.VarChar(100), "CANCELLED CHEQUE")
        .input("doc_name", sql.VarChar(200), chequePath)
        .input("doc_status", sql.VarChar(100), "APPROVED")
        .input("doc_remark", sql.VarChar(sql.MAX), "CANCELLED CHEQUE")
        .input("source", sql.VarChar(500), "WEB")
        .query(`
          INSERT INTO emp_docs
            (emp_id, doc_type, doc_name, doc_status, doc_remark, source)
          OUTPUT INSERTED.id
          VALUES
            (@emp_id, @doc_type, @doc_name, @doc_status, @doc_remark, @source)
        `);

      const chequeId = chequeResult.recordset[0]?.id;

      if (chequeId != null) {
        savedDocumentIds.push(chequeId);
      }
    }
  }

  // Return actual records, not boolean true.
  const result = await pool
    .request()
    .input("emp_id", sql.Int, emp_id)
    .query(`
      SELECT
        id,
        emp_id AS empId,
        doc_type AS documentType,
        doc_name AS imagePath,
        doc_status AS status,
        doc_remark AS remark,
        source
      FROM emp_docs
      WHERE emp_id = @emp_id
      ORDER BY id
    `);

  logger.log("SAVED DOCUMENTS RESPONSE:", result.recordset);

  return result.recordset;
};


const toUpper = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim().toUpperCase();
};

// ======================================
// UPLOAD EMPLOYEE DOCUMENTS
// ======================================


const uploadEmployeeDocuments = async ({
  emp_id,
  emp_code,
  created_by,
  created_by_name,
  documents = [],
  files = [],
  cancelledChequeFile,
}) => {
  const pool = await poolPromise;

  const getDocumentFile = (doc, index) => {
    if (
      doc.fileIndex !== null &&
      doc.fileIndex !== undefined &&
      Number.isInteger(Number(doc.fileIndex))
    ) {
      return files[Number(doc.fileIndex)] || null;
    }

    return files[index] || null;
  };

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];

    if (!doc.documentType?.trim()) {
      continue;
    }

    const file = getDocumentFile(doc, i);

    let filePath = doc.imagePath || "";

    if (file && file.originalname !== "empty.txt") {
      filePath = `api/emp_docs/${file.filename}`;
    }

    const result = await pool
      .request()
      .input("emp_id", sql.Int, emp_id)
      .input("emp_code", sql.VarChar(100), emp_code || "")
      .input(
        "doc_type",
        sql.VarChar(100),
        toUpper(doc.documentType)
      )
      .input("doc_name", sql.VarChar(200), filePath)
      .input(
        "doc_status",
        sql.VarChar(100),
        toUpper(doc.status) || "PENDING"
      )
      .input(
        "doc_remark",
        sql.VarChar(sql.MAX),
        toUpper(doc.remark) || ""
      )
      .input("source", sql.VarChar(500), "WEB")
      .input("created_by", sql.Int, created_by)
      .input("active", sql.Bit, 0)
      .query(`
        INSERT INTO emp_docs (
          emp_id,
          emp_code,
          doc_type,
          doc_name,
          doc_status,
          doc_remark,
          source,
          created_by,
          created_on,
          active
        )
        OUTPUT INSERTED.id
        VALUES (
          @emp_id,
          @emp_code,
          @doc_type,
          @doc_name,
          @doc_status,
          @doc_remark,
          @source,
          @created_by,
          FORMAT(
            DATEADD(MINUTE, 330, GETUTCDATE()),
            'yyyy-MM-dd HH:mm:ss'
          ),
          @active
        )
      `);

    console.log("Inserted document:", {
      id: result.recordset[0]?.id,
      documentType: doc.documentType,
      filePath,
      uploadedFile: file?.originalname,
    });
  }

  // Cancelled cheque
  if (cancelledChequeFile) {
    await pool
      .request()
      .input("emp_id", sql.Int, emp_id)
      .input("emp_code", sql.VarChar(100), emp_code || "")
      .input("doc_type", sql.VarChar(100), "CANCELLED CHEQUE")
      .input(
        "doc_name",
        sql.VarChar(200),
        `emp_docs/${cancelledChequeFile.filename}`
      )
      .input("doc_status", sql.VarChar(100), "APPROVED")
      .input("doc_remark", sql.VarChar(500), "CANCELLED CHEQUE")
      .input("source", sql.VarChar(500), "WEB")
      .input("created_by", sql.Int, created_by)
      .input("active", sql.Bit, 0)
      .query(`
        INSERT INTO emp_docs (
          emp_id,
          emp_code,
          doc_type,
          doc_name,
          doc_status,
          doc_remark,
          source,
          created_by,
          created_on,
          active
        )
        VALUES (
          @emp_id,
          @emp_code,
          @doc_type,
          @doc_name,
          @doc_status,
          @doc_remark,
          @source,
          @created_by,
          FORMAT(
            DATEADD(MINUTE, 330, GETUTCDATE()),
            'yyyy-MM-dd HH:mm:ss'
          ),
          @active
        )
      `);
  }

  // Return actual saved records.
  const savedResult = await pool
    .request()
    .input("emp_id", sql.Int, emp_id)
    .query(`
      SELECT
        id,
        emp_id AS empId,
        doc_type AS documentType,
        doc_name AS imagePath,
        doc_status AS status,
        doc_remark AS remark
      FROM emp_docs
      WHERE emp_id = @emp_id
      ORDER BY id
    `);

  return savedResult.recordset;
};


// ======================================
// GET EMPLOYEE OFFER DATA
// ======================================

const getEmployeeOfferData = async (id) => {
  try {
    const pool = await poolPromise;

    // ======================================
    // EMPLOYEE + COMPANY + BRANCH
    // ======================================

    const empResult = await pool
      .request()
      .input("id", sql.Int, id)
      .query(`
        SELECT
          e.id,
          e.employee_code,
          e.first_name,
          e.last_name,
          e.rank,
          e.basic_salary,
          e.client_id,
          e.department,
          e.date_of_joining,
          e.site_hours,
          e.site_name,
          e.client_name,
          e.shift_type,

          -- ==============================
          -- COMPANY
          -- ==============================
          e.company_id,
          c.company_name,
          c.logo AS company_logo,

          -- ==============================
          -- BRANCH
          -- ==============================
          e.branch_id,
          b.branch_name,
          b.address AS branch_address

        FROM employee e

        LEFT JOIN companies c
          ON TRY_CONVERT(INT, e.company_id) = c.id

        LEFT JOIN branch b
          ON TRY_CONVERT(
            INT,
            e.branch_id
          ) = b.id

        WHERE e.id = @id
      `);

    const emp = empResult.recordset[0];

    if (!emp) {
      return {
        emp: null,
        client: null,
      };
    }

    // ======================================
    // CLIENT
    // ======================================

    let client = null;

    if (emp.client_id) {
      const clientResult = await pool
        .request()
        .input("client_id", sql.Int, emp.client_id)
        .query(`
          SELECT
            company_name,
            client_add,
            client_city,
            client_state,
            city_pincode
          FROM new_client
          WHERE id = @client_id
        `);

      client = clientResult.recordset[0] || null;
    }

    // ======================================
    // RETURN
    // ======================================

    return {
      emp,
      client,
    };

  } catch (error) {

    console.error(
      "getEmployeeOfferData Error:",
      error
    );

    throw error;
  }
};

const updateOfferLetterDetails = async ({
  emp_id,
  appointment_letter_img_path,
  offer_letter_ref_no,
}) => {
  const pool = await poolPromise;

  const result = await pool
    .request()

    .input("emp_id", emp_id)

    .input("appointment_letter_img_path", appointment_letter_img_path)

    .input("offer_letter_ref_no", offer_letter_ref_no).query(`

      UPDATE employee

      SET
        appointment_letter_img_path = @appointment_letter_img_path,
        offer_letter_ref_no = @offer_letter_ref_no

      WHERE id = @emp_id

    `);

  return result;
};

// ======================================
// EMPLOYEE DETAILS - 13/6/26 - update
// ======================================

const getEmployeeId = async (id) => {
  const pool = await poolPromise;

  const result = await pool
    .request()

    .input("id", sql.Int, id).query(`

          SELECT *
          FROM employee
          WHERE id = @id

        `);

  return result.recordset[0];
};

// ======================================
// DOCUMENTS - 13/6/26 - update
// ======================================

const getEmployeeDocument = async (id) => {
  const pool = await poolPromise;

  const result = await pool
    .request()

    .input("id", sql.Int, id).query(`

          SELECT *
          FROM emp_docs
          WHERE emp_id = @id
AND active = 0
          ORDER BY id DESC

        `);

  const formattedDocs = result.recordset.map((doc) => {
    let fullDocUrl = doc.doc_name || "";
    if (fullDocUrl && !fullDocUrl.startsWith("http")) {
      fullDocUrl = `${DOC_BASE_URL}${fullDocUrl.replace(/^\/?api\//, "")}`;
    }
    return { ...doc, doc_name: fullDocUrl };
  });

  return formattedDocs;
};

// ======================================
// EXPERIENCE - 13/6/26 - update
// ======================================

const getEmployeeExperience = async (id) => {
  const pool = await poolPromise;

  const result = await pool
    .request()

    .input("id", sql.Int, id).query(`

          SELECT *
          FROM emp_experience
          WHERE emp_id = @id

          ORDER BY id DESC

        `);

  return result.recordset;
};

// ======================================
// FAMILY - 13/6/26 - update
// ======================================

const getEmployeeFamily = async (id) => {
  const pool = await poolPromise;

  const result = await pool
    .request()

    .input("id", sql.Int, id).query(`

          SELECT *
          FROM emp_nominee
          WHERE emp_id = @id
 AND active = 0
          ORDER BY id DESC

        `);

  return result.recordset;
};

// ======================================
// EXPORTS
// ======================================

const deleteEmployeeExperience = async (id) => {
  const pool = await poolPromise;
  await pool.request()
    .input('id', sql.Int, id)
    .query("UPDATE emp_experience SET active = '1' WHERE id = @id");
};

module.exports = {
  deleteEmployeeExperience,
  createEmployee,
  getNextEmployeeCode,
  getAllEmployees,
  getEmployeeById,
  updateEmployee,
  updateEmployeeStatus,
  updateEmployeeSalary,
  deleteEmployee,
  restoreEmployee,
  exportEmployeesToExcel,
  createEmployeeNominee,
  exportEmployeesToExcel,
  getEmployeeId,
  getEmployeeDocument,
  getEmployeeExperience,
  getEmployeeFamily,
  getUserById,
  getEmployeeOfferData,
  createEmployeeExperience,
  updateOfferStatus,
  verifyEmployee,
  updateEmployeeDocuments,
  uploadEmployeeDocuments,
  updateOfferLetterPath,
  getEmployeeOfferData,
  updateOfferLetterDetails,
  getEmployeeDocuments,
  bulkInsertTempEmployees,
  getClientRateByCode,
  verifyEmployeeData,
  getTempEmployeeData,
  checkEmployeeCode,
  downloadEmployeeErrors,
  getEmployeeToDownload,
  deleteTempEmployeeByUser,
  addTempEmployee,
  verifyEmployeeData2,
  addEmpCodeInAllEmpTables,
  saveCardId,
  checkEmailExists,
  getEmployeesDropdown,
    updateEmployeeNominee,
  deleteEmployeeNominee,
  deleteEmployeeDocument,
  getFailedTempEmployees,
  saveEmployeeLoginCoordinates,
getUserCompanyBranch 
  // addTempEmployeeLog,
};


