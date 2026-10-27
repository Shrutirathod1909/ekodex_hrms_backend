// const { poolPromise } = require("../config/db");

// const IdCardModel = {
//   // GET ALL EMPLOYEES
//   getAll: async () => {
//     const pool = await poolPromise;

//     const result = await pool.request().query(`
//       SELECT 
//         e.employee_code,
//         e.emp_full_name,
//         e.rank,
//         u.profile_image
//       FROM employee e
//       LEFT JOIN users u 
//         ON e.employee_code = u.emp_code
//     `);

//     return result.recordset;
//   },

//   // GET SINGLE EMPLOYEE
//   getByCode: async (emp_code) => {
//     const pool = await poolPromise;

//     const result = await pool.request().input("emp_code", emp_code).query(`
//         SELECT 
//           e.employee_code,
//           e.emp_full_name,
//           e.rank,
//           u.profile_image
//         FROM employee e
//         LEFT JOIN users u 
//           ON e.employee_code = u.emp_code
//         WHERE e.employee_code = @emp_code
//       `);

//     return result.recordset[0];
//   },
// };

// module.exports = IdCardModel;


const { poolPromise } = require("../config/db");

const IdCardModel = {

  // ==========================================
  // GET ALL EMPLOYEES
  // ==========================================
  getAll: async () => {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT 
        e.employee_code,
        e.emp_full_name,
        e.rank,

        -- USER
        u.profile_image,

        -- COMPANY
        c.id AS company_id,
        c.company_name,
        c.logo AS company_logo,

        -- BRANCH
        b.id AS branch_id,
        b.branch_name,
        b.address AS branch_address

      FROM employee e

      LEFT JOIN users u
        ON e.employee_code = u.emp_code

      LEFT JOIN companies c
        ON TRY_CONVERT(INT, e.company_id) = c.id

      LEFT JOIN branch b
        ON TRY_CONVERT(INT, e.branch_id) = b.id

      ORDER BY e.employee_code
    `);

    return result.recordset;
  },


  // ==========================================
  // GET SINGLE EMPLOYEE
  // ==========================================
  getByCode: async (emp_code) => {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("emp_code", emp_code)
      .query(`
        SELECT 
          e.employee_code,
          e.emp_full_name,
          e.rank,

          -- USER
          u.profile_image,

          -- COMPANY
          c.id AS company_id,
          c.company_name,
          c.logo AS company_logo,

          -- BRANCH
          b.id AS branch_id,
          b.branch_name,
          b.address AS branch_address

        FROM employee e

        LEFT JOIN users u
          ON e.employee_code = u.emp_code

        LEFT JOIN companies c
          ON TRY_CONVERT(INT, e.company_id) = c.id

        LEFT JOIN branch b
          ON TRY_CONVERT(INT, e.branch_id) = b.id

        WHERE e.employee_code = @emp_code
      `);

    return result.recordset[0];
  },
};

module.exports = IdCardModel;