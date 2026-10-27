const sql = require("mssql");
const { poolPromise } = require("../config/db");
const NewJoinee = require("../models/new_joinee_Model");
const clientModel = require("../models/clientModel");
// const createNewJoinee = async (req, res) => {
//   const pool = await poolPromise;
//   const transaction = new sql.Transaction(pool);
//   try {
//     await transaction.begin();
//     console.log(req.body);
//     const data = {
//       ...req.body,
//       date_of_joining: req.body.date_of_joining || req.body.joining_date,
//       phone1: req.body.phone1 || req.body.mobile,
//       emp_stages: req.body.emp_stages || req.body.emp_status,
//     };

//     // console.log(req.body.emp_status);
//     // console.log(req.body.emp_stages);
//     const userId = req.user.id;
//     try {
//       const userDetail = await clientModel.getUserById(userId);
//       console.log(userDetail);
//     } catch (error) {
//       console.log(error);
//     }
//     const emp_id = await NewJoinee.createEmployee(req, transaction);

//     await NewJoinee.createLog(emp_id, data, transaction);
//     // ðŸ‘‰ FILES HANDLING
//     const files = req.files;
//     console.log(files);

//     if (files) {
//       const docTypes = [
//         { key: "photo", type: "photo" },
//         { key: "aadhar_card", type: "aadhar_card" },
//         { key: "bank_detail", type: "bank_detail" },
//         { key: "resume", type: "resume" },
//         { key: "pan_card", type: "pan_card" },
//       ];

//       for (const doc of docTypes) {
//         if (files[doc.key]) {
//           await NewJoinee.insertDocs(
//             emp_id,
//             {
//               doc_type: doc.type,
//               doc_name: files[doc.key][0].filename,
//               created_by: req.body.created_by || 0,
//               created_by_name: req.body.created_by_name || "",
//               emp_code: req.body.emp_code || "",
//             },
//             transaction,
//           );
//         }
//       }
//     }

//     await transaction.commit();

//     res.json({
//       success: true,
//       message: "New Joinee Created Successfully",
//       emp_id,
//     });
//   } catch (error) {
//     console.error("Transaction Error:", error);
//     // Only rollback if the transaction was actually started
//     if (transaction) {
//       try {
//         await transaction.rollback();
//       } catch (rollbackError) {
//         console.error("Rollback failed:", rollbackError);
//       }
//     }
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

const createNewJoinee = async (req, res) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // 1. Fetch User Details safely using the transaction
    const userId = req.user.id;
    const userResult = await transaction
      .request()
      .input("id", sql.Int, userId)
      .query(`SELECT * FROM users WHERE id = @id`);

    const userDetail = userResult.recordset[0];
    if (!userDetail) {
      throw new Error("User not found");
    }
    // console.log("User details:", userDetail);

    // 2. Prepare Data
    const data = {
      ...req.body,
      // Use userDetail here if you need to pass user info to the model
      created_by: userDetail.id,
      created_by_name: userDetail.first_name,
      date_of_joining: req.body.date_of_joining || req.body.joining_date,
      phone1: req.body.phone1 || req.body.mobile,
      emp_stages: req.body.emp_stages || req.body.emp_status,
    };

    // 3. Pass the transaction and the enriched data to your model
    const emp_id = await NewJoinee.createEmployee(data, transaction);

    await NewJoinee.createLog(emp_id, data, transaction);

    // 4. Files Handling
    const files = req.files;
    if (files) {
      const docTypes = [
        { key: "photo", type: "photo" },
        { key: "aadhar_card", type: "aadhar_card" },
        { key: "bank_detail", type: "bank_detail" },
        { key: "resume", type: "resume" },
        { key: "pan_card", type: "pan_card" },
      ];

      for (const doc of docTypes) {
        if (files[doc.key]) {
          await NewJoinee.insertDocs(
            emp_id,
            {
              doc_type: doc.type,
              doc_name: files[doc.key][0].filename,
              created_by: userDetail.id,
              created_by_name: userDetail.first_name,
              emp_code: req.body.emp_code || "",
            },
            transaction,
          );
        }
      }
    }

    await transaction.commit();
    res.json({
      success: true,
      message: "New Joinee Created Successfully",
      emp_id,
    });
  } catch (error) {
    console.error("Transaction Error:", error);
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error(rollbackError);
      }
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAll = async (req, res) => {
  try {
    const data = await NewJoinee.getAllEmpTypes();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
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

module.exports = { createNewJoinee, getAll };
