const clientModel = require("../models/clientModel");
const { poolPromise, sql } = require("../config/db");
const logger = require("../utils/logger");
const num = (value) => {
  if (value === undefined || value === null || value === "" || isNaN(value)) {
    return 0;
  }
  return Number(value);
};
const safe = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
};

function getFormattedDateTime() {
  const d = new Date();

  const pad = (n) => String(n).padStart(2, "0");

  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    " " +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes()) +
    ":" +
    pad(d.getSeconds())
  );
}

// exports.createClient = async (req) => {
//   const pool = await poolPromise;

//   const transaction = new sql.Transaction(pool);

//   try {
//     await transaction.begin();

//     const createdBy = Number(req.user?.id || 0);

//     const data = req.body;

//     // =========================
//     // Duplicate Company
//     // =========================

//     const duplicateCompany = await clientModel.checkDuplicateCompany(
//       transaction,
//       data.companyName,
//     );

//     if (duplicateCompany.recordset.length > 0) {
//       await transaction.rollback();

//       throw new Error("Company name already exists");
//     }

//     // =========================
//     // Duplicate Email
//     // =========================

//     const duplicateEmail = await clientModel.checkDuplicateEmail(
//       transaction,
//       data.emailId,
//     );

//     if (duplicateEmail.recordset.length > 0) {
//       await transaction.rollback();

//       throw new Error("Email already exists");
//     }

//     // =========================
//     // Insert Client
//     // =========================

//     const clientResult = await clientModel.insertClient(
//       transaction,
//       data,
//       req,
//       createdBy,
//       getFormattedDateTime(),
//     );

//     const clientId = clientResult.recordset[0].id;

//     // =========================
//     // Insert Sites
//     // =========================

//     for (const site of data.sites || []) {
//       const countResult = await clientModel.getClientRateCount(transaction);

//       const total = countResult.recordset[0].total + 1;

//       const clientCode = `C${String(total).padStart(3, "0")}`;

//       await clientModel.insertSite(transaction, clientId, site, clientCode);
//     }

//     await transaction.commit();

//     return {
//       clientId,
//     };
//   } catch (error) {
//     if (transaction._aborted !== true) {
//       await transaction.rollback();
//     }

//     throw error;
//   }
// };

exports.createClient = async (req) => {
  const pool = await poolPromise;

  const transaction = new sql.Transaction(pool);

  try {
    // =========================
    // BEGIN TRANSACTION
    // =========================

    await transaction.begin();

    const createdBy = Number(req.user?.id || 0);

    const data = req.body;

    // =========================
    // DUPLICATE COMPANY CHECK
    // =========================

    const duplicateCompany = await clientModel.checkDuplicateCompany(
      transaction,
      data.companyName,
    );

    if (duplicateCompany.recordset.length > 0) {
      throw new Error("Company name already exists");
    }

    // =========================
    // DUPLICATE EMAIL CHECK
    // =========================

    const duplicateEmail = await clientModel.checkDuplicateEmail(
      transaction,
      data.emailId,
    );

    if (duplicateEmail.recordset.length > 0) {
      throw new Error("Email already exists");
    }

    // =========================
    // INSERT CLIENT
    // =========================

    const clientResult = await clientModel.insertClient(
      transaction,
      data,
      req,
      createdBy,
      getFormattedDateTime(),
    );

    const clientId = Number(clientResult.recordset[0].id);

    // =========================
    // INSERT SITES
    // =========================

    if (Array.isArray(data.sites)) {
      for (const site of data.sites) {
        const countResult = await clientModel.getClientRateCount(transaction);

        const total = Number(countResult.recordset[0].total) + 1;

        const clientCode = `C${String(total).padStart(3, "0")}`;

        await clientModel.insertSite(transaction, clientId, site, clientCode);
      }
    }

    // =========================
    // COMMIT
    // =========================

    await transaction.commit();

    return {
      success: true,
      clientId,
    };
  } catch (error) {
    console.log("CREATE CLIENT ERROR =>", error);

    // rollback only if transaction started
    if (transaction && transaction._aborted !== true) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.log("ROLLBACK ERROR =>", rollbackError.message);
      }
    }

    throw error;
  }
};

exports.addClientSite = async (req) => {
  const pool = await poolPromise;

  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    logger.success("TRANSACTION STARTED");

    const { clientId } = req.params;

    const { siteDetails } = req.body;

    const siteData = siteDetails || {};

    // =========================================
    // CHECK CLIENT EXISTS
    // =========================================

    const clientCheck = await clientModel.checkClientExists(
      transaction,
      clientId,
    );

    if (!clientCheck.recordset.length) {
      await transaction.rollback();

      throw new Error("Client not found");
    }

    // =========================================
    // GENERATE CLIENT CODE
    // =========================================

    const codeResult = await clientModel.getLastClientCode(transaction);

    const nextCode = (codeResult.recordset[0].maxCode || 0) + 1;

    const clientCode = "C" + String(nextCode).padStart(3, "0");

    // =========================================
    // QUERY PARAMS
    // =========================================

    const queryParams = {
      client_id: clientId,

      site_name: safe(siteData.siteName),

      work_order_no: safe(siteData.workOrderNo),

      client_code: clientCode,

      cc_contact_person: safe(siteData.contactPersonName),

      cc_address: safe(siteData.address),

      cc_billing_address: safe(siteData.billingAddress),

      cc_contactno: safe(siteData.contactNo),

      cc_emailid: safe(siteData.emailId),

      cc_city: safe(siteData.city),

      cc_state: safe(siteData.state),

      cc_country: safe(siteData.country),

      cc_location_name: safe(siteData.locationName),

      cc_sales_person: safe(siteData.salesPersonName),

      cc_sales_person_email: safe(siteData.salesPersonEmailId),

      cc_sales_person_phone: safe(siteData.salesPersonContactNo),

      cc_loct_Startdate: safe(siteData.locationStartDate),

      cc_bill_cycle_Date: safe(siteData.billCycleDate),

      cc_loct_status: safe(siteData.status),

      cc_expected_Date: safe(siteData.expectedDate),

      cc_cgst: num(siteData.cgst),

      cc_sgst: num(siteData.sgst),

      cc_igst: num(siteData.igst),

      cc_est_billing_amount: num(siteData.expectedBillingAmount),

      billing_nodays: num(siteData.daysForBilling),

      display_ot: siteData.viewOTHours ? 1 : 0,

      attach_wages: siteData.attachWagesSHeet ? 1 : 0,

      convert_decimal: siteData.roundOffAmount ? 1 : 0,

      bill_without_rank: siteData.billWithoutRank ? 1 : 0,

      non_compliance: siteData.nonComplianceSite ? 1 : 0,

      apply_leave: siteData.applyLeave ? 1 : 0,

      office_latitude: safe(siteData.officeLatitude),

      office_longitude: safe(siteData.officeLongitude),

      active: 0,

      company_id: req.user.company_id || 1,

      branch_id: req.user.branch_id || 1,

      modified_by: req.user.id || 1,
    };

    // =========================================
    // INSERT SITE
    // =========================================

    const insertResult = await clientModel.insertClientSite(
      transaction,
      queryParams,
    );

    const siteId = insertResult.recordset[0].id;

    await transaction.commit();

    return {
      siteId,
      clientCode,
    };
  } catch (error) {
    if (transaction._aborted !== true) {
      await transaction.rollback();
    }

    throw error;
  }
};
