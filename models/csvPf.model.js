// const { poolPromise } = require("../config/db");

// const CsvPfModel = {

//   async getPfData({ client_id, site_id, month, year }) {
//     try {

//       const pool = await poolPromise;

//       const result = await pool.request()
//         .input("client_id", client_id)
//         .input("site_id", site_id)
//         .input("month", month)
//         .input("year", year)
//         .query(`
//           SELECT 
//             e.uan_no,
//             e.emp_full_name,
//             ISNULL(w.earned_gross,0) AS gross_wages,
//             ISNULL(w.esic_wages,0) AS esic_wages,
//             ISNULL(w.deduct_pf,0) AS ee,
//             ISNULL(w.emp_pf,0) AS er,
//             0 AS er_edli
//           FROM emp_wages w
//           LEFT JOIN employee e 
//             ON e.employee_code = w.emp_code
//           WHERE 
//             w.client_id = @client_id
//             AND w.site_id = @site_id
//             AND w.at_month = @month
//             AND w.at_year = @year
//         `);

//       console.log("csvPFData",result.recordset[0])

//       return result.recordset;

//     } catch (error) {
//       console.error("MODEL ERROR:", error);
//       throw error;
//     }
//   }

// };

// module.exports = CsvPfModel;

const { poolPromise, sql } = require("../config/db");

const CsvPfModel = {
  async getPfData({ client_id, site_id, month, year }) {
    try {
      const pool = await poolPromise;

      console.log("PF MODEL PARAMS:", {
        client_id,
        site_id,
        month,
        year,
      });

      const result = await pool
        .request()
        .input("client_id", sql.Int, Number(client_id))
        .input("site_id", sql.Int, Number(site_id))
        .input("month", sql.Int, Number(month))
        .input("year", sql.Int, Number(year))
        .query(`
          SELECT 
            e.uan_no,
            e.emp_full_name,
            ISNULL(w.earned_gross, 0) AS gross_wages,
            ISNULL(w.esic_wages, 0) AS esic_wages,
            ISNULL(w.deduct_pf, 0) AS ee,
            ISNULL(w.emp_pf, 0) AS er,
            0 AS er_edli
          FROM emp_wages w
          LEFT JOIN employee e 
            ON e.employee_code = w.emp_code
          WHERE 
            w.client_id = @client_id
            AND w.site_id = @site_id
            AND w.at_month = @month
            AND w.at_year = @year
        `);

      console.log(
        "PF ROW COUNT:",
        result.recordset.length
      );

      console.log(
        "PF DATA:",
        result.recordset
      );

      return result.recordset;

    } catch (error) {
      console.error(
        "MODEL ERROR:",
        error
      );

      throw error;
    }
  },
};

module.exports = CsvPfModel;