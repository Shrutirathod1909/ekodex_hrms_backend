// const salaryWagesModel = require("../models/salary_wages_model");

// const getSalaryWagesSheet = async (req, res) => {
//   try {
//     const {
//       site_id,
//       month,
//       year,
//     } = req.body;

//     console.log("Salary Wages Request:", {
//       site_id,
//       month,
//       year,
//     });

//     if (!site_id || !month || !year) {
//       return res.status(400).json({
//         status: false,
//         message: "site_id, month and year are required",
//       });
//     }

//     const empWages = await salaryWagesModel.getSalaryWages(
//       site_id,
//       month,
//       year
//     );

//     console.log("Salary Wages Count:", empWages.length);

//     return res.status(200).json({
//       status: true,
//       message: "Salary wages sheet fetched successfully",
//       data: empWages,
//     });

//   } catch (error) {
//     console.log("Salary Wages Error:", error);

//     return res.status(500).json({
//       status: false,
//       message: "Internal Server Error",
//       error: error.message,
//     });
//   }
// };

// module.exports = {
//   getSalaryWagesSheet,
// };

const salaryWagesModel = require("../models/salary_wages_model");

const getSalaryWagesSheet = async (req, res) => {
  try {
    const {
      client_id,
      site_id,
      month,
      year
    } = req.body;

    // Validation
    if (!client_id || !site_id || !month || !year) {
      return res.status(400).json({
        status: false,
        message: "All fields are required",
      });
    }

    // Bill Info
    const billInfo =
      await salaryWagesModel.getBillByClientAndSite(
        client_id,
        site_id,
        month,
        year
      );

    // Employee Wages
    const empWages =
      await salaryWagesModel.getSalaryBySite(
        site_id,
        month,
        year
      );

    // Client Detail
    const clientDetail =
      await salaryWagesModel.getClientDetail(client_id);

    // Site Detail
    const clientRates =
      await salaryWagesModel.getClientRates(site_id);

    return res.status(200).json({
      status: true,
      message: "Salary wages sheet fetched successfully",
      data: {
        bill_info: billInfo,
        emp_wages: empWages,
        clientdetail: clientDetail,
        client_rates: clientRates,
        site_id,
        month,
        year,
      },
    });

  } catch (error) {
    console.log("Salary Wages Error:", error);

    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  getSalaryWagesSheet,
};


