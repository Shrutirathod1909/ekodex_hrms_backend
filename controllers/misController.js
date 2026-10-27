const misModel = require("../models/misModel");

exports.misReport = async (req, res) => {
  try {
    const {
      at_month,
      at_year,
      clientid,
      siteid,
    } = req.body;

    if (
      !at_month ||
      !at_year ||
      !clientid ||
      !siteid
    ) {
      return res.status(400).json({
        success: false,
        message:
          "at_month, at_year, clientid, siteid required",
      });
    }

    const billInfo =
      await misModel.getBillInfo(
        at_month,
        at_year,
        clientid,
        siteid
      );

    const empWages =
      await misModel.getEmpWagesTotal(
        at_month,
        at_year,
        clientid,
        siteid
      );

    const totalAdvance =
      await misModel.getTotalAdvance(
        at_month,
        at_year,
        clientid,
        siteid
      );

    const invoiceFromWages =
      Number(
        empWages?.totalinvoicevalue || 0
      );

    let invoiceValue =
      Math.round(invoiceFromWages);

    let cgst =
      Math.round(
        Number(empWages?.CGST || 0)
      );

    let sgst =
      Math.round(
        Number(empWages?.SGST || 0)
      );

    let igst =
      Math.round(
        Number(empWages?.IGST || 0)
      );

    let serviceCharge =
      Math.round(
        Number(
          empWages?.service_amount || 0
        )
      );

    if (invoiceValue === 0) {
      const bill =
        billInfo?.[0] || {};

      invoiceValue =
        Math.round(
          Number(
            bill?.total_cost_without_gst || 0
          )
        );

      cgst =
        Math.round(
          Number(bill?.cgst || 0)
        );

      sgst =
        Math.round(
          Number(bill?.sgst || 0)
        );

      igst =
        Math.round(
          Number(bill?.igst || 0)
        );

      if (bill?.auto_no) {
        const serviceData =
          await misModel.getServiceCharges(
            bill.auto_no
          );

        serviceCharge =
          Math.round(
            Number(
              serviceData?.service_charges || 0
            )
          );
      }
    }

    const taxValue =
      Math.round(
        cgst +
        sgst +
        igst
      );

    const salaryAmount =
      Math.round(
        Number(
          empWages?.salary_amount || 0
        )
      );

    const employerPF =
      Math.round(
        Number(
          empWages?.employer_pf_amount || 0
        )
      );

    const employeePF =
      Math.round(
        Number(
          empWages?.employee_pf_amount || 0
        )
      );

    const employerESIC =
      Math.round(
        Number(
          empWages?.employer_esic_amount || 0
        )
      );

    const employeeESIC =
      Math.round(
        Number(
          empWages?.employee_esic_amount || 0
        )
      );

    const ptAmount =
      Math.round(
        Number(
          empWages?.pt_amount || 0
        )
      );

    const otherExpense =
      Math.round(
        Number(
          totalAdvance?.totalexpense || 0
        )
      );

    const adminCharges =
      Math.round(
        (
          employerPF +
          employeePF
        ) * 0.01
      );

    const esicAmount =
      employerESIC;

    const balance =
      Math.round(
        invoiceValue
        - taxValue
        - salaryAmount
        - employerPF
        - employeeESIC
        - adminCharges
        - esicAmount
        - ptAmount
        - otherExpense
      );

    const netProfit =
      Math.round(
        balance +
        serviceCharge
      );

    const particulars = [
      {
        sr_no: 1,
        particulars: "INVOICE VALUE",
        amount: invoiceValue,
      },
      {
        sr_no: 2,
        particulars: "TAX VALUE",
        amount: taxValue,
      },
      {
        sr_no: 3,
        particulars: "SALARY AMOUNT",
        amount: salaryAmount,
      },
      {
        sr_no: 4,
        particulars: "EPF AMOUNT (EMPLOYER)",
        amount: employerPF,
      },
      {
        sr_no: 5,
        particulars: "EPF AMOUNT (EMPLOYEE)",
        amount: employeePF,
      },
      {
        sr_no: 6,
        particulars: "EPF ADMIN CHARGES",
        amount: adminCharges,
      },
      {
        sr_no: 7,
        particulars: "ESIC AMOUNT (EMPLOYER)",
        amount: employerESIC,
      },
      {
        sr_no: 8,
        particulars: "ESIC AMOUNT (EMPLOYEE)",
        amount: employeeESIC,
      },
      {
        sr_no: 9,
        particulars: "PT AMOUNT",
        amount: ptAmount,
      },
      {
        sr_no: 10,
        particulars: "ANY OTHER EXPENSES",
        amount: otherExpense,
      },
      {
        sr_no: 11,
        particulars: "BALANCE",
        amount: balance,
      },
      {
        sr_no: 12,
        particulars: "SERVICE CHARGE",
        amount: serviceCharge,
      },
      {
        sr_no: 13,
        particulars: "NET PROFIT",
        amount: netProfit,
      },
    ];

    return res.status(200).json({
      success: true,
      message: "MIS Report Data",
      base_amount: invoiceValue,
      gst_amount: taxValue,
      billInfo,
      empWages,
      totalAdvance,
      particulars,
    });

  } catch (err) {
    console.error(
      "MIS REPORT ERROR:",
      err
    );

    return res.status(500).json({
      success: false,
      message:
        err.message ||
        "Internal Server Error",
    });
  }
};

