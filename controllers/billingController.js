const billingModel = require("../models/billingModel");

// const getBillingFormat = async (req, res) => {
//   try {
//     const { client_id, site_id, month, year } = req.query;

//     const billInfo = await billingModel.getBillByClientSite(
//       client_id,
//       site_id,
//       month,
//       year
//     );

//     if (!billInfo.length) {
//       return res.status(404).json({
//         success: false,
//         message: "Bill not found",
//       });
//     }

//     const bill = billInfo[0];

//     const clientDetail = await billingModel.getClient(
//       bill.client_id
//     );

//     const siteDetail = await billingModel.getSite(
//       bill.rate_id
//     );

//     const companyDetail = await billingModel.getCompany(
//       clientDetail[0].billing_company_id
//     );

//     const empWages = await billingModel.getEmployeeWages(
//       bill.rate_id,
//       bill.invoice_month,
//       bill.invoice_year
//     );

//     const supportings = await billingModel.getSupportings(
//       bill.auto_no
//     );

//     const response = {
//       bill_info: bill,
//       client_detail: clientDetail,
//       site_detail: siteDetail,
//       company_detail: companyDetail,
//       emp_wages: empWages,
//       supportings: supportings,
//     };

//     res.json({
//       success: true,
//       data: response,
//     });

//   } catch (error) {
//     console.log(error);

//     res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };
const getBillingFormat = async (req, res) => {
  try {
    const { client_id, site_id, month, year } = req.query;

    const billInfo = await billingModel.getBillByClientSite(
      client_id,
      site_id,
      month,
      year,
    );

    if (!billInfo.length) {
      return res.status(404).json({
        success: false,
        message: "Bill not found",
      });
    }

    const bill = billInfo[0];

    // Convert joined ORDER data into orders array
    const orders = billInfo
      .filter((row) => row.order_id)
      .map((row) => ({
        id: row.order_id,
        client_id: row.order_client_id,
        unit_id: row.order_unit_id,
        type: row.order_type,

        invoice_no: row.order_invoice_no,
        auto_no: row.order_auto_no,

        invoice_month: row.order_invoice_month,
        invoice_year: row.order_invoice_year,

        total_nos: row.order_total_nos,
        cost_per_head: row.order_cost_per_head,
        total: row.order_total,

        status: row.order_status,
        invoice_date: row.order_invoice_date,

        service_charges_type: row.service_charges_type,
        service_charges: row.service_charges,

        no_of_days: row.no_of_days,

        emp_name: row.emp_name,
        emp_code: row.emp_code,
        sac_code: row.sac_code,

        tb_date: row.tb_date,
        tb_from: row.tb_from,
        tb_to: row.tb_to,
        lr_no: row.lr_no,
        tb_vehicle_no: row.tb_vehicle_no,
        tb_weight: row.tb_weight,
        tb_invoice_no: row.tb_invoice_no,

        source: row.order_source,
        client_name: row.order_client_name,
        site_name: row.order_site_name,
      }));

    const clientDetail = await billingModel.getClient(bill.client_id);

    const siteDetail = await billingModel.getSite(bill.rate_id);

    const companyDetail = await billingModel.getCompany(
      clientDetail[0].billing_company_id,
    );

    const empWages = await billingModel.getEmployeeWages(
      bill.rate_id,
      bill.invoice_month,
      bill.invoice_year,
    );

    const supportings = await billingModel.getSupportings(bill.auto_no);

    const response = {
      bill_info: bill,
      client_detail: clientDetail,
      site_detail: siteDetail,
      company_detail: companyDetail,

      // ORDER DATA
      orders: orders,

      // Existing data
      emp_wages: empWages,
      supportings: supportings,
    };

    console.log("Reponse Billing form", response);

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getBillingFormat,
};
