const sql = require("mssql");
const { poolPromise } = require("../config/db");
const clientModel = require("../models/clientModel");
const safe = (v) => {
  if (v === undefined || v === null) return "";

  if (typeof v === "string") {
    // Regex for basic email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // If it's an email, return as-is. Otherwise, convert to uppercase.
    return emailRegex.test(v) ? v : v.toUpperCase();
  }

  return v;
};

const getUserById = async (id) => {
  const pool = await poolPromise;

  const result = await pool.request().input("id", sql.Int, id).query(`
      SELECT *
      FROM users
      WHERE id = @id
    `);

  return result.recordset[0];
};

const NewJoinee = {
  // createEmployee: async (req, transaction) => {
  //   const request = new sql.Request(transaction);
  //   // const userDetail = await getUserById(req.user.id);
  //   // console.log(req.user);
  //   const data = req.body;
  //   const result = await request.query(`
  //     INSERT INTO employee (
  //       first_name,
  //       middle_name,
  //       last_name,
  //       gender,
  //       dob,
  //       date_of_joining,
  //       phone1,
  //       email_id,
  //       address,
  //       city,
  //       state,
  //       pincode,
  //       emp_stages,
  //       em_status,
  //       reference_name,
  //       reference_mobile,
  //       reference_relation,
  //       created_on
  //     )
  //     VALUES (
  //       '${safe(data.first_name)}',
  //       '${safe(data.middle_name)}',
  //       '${safe(data.last_name)}',
  //       '${safe(emp_full_name)}',
  //       '${safe(data.gender)}',
  //       '${safe(data.dob)}',
  //       '${safe(data.date_of_joining)}',
  //       '${safe(data.phone1)}',
  //       '${data.email}',
  //       '${safe(data.address)}',
  //       '${safe(data.city)}',
  //       '${safe(data.state)}',
  //       '${safe(data.pincode)}',
  //       '${safe("PENDING")}',
  //       '${safe("WORKING")}',
  //       '${safe(data.reference_name)}',
  //       '${safe(data.reference_mobile)}',
  //       '${safe(data.reference_relation)}',
  //       FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss')
  //     );
  //     SELECT SCOPE_IDENTITY() AS id;
  //   `);

  //   return result.recordset[0].id;
  // },

  createEmployee: async (data, transaction) => {
    const request = new sql.Request(transaction);

    // Logic for emp_full_name
    const emp_full_name = [
      safe(data.first_name),
      safe(data.middle_name),
      safe(data.last_name)
    ].filter(Boolean).join(" ");

    // Use .input() for every field to prevent SQL Injection
    // and handle potential undefined values safely
    const result = await request
      .input("first_name", sql.NVarChar, safe(data.first_name) || null)
      .input("middle_name", sql.NVarChar, safe(data.middle_name) || null)
      .input("last_name", sql.NVarChar, safe(data.last_name) || null)
      .input("emp_full_name", sql.NVarChar, emp_full_name || null)
      .input("gender", sql.NVarChar, safe(data.gender) || null)
      .input("dob", sql.Date, data.dob || null)
      .input("doj", sql.Date, data.date_of_joining || null)
      .input("phone", sql.NVarChar, data.phone1 || null)
      .input("email", sql.NVarChar, safe(data.email) || null)
      .input("address", sql.NVarChar, safe(data.address) || null)
      .input("city", sql.NVarChar, safe(data.city) || null)
      .input("state", sql.NVarChar, safe(data.state) || null)
      .input("pincode", sql.NVarChar, data.pincode || null)
      .input("ref_name", sql.NVarChar, safe(data.reference_name) || null)
      .input("ref_mobile", sql.NVarChar, data.reference_mobile || null)
      .input("ref_rel", sql.NVarChar, safe(data.reference_relation) || null)
      .input("department", sql.NVarChar, safe(data.department) || null)
      .input("rank", sql.NVarChar, safe(data.designation) || null)
      .input("bank_name", sql.NVarChar, safe(data.bank_name) || null)
      .input("account_no", sql.NVarChar, data.bank_no || null)
      .input("bank_ifsc", sql.NVarChar, data.bank_ifsc_code || null)
      .input("created_by", sql.NVarChar, data.created_by || null)
      .input("created_by_name", sql.NVarChar, data.created_by_name || null)
      .input("created_on", sql.NVarChar, "" || null).query(`
      INSERT INTO employee (
        first_name, middle_name, last_name, emp_full_name, gender, dob, 
        date_of_joining, phone1, email_id, address, city, 
        state, pincode, emp_stages, em_status, 
        reference_name, reference_mobile, reference_relation,
        department, rank, bank_name, account_no, bank_ifsc,
        created_by,created_by_name,created_on
      )
      VALUES (
        @first_name, @middle_name, @last_name, @emp_full_name, @gender, @dob, 
        @doj, @phone, @email, @address, @city, 
        @state, @pincode, 'PENDING', 'WORKING', 
        @ref_name, @ref_mobile, @ref_rel,
        @department, @rank, @bank_name, @account_no, @bank_ifsc,
        @created_by,@created_by_name, FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss')
      );
      SELECT SCOPE_IDENTITY() AS id;
    `);

    return result.recordset[0].id;
  },

  createLog: async (emp_id, data, transaction) => {
    const emp_full_name = [
      safe(data.first_name),
      safe(data.middle_name),
      safe(data.last_name)
    ].filter(Boolean).join(" ");
    const request = new sql.Request(transaction);

    return await request.query(`
      INSERT INTO employee_log (
        first_name,
        middle_name,
        last_name,
        emp_full_name,
        gender,
        dob,
        date_of_joining,
        phone1,
        email_id,
        address,
        city,
        state,
        pincode,
        emp_stages,
        em_status,
        reference_name,
        reference_mobile,
        reference_relation,
        activity_id,
        activity_remark,
        created_on
      )
      VALUES (
        '${safe(data.first_name)}',
        '${safe(data.middle_name)}',
        '${safe(data.last_name)}',
        '${safe(emp_full_name)}',
        '${safe(data.gender)}',
        '${safe(data.dob)}',
        '${safe(data.date_of_joining)}',
        '${safe(data.phone1)}',
        '${safe(data.email)}',
        '${safe(data.address)}',
        '${safe(data.city)}',
        '${safe(data.state)}',
        '${safe(data.pincode)}',
        '${safe(data.emp_stages || "PENDING")}',
        '${safe(data.emp_status || "WORKING")}',
        '${safe(data.reference_name)}',
        '${safe(data.reference_mobile)}',
        '${safe(data.reference_relation)}',
         ${emp_id},
        'new_joining',
        FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss')
      )
    `);
  },

  insertDocs: async (emp_id, data, transaction) => {
    const request = new sql.Request(transaction);

    let updateEmployeeLogoSql = "";
    if (data.doc_type === "photo") {
      updateEmployeeLogoSql = `
        UPDATE employee 
        SET employee_logo = 'api/emp_docs/${data.doc_name}' 
        WHERE id = ${emp_id};
      `;
    }

    return await request.query(`
      INSERT INTO emp_docs (
        emp_id,
        doc_type,
        doc_name,
        created_by,
        created_on,
        active,
        doc_remark,
        doc_status,
        emp_code,
        source
      )
      VALUES (
        ${emp_id},
        '${safe(data.doc_type)}',
        'api/emp_docs/${data.doc_name}',
        ${safe(data.created_by || 0)},
        FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss'),
        0,
        'new_joinee',
        'PENDING',
        '${safe(data.emp_code)}',
        'WEB'
      );
      ${updateEmployeeLogoSql}
    `);
  },
  getAllEmpTypes: async () => {
    const pool = await poolPromise;

    const result = await pool.request().query(`
    SELECT *
    FROM emp_type
    ORDER BY id DESC
  `);

    return result.recordset;
  },
};

module.exports = NewJoinee;