// const misModel = require("../models/misModel");

// exports.misReport = async (req, res) => {
//   try {
//     const {
//       at_month,
//       at_year,
//       clientid,
//       siteid,
//     } = req.body;

//     // ================= VALIDATION =================

//     if (
//       !at_month ||
//       !at_year ||
//       !clientid ||
//       !siteid
//     ) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "at_month, at_year, clientid, siteid required",
//       });
//     }

//     // ================= BILL INFO =================

//     const billInfo =
//       await misModel.getBillInfo(
//         at_month,
//         at_year,
//         clientid,
//         siteid
//       );

//     // ================= EMP WAGES =================

//     const empWages =
//       await misModel.getEmpWagesTotal(
//         at_month,
//         at_year,
//         clientid,
//         siteid
//       );

//     // ================= TOTAL ADVANCE =================

//     const totalAdvance =
//       await misModel.getTotalAdvance(
//         at_month,
//         at_year,
//         clientid,
//         siteid
//       );

//     // ================= CALCULATIONS =================

//     const invoiceValue =
//       Number(empWages?.totalinvoicevalue || 0);

//     const taxValue =
//       Number(empWages?.CGST || 0) +
//       Number(empWages?.SGST || 0) +
//       Number(empWages?.IGST || 0);

//     const salaryAmount =
//       Number(empWages?.gross_salary || 0);

//     const employerPF =
//       Number(empWages?.employer_pf_amount || 0);

//     const employeePF =
//       Number(empWages?.employee_pf_amount || 0);

//     const employerESIC =
//       Number(empWages?.employer_esic_amount || 0);

//     const employeeESIC =
//       Number(empWages?.employee_esic_amount || 0);

//     const ptAmount =
//       Number(empWages?.pt_amount || 0);

//     const otherExpense =
//       Number(totalAdvance?.totalexpense || 0);

//     const serviceCharge =
//       Number(empWages?.service_amount || 0);

//     // ================= TOTAL EXPENSE =================

//     const totalExpense =
//       salaryAmount +
//       employerPF +
//       employeePF +
//       employerESIC +
//       employeeESIC +
//       ptAmount +
//       otherExpense;

//     // ================= BALANCE =================

//     const balance =
//       invoiceValue - totalExpense;

//     // ================= NET PROFIT =================

//     const netProfit =
//       balance + serviceCharge;

//     // ================= PARTICULARS =================

//     const particulars = [
//       {
//         sr_no: 1,
//         particulars: "INVOICE VALUE",
//         amount: invoiceValue,
//       },
//       {
//         sr_no: 2,
//         particulars: "TAX VALUE",
//         amount: taxValue,
//       },
//       {
//         sr_no: 3,
//         particulars: "SALARY AMOUNT",
//         amount: salaryAmount,
//       },
//       {
//         sr_no: 4,
//         particulars: "EPF AMOUNT (EMPLOYER)",
//         amount: employerPF,
//       },
//       {
//         sr_no: 5,
//         particulars: "EPF AMOUNT (EMPLOYEE)",
//         amount: employeePF,
//       },
//       {
//         sr_no: 6,
//         particulars: "EPF ADMIN CHARGES",
//         amount: 0,
//       },
//       {
//         sr_no: 7,
//         particulars: "ESIC AMOUNT (EMPLOYER)",
//         amount: employerESIC,
//       },
//       {
//         sr_no: 8,
//         particulars: "ESIC AMOUNT (EMPLOYEE)",
//         amount: employeeESIC,
//       },
//       {
//         sr_no: 9,
//         particulars: "PT AMOUNT",
//         amount: ptAmount,
//       },
//       {
//         sr_no: 10,
//         particulars: "ANY OTHER EXPENSES",
//         amount: otherExpense,
//       },
//       {
//         sr_no: 11,
//         particulars: "BALANCE",
//         amount: balance,
//       },
//       {
//         sr_no: 12,
//         particulars: "SERVICE CHARGE",
//         amount: serviceCharge,
//       },
//       {
//         sr_no: 13,
//         particulars: "NET PROFIT",
//         amount: netProfit,
//       },
//     ];

//     // ================= RESPONSE =================

//     return res.status(200).json({
//       success: true,

//       message: "MIS Report Data",

//       base_amount: invoiceValue,

//       gst_amount: taxValue,

//       billInfo,

//       empWages,

//       totalAdvance,

//       particulars,
//     });

//   } catch (err) {
//     console.log("MIS REPORT ERROR:", err);

//     return res.status(500).json({
//       success: false,
//       message: err.message,
//     });
//   }
// };
