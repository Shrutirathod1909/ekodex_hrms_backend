const { sql, poolPromise, DOC_BASE_URL } = require("../config/db");
const xlsx = require("xlsx");
const logger = require("../utils/logger");
const { logAction } = require("../utils/auditLogger");
const { checkSuperadminProtection } = require("../utils/superadminProtection");
const {
  addClientId,
  addSiteId,
} = require("./superadminIdModel");
const safe = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
};

exports.exportClients = async (ids) => {
  const pool = await poolPromise;

  let query = `
      SELECT 
          id, company_name, contact_no, client_email, contact_person, 
          client_add, client_city, client_state, city_pincode, 
          client_gst_state_code, client_gst_no, bank_name, client_acc_no, 
          ifsc_code, bank_branch, bank_city, micr_code, sac_code, 
          other_info, terms, company_bank_name, billing_company, 
          billing_company_id, x_client_code
      FROM new_client
      WHERE 1=1
  `;

  // Only add the AND condition if ids exist and contain items
  if (Array.isArray(ids) && ids.length > 0) {
    // Sanitize and join IDs:
    // Ensure they are numbers to prevent SQL injection
    const idList = ids.map((id) => Number(id)).join(",");
    query += ` AND id IN (${idList})`;
  } else {
    // If no filter is applied, return active only.
    query += ` AND active = 0`;
  }

  query += ` ORDER BY id DESC`;

  const result = await pool.request().query(query);
  return result.recordset;
};

exports.getClientSites = async (clientId) => {
  const pool = await poolPromise;

  // ==========================
  // CLIENT RATES
  // ==========================
  const sitesResult = await pool.request().input("clientId", sql.Int, clientId)
    .query(`
      SELECT *
      FROM client_rates
      WHERE client_id = @clientId
      ORDER BY id DESC
    `);

  const sites = sitesResult.recordset;

  // ==========================
  // CLIENT OTHER INFO
  // ==========================
  const ratesResult = await pool.request().input("clientId", sql.Int, clientId)
    .query(`
      SELECT coi.*
      FROM client_other_info coi
      INNER JOIN client_rates cr
        ON coi.rate_id = cr.id
      WHERE cr.client_id = @clientId
    `);

  // ==========================
  // CLIENT SERVICE CHARGES
  // ==========================
  const chargesResult = await pool
    .request()
    .input("clientId", sql.Int, clientId).query(`
      SELECT csc.*
      FROM client_service_charges csc
      INNER JOIN client_rates cr
        ON csc.rate_id = cr.id
      WHERE cr.client_id = @clientId
    `);

  // ==========================
  // GROUP OTHER INFO BY RATE_ID
  // ==========================
  const ratesMap = {};

  ratesResult.recordset.forEach((rate) => {
    if (!ratesMap[rate.rate_id]) {
      ratesMap[rate.rate_id] = [];
    }

    ratesMap[rate.rate_id].push({
      id: rate.id,
      empType: rate.emp_type,
      hours: rate.emp_hours,
      nos: rate.emp_nos,
      basic: rate.emp_basic,
      hra: rate.emp_basicda,
      da: rate.emp_da,
      specialAllowance: rate.special_allow,
      otherAllowance: rate.other_allow,
      lww: rate.lww,
      bonus: rate.bonus,
      gross: rate.emp_total_cost,
      serviceChargeType: rate.service_charges_type,
      serviceCharge: rate.service_charges,
      perDayRate: rate.emp_perday_rate,
      otRate: rate.ot_rate,
      leaveWages: rate.fixed_leave_wages,
      uniformWashing: rate.fixed_uniform_wages,
      anyOther: rate.any_other,
    });
  });

  // ==========================
  // GROUP SERVICE CHARGES BY RATE_ID
  // ==========================
  const chargesMap = {};

  chargesResult.recordset.forEach((charge) => {
    if (!chargesMap[charge.rate_id]) {
      chargesMap[charge.rate_id] = [];
    }

    chargesMap[charge.rate_id].push({
      id: charge.id,
      typeOfService: charge.type_of_services,
      countServices: charge.count_services,
      chargesServices: charge.charges_services,
      calculateOn: charge.ea_calculateon,
      operator: charge.ea_operator,
      compareValue: charge.ea_comp_operator,
      source: charge.source,
    });
  });

  // ==========================
  // FINAL RESPONSE
  // ==========================
  return sites.map((row) => {
    const siteRates = ratesMap[row.id] || [];

    // Attach service charges to each rate
    const ratesWithCharges = siteRates.map((rate) => ({
      ...rate,
      additionalCharges: chargesMap[row.id] || [],
    }));

    return {
      // Identification
      id: row.id,
      clientId: row.client_id,
      siteId: row.id,
      branchId: row.branch_id,
      companyId: row.company_id,
      siteName: row.site_name,
      clientCode: row.client_code,

      // Contact & Location
      contactPerson: row.cc_contact_person,
      address: row.cc_address,
      contactNo: row.cc_contactno,
      emailId: row.cc_emailid,
      city: row.cc_city,
      state: row.cc_state,
      pincode: row.cc_pincode,
      country: row.cc_country,
      locationName: row.cc_location_name,
      cc_branch_name: row.cc_branch_name,
      cc_site_hours: row.cc_site_hours,
      cc_total_manpower: row.cc_total_manpower,
      attendanceUploadType: row.attendance_upload_type,
      locationStartDate: row.cc_loct_Startdate,
      locationEndDate: row.cc_loct_Enddate,

      // Sales
      salesPerson: row.cc_sales_person,
      salesPersonEmail: row.cc_sales_person_email,
      salesPersonPhone: row.cc_sales_person_phone,

      // Billing
      billCycleDate: row.cc_bill_cycle_Date,
      expectedDate: row.cc_expected_Date,
      cgst: row.cc_cgst,
      sgst: row.cc_sgst,
      igst: row.cc_igst,
      estimatedBillingAmount: row.cc_est_billing_amount,
      billingAddress: row.cc_billing_address,
      billingNoDays: row.billing_nodays,

      // Settings
      status: row.cc_loct_status,
      active: row.active,
      displayOT: row.display_ot,
      divideBy: row.divide_by,
      attachWages: row.attach_wages,
      convertDecimal: row.convert_decimal,
      wagesHeader: row.wages_header,
      multiplyOTHours: row.multiply_ot_hours,
      calculateUniformDays: row.calculate_uniform_days,
      calculateEarnedGrossWithoutOT: row.calculate_earnedgross_withoutot,
      billWithoutRank: row.bill_without_rank,
      pfWagesCalculatedOn: row.pf_wages_calculated_on,
      esicWagesCalculatedOn: row.ESIC_wages_calculated_on,
      ctcCalculate: row.CTC_calculate,
      excludeWeekoffNetday: row.exclude_weekoff_netday,
      excludeHolidayNetday: row.exclude_holiday_netday,
      nonCompliance: row.non_compliance,
      applyLeave: row.apply_leave,

      // Meta
      workOrderNo: row.work_order_no,
      officeLatitude: row.office_latitude,
      officeLongitude: row.office_longitude,
      source: row.source,
      poNumber: row.po_number,
      contractAttachment: row.contract_attachment
        ? row.contract_attachment.includes("client_contracts")
          ? `${DOC_BASE_URL}${row.contract_attachment}`
          : `${DOC_BASE_URL}client_contracts/${row.contract_attachment}`
        : null,
      disabledBy: row.disabled_by,
      disabledOn: row.disabled_on,
      modifiedBy: row.modified_by,
      modifiedOn: row.modified_on,

      // Child Data
      rates: ratesWithCharges,
      additionalCharges: chargesMap[row.id] || [],
    };
  });
};

exports.getUserById = async (id) => {
  const pool = await poolPromise;

  const result = await pool.request().input("id", sql.Int, id).query(`
      SELECT *
      FROM users
      WHERE id = @id
    `);

  return result.recordset[0];
};

exports.checkDuplicateCompany = async (transaction, companyName) => {
  return await new sql.Request(transaction).input(
    "company_name",
    sql.VarChar,
    safe(companyName),
  ).query(`
      SELECT TOP 1 id
      FROM new_client
      WHERE company_name = @company_name
      AND active = 0
    `);
};

exports.checkDuplicateEmail = async (transaction, emailId) => {
  return await new sql.Request(transaction).input(
    "client_email",
    sql.VarChar,
    safe(emailId),
  ).query(`
      SELECT TOP 1 id
      FROM new_client
      WHERE client_email = @client_email
      AND active = 0
    `);
};

exports.insertClient = async (transaction, data, req, createdBy, createdOn) => {
  const request = new sql.Request(transaction);

  request
    .input("company_name", sql.VarChar, safe(data.companyName))
    .input("contact_person", sql.VarChar, safe(data.contactPersonName))
    .input("contact_no", sql.VarChar, safe(data.contactNo))
    .input("client_email", sql.VarChar, safe(data.emailId))
    .input("created_by", sql.Int, createdBy)
    .input("created_on", sql.VarChar, createdOn);

  const insertResult = await request.query(`
    INSERT INTO new_client (
      company_name,
      contact_person,
      contact_no,
      client_email,
      created_by,
      created_on,
      active
    )
    VALUES (
      @company_name,
      @contact_person,
      @contact_no,
      @client_email,
      @created_by,
      @created_on,
      0
    );

    SELECT SCOPE_IDENTITY() AS id;
  `);
  const insertClient = insertResult.recordset[0];
  await logAction("new_client", insertClient.id, "CREATE");
  return insertResult;
};

exports.getClientRateCount = async (transaction) => {
  return await new sql.Request(transaction).query(`
      SELECT COUNT(*) AS total
      FROM client_rates
    `);
};

exports.insertSite = async (transaction, clientId, site, clientCode) => {
  const result = await new sql.Request(transaction)
    .input("client_id", sql.Int, clientId)
    .input("site_name", sql.VarChar, safe(site.siteName))
    .input("work_order_no", sql.VarChar, safe(site.workOrderNo))
    .input("client_code", sql.VarChar, safe(clientCode)).query(`
      INSERT INTO client_rates (
        client_id,
        site_name,
        work_order_no,
        client_code,
        active
      )
      VALUES (
        @client_id,
        @site_name,
        @work_order_no,
        @client_code,
        0
      );

      SELECT SCOPE_IDENTITY() AS id;
    `);
  const createSite = result.recordset[0];
  if (createSite && createSite.id) {
    await logAction("client_rates", createSite.id, "CREATE");
  }
  return result;
};

// =========================================
// CHECK CLIENT
// =========================================

exports.checkClientExists = async (transaction, clientId) => {
  return await new sql.Request(transaction).input("clientId", sql.Int, clientId)
    .query(`
      SELECT TOP 1 id
      FROM new_client
      WHERE id = @clientId
      AND active = 0
    `);
};

// =========================================
// GET LAST CLIENT CODE
// =========================================

exports.getLastClientCode = async (transaction) => {
  return await new sql.Request(transaction).query(`
      SELECT MAX(
        CAST(
          SUBSTRING(client_code, 2, 10)
          AS INT
        )
      ) AS maxCode
      FROM client_rates
    `);
};

// =========================================
// INSERT SITE
// =========================================

exports.insertClientSite = async (transaction, data) => {
  return await new sql.Request(transaction)

    // BASIC
    .input("client_id", sql.Int, data.client_id)
    .input("site_name", sql.VarChar, data.site_name)
    .input("work_order_no", sql.VarChar, data.work_order_no)
    .input("client_code", sql.VarChar, data.client_code)

    // CONTACT
    .input("cc_contact_person", sql.VarChar, data.cc_contact_person)
    .input("cc_address", sql.VarChar, data.cc_address)
    .input("cc_billing_address", sql.VarChar, data.cc_billing_address)
    .input("cc_contactno", sql.VarChar, data.cc_contactno)
    .input("cc_emailid", sql.VarChar, data.cc_emailid)
    .input("cc_city", sql.VarChar, data.cc_city)
    .input("cc_state", sql.VarChar, data.cc_state)
    .input("cc_country", sql.VarChar, data.cc_country)
    .input("cc_location_name", sql.VarChar, data.cc_location_name)

    // SALES
    .input("cc_sales_person", sql.VarChar, data.cc_sales_person)
    .input("cc_sales_person_email", sql.VarChar, data.cc_sales_person_email)
    .input("cc_sales_person_phone", sql.VarChar, data.cc_sales_person_phone)

    // DATES
    .input("cc_loct_Startdate", sql.VarChar, data.cc_loct_Startdate)
    .input("cc_bill_cycle_Date", sql.VarChar, data.cc_bill_cycle_Date)
    .input("cc_loct_status", sql.VarChar, data.cc_loct_status)
    .input("cc_expected_Date", sql.VarChar, data.cc_expected_Date)

    // GST
    .input("cc_cgst", sql.Float, data.cc_cgst)
    .input("cc_sgst", sql.Float, data.cc_sgst)
    .input("cc_igst", sql.Float, data.cc_igst)
    .input("cc_est_billing_amount", sql.Float, data.cc_est_billing_amount)

    .input("billing_nodays", sql.Int, data.billing_nodays)

    // FLAGS
    .input("display_ot", sql.Bit, data.display_ot)
    .input("attach_wages", sql.Bit, data.attach_wages)
    .input("convert_decimal", sql.Bit, data.convert_decimal)
    .input("bill_without_rank", sql.Bit, data.bill_without_rank)
    .input("non_compliance", sql.Bit, data.non_compliance)
    .input("apply_leave", sql.Bit, data.apply_leave)

    // LOCATION
    .input("office_latitude", sql.VarChar, data.office_latitude)
    .input("office_longitude", sql.VarChar, data.office_longitude)

    // SYSTEM
    .input("active", sql.Bit, data.active)
    .input("company_id", sql.Int, data.company_id)
    .input("branch_id", sql.Int, data.branch_id)
    .input("modified_by", sql.Int, data.modified_by).query(`

      INSERT INTO client_rates (

        client_id,
        site_name,
        work_order_no,
        client_code,

        cc_contact_person,
        cc_address,
        cc_billing_address,
        cc_contactno,
        cc_emailid,
        cc_city,
        cc_state,
        cc_country,
        cc_location_name,

        cc_sales_person,
        cc_sales_person_email,
        cc_sales_person_phone,

        cc_loct_Startdate,
        cc_bill_cycle_Date,
        cc_loct_status,
        cc_expected_Date,

        cc_cgst,
        cc_sgst,
        cc_igst,
        cc_est_billing_amount,
        billing_nodays,

        display_ot,
        attach_wages,
        convert_decimal,
        bill_without_rank,

        non_compliance,
        apply_leave,

        office_latitude,
        office_longitude,

        active,
        company_id,
        branch_id,
        modified_by

      )

      VALUES (

        @client_id,
        @site_name,
        @work_order_no,
        @client_code,

        @cc_contact_person,
        @cc_address,
        @cc_billing_address,
        @cc_contactno,
        @cc_emailid,
        @cc_city,
        @cc_state,
        @cc_pincode,
        @cc_country,
        @cc_location_name,

        @cc_sales_person,
        @cc_sales_person_email,
        @cc_sales_person_phone,

        @cc_loct_Startdate,
        @cc_bill_cycle_Date,
        @cc_loct_status,
        @cc_expected_Date,

        @cc_cgst,
        @cc_sgst,
        @cc_igst,
        @cc_est_billing_amount,
        @billing_nodays,

        @display_ot,
        @attach_wages,
        @convert_decimal,
        @bill_without_rank,

        @non_compliance,
        @apply_leave,

        @office_latitude,
        @office_longitude,

        @active,
        @company_id,
        @branch_id,
        @modified_by

      );

      SELECT SCOPE_IDENTITY() AS id;

    `);
};

// models/clientModel.js

exports.createClient = async (data, user, attachment) => {
  console.log(user);
  const pool = await poolPromise;

  // Check unique client code
  if (data.clientcode) {
    const clientCodeCheck = await pool
      .request()
      .input("clientcode", sql.NVarChar, String(data.clientcode).toUpperCase())
      .query(`SELECT id FROM new_client WHERE x_client_code = @clientcode`);
    if (clientCodeCheck.recordset.length > 0) {
      throw new Error("Client code already exists.");
    }
  }

  // Check unique site id
  if (data.sites && data.sites.length > 0) {
    for (const site of data.sites) {
      if (site.site_id) {
        const siteIdCheck = await pool
          .request()
          .input("site_id", sql.NVarChar, String(site.site_id).toUpperCase())
          .query(`SELECT id FROM client_rates WHERE new_site_id = @site_id`);
        if (siteIdCheck.recordset.length > 0) {
          throw new Error(`Site ID '${site.site_id}' already exists.`);
        }
      }
    }
  }

  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // ==========================
    // BILLING COMPANY NAME
    // ==========================

    let billingCompanyName = "";

    if (data.billingCompany) {
      const billingResult = await transaction
        .request()
        .input("id", sql.Int, data.billingCompany).query(`
            SELECT company_name
            FROM companies
            WHERE id = @id
        `);

      if (billingResult.recordset.length > 0) {
        billingCompanyName = billingResult.recordset[0].company_name || "";
      }
    }

    // ==========================
// BILLING BRANCH NAME
// ==========================

const billingBranchId = data.billingBranch
  ? Number(data.billingBranch)
  : null;

let billingBranchName = "";

if (billingBranchId) {
  const branchResult = await transaction
    .request()
    .input("id", sql.BigInt, billingBranchId)
    .query(`
      SELECT branch_name
      FROM branch
      WHERE id = @id
    `);

  if (branchResult.recordset.length > 0) {
    billingBranchName =
      branchResult.recordset[0].branch_name || "";
  }
}
    // ==========================
    // INSERT NEW CLIENT
    // ==========================

    const clientInsert = await transaction
      .request()
      .input("company_name", sql.NVarChar, data.companyName ? String(data.companyName).toUpperCase() : "")
      .input("x_client_code", sql.NVarChar, data.clientcode ? String(data.clientcode).toUpperCase() : "")
      .input("contact_no", sql.NVarChar, data.contactNo || "")
      .input("client_email", sql.NVarChar, data.emailId ? String(data.emailId).toUpperCase() : "")
      .input("contact_person", sql.NVarChar, data.contactPersonName ? String(data.contactPersonName).toUpperCase() : "")
      .input("client_add", sql.NVarChar, data.address ? String(data.address).toUpperCase() : "")
      .input("client_city", sql.NVarChar, data.city ? String(data.city).toUpperCase() : "")
      .input("client_state", sql.NVarChar, data.state ? String(data.state).toUpperCase() : "")
      .input("city_pincode", sql.NVarChar, data.pincode || "")
      .input("client_gst_state_code", sql.NVarChar, data.gstStateCode ? String(data.gstStateCode).toUpperCase() : "")
      .input("client_gst_no", sql.NVarChar, data.gstNo ? String(data.gstNo).toUpperCase() : "")
      .input("bank_name", sql.NVarChar, data.bankName ? String(data.bankName).toUpperCase() : "")
      .input("client_acc_no", sql.NVarChar, data.accountNo || "")
      .input("ifsc_code", sql.NVarChar, data.ifscCode ? String(data.ifscCode).toUpperCase() : "")
      .input("bank_branch", sql.NVarChar, data.branch ? String(data.branch).toUpperCase() : "")
      .input("bank_city", sql.NVarChar, data.bankCity ? String(data.bankCity).toUpperCase() : "")
      .input("micr_code", sql.NVarChar, data.micrCode ? String(data.micrCode).toUpperCase() : "")
      .input("sac_code", sql.NVarChar, data.sacCode ? String(data.sacCode).toUpperCase() : "")
      .input("other_info", sql.NVarChar, data.otherInfo ? String(data.otherInfo).toUpperCase() : "")
      .input("terms", sql.NVarChar, data.termsAndConditions || "")
      .input("company_bank_name", sql.NVarChar, data.companyBankName ? String(data.companyBankName).toUpperCase() : "")
      .input("billing_company_id", sql.NVarChar, data.billingCompany || "")
      .input("billing_company", sql.NVarChar, billingCompanyName.toUpperCase())
      .input(
  "billing_branch_id",
  sql.BigInt,
  billingBranchId
)
.input(
  "billing_branch",
  sql.NVarChar(255),
  billingBranchName.toUpperCase()
)
      .input("source", sql.VarChar, "WEB")
 .input(
  "branch_id",
  sql.BigInt,
  billingBranchId
)
.input(
  "company_id",
  sql.Int,
  data.billingCompany ? Number(data.billingCompany) : null
)
      .input("created_by", sql.VarChar, user.id)
      .input("created_by_name", sql.VarChar, user.first_name).query(`
        INSERT INTO new_client
        (
          company_name,
          x_client_code,
          contact_no,
          client_email,
          contact_person,
          client_add,
          client_city,
          client_state,
          city_pincode,
          client_gst_state_code,
          client_gst_no,
          bank_name,
          client_acc_no,
          ifsc_code,
          bank_branch,
          bank_city,
          micr_code,
          sac_code,
          other_info,
          terms,
          company_bank_name,
          billing_company_id,
          billing_company,
          billing_branch_id,
billing_branch,
branch_id,
company_id,
          source,
          created_on,
          created_by,
          created_by_name
        )
        OUTPUT INSERTED.id
        VALUES
        (
          @company_name,
          @x_client_code,
          @contact_no,
          @client_email,
          @contact_person,
          @client_add,
          @client_city,
          @client_state,
          @city_pincode,
          @client_gst_state_code,
          @client_gst_no,
          @bank_name,
          @client_acc_no,
          @ifsc_code,
          @bank_branch,
          @bank_city,
          @micr_code,
          @sac_code,
          @other_info,
          @terms,
          @company_bank_name,
          @billing_company_id,
          @billing_company,
          @billing_branch_id,
@billing_branch,
@branch_id,
@company_id,
          @source,
          FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss'),
          @created_by,
          @created_by_name
        )
      `);

    const clientId = clientInsert.recordset[0].id;
await addClientId(clientId);
    const logResultClient = await logAction(
      "new_client",
      clientId,
      "CREATE",
      transaction,
    );
    // console.log(logResultClient)
    // ==========================
    // SITES LOOP
    // ==========================

    for (const site of data.sites || []) {
      const clientCodeResult = await transaction.request().query(`
            SELECT ISNULL(MAX(id),0)+1 AS nextCode
            FROM client_rates
        `);

      const clientCode = clientCodeResult.recordset[0].nextCode;

      // ==========================
      // CLIENT RATES
      // ==========================

      const rateInsert = await transaction
        .request()
        .input("client_id", sql.Int, clientId)
   
.input(
  "company_id",
  sql.Int,
  data.billingCompany ? Number(data.billingCompany) : null
)
.input(
  "branch_id",
  sql.BigInt,
  data.billingBranch ? Number(data.billingBranch) : null
)
        .input("cc_contact_person", sql.NVarChar, site.siteContactPerson || "")
        .input("site_name", sql.NVarChar, site.siteName || "")
        .input("work_order_no", sql.NVarChar, site.workOrderNo || "")
        .input("client_code", sql.NVarChar, data.clientcode || "")
        .input("cc_address", sql.NVarChar, site.siteAddress || "")
        .input("cc_billing_address", sql.NVarChar, site.billingAddress || "")
        .input("cc_contactno", sql.NVarChar, site.siteContactNo || "")
        .input("cc_emailid", sql.NVarChar, site.siteEmailId || "")
        .input("cc_city", sql.NVarChar, site.siteCity || "")
        .input("cc_state", sql.NVarChar, site.siteState || "")
        .input("cc_pincode", sql.NVarChar, site.sitePincode || "")
        .input("cc_country", sql.NVarChar, site.country || "")
        .input("cc_location_name", sql.NVarChar, site.sitezonename || "")
        .input("cc_branch_name", sql.NVarChar, site.cc_branch_name || "")
        .input("cc_site_hours", sql.NVarChar, site.cc_site_hours || "")
        .input("cc_total_manpower", sql.NVarChar, site.cc_total_manpower || "")
        .input(
  "attendance_upload_type",
  sql.NVarChar,
  site.attendanceUploadType || "",
)
        .input("cc_loct_Startdate", sql.Date, site.locationStartDate || null)
        .input("cc_loct_Enddate", sql.Date, site.locationEndDate || null)
        .input("cc_sales_person", sql.NVarChar, site.salesPersonName || "")
        .input(
          "cc_sales_person_email",
          sql.NVarChar,
          site.salesPersonEmailId || "",
        )
        .input(
          "cc_sales_person_phone",
          sql.NVarChar,
          site.salesPersonContactNo || "",
        )
        .input("cc_bill_cycle_Date", sql.NVarChar, site.billCycleDate || "")
        .input("cc_expected_Date", sql.Date, site.locationEndDate || null)
        .input("cc_loct_status", sql.NVarChar, site.status || "Active")
        .input("cc_cgst", sql.Decimal(18, 2), site.cgst || 0)
        .input("cc_sgst", sql.Decimal(18, 2), site.sgst || 0)
        .input("cc_igst", sql.Decimal(18, 2), site.igst || 0)
        .input(
          "cc_est_billing_amount",
          sql.Decimal(18, 2),
          site.expectedBillingAmount || 0,
        )
        .input("display_ot", sql.Bit, site.viewOTHours ? 1 : 0)
        .input("attach_wages", sql.Bit, site.attachWagesSHeet ? 1 : 0)
        .input("convert_decimal", sql.Bit, site.roundOffAmount ? 1 : 0)
        .input("bill_without_rank", sql.Bit, site.billWithoutRank ? 1 : 0)
        .input("non_compliance", sql.Bit, site.nonComplianceSite ? 1 : 0)
        .input("apply_leave", sql.Bit, site.applyLeave ? 1 : 0)
        .input("billing_nodays", sql.Int, site.daysForBilling || 0)
        .input("office_latitude", sql.NVarChar, site.latitude || "")
        .input("office_longitude", sql.NVarChar, site.longitude || "")
        .input("new_site_id", sql.NVarChar, site.site_id || "")
        .input("po_number", sql.NVarChar, site.ponumber || "")
        .input("source", sql.NVarChar, "WEB")
        .input("created_by", sql.NVarChar, user.id)
        .input("created_by_name", sql.NVarChar, user.first_name)
        .input("contract_attachment", sql.NVarChar, attachment).query(`
          INSERT INTO client_rates
          (
            client_id,
               company_id,
    branch_id,
            cc_contact_person,
            site_name,
            work_order_no,
            client_code,
            cc_address,
            cc_billing_address,
            cc_contactno,
            cc_emailid,
            cc_city,
            cc_state,
            cc_pincode,
            cc_country,
            cc_location_name,
            cc_branch_name,
            cc_site_hours,
            cc_total_manpower,
            attendance_upload_type,

            cc_loct_Startdate,
            cc_loct_Enddate,
            cc_sales_person,
            cc_sales_person_email,
            cc_sales_person_phone,
            cc_bill_cycle_Date,
            cc_expected_Date,
            cc_loct_status,
            cc_cgst,
            cc_sgst,
            cc_igst,
            cc_est_billing_amount,
            display_ot,
            attach_wages,
            convert_decimal,
            bill_without_rank,
            non_compliance,
            apply_leave,
            billing_nodays,
            office_latitude,
            office_longitude,
            new_site_id,
            po_number,
            source,
            created_by,
            created_on,
            created_by_name,
            contract_attachment
          )
          OUTPUT INSERTED.id
          VALUES
          (
            @client_id,
                @company_id,
    @branch_id,
            @cc_contact_person,
            @site_name,
            @work_order_no,
            @client_code,
            @cc_address,
            @cc_billing_address,
            @cc_contactno,
            @cc_emailid,
            @cc_city,
            @cc_state,
            @cc_pincode,
            @cc_country,
            @cc_location_name,
            @cc_branch_name,
            @cc_site_hours,
            @cc_total_manpower,
            @attendance_upload_type,

            @cc_loct_Startdate,
            @cc_loct_Enddate,
            @cc_sales_person,
            @cc_sales_person_email,
            @cc_sales_person_phone,
            @cc_bill_cycle_Date,
            @cc_expected_Date,
            @cc_loct_status,
            @cc_cgst,
            @cc_sgst,
            @cc_igst,
            @cc_est_billing_amount,
            @display_ot,
            @attach_wages,
            @convert_decimal,
            @bill_without_rank,
            @non_compliance,
            @apply_leave,
            @billing_nodays,
            @office_latitude,
            @office_longitude,
            @new_site_id,
            @po_number,
            @source,
            @created_by,
            FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss'),
            @created_by_name,
            @contract_attachment
          )
        `);

      const rateId = rateInsert.recordset[0].id;
      await addSiteId(rateId);
      await logAction("client_rates", rateId, "CREATE", transaction);
      // ==========================
      // CLIENT OTHER INFO
      // ==========================

      for (const rate of site.rates || []) {
        const insertRate = await transaction
          .request()
          .input("client_id", sql.Int, clientId)
          .input("rate_id", sql.Int, rateId)

          .input("emp_type", sql.NVarChar, rate.empType || "")
          .input("emp_hours", sql.Decimal(18, 2), Number(rate.hours || 0))
          .input("emp_nos", sql.Int, Number(rate.nos || 0))

          .input("emp_basic", sql.Decimal(18, 2), Number(rate.basic || 0))
          .input("emp_basicda", sql.Decimal(18, 2), Number(rate.hra || 0))
          .input("emp_da", sql.Decimal(18, 2), Number(rate.da || 0))

          .input(
            "special_allow",
            sql.Decimal(18, 2),
            Number(rate.specialAllowance || 0),
          )

          .input(
            "other_allow",
            sql.Decimal(18, 2),
            Number(rate.otherAllowance || 0),
          )

          .input("lww", sql.Decimal(18, 2), Number(rate.lww || 0))
          .input("bonus", sql.Decimal(18, 2), Number(rate.bonus || 0))

          .input("emp_total_cost", sql.Decimal(18, 2), Number(rate.gross || 0))

          .input(
            "service_charges_type",
            sql.NVarChar,
            rate.serviceChargeType || "",
          )

          .input(
            "service_charges",
            sql.Decimal(18, 2),
            Number(rate.serviceCharge || 0),
          )

          .input(
            "emp_perday_rate",
            sql.Decimal(18, 2),
            Number(rate.perDayRate || 0),
          )

          .input("ot_rate", sql.Decimal(18, 2), Number(rate.otRate || 0))

          .input(
            "fixed_leave_wages",
            sql.Decimal(18, 2),
            Number(rate.leaveWages || 0),
          )

          .input("created_by", sql.NVarChar, user.id)
          .input("created_by_name", sql.NVarChar, user.first_name)

          .input(
            "fixed_uniform_wages",
            sql.Decimal(18, 2),
            Number(rate.uniformWashing || 0),
          )

          .input("any_other", sql.Decimal(18, 2), Number(rate.anyOther || 0))
          .query(`
            INSERT INTO client_other_info
            (
                client_id,
                rate_id,
                emp_type,
                emp_hours,
                emp_nos,
                emp_basic,
                emp_basicda,
                emp_da,
                special_allow,
                other_allow,
                lww,
                bonus,
                emp_total_cost,
                service_charges_type,
                service_charges,
                emp_perday_rate,
                ot_rate,
                fixed_leave_wages,
                fixed_uniform_wages,
                any_other,
                created_by,
                created_on,
                created_by_name
            )
            OUTPUT INSERTED.id
            VALUES
            (
                @client_id,
                @rate_id,
                @emp_type,
                @emp_hours,
                @emp_nos,
                @emp_basic,
                @emp_basicda,
                @emp_da,
                @special_allow,
                @other_allow,
                @lww,
                @bonus,
                @emp_total_cost,
                @service_charges_type,
                @service_charges,
                @emp_perday_rate,
                @ot_rate,
                @fixed_leave_wages,
                @fixed_uniform_wages,
                @any_other,
                @created_by,
                FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss'),
                @created_by_name
            )
        `);
        const otherInfoId = insertRate.recordset[0].id;

        await logAction(
          "client_other_info",
          otherInfoId,
          "CREATE",
          transaction,
        );

      }

      // ==========================
      // CLIENT SERVICE CHARGES (otherCharges)
      // ==========================
      if (site.otherCharges && site.otherCharges.length > 0) {
        for (const charge of site.otherCharges) {
          if (!charge.serviceType && !charge.charges) continue; // skip empty rows

          const insertCharges = await transaction
            .request()
            .input("client_id", sql.Int, clientId)
            .input("rate_id", sql.Int, rateId)
            .input("type_of_services", sql.NVarChar, charge.serviceType || "")
            .input("count_services", sql.NVarChar, charge.chargesType || "Rs")
            .input(
              "charges_services",
              sql.Decimal(18, 2),
              Number(charge.charges || 0),
            )
            .input("ea_calculateon", sql.NVarChar, charge.calculateOn?.toUpperCase() || "")
            .input("ea_operator", sql.NVarChar, charge.condition?.toUpperCase() || "")
            .input("ea_comp_operator", sql.NVarChar, charge.amountRange || "")
            .input("created_by", sql.NVarChar, user.id)
            .input("created_by_name", sql.NVarChar, user.first_name)
            .input("source", sql.NVarChar, "WEB").query(`
                INSERT INTO client_service_charges
                (
                  client_id,
                  rate_id,
                  type_of_services,
                  count_services,
                  charges_services,
                  ea_calculateon,
                  ea_operator,
                  ea_comp_operator,
                  source,
                  created_by,
                  created_on,
                  created_by_name
                )
                  OUTPUT INSERTED.id
                VALUES
                (
                  @client_id,
                  @rate_id,
                  @type_of_services,
                  @count_services,
                  @charges_services,
                  @ea_calculateon,
                  @ea_operator,
                  @ea_comp_operator,
                  @source,
                  @created_by,
                FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss'),
                  @created_by_name
                )
              `);

          const serviceChargeId = insertCharges.recordset[0].id;

          await logAction(
            "client_service_charges",
            serviceChargeId,
            "CREATE",
            transaction,
          );
        }
      }
    }

    await transaction.commit();
    return {
      success: true,
      clientId,
    };
  } catch (error) {
    console.error("CREATE CLIENT ERROR:", error);
    await transaction.rollback();
    throw error;
  }
};

exports.getClientDetailsById = async (clientId) => {
  const pool = await poolPromise;

  try {
    // ==========================
    // CLIENT MASTER
    // ==========================
    const clientResult = await pool
      .request()
      .input("clientId", sql.Int, clientId).query(`
        SELECT *
        FROM new_client
        WHERE id = @clientId
      `);

    if (clientResult.recordset.length === 0) {
      throw new Error("Client not found");
    }

    const client = clientResult.recordset[0];

    // ==========================
    // SITES
    // ==========================
    const siteResult = await pool.request().input("clientId", sql.Int, clientId)
      .query(`
        SELECT *
        FROM client_rates
        WHERE client_id = @clientId
        ORDER BY id
      `);

    const sites = [];

    for (const site of siteResult.recordset) {
      // ==========================
      // RATES
      // ==========================
      const ratesResult = await pool
        .request()
        .input("clientId", sql.Int, clientId)
        .input("rateId", sql.Int, site.id).query(`
          SELECT *
          FROM client_other_info
          WHERE client_id = @clientId
          AND rate_id = @rateId
          ORDER BY id
        `);

      const rates = [];

      for (const rate of ratesResult.recordset) {
        // ==========================
        // ADDITIONAL CHARGES
        // ==========================
        const chargesResult = await pool
          .request()
          .input("clientId", sql.Int, clientId)
          .input("rateId", sql.Int, site.id).query(`
            SELECT *
            FROM client_service_charges
            WHERE client_id = @clientId
            AND rate_id = @rateId
            ORDER BY id
          `);

        rates.push({
          id: rate.id,
          empType: rate.emp_type,
          hours: rate.emp_hours,
          nos: rate.emp_nos,
          basic: rate.emp_basic,
          hra: rate.emp_basicda,
          da: rate.emp_da,
          specialAllowance: rate.special_allow,
          otherAllowance: rate.other_allow,
          lww: rate.lww,
          bonus: rate.bonus,
          gross: rate.emp_total_cost,
          serviceChargeType: rate.service_charges_type,
          serviceCharge: rate.service_charges,
          perDayRate: rate.emp_perday_rate,
          otRate: rate.ot_rate,
          leaveWages: rate.fixed_leave_wages,
          uniformWashing: rate.fixed_uniform_wages,
          anyOther: rate.any_other,

          additionalCharges: chargesResult.recordset.map((charge) => ({
            id: charge.id,
            typeOfService: charge.type_of_services,
            countServices: charge.count_services,
            chargesServices: charge.charges_services,
            calculateOn: charge.ea_calculateon,
            operator: charge.ea_operator,
            compareValue: charge.ea_comp_operator,
          })),
        });
      }

      // Fetch otherCharges (client_service_charges) for this site
      const siteChargesResult = await pool
        .request()
        .input("clientId", sql.Int, clientId)
        .input("siteId", sql.Int, site.id).query(`
          SELECT *
          FROM client_service_charges
          WHERE client_id = @clientId
          AND rate_id = @siteId
          ORDER BY id
        `);

      const otherCharges = siteChargesResult.recordset.map((charge) => ({
        id: charge.id,
        serviceType: charge.type_of_services,
        chargesType: charge.count_services,
        charges: charge.charges_services,
        calculateOn: charge.ea_calculateon,
        condition: charge.ea_operator,
        amountRange: charge.ea_comp_operator,
      }));

      sites.push({
        id: site.id,
        siteName: site.site_name,
        site_id: site.new_site_id,
        workOrderNo: site.work_order_no,

        siteContactPerson: site.cc_contact_person,
        siteContactNo: site.cc_contactno,
        siteEmailId: site.cc_emailid,

        siteAddress: site.cc_address,
        billingAddress: site.cc_billing_address,

        siteCity: site.cc_city,
        siteState: site.cc_state,
        sitePincode: site.cc_pincode,
        country: site.cc_country,

        sitezonename: site.cc_location_name,
        cc_branch_name: site.cc_branch_name,
        cc_site_hours: site.cc_site_hours,
        cc_total_manpower: site.cc_total_manpower,

        locationStartDate: site.cc_loct_Startdate,
        locationEndDate: site.cc_loct_Enddate,

        salesPersonName: site.cc_sales_person,
        salesPersonEmailId: site.cc_sales_person_email,
        salesPersonContactNo: site.cc_sales_person_phone,

        billCycleDate: site.cc_bill_cycle_Date,
        status: site.cc_loct_status,

        cgst: site.cc_cgst,
        sgst: site.cc_sgst,
        igst: site.cc_igst,

        expectedBillingAmount: site.cc_est_billing_amount,
        daysForBilling: site.billing_nodays,

        latitude: site.office_latitude,
        longitude: site.office_longitude,

        ponumber: site.po_number,
        contractAttachment: site.contract_attachment
          ? site.contract_attachment.includes("client_contracts")
            ? `${DOC_BASE_URL}${site.contract_attachment}`
            : `${DOC_BASE_URL}client_contracts/${site.contract_attachment}`
          : null,

        viewOTHours: !!site.display_ot,
        attachWagesSHeet: !site.attach_wages ? true : false,
        roundOffAmount: !site.convert_decimal ? true : false,
        billWithoutRank: !site.bill_without_rank ? true : false,
        nonComplianceSite: !site.non_compliance ? true : false,
        applyLeave: !site.apply_leave ? true : false,

        rates,
        otherCharges,
      });
    }

    return {
      success: true,
      data: {
        id: client.id,

        companyName: client.company_name,
        clientcode: client.x_client_code,

        contactPersonName: client.contact_person,
        contactNo: client.contact_no,
        emailId: client.client_email,

        address: client.client_add,
        city: client.client_city,
        state: client.client_state,
        pincode: client.city_pincode,

        gstStateCode: client.client_gst_state_code,
        gstNo: client.client_gst_no,
        sacCode: client.sac_code,

        billingCompany: {
          id: client.billing_company_id || "",
          name: client.billing_company || "",
        },
billingBranchId: client.billing_branch_id || "",
billingBranchName: client.billing_branch || "",
        bankName: client.bank_name,
        accountNo: client.client_acc_no,
        ifscCode: client.ifsc_code,
        micrCode: client.micr_code,
        branch: client.bank_branch,
        bankCity: client.bank_city,

        companyBankName: client.company_bank_name,

        otherInfo: client.other_info,
        termsAndConditions: client.terms,

        sites,
      },
    };
  } catch (error) {
    throw error;
  }
};

// exports.getAllClients = async (req) => {
//   logger.log("\n================ GET ALL CLIENTS START ================\n");

//   const { searchFields, fromDate, toDate } = req.query;

//   const pool = await poolPromise;

//   let whereClause = `
//     WHERE 1=1
//   `;

//   logger.log("\n================ AFTER ACTIVE ================\n");

//   const request = pool.request();

//   // =========================================
//   // SEARCH
//   // =========================================

//   if (searchFields) {
//     const fields = JSON.parse(searchFields);

//     fields.forEach((field, index) => {
//       const allowedFields = {
//         companyName: "c.company_name",
//         contactPersonName: "c.contact_person",
//         contactNo: "c.contact_no",
//         emailId: "c.client_email",
//         city: "c.client_city",
//         state: "c.client_state",
//         gstNo: "c.client_gst_no",
//       };

//       if (allowedFields[field.field] && field.keyword) {
//         const param = `search${index}`;

//         whereClause += `
//           AND ${allowedFields[field.field]}
//           LIKE @${param}
//         `;

//         request.input(param, `%${field.keyword}%`);
//       }
//     });
//   }

//   // =========================================
//   // DATE FILTER
//   // =========================================

//   if (fromDate && toDate) {
//     whereClause += `
//       AND CAST(c.created_on AS DATE)
//       BETWEEN @fromDate AND @toDate
//     `;

//     request.input("fromDate", fromDate);

//     request.input("toDate", toDate);
//   }

//   // =========================================
//   // MAIN QUERY
//   // =========================================

//   const result = await request.query(`

//     SELECT

//       c.id,
//       c.company_name,
//       c.contact_person,
//       c.contact_no,
//       c.client_email,
//       c.client_city,
//       c.client_state,
//       c.client_gst_no,
//       c.created_on,
//       c.modified_on,
//       c.x_client_code,
//       c.created_by_name,
//       c.modified_by_name,
//       c.disabled_by_name,
//       c.disabled_on,
//       c.billing_company AS billing_company_name,
//       c.active

//     FROM new_client c
//     ${whereClause}

//     ORDER BY c.id DESC

//   `);

//   logger.success("CLIENTS FETCHED => " + result.recordset.length);

//   // =========================================
//   // FORMAT RESPONSE
//   // =========================================

//   const formatted = result.recordset.map((client) => ({
//     _id: client.id,
//     companyName: client.company_name || "",
//     contactPersonName: client.contact_person || "",
//     contactNo: client.contact_no || "",
//     emailId: client.client_email || "",
//     x_client_code: client.x_client_code || "",
//     city: client.client_city || "",
//     state: client.client_state || "",
//     gstNo: client.client_gst_no || "",
//     billingCompany: client.billing_company_name || "",
//     companyBank: {
//       bankName: client.bank_name || "",
//       ifsc: client.bank_ifsc || "",
//     },
//     totalSites: client.totalSites || 0,
//     totalEmployees: client.totalEmployees || 0,
//     created_by_name: client.created_by_name || "",
//     created_on: client.created_on,
//     modified_on: client.modified_on,
//     modified_by_name: client.modified_by_name || "",
//     disabled_on: client.disabled_on || null,
//     disabled_by_name: client.disabled_by_name || "",
//     active: client.active,
//   }));

//   // logger.info(JSON.stringify(formatted, null, 2));

//   return formatted;
// };

exports.getAllClients = async (req) => {
  logger.log(
    "\n================ GET ALL CLIENTS START ================\n"
  );

  const { searchFields, fromDate, toDate } = req.query;

  const pool = await poolPromise;
  const request = pool.request();

  let whereClause = " WHERE 1 = 1 ";

  // =========================================
  // USER DETAILS
  // =========================================

  const userId = req.user?.id;
  const userRole = req.user?.role;
  const normalizedRole = userRole?.trim().toUpperCase();

  const isSuperAdmin =
    req.user?.is_superadmin === true ||
    Number(userId) === 1 ||
    ["SUPER ADMIN", "SUPERADMIN"].includes(normalizedRole);

  logger.log("Logged In User ID =>", userId);
  logger.log("Logged In User Role =>", userRole);
  logger.log("Is Super Admin =>", isSuperAdmin);

  // =========================================
  // ACCESS CONTROL
  // Super Admin: All clients
  // Admin: All clients of allotted companies
  // Employee: Assigned companies + branches
  // =========================================

  if (!isSuperAdmin) {
    if (!userId) {
      throw new Error("Authenticated user ID not found");
    }

    const userResult = await pool
      .request()
      .input("userId", userId)
      .query(`
        SELECT
          company_id,
          branch_id
        FROM users
        WHERE id = @userId
      `);

    const user = userResult.recordset[0];

    if (!user) {
      throw new Error("User not found");
    }

    // =========================================
    // COMPANY IDS
    // Supports values like "2,1"
    // =========================================

    const companyIds = String(user.company_id ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => /^\d+$/.test(id));

    logger.log("Assigned Company IDs =>", companyIds);

    if (companyIds.length === 0) {
      whereClause += " AND 1 = 0 ";
    } else {
      request.input("allottedCompanyIds", companyIds.join(","));

      const companyCondition = `
        (
          TRY_CAST(c.billing_company_id AS INT) IN (
            SELECT TRY_CAST(LTRIM(RTRIM(value)) AS INT)
            FROM STRING_SPLIT(@allottedCompanyIds, ',')
            WHERE TRY_CAST(LTRIM(RTRIM(value)) AS INT) IS NOT NULL
          )
          OR c.billing_company IN (
            SELECT company_name
            FROM companies
            WHERE id IN (
              SELECT TRY_CAST(LTRIM(RTRIM(value)) AS INT)
              FROM STRING_SPLIT(@allottedCompanyIds, ',')
              WHERE TRY_CAST(LTRIM(RTRIM(value)) AS INT) IS NOT NULL
            )
          )
        )
      `;

      // =========================================
      // EMPLOYEE: COMPANY + MULTIPLE BRANCHES
      // =========================================

      if (normalizedRole === "EMPLOYEE") {
        const branchIds = String(user.branch_id ?? "")
          .split(",")
          .map((id) => id.trim())
          .filter((id) => /^\d+$/.test(id));

        logger.log("Assigned Branch IDs =>", branchIds);

        if (branchIds.length === 0) {
          whereClause += " AND 1 = 0 ";
        } else {
          request.input("allottedBranchIds", branchIds.join(","));

          whereClause += `
            AND ${companyCondition}
            AND TRY_CAST(c.billing_branch_id AS INT) IN (
              SELECT TRY_CAST(LTRIM(RTRIM(value)) AS INT)
              FROM STRING_SPLIT(@allottedBranchIds, ',')
              WHERE TRY_CAST(LTRIM(RTRIM(value)) AS INT) IS NOT NULL
            )
          `;
        }
      } else {
        // =========================================
        // ADMIN: ASSIGNED COMPANIES
        // =========================================

        whereClause += ` AND ${companyCondition} `;
      }
    }
  }

  logger.log(
    "\n================ AFTER ACCESS CONDITION ================\n"
  );

  // =========================================
  // SEARCH FILTER
  // =========================================

  if (searchFields) {
    let fields = [];

    try {
      fields = JSON.parse(searchFields);

      if (!Array.isArray(fields)) {
        fields = [];
      }
    } catch (error) {
      throw new Error("Invalid searchFields JSON");
    }

    const allowedFields = {
      billingCompany: "c.billing_company",
      billingBranch: "c.billing_branch",
      companyName: "c.company_name",
      contactPersonName: "c.contact_person",
      contactNo: "c.contact_no",
      emailId: "c.client_email",
      city: "c.client_city",
      state: "c.client_state",
      gstNo: "c.client_gst_no",
    };

    fields.forEach((field, index) => {
      const column = allowedFields[field.field];

      if (
        column &&
        field.keyword !== undefined &&
        field.keyword !== null &&
        String(field.keyword).trim() !== ""
      ) {
        const param = `search${index}`;

        whereClause += `
          AND ${column} LIKE @${param}
        `;

        request.input(
          param,
          `%${String(field.keyword).trim()}%`
        );
      }
    });
  }

  // =========================================
  // DATE FILTER
  // =========================================

  if (fromDate && toDate) {
    whereClause += `
      AND CAST(c.created_on AS DATE)
      BETWEEN @fromDate AND @toDate
    `;

    request.input("fromDate", fromDate);
    request.input("toDate", toDate);
  }

  // =========================================
  // MAIN QUERY
  // =========================================

  const result = await request.query(`
    SELECT
      c.id,
      c.company_name,
      c.contact_person,
      c.contact_no,
      c.client_email,
      c.billing_company_id,
      c.billing_branch_id,
      c.client_city,
      c.client_state,
      c.client_gst_no,
      c.created_on,
      c.modified_on,
      c.x_client_code,

      -- Added fields
      c.created_by,
      c.modified_by,
      c.superadmin_status,

      c.created_by_name,
      c.modified_by_name,
      c.disabled_by_name,
      c.disabled_on,

      c.billing_company AS billing_company_name,
      c.billing_branch AS billing_branch_name,
      c.active

    FROM new_client c

    ${whereClause}

    ORDER BY c.id DESC
  `);

  logger.success(
    "CLIENTS FETCHED => " + result.recordset.length
  );

  // =========================================
  // FORMAT RESPONSE
  // =========================================

  const formatted = result.recordset.map((client) => ({
    _id: client.id,

    companyName: client.company_name || "",
    contactPersonName: client.contact_person || "",
    contactNo: client.contact_no || "",
    emailId: client.client_email || "",

    billing_company_id: client.billing_company_id,
    billing_branch_id: client.billing_branch_id,

    x_client_code: client.x_client_code || "",
    city: client.client_city || "",
    state: client.client_state || "",
    gstNo: client.client_gst_no || "",

    billingCompany: client.billing_company_name || "",
    billingBranch: client.billing_branch_name || "",

    companyBank: {
      bankName: client.bank_name || "",
      ifsc: client.bank_ifsc || "",
    },

    totalSites: client.totalSites || 0,
    totalEmployees: client.totalEmployees || 0,

    // Added user IDs and status
    created_by: client.created_by,
    modified_by: client.modified_by,
    superadmin_status: client.superadmin_status,

    // Existing audit details
    created_by_name: client.created_by_name || "",
    created_on: client.created_on,

    modified_on: client.modified_on,
    modified_by_name: client.modified_by_name || "",

    disabled_on: client.disabled_on || null,
    disabled_by_name: client.disabled_by_name || "",

    active: client.active,
  }));

  return formatted;
};


exports.getClientById = async (req) => {
  logger.log("\n================ GET CLIENT BY ID START ================\n");

  const { id } = req.params;

  logger.info("CLIENT ID => " + id);

  if (!id) {
    throw new Error("Client id is required");
  }

  const pool = await poolPromise;

  // =========================================
  // CLIENT QUERY
  // =========================================

  const clientQuery = `

    SELECT

      c.*,

      ISNULL(
        creator.fullname,
        ''
      ) AS created_by_name,

      ISNULL(
        billing.company_name,
        ''
      ) AS billing_company_name,

      ISNULL(
        bank.bank_name,
        ''
      ) AS comp_bank_name,

      ISNULL(
        bank.ifsc_code,
        ''
      ) AS bank_ifsc,

      ISNULL(
        bank.ac_no,
        ''
      ) AS bank_account_no

    FROM new_client c

    LEFT JOIN users creator
      ON TRY_CAST(
        c.created_by AS INT
      ) = creator.id

    LEFT JOIN new_client billing
      ON TRY_CAST(
        c.billing_company_id AS INT
      ) = billing.id

    LEFT JOIN company_bank_detail bank
      ON TRY_CAST(
        c.company_bank_name AS INT
      ) = bank.id

    WHERE c.id = @id
    AND c.active = 0

  `;

  logger.log("\n================ CLIENT QUERY ================\n");

  logger.info(clientQuery);

  const clientResult = await pool
    .request()

    .input("id", sql.Int, id)

    .query(clientQuery);

  logger.info("CLIENT RESULT => " + clientResult.recordset.length);

  if (!clientResult.recordset.length) {
    throw new Error("Client not found");
  }

  const client = clientResult.recordset[0];

  logger.success("CLIENT FOUND => " + client.company_name);

  // =========================================
  // SITES QUERY
  // =========================================

  const sitesQuery = `

    SELECT *

    FROM client_rates

    WHERE client_id = @clientId
    AND active = 0

    ORDER BY id DESC

  `;

  const sitesResult = await pool
    .request()

    .input("clientId", sql.Int, id)

    .query(sitesQuery);

  const sites = (sitesResult.recordset || []).map((s) => ({
    id: s.id,
    siteName: s.site_name || "",
    clientCode: s.client_code || "",
    workOrderNo: s.work_order_no || "",
    contactPersonName: s.cc_contact_person || "",
    address: s.cc_address || "",
    billingAddress: s.cc_billing_address || "",
    city: s.cc_city || "",
    state: s.cc_state || "",
    pincode: s.cc_pincode || "",
    country: s.cc_country || "",
    emailId: s.cc_emailid || "",
    contactNo: s.cc_contactno || "",
    cgst: s.cc_cgst || 0,
    sgst: s.cc_sgst || 0,
    igst: s.cc_igst || 0,
    billingAmount: s.cc_est_billing_amount || 0,
    locationName: s.cc_location_name || "",
    locationStartDate: s.cc_loct_Startdate ? String(s.cc_loct_Startdate).slice(0, 10) : "",
    locationEndDate: s.cc_loct_Enddate ? String(s.cc_loct_Enddate).slice(0, 10) : "",
    salesPerson: s.cc_sales_person || "",
    salesPersonEmail: s.cc_sales_person_email || "",
    salesPersonPhone: s.cc_sales_person_phone || "",
    billCycleDate: s.cc_bill_cycle_Date || "",
    branchName: s.cc_branch_name || "",
    siteHours: s.cc_site_hours || "",
    totalManpower: s.cc_total_manpower || "",
    status: s.cc_loct_status || "Active",
    viewOTHours: s.display_ot ?? 0,
    attachWagesSHeet: s.attach_wages ?? 0,
    roundOffAmount: s.convert_decimal ?? 0,
    billWithoutRank: s.bill_without_rank ?? 0,
    nonComplianceSite: s.non_compliance ?? 0,
    applyLeave: s.apply_leave ?? 0,
    billingNoDays: s.billing_nodays || 0,
    officeLatitude: s.office_latitude || "",
    officeLongitude: s.office_longitude || "",
    siteId: s.new_site_id || "",
    poNumber: s.po_number || "",
    contractAttachment: s.contract_attachment || "",
    modifiedBy: s.modified_by || "",
    modifiedOn: s.modified_on || "",
  }));

  // =========================================
  // FINAL RESPONSE
  // =========================================

  const responseData = {
    // BASIC INFO
    _id: client.id,
    companyName: client.company_name || "",
    contactNo: client.contact_no || "",
    emailId: client.client_email || "",
    contactPersonName: client.contact_person || "",
    address: client.client_add || "",
    city: client.client_city || "",
    state: client.client_state || "",
    pincode: client.city_pincode || "",
    // GST
    gstNo: client.client_gst_no || "",
    gstStateCode: client.client_gst_state_code || "",
    sacCode: client.sac_code || "",
    // BANK DETAILS
    bankDetails: {
      bankName: client.bank_name || "",
      accountNo: client.client_acc_no || "",
      ifsc: client.ifsc_code || "",
      branch: client.bank_branch || "",
      bankCity: client.bank_city || "",
      micrCode: client.micr_code || "",
    },

    // COMPANY BANK
    companyBank: {
      id: client.company_bank_name || "",
    },

    // BILLING COMPANY
    billingCompany: {
      id: client.billing_company_id || "",

      name: client.billing_company || "",
    },

    // EXTRA INFO
    termsAndConditions: client.terms || "",

    otherInfo: client.other_info || "",

    // SYSTEM INFO
    source: client.source || "",

    branchId: client.branch_id || "",

    companyId: client.company_id || "",

    createdBy: client.created_by || "",

    createdOn: client.created_on || "",

    modifiedBy: client.modified_by || "",

    modifiedOn: client.modified_on || "",

    // SITES
    sites,
  };

  logger.log("\n================ FINAL RESPONSE ================\n");

  logger.info(JSON.stringify(responseData, null, 2));

  return responseData;
};

// exports.getSitesByClientId = async (req) => {
//   logger.log(
//     "\n================ GET SITES BY CLIENT ID API START ================\n",
//   );

//   const { clientId } = req.params;

//   logger.info("CLIENT ID => " + clientId);

//   // =========================================
//   // VALIDATION
//   // =========================================

//   if (!clientId) {
//     throw new Error("clientId is required");
//   }

//   // =========================================
//   // DB CONNECTION
//   // =========================================

//   const pool = await poolPromise;

//   logger.success("DATABASE CONNECTED");

//   // =========================================
//   // QUERY
//   // =========================================

//   const getSitesQuery = `

//       SELECT *

//       FROM client_rates

//       WHERE client_id = @clientId
//       AND active = 0

//       ORDER BY site_name

//     `;

//   logger.log("\n================ GET SITES QUERY ================\n");

//   logger.info(getSitesQuery);

//   logger.info("QUERY PARAMS =>");

//   logger.info({
//     clientId,
//   });

//   // =========================================
//   // RAW SQL PREVIEW
//   // =========================================

//   const rawSQL = `

//       SELECT *

//       FROM client_rates

//       WHERE client_id = '${clientId}'
//       AND active = '0'

//       ORDER BY site_name

//     `;

//   logger.log("\n================ RAW SQL PREVIEW ================\n");

//   logger.info(rawSQL);

//   // =========================================
//   // EXECUTE QUERY
//   // =========================================

//   const result = await pool
//     .request()

//     .input("clientId", sql.Int, clientId)

//     .query(getSitesQuery);

//   logger.success("QUERY EXECUTED SUCCESSFULLY");

//   logger.info("TOTAL RECORDS => " + result.recordset.length);

//   logger.info("QUERY RESULT =>");

//   logger.info(JSON.stringify(result.recordset, null, 2));

//   // =========================================
//   // MAP DATA
//   // =========================================

//   const sites = (result.recordset || []).map((row) => ({
//     id: row.id,
//     site_id: row.id,
//     clientId: row.client_id,
//     // BASIC
//     siteName: row.site_name || "",
//     clientCode: row.client_code || "",
//     workOrderNo: row.work_order_no || "",
//     // CONTACT
//     contactPersonName: row.cc_contact_person || "",
//     address: row.cc_address || "",
//     billingAddress: row.cc_billing_address || "",
//     contactNo: row.cc_contactno || "",
//     emailId: row.cc_emailid || "",
//     // LOCATION
//     city: row.cc_city || "",
//     state: row.cc_state || "",
//     country: row.cc_country || "",
//     locationName: row.cc_location_name || "",
//     officeLatitude: row.office_latitude || "",
//     officeLongitude: row.office_longitude || "",
//     // SALES
//     salesPersonName: row.cc_sales_person || "",
//     salesPersonContactNo: row.cc_sales_person_phone || "",
//     salesPersonEmailId: row.cc_sales_person_email || "",
//     // DATE
//     locationStartDate: row.cc_loct_Startdate || "",
//     billCycleDate: row.cc_bill_cycle_Date || "",
//     status: row.cc_loct_status || "",
//     expectedDate: row.cc_expected_Date || "",
//     // GST
//     expectedBillingAmount: row.cc_est_billing_amount || 0,
//     billingDays: row.billing_nodays || 0,
//     cgst: row.cc_cgst || 0,
//     sgst: row.cc_sgst || 0,
//     igst: row.cc_igst || 0,
//     // FLAGS
//     displayOt: row.display_ot || false,
//     attachWages: row.attach_wages || false,
//     convertDecimal: row.convert_decimal || false,
//     billWithoutRank: row.bill_without_rank || false,
//     applyLeave: row.apply_leave || false,
//     nonCompliance: row.non_compliance || false,
//     // SYSTEM
//     active: row.active || 0,
//     companyId: row.company_id || "",
//     branchId: row.branch_id || "",
//     modifiedBy: row.modified_by || "",
//     modifiedOn: row.modified_on || "",
//     disabledBy: row.disabled_by || "",
//     disabledOn: row.disabled_on || "",
//     source: row.source || "",
//     // TITLE
//     title: `${row.site_name || ""}-${row.client_code || ""}`,
//   }));

//   logger.log("\n================ FINAL RESPONSE DATA ================\n");

//   logger.info(JSON.stringify(sites, null, 2));

//   logger.success("\n================ GET SITES SUCCESS ================\n");

//   return sites;
// };

// In clientModel.js

exports.getSitesByClientIds = async (clientIdsArray, billingCompanyId) => {
  if (!Array.isArray(clientIdsArray)) {
    throw new Error("clientIds must be an array");
  }

  if (clientIdsArray.length === 0) {
    return [];
  }

  const pool = await poolPromise;

  const placeholders = clientIdsArray
    .map((_, i) => `@cid${i}`)
    .join(",");

  const query = `
    SELECT *
    FROM client_rates
    WHERE client_id IN (${placeholders})
      AND billing_company_id = @billingCompanyId
      AND active = 0
    ORDER BY site_name
  `;

  const request = pool.request();

  clientIdsArray.forEach((id, i) => {
    request.input(`cid${i}`, sql.NVarChar, String(id));
  });

  request.input(
    "billingCompanyId",
    sql.NVarChar,
    String(billingCompanyId)
  );

  const result = await request.query(query);

  return result.recordset;
};


// exports.getSitesByClientIds = async (req, res) => {
//   logger.log(
//     "\n================ GET SITES BY CLIENT IDS API START ================\n",
//   );

//   // We now expect an array in the request body
//   const { clientIds } = req.query;

//   logger.info("CLIENT IDS => " + JSON.stringify(clientIds));

//   // =========================================
//   // VALIDATION
//   // =========================================
//   if (!clientIds || !Array.isArray(clientIds) || clientIds.length === 0) {
//     return res.status(400).json({ message: "clientIds array is required" });
//   }

//   try {
//     const pool = await poolPromise;
//     logger.success("DATABASE CONNECTED");

//     // =========================================
//     // QUERY (Using IN clause)
//     // =========================================
//     // We create a list of parameters for the SQL IN clause
//     const getSitesQuery = `
//       SELECT *
//       FROM client_rates
//       WHERE client_id IN (${clientIds.map((_, i) => `@cid${i}`).join(",")})
//       AND active = 0
//       ORDER BY site_name
//     `;

//     const request = pool.request();

//     // Dynamically add parameters for each ID
//     clientIds.forEach((id, i) => {
//       request.input(`cid${i}`, sql.Int, id);
//     });

//     const result = await request.query(getSitesQuery);

//     logger.success("QUERY EXECUTED SUCCESSFULLY");

//     // =========================================
//     // MAP DATA
//     // =========================================
//     const sites = (result.recordset || []).map((row) => ({
//       id: row.id,
//       site_id: row.id,
//       clientId: row.client_id, // Important: keep this to filter in frontend
//       siteName: row.site_name || "",
//       clientCode: row.client_code || "",
//       // ... include your other fields here
//       title: `${row.site_name || ""}-${row.client_code || ""}`,
//     }));

//     res.status(200).json({ data: sites });
//   } catch (error) {
//     logger.error("GET SITES BY CLIENT IDS ERROR", error);
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// };

// exports.getSitesByClientIds = async (req) => {
//   try {
//     logger.log(
//       "\n================ GET SITES BY CLIENT IDS API START ================\n",
//     );

//     const { clientId } = req.params;

//     // =========================================
//     // VALIDATION
//     // =========================================

//     logger.info("CLIENT ID => " + clientId);

//     if (!clientId) {
//       throw new Error("clientId is required");
//     }

//     // =========================================
//     // DATABASE CONNECTION
//     // =========================================

//     const pool = await poolPromise;

//     logger.success("DATABASE CONNECTED");

//     // =========================================
//     // QUERY
//     // =========================================

//     const getSitesQuery = `

//         SELECT DISTINCT

//           id,
//           site_name,
//           client_code

//         FROM client_rates

//         WHERE client_id = @clientId
//         AND active = '0'

//         ORDER BY site_name

//       `;

//     logger.log("\n================ GET SITES QUERY ================\n");

//     logger.info(getSitesQuery);

//     logger.info("QUERY PARAMS =>");

//     logger.info({
//       clientId,
//     });

//     // =========================================
//     // RAW SQL PREVIEW
//     // =========================================

//     const rawSQL = `

//         SELECT DISTINCT

//           id,
//           site_name,
//           client_code

//         FROM client_rates

//         WHERE client_id = '${clientId}'
//         AND active = 0

//         ORDER BY site_name

//       `;

//     logger.log("\n================ RAW SQL PREVIEW ================\n");

//     logger.info(rawSQL);

//     // =========================================
//     // EXECUTE QUERY
//     // =========================================

//     const result = await pool
//       .request()

//       .input("clientId", sql.Int, clientId)

//       .query(getSitesQuery);

//     logger.success("QUERY EXECUTED SUCCESSFULLY");

//     logger.info("TOTAL RECORDS => " + result.recordset.length);

//     logger.info("QUERY RESULT =>");

//     logger.info(JSON.stringify(result.recordset, null, 2));

//     // =========================================
//     // NO DATA FOUND
//     // =========================================

//     if (result.recordset.length === 0) {
//       logger.warn("NO BRANCHES FOUND FOR CLIENT ID => " + clientId);

//       return [];
//     }

//     // =========================================
//     // MAP DATA
//     // =========================================

//     const sitesData = result.recordset.map((row) => ({
//       id: row.id,

//       site_id: row.id,

//       site_name: row.site_name || "",

//       title: `${row.site_name || ""}-${row.client_code || ""}`,

//       client_code: row.client_code || "",
//     }));

//     logger.log("\n================ FINAL RESPONSE DATA ================\n");

//     logger.info(JSON.stringify(sitesData, null, 2));

//     logger.success(
//       `FOUND ${sitesData.length} BRANCHES FOR CLIENT ID => ${clientId}`,
//     );

//     logger.success("\n================ GET SITES SUCCESS ================\n");

//     return sitesData;
//   } catch (error) {
//     logger.error("\n================ GET SITES ERROR ================\n");

//     logger.error(error.message);

//     logger.error(error.stack);

//     throw error;
//   }
// };

exports.updateClientDetails = async (req) => {
  const { id } = req.params;
  await checkSuperadminProtection("new_client", id, req.user);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    logger.log(
      "\n================ UPDATE CLIENT DETAILS API START ================\n",
    );

    const userId = req.user.id;

    logger.info("CLIENT ID => " + id);

    logger.info("USER ID => " + userId);

    const {
      companyName,
      contactPersonName,
      contactNo,
      emailId,
      address,
      city,
      state,
      pincode,
      gstStateCode,
      gstNo,
      sacCode,
      billingCompany,
      billingCompanyId,
        billingBranchId,
  billingBranch,
      source,
      companyBankName,
      otherInfo,
      termsAndConditions,
    } = req.body;

    // =========================================
    // REQUEST BODY
    // =========================================

    logger.log("\n================ REQUEST BODY ================\n");

    logger.info(JSON.stringify(req.body, null, 2));

    // =========================================
    // START TRANSACTION
    // =========================================

    await transaction.begin();

    logger.success("TRANSACTION STARTED");

    // =========================================
    // DUPLICATE CHECK
    // =========================================

    logger.log("\n================ DUPLICATE CHECK ================\n");

    const duplicateQuery = `

        SELECT id

        FROM new_client

        WHERE active = 0

        AND (
          company_name = @companyName
          OR client_email = @emailId
        )

        AND id <> @id

      `;

    logger.info("DUPLICATE QUERY =>");

    logger.info(duplicateQuery);

    const duplicateParams = {
      id,

      companyName,

      emailId,
    };

    logger.info("DUPLICATE PARAMS =>");

    logger.info(JSON.stringify(duplicateParams, null, 2));

    const dup = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("companyName", sql.VarChar, companyName)
      .input("emailId", sql.VarChar, emailId)
      .query(duplicateQuery);
    logger.info("DUPLICATE RESULT =>");
    logger.info(dup.recordset);
    if (dup.recordset.length > 0) {
      logger.warn("DUPLICATE COMPANY NAME OR EMAIL FOUND");

      if (transaction._aborted !== true) {
        await transaction.rollback();
      }
      logger.warn("TRANSACTION ROLLBACK SUCCESS");
      throw new Error("Company name or Email already exists");
    }
    logger.success("NO DUPLICATE FOUND");

    // =========================================
    // UPDATE QUERY
    // =========================================

    logger.log("\n================ UPDATE CLIENT QUERY ================\n");

    const updateQuery = `
        UPDATE new_client
        SET
          company_name = @companyName,
          contact_person = @contactPersonName,
          contact_no = @contactNo,
          client_email = @emailId,
          client_add = @address,
          client_city = @city,
          client_state = @state,
          city_pincode = @pincode,
          client_gst_state_code = @gstStateCode,
          client_gst_no = @gstNo,
          sac_code = @sacCode,
          billing_company = @billingCompany,
          billing_company_id = @billingCompanyId,
          billing_branch_id = @billingBranchId,
billing_branch = @billingBranch,
company_id = @companyId,
branch_id = @branchId,
          source = @source,
          company_bank_name = @companyBankName,
          other_info = @otherInfo,
          terms = @termsAndConditions,
          modified_by = @userId,
          modified_on = FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss')

        WHERE id = @id

      `;

    logger.info("UPDATE QUERY =>");

    logger.info(updateQuery);

    // =========================================
    // QUERY PARAMS
    // =========================================

    const queryParams = {
      id,

      companyName: companyName || "",
      contactPersonName: contactPersonName || "",
      contactNo: contactNo || "",
      emailId: emailId || "",
      address: address || "",
      city: city || "",
      state: state || "",
      pincode: pincode || "",
      gstStateCode: gstStateCode || "",
      gstNo: gstNo || "",
      sacCode: sacCode || "",
      billingCompany: billingCompany || "",
      billingCompanyId: billingCompanyId || "",
      billingBranchId: billingBranchId ? Number(billingBranchId) : null,
billingBranch: billingBranch || "",
  companyId: billingCompanyId ? Number(billingCompanyId) : null,
  branchId: billingBranchId ? Number(billingBranchId) : null,
      source: source || "",
      companyBankName: companyBankName || "",
      otherInfo: otherInfo || "",
      termsAndConditions: termsAndConditions || "",
      userId,
    };

    logger.log("\n================ QUERY PARAMS ================\n");

    logger.info(JSON.stringify(queryParams, null, 2));

    // =========================================
    // RAW SQL PREVIEW
    // =========================================

    const rawSQL = `
        UPDATE new_client
        SET
          company_name = '${queryParams.companyName}',
          contact_person = '${queryParams.contactPersonName}',
          contact_no = '${queryParams.contactNo}',
          client_email = '${queryParams.emailId}',
          client_add = '${queryParams.address}',
          client_city = '${queryParams.city}',
          client_state = '${queryParams.state}',
          city_pincode = '${queryParams.pincode}',
          client_gst_state_code = '${queryParams.gstStateCode}',
          client_gst_no = '${queryParams.gstNo}',
          sac_code = '${queryParams.sacCode}',
          billing_company = '${queryParams.billingCompany}',
          billing_company_id = '${queryParams.billingCompanyId}',
          source = '${queryParams.source}',
          company_bank_name = '${queryParams.companyBankName}',
          other_info = '${queryParams.otherInfo}',
          terms = '${queryParams.termsAndConditions}',
          modified_by = '${queryParams.userId}',
          modified_on = FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss')

        WHERE id = '${queryParams.id}'

      `;

    logger.log("\n================ RAW SQL PREVIEW ================\n");

    logger.info(rawSQL);

    // =========================================
    // EXECUTE UPDATE
    // =========================================
logger.info("FINAL IDS => " + JSON.stringify({
  billingCompanyId: queryParams.billingCompanyId,
  billingBranchId: queryParams.billingBranchId,
  companyId: queryParams.companyId,
  branchId: queryParams.branchId,
}));
    const updateResult = await new sql.Request(transaction)
      .input("id", sql.Int, queryParams.id)
      .input("companyName", sql.VarChar, queryParams.companyName)
      .input("contactPersonName", sql.VarChar, queryParams.contactPersonName)
      .input("contactNo", sql.VarChar, queryParams.contactNo)
      .input("emailId", sql.VarChar, queryParams.emailId)
      .input("address", sql.VarChar, queryParams.address)
      .input("city", sql.VarChar, queryParams.city)
      .input("state", sql.VarChar, queryParams.state)
      .input("pincode", sql.VarChar, queryParams.pincode)
      .input("gstStateCode", sql.VarChar, queryParams.gstStateCode)
      .input("gstNo", sql.VarChar, queryParams.gstNo)
      .input("sacCode", sql.VarChar, queryParams.sacCode)
      .input("billingCompany", sql.VarChar, queryParams.billingCompany)
      .input("billingCompanyId", sql.VarChar, queryParams.billingCompanyId)
        .input("billingBranchId", sql.BigInt, queryParams.billingBranchId)
  .input("billingBranch", sql.NVarChar(255), queryParams.billingBranch)
  .input("companyId", sql.Int, queryParams.companyId)
  .input("branchId", sql.BigInt, queryParams.branchId)
      .input("source", sql.VarChar, queryParams.source)
      .input("companyBankName", sql.VarChar, queryParams.companyBankName)
      .input("otherInfo", sql.VarChar, queryParams.otherInfo)
      .input("termsAndConditions", sql.VarChar, queryParams.termsAndConditions)
      .input("userId", sql.Int, queryParams.userId)
      .query(updateQuery);

    logger.success("CLIENT UPDATE SUCCESS");

    logger.info("ROWS AFFECTED =>");

    logger.info(updateResult.rowsAffected);

    // =========================================
    // COMMIT
    // =========================================

    await transaction.commit();

    logger.success(
      "\n================ TRANSACTION COMMIT SUCCESS ================\n",
    );

    return {
      rowsAffected: updateResult.rowsAffected[0],
    };
  } catch (error) {
    logger.log("UPDATE CLIENT ERROR =>", error);

    logger.error("\n================ UPDATE CLIENT ERROR ================\n");

    logger.error(error.message);

    logger.error(error.stack);

    try {
      if (transaction._aborted !== true) {
        await transaction.rollback();

        logger.warn("TRANSACTION ROLLBACK SUCCESS");
      }
    } catch (rollbackError) {
      logger.log("ROLLBACK ERROR =>", rollbackError);

      logger.error("ROLLBACK ERROR => " + rollbackError.message);
    }

    throw error;
  }
};

exports.updateClientBankDetails = async (req) => {
  try {
    const pool = await poolPromise;

    logger.log(
      "\n================ UPDATE CLIENT BANK DETAILS API START ================\n",
    );

    const { id } = req.params;

    const userId = req.user.id;

    const bank = req.body;

    // =========================================
    // REQUEST DETAILS
    // =========================================

    logger.info("CLIENT ID => " + id);

    logger.info("USER ID => " + userId);

    logger.log("\n================ REQUEST BODY ================\n");

    logger.info(JSON.stringify(bank, null, 2));

    // =========================================
    // UPDATE QUERY
    // =========================================

    const updateQuery = `

        UPDATE new_client

        SET

          bank_name = @bankName,

          client_acc_no = @accountNo,

          ifsc_code = @ifscCode,

          bank_branch = @branch,

          bank_city = @bankCity,

          micr_code = @micrCode,

          modified_by = @userId,

          modified_on =FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss')

        WHERE id = @id

      `;

    logger.log("\n================ UPDATE QUERY ================\n");

    logger.info(updateQuery);

    // =========================================
    // QUERY PARAMS
    // =========================================

    const queryParams = {
      id,

      bankName: bank.bankName || "",

      accountNo: bank.accountNo || "",

      ifscCode: bank.ifscCode || "",

      branch: bank.branch || "",

      bankCity: bank.bankCity || "",

      micrCode: bank.micrCode || "",

      userId,
    };

    logger.log("\n================ QUERY PARAMS ================\n");

    logger.info(JSON.stringify(queryParams, null, 2));

    // =========================================
    // RAW SQL PREVIEW
    // =========================================

    const rawSQL = `

        UPDATE new_client

        SET

          bank_name = '${queryParams.bankName}',

          client_acc_no = '${queryParams.accountNo}',

          ifsc_code = '${queryParams.ifscCode}',

          bank_branch = '${queryParams.branch}',

          bank_city = '${queryParams.bankCity}',

          micr_code = '${queryParams.micrCode}',

          modified_by = '${queryParams.userId}',

          modified_on = FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss')

        WHERE id = '${queryParams.id}'

      `;

    logger.log("\n================ RAW SQL ================\n");

    logger.info(rawSQL);

    // =========================================
    // EXECUTE QUERY
    // =========================================

    const result = await new sql.Request(pool)

      .input("id", sql.Int, queryParams.id)

      .input("bankName", sql.VarChar, queryParams.bankName)

      .input("accountNo", sql.VarChar, queryParams.accountNo)

      .input("ifscCode", sql.VarChar, queryParams.ifscCode)

      .input("branch", sql.VarChar, queryParams.branch)

      .input("bankCity", sql.VarChar, queryParams.bankCity)

      .input("micrCode", sql.VarChar, queryParams.micrCode)

      .input("userId", sql.Int, queryParams.userId)

      .query(updateQuery);

    // =========================================
    // RESULT
    // =========================================

    logger.log("\n================ QUERY RESULT ================\n");

    logger.info(result.rowsAffected);

    if (result.rowsAffected[0] === 0) {
      throw new Error("Client not found");
    }

    logger.success("BANK DETAILS UPDATED SUCCESSFULLY");

    logger.log(
      "\n================ UPDATE CLIENT BANK DETAILS API END ================\n",
    );

    return {
      rowsAffected: result.rowsAffected[0],
    };
  } catch (error) {
    logger.log("UPDATE BANK DETAILS ERROR =>", error);

    logger.error(
      "\n================ UPDATE CLIENT BANK DETAILS ERROR ================\n",
    );

    logger.error(error.message);

    logger.error(error.stack);

    throw error;
  }
};

exports.updateClientSiteDetails = async (req) => {
  const pool = await poolPromise;

  const transaction = new sql.Transaction(pool);

  const safe = (v) => (v == null ? "" : String(v));

  const num = (v) => (v == null || v === "" || isNaN(v) ? 0 : Number(v));

  try {
    logger.log(
      "\n================ UPDATE CLIENT SITE API START ================\n",
    );

    const clientIdNum = Number(req.params.clientId);

    const siteIdNum = Number(req.params.siteId);

    logger.info("CLIENT ID => " + clientIdNum);

    logger.info("SITE ID => " + siteIdNum);

    if (isNaN(clientIdNum) || isNaN(siteIdNum)) {
      throw new Error("Invalid clientId or siteId");
    }

    const siteData = req.body;

    logger.log("\n================ REQUEST BODY ================\n");

    logger.info(JSON.stringify(siteData, null, 2));

    if (!siteData) {
      throw new Error("Site data missing");
    }

    await transaction.begin();

    logger.success("TRANSACTION STARTED");

    logger.info("REQ.USER =>");

    logger.info(req.user);

    const userId = req.user.id || 1;

    // =====================================
    // CHECK SITE EXISTS
    // =====================================

    const checkQuery = `

        SELECT TOP 1 id

        FROM client_rates

        WHERE id = @siteId

        AND client_id = @clientId

      `;

    logger.info("CHECK QUERY =>");

    logger.info(checkQuery);

    const checkResult = await new sql.Request(transaction)

      .input("siteId", sql.Int, siteIdNum)

      .input("clientId", sql.Int, clientIdNum)

      .query(checkQuery);

    logger.info("CHECK RESULT =>");

    logger.info(checkResult.recordset);

    if (!checkResult.recordset.length) {
      if (transaction._aborted !== true) {
        await transaction.rollback();
      }

      throw new Error("Site not found");
    }

    logger.success("SITE EXISTS");

    // =====================================
    // UPDATE QUERY
    // =====================================

    const updateQuery = `
        UPDATE client_rates
        SET
          site_name = @site_name,
          work_order_no = @work_order_no,
          client_code = @client_code,
          cc_contact_person = @cc_contact_person,
          cc_address = @cc_address,
          cc_billing_address = @cc_billing_address,
          cc_contactno = @cc_contactno,
          cc_emailid = @cc_emailid,
          cc_city = @cc_city,
          cc_state = @cc_state,
          cc_country = @cc_country,
          cc_location_name = @cc_location_name,
          cc_loct_Startdate = @cc_loct_Startdate,
          cc_sales_person = @cc_sales_person,
          cc_sales_person_email = @cc_sales_person_email,
          cc_sales_person_phone = @cc_sales_person_phone,
          cc_bill_cycle_Date = @cc_bill_cycle_Date,
          cc_loct_status = @cc_loct_status,
          cc_expected_Date = @cc_expected_Date,
          cc_cgst = @cc_cgst,
          cc_sgst = @cc_sgst,
          cc_igst = @cc_igst,
          cc_est_billing_amount =
          @cc_est_billing_amount,
          billing_nodays =
          @billing_nodays,
          display_ot =
          @display_ot,
          attach_wages =
          @attach_wages,
          convert_decimal =
          @convert_decimal,
          bill_without_rank =
          @bill_without_rank,
          multiply_ot_hours =
          @multiply_ot_hours,
          calculate_uniform_days =
          @calculate_uniform_days,
          calculate_earnedgross_withoutot =
          @calculate_earnedgross_withoutot,
          pf_wages_calculated_on =
          @pf_wages_calculated_on,
          ESIC_wages_calculated_on =
          @ESIC_wages_calculated_on,
          CTC_calculate =
          @CTC_calculate,
          exclude_weekoff_netday =
          @exclude_weekoff_netday,
          exclude_holiday_netday =
          @exclude_holiday_netday,
          non_compliance =
          @non_compliance,
          apply_leave =
          @apply_leave,
          office_latitude =
          @office_latitude,
          office_longitude =
          @office_longitude,
          modified_by =
          @modified_by,
          modified_on =
       FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss')
        WHERE id = @siteId
        AND client_id = @clientId
      `;
    logger.info("UPDATE QUERY =>");
    logger.info(updateQuery);
    // =====================================
    // QUERY PARAMS
    // =====================================

    const queryParams = {
      siteId: siteIdNum,

      clientId: clientIdNum,

      site_name: safe(siteData.siteName),

      work_order_no: safe(siteData.workOrderNo),

      client_code: safe(siteData.clientCode),

      cc_contact_person: safe(siteData.contactPersonName),

      cc_address: safe(siteData.address),

      cc_billing_address: safe(siteData.billingAddress),

      cc_contactno: safe(siteData.contactNo),

      cc_emailid: safe(siteData.emailId),

      cc_city: safe(siteData.city),

      cc_state: safe(siteData.state),

      cc_country: safe(siteData.country),

      cc_location_name: safe(siteData.locationName),

      cc_loct_Startdate: safe(siteData.locationStartDate),

      cc_sales_person: safe(siteData.salesPersonName),

      cc_sales_person_email: safe(siteData.salesPersonEmailId),

      cc_sales_person_phone: safe(siteData.salesPersonContactNo),

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

      multiply_ot_hours: siteData.multiplyOtHours ? 1 : 0,

      calculate_uniform_days: siteData.calculateUniformDays ? 1 : 0,

      calculate_earnedgross_withoutot: siteData.calculateEarnedGrossWithoutOT
        ? 1
        : 0,

      pf_wages_calculated_on: safe(siteData.pfWagesCalculatedOn),

      ESIC_wages_calculated_on: safe(siteData.esicWagesCalculatedOn),

      CTC_calculate: siteData.ctcCalculate ? 1 : 0,

      exclude_weekoff_netday: siteData.excludeWeekoffNetday ? 1 : 0,

      exclude_holiday_netday: siteData.excludeHolidayNetday ? 1 : 0,

      non_compliance: siteData.nonComplianceSite ? 1 : 0,

      apply_leave: siteData.applyLeave ? 1 : 0,

      office_latitude: safe(siteData.officeLatitude),

      office_longitude: safe(siteData.officeLongitude),

      modified_by: userId,
    };

    logger.info("QUERY PARAMS =>");

    logger.info(JSON.stringify(queryParams, null, 2));

    // =====================================
    // EXECUTE UPDATE
    // =====================================

    const updateResult = await new sql.Request(transaction)

      .input("siteId", sql.Int, queryParams.siteId)

      .input("clientId", sql.Int, queryParams.clientId)

      .input("site_name", sql.VarChar, queryParams.site_name)

      .input("work_order_no", sql.VarChar, queryParams.work_order_no)

      .input("client_code", sql.VarChar, queryParams.client_code)

      .input("cc_contact_person", sql.VarChar, queryParams.cc_contact_person)

      .input("cc_address", sql.VarChar, queryParams.cc_address)

      .input("cc_billing_address", sql.VarChar, queryParams.cc_billing_address)

      .input("cc_contactno", sql.VarChar, queryParams.cc_contactno)

      .input("cc_emailid", sql.VarChar, queryParams.cc_emailid)

      .input("cc_city", sql.VarChar, queryParams.cc_city)

      .input("cc_state", sql.VarChar, queryParams.cc_state)

      .input("cc_country", sql.VarChar, queryParams.cc_country)

      .input("cc_location_name", sql.VarChar, queryParams.cc_location_name)

      .input("cc_loct_Startdate", sql.VarChar, queryParams.cc_loct_Startdate)

      .input("cc_sales_person", sql.VarChar, queryParams.cc_sales_person)

      .input(
        "cc_sales_person_email",
        sql.VarChar,
        queryParams.cc_sales_person_email,
      )

      .input(
        "cc_sales_person_phone",
        sql.VarChar,
        queryParams.cc_sales_person_phone,
      )

      .input("cc_bill_cycle_Date", sql.VarChar, queryParams.cc_bill_cycle_Date)

      .input("cc_loct_status", sql.VarChar, queryParams.cc_loct_status)

      .input("cc_expected_Date", sql.VarChar, queryParams.cc_expected_Date)

      .input("cc_cgst", sql.Float, queryParams.cc_cgst)

      .input("cc_sgst", sql.Float, queryParams.cc_sgst)

      .input("cc_igst", sql.Float, queryParams.cc_igst)

      .input(
        "cc_est_billing_amount",
        sql.Float,
        queryParams.cc_est_billing_amount,
      )

      .input("billing_nodays", sql.Int, queryParams.billing_nodays)

      .input("display_ot", sql.Bit, queryParams.display_ot)

      .input("attach_wages", sql.Bit, queryParams.attach_wages)

      .input("convert_decimal", sql.Bit, queryParams.convert_decimal)

      .input("bill_without_rank", sql.Bit, queryParams.bill_without_rank)

      .input("multiply_ot_hours", sql.Bit, queryParams.multiply_ot_hours)

      .input(
        "calculate_uniform_days",
        sql.Bit,
        queryParams.calculate_uniform_days,
      )

      .input(
        "calculate_earnedgross_withoutot",
        sql.Bit,
        queryParams.calculate_earnedgross_withoutot,
      )

      .input(
        "pf_wages_calculated_on",
        sql.VarChar,
        queryParams.pf_wages_calculated_on,
      )

      .input(
        "ESIC_wages_calculated_on",
        sql.VarChar,
        queryParams.ESIC_wages_calculated_on,
      )

      .input("CTC_calculate", sql.Bit, queryParams.CTC_calculate)

      .input(
        "exclude_weekoff_netday",
        sql.Bit,
        queryParams.exclude_weekoff_netday,
      )

      .input(
        "exclude_holiday_netday",
        sql.Bit,
        queryParams.exclude_holiday_netday,
      )

      .input("non_compliance", sql.Bit, queryParams.non_compliance)

      .input("apply_leave", sql.Bit, queryParams.apply_leave)

      .input("office_latitude", sql.VarChar, queryParams.office_latitude)

      .input("office_longitude", sql.VarChar, queryParams.office_longitude)

      .input("modified_by", sql.Int, queryParams.modified_by)

      .query(updateQuery);

    logger.success("SITE UPDATE SUCCESS");

    logger.info("ROWS AFFECTED =>");

    logger.info(updateResult.rowsAffected);

    if (updateResult.rowsAffected[0] === 0) {
      throw new Error("No record updated - check siteId/clientId");
    }

    await transaction.commit();

    logger.success(
      "\n================ TRANSACTION COMMIT SUCCESS ================\n",
    );

    return {
      rowsAffected: updateResult.rowsAffected,
    };
  } catch (error) {
    logger.log("FULL UPDATE ERROR =>", error);

    logger.error(
      "\n================ UPDATE CLIENT SITE ERROR ================\n",
    );

    logger.error(error.message);

    try {
      if (transaction._aborted !== true) {
        await transaction.rollback();

        logger.warn("TRANSACTION ROLLBACK SUCCESS");
      }
    } catch (rollbackError) {
      logger.log("ROLLBACK ERROR =>", rollbackError);

      logger.error("ROLLBACK ERROR => " + rollbackError.message);
    }

    throw error;
  }
};


exports.deleteClient = async (req) => {
  try {
    logger.log(
      "\n================ DELETE CLIENT API START ================\n"
    );

    const clientId = req.params.id || req.params.clientId;

    await checkSuperadminProtection(
      "new_client",
      clientId,
      req.user
    );

    const userId = req.user.id;
    const userRole = req.user?.role;
    const normalizedRole = userRole?.trim().toUpperCase();

    // Check Super Admin
    const isSuperAdmin =
      req.user?.is_superadmin === true ||
      Number(userId) === 1 ||
      ["SUPER ADMIN", "SUPERADMIN"].includes(normalizedRole);

    logger.info("CLIENT ID => " + clientId);
    logger.info("USER ID => " + userId);
    logger.info("IS SUPER ADMIN => " + isSuperAdmin);

    const pool = await poolPromise;

    // =====================================
    // DELETE QUERY
    // Super Admin: superadmin_status = 1
    // Other users: preserve existing status
    // =====================================

    const deleteQuery = `
      UPDATE new_client
      SET
        active = '1',
        disabled_by = @disabled_by,
        disabled_by_name = @disabled_by_name,
        disabled_on = @disabled_on,
        superadmin_status =
          CASE
            WHEN @isSuperAdmin = 1 THEN 1
            ELSE superadmin_status
          END
      WHERE id = @id
        AND active = '0'
    `;

    const result = await pool
      .request()
      .input("id", sql.Int, clientId)
      .input("disabled_by", sql.VarChar, String(userId))
      .input(
        "disabled_by_name",
        sql.VarChar,
        req.disabledByName || ""
      )
      .input("disabled_on", sql.DateTime, new Date())
      .input("isSuperAdmin", sql.Bit, isSuperAdmin)
      .query(deleteQuery);

    logger.info(
      "DELETE ROWS AFFECTED => " +
      result.rowsAffected[0]
    );

    if (result.rowsAffected[0] === 0) {
      throw new Error("Client not found");
    }

    logger.success("CLIENT DELETED SUCCESSFULLY");

    logger.log(
      "\n================ DELETE CLIENT API END ================\n"
    );

    return {
      rowsAffected: result.rowsAffected[0],
    };
  } catch (error) {
    logger.error("DELETE CLIENT FAILED:", error);
    logger.error(error.stack);
    throw error;
  }
};


// =====================================
// RESTORE CLIENT
// =====================================

exports.restoreClient = async (req) => {
  try {
    logger.log("\n================ RESTORE CLIENT API START ================\n");

    const clientId = req.params.id || req.params.clientId;
    const userId = req.user.id;

    logger.info("CLIENT ID => " + clientId);
    logger.info("USER ID => " + userId);

    const pool = await poolPromise;

    const restoreQuery = `
        UPDATE new_client
        SET
          active = '0',
          modified_by = @modified_by,
          modified_by_name = @modified_by_name,
          modified_on = @modified_on
        WHERE id = @id
        AND active = '1'
      `;

    logger.log("\n================ RESTORE QUERY ================\n");
    logger.info(restoreQuery);

    const queryParams = {
      id: clientId,
      modified_by: String(userId),
      modified_by_name: req.modifiedByName || "",
      modified_on: new Date(),
    };

    const result = await pool
      .request()
      .input("id", sql.Int, queryParams.id)
      .input("modified_by", sql.VarChar, queryParams.modified_by)
      .input("modified_by_name", sql.VarChar, queryParams.modified_by_name)
      .input("modified_on", sql.DateTime, queryParams.modified_on)
      .query(restoreQuery);

    if (result.rowsAffected[0] === 0) {
      logger.warn("CLIENT NOT FOUND OR ALREADY ACTIVE");
      throw new Error("Client not found or already active");
    }

    logger.success("CLIENT RESTORED SUCCESSFULLY");
    logger.log("\n================ RESTORE CLIENT API END ================\n");

    return {
      rowsAffected: result.rowsAffected[0],
    };
  } catch (error) {
    logger.error("RESTORE CLIENT FAILED:", error);
    throw error;
  }
};

// =====================================
// GET COMPANY BANKS
// =====================================

exports.getCompanyBanks = async (companyId) => {
  try {
    logger.log(
      "\n================ GET COMPANY BANKS API START ================\n",
    );

    logger.info("COMPANY ID => " + companyId);

    // =====================================
    // VALIDATION
    // =====================================

    if (!companyId) {
      logger.warn("COMPANY ID MISSING");

      throw new Error("companyId is required");
    }

    // =====================================
    // DB CONNECTION
    // =====================================

    const pool = await poolPromise;

    logger.success("DATABASE CONNECTED");

    // =====================================
    // QUERY
    // =====================================

    const query = `

        SELECT

          id,
          company_id,
          ac_no,
          ac_type,
          bank_name,
          ifsc_code,
          micr_no,
          branch_city,
          branch_address,
          swift_ac_no

        FROM company_bank_detail

        WHERE company_id =
        @companyId

        AND active = '0'

        ORDER BY bank_name

      `;

    logger.info("QUERY =>");

    logger.info(query);

    // =====================================
    // EXECUTE QUERY
    // =====================================

    const result = await pool
      .request()

      .input("companyId", sql.Int, companyId)

      .query(query);

    logger.success("BANKS FETCH SUCCESS");

    logger.info(result.recordset);

    // =====================================
    // MAP DATA
    // =====================================

    const banks = result.recordset.map((row) => ({
      id: row.id,

      bankName: row.bank_name || "",

      accountNo: row.ac_no || "",

      accountType: row.ac_type || "",

      ifsc: row.ifsc_code || "",

      micr: row.micr_no || "",

      city: row.branch_city || "",

      branchAddress: row.branch_address || "",

      swiftCode: row.swift_ac_no || "",
    }));

    return banks;
  } catch (error) {
    logger.error(
      "\n================ GET COMPANY BANKS ERROR ================\n",
    );

    logger.error(error.message);

    throw error;
  }
};

// =====================================
// DELETE CLIENT SITE
// =====================================

exports.deleteClientSite = async (req) => {
  try {
    logger.log(
      "\n================ DELETE CLIENT SITE API START ================\n"
    );

    const pool = await poolPromise;

    const siteId = Number(req.params.siteId);
    const userId = Number(req.user.id);

    // Request details
    logger.info("SITE ID => " + siteId);
    logger.info("USER ID => " + userId);

    // Validate site ID
    if (!Number.isInteger(siteId) || siteId <= 0) {
      logger.warn("INVALID SITE ID");
      throw new Error("Invalid site id");
    }

    // Delete site and mark Super Admin deletion
    const deleteQuery = `
      UPDATE client_rates
      SET
        active = 1,

        superadmin_status = CASE
          WHEN @userId = 1 THEN 1
          ELSE ISNULL(superadmin_status, 0)
        END,

        disabled_by = @disabled_by,
        disabled_by_name = @disabled_by_name,
        disabled_on = @disabled_on

      WHERE id = @siteId
        AND active = 0
    `;

    logger.log("\n================ DELETE QUERY ================\n");
    logger.info(deleteQuery);

    logger.info("QUERY PARAMS =>");
    logger.info({
      siteId,
      userId,
      disabled_by: userId,
      disabled_by_name: req.disabledByName || "",
      disabled_on: new Date(),
    });

    // Execute query
    const result = await pool
      .request()
      .input("siteId", sql.Int, siteId)
      .input("userId", sql.Int, userId)
      .input("disabled_by", sql.Int, userId)
      .input(
        "disabled_by_name",
        sql.VarChar,
        req.disabledByName || ""
      )
      .input("disabled_on", sql.DateTime, new Date())
      .query(deleteQuery);

    logger.info("ROWS AFFECTED =>");
    logger.info(result.rowsAffected);

    // Site not found or already deleted
    if (result.rowsAffected[0] === 0) {
      logger.warn("SITE NOT FOUND OR ALREADY DELETED");
      throw new Error("Site not found");
    }

    // Success
    logger.success(
      "\n================ SITE DELETE SUCCESS ================\n"
    );

    logger.success("DELETED SITE ID => " + siteId);

    return {
      rowsAffected: result.rowsAffected[0],
    };
  } catch (error) {
    logger.log("DELETE SITE ERROR =>", error);

    logger.error(
      "\n================ DELETE CLIENT SITE ERROR ================\n"
    );

    logger.error(error.message);

    throw error;
  }
};


// =====================================
// FORMAT DATE
// =====================================

function formatDateForExcel(val) {
  if (!val && val !== 0) return "";

  const d = new Date(val);

  if (d instanceof Date && !isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, "0");

    const mm = String(d.getMonth() + 1).padStart(2, "0");

    const yyyy = d.getFullYear();

    return `${dd}-${mm}-${yyyy}`;
  }

  return String(val);
}

// =====================================
// EXPORT CLIENTS TO EXCEL
// =====================================

exports.exportClientsToExcel = async (req) => {
  try {
    logger.log(
      "\n================ EXPORT CLIENTS EXCEL START ================\n",
    );

    const { searchFields, fromDate, toDate } = req.query;

    const pool = await poolPromise;

    let whereClause = `WHERE c.active = '0'`;

    // =====================================
    // SEARCH FILTER
    // =====================================

    if (searchFields) {
      const fields = JSON.parse(searchFields);

      fields.forEach((f) => {
        if (f.field && f.keyword) {
          whereClause += `
                AND c.${f.field}
                LIKE '%${f.keyword}%'
              `;
        }
      });
    }

    // =====================================
    // DATE FILTER
    // =====================================

    if (fromDate && toDate) {
      whereClause += `
          AND c.created_on
          BETWEEN '${fromDate}'
          AND '${toDate} 23:59:59'
        `;
    }

    // =====================================
    // USER ACCESS FILTER
    // =====================================
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const normalizedRole = userRole?.trim().toUpperCase();
    const isSuperAdmin =
      req.user?.is_superadmin === true ||
      Number(userId) === 1 ||
      normalizedRole === "SUPER ADMIN" ||
      normalizedRole === "SUPERADMIN";

    if (!isSuperAdmin && userId) {
      const userResult = await pool
        .request()
        .input("userId", userId)
        .query(`SELECT company_id FROM users WHERE id = @userId`);

      const rawCompanyId = userResult.recordset[0]?.company_id || "";
      const cleanedCompanyId = String(rawCompanyId).trim();

      if (!cleanedCompanyId) {
        whereClause += ` AND 1 = 0 `;
      } else {
        const safeIds = cleanedCompanyId
          .split(",")
          .map((id) => parseInt(id.trim(), 10))
          .filter((id) => !isNaN(id))
          .join(",");

        if (safeIds) {
          whereClause += `
            AND (
              TRY_CAST(c.billing_company_id AS INT) IN (${safeIds})
              OR c.billing_company IN (SELECT company_name FROM companies WHERE id IN (${safeIds}))
            )
          `;
        } else {
          whereClause += ` AND 1 = 0 `;
        }
      }
    }

    // =====================================
    // GET CLIENTS
    // =====================================

    const clientsResult = await pool.request().query(`

            SELECT

              c.id,
              c.company_name,
              c.contact_person,
              c.contact_no,
              c.client_email,
              c.client_gst_no,
              c.created_on

            FROM new_client c

            ${whereClause}

            ORDER BY c.created_on DESC

          `);

    const clients = clientsResult.recordset;

    // =====================================
    // GET SITES
    // =====================================

    const sitesResult = await pool.request().query(`

            SELECT

              s.client_id,
              s.site_name,
              s.client_code,
              s.cc_contact_person,
              s.cc_address,
              s.cc_contactno,
              s.cc_emailid

            FROM client_rates s

            WHERE s.active = '0'

          `);

    const sites = sitesResult.recordset;

    // =====================================
    // MAP SITES
    // =====================================

    const siteMap = {};

    sites.forEach((s) => {
      if (!siteMap[s.client_id]) {
        siteMap[s.client_id] = [];
      }

      siteMap[s.client_id].push(s);
    });

    // =====================================
    // HEADERS
    // =====================================

    const headers = [
      "Client Name",
      "Client Code",
      "Client Contact Person",
      "Client Contact No",
      "Client GST No",
      "Site Name",
      "Site Contact Person",
      "Site Address",
      "Site Contact No",
      "Site Email ID",
      "Created On",
    ];

    // =====================================
    // EXCEL ROWS
    // =====================================

    const excelRows = [];

    clients.forEach((client) => {
      const clientSites = siteMap[client.id] || [];

      clientSites.forEach((site) => {
        excelRows.push([
          client.company_name || "",

          site.client_code || "",

          client.contact_person || "",

          client.contact_no || "",

          client.client_gst_no || "",

          site.site_name || "",

          site.cc_contact_person || "",

          site.cc_address || "",

          site.cc_contactno || "",

          site.cc_emailid || "",

          formatDateForExcel(client.created_on),
        ]);
      });
    });

    // =====================================
    // CREATE EXCEL
    // =====================================

    const sheetData = [headers, ...excelRows];

    const worksheet = xlsx.utils.aoa_to_sheet(sheetData);

    const workbook = xlsx.utils.book_new();

    xlsx.utils.book_append_sheet(workbook, worksheet, "Client Sites");

    const buffer = xlsx.write(workbook, {
      type: "buffer",

      bookType: "xlsx",
    });

    logger.success("EXCEL GENERATED SUCCESSFULLY");

    return buffer;
  } catch (error) {
    logger.error("EXPORT CLIENT ERROR => " + error.message);

    throw error;
  }
};

// =====================================
// GET WO RATES
// =====================================

exports.getWORates = async (siteId) => {
  try {
    const pool = await poolPromise;

    const result = await pool
      .request()

      .input("siteId", sql.Int, siteId).query(`

            SELECT *

            FROM wo_rate_chart

            WHERE site_id =
            @siteId

            AND active = '0'

            ORDER BY created_on ASC

          `);

    return result.recordset;
  } catch (error) {
    throw error;
  }
};

// =====================================
// ADD WO RATES
// =====================================

exports.addWORates = async (req) => {
  const pool = await poolPromise;

  const transaction = new sql.Transaction(pool);

  try {
    const clientId = req.params.clientId;

    const siteId = req.params.siteId;

    const woRates = req.body;

    await transaction.begin();

    const request = transaction.request();

    // =====================================
    // EXISTING RECORDS
    // =====================================

    const existing = await request

      .input("clientId", sql.Int, clientId)

      .input("siteId", sql.Int, siteId).query(`

            SELECT id

            FROM wo_rate_chart

            WHERE client_id =
            @clientId

            AND site_id =
            @siteId

            AND active = '0'

          `);

    const existingIds = existing.recordset.map((r) => r.id);

    const incomingIds = woRates.filter((o) => o.id).map((o) => o.id);

    // =====================================
    // INSERT / UPDATE
    // =====================================

    for (const o of woRates) {
      if (o.id && existingIds.includes(o.id)) {
        // UPDATE

        await transaction
          .request()

          .input("id", sql.Int, o.id)

          .input("woType", sql.VarChar, o.woType || "")

          .input("size", sql.VarChar, o.size || "")

          .input("fromWt", sql.VarChar, o.fromWt || "")

          .input("toWt", sql.VarChar, o.toWt || "")

          .input("type", sql.VarChar, o.type || "")

          .input("equipmentType", sql.VarChar, o.equipmentType || "")

          .input("examPer", sql.VarChar, o.examPer || "")

          .input("rate", sql.Float, o.rate || 0)

          .input("modified_by", sql.Int, req.user.id)

          .input("modified_on", sql.DateTime, new Date()).query(`

              UPDATE wo_rate_chart

              SET

                wo_type =
                @woType,

                size =
                @size,

                from_wt =
                @fromWt,

                to_wt =
                @toWt,

                type =
                @type,

                equipment_type =
                @equipmentType,

                exam_per =
                @examPer,

                rate =
                @rate,

                modified_by =
                @modified_by,

                modified_on =
                @modified_on

              WHERE id =
              @id

            `);
      } else {
        // INSERT

        await transaction
          .request()

          .input("clientId", sql.Int, clientId)

          .input("siteId", sql.Int, siteId)

          .input("woType", sql.VarChar, o.woType || "")

          .input("size", sql.VarChar, o.size || "")

          .input("fromWt", sql.VarChar, o.fromWt || "")

          .input("toWt", sql.VarChar, o.toWt || "")

          .input("type", sql.VarChar, o.type || "")

          .input("equipmentType", sql.VarChar, o.equipmentType || "")

          .input("examPer", sql.VarChar, o.examPer || "")

          .input("rate", sql.Float, o.rate || 0)

          .input("created_by", sql.Int, req.user.id).query(`

              INSERT INTO wo_rate_chart (

                client_id,
                site_id,
                wo_type,
                size,
                from_wt,
                to_wt,
                type,
                equipment_type,
                exam_per,
                rate,
                created_by,
                active,
                created_on

              )

              VALUES (

                @clientId,
                @siteId,
                @woType,
                @size,
                @fromWt,
                @toWt,
                @type,
                @equipmentType,
                @examPer,
                @rate,
                @created_by,
                '0',
                FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss')

              )

            `);
      }
    }

    // =====================================
    // DELETE REMOVED
    // =====================================

    const toDelete = existingIds.filter((id) => !incomingIds.includes(id));

    if (toDelete.length > 0) {
      await transaction
        .request()
        .input("ids", sql.VarChar, toDelete.join(","))
        .input("disabled_by", sql.Int, req.user.id).query(`
            UPDATE wo_rate_chart
            SET
              active = '0',
              disabled_by =
              @disabled_by,
              disabled_on =
             FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss')
            WHERE id IN (
              SELECT value
              FROM STRING_SPLIT(@ids, ',')

            )

          `);
    }

    await transaction.commit();

    return {
      success: true,
    };
  } catch (error) {
    await transaction.rollback();

    throw error;
  }
};

// =====================================
// GET SITE BY SITE ID
// =====================================

// exports.getSiteBySiteId = async (id) => {
//   try {
//     const pool = await poolPromise;

//     const result = await pool
//       .request()

//       .input("id", sql.Int, id).query(`

//             SELECT TOP 1 *

//             FROM client_rates

//             WHERE id = @id

//           `);

//     if (!result.recordset.length) {
//       throw new Error("Site not found");
//     }

//     return result.recordset[0];
//   } catch (error) {
//     throw error;
//   }
// };
exports.getSiteBySiteId = async (id) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .query(`
      SELECT TOP 1
        cr.*,
        nc.company_name AS client_name
      FROM client_rates cr
      LEFT JOIN new_client nc
        ON nc.id = cr.client_id
      WHERE cr.id = @id
    `);

  if (!result.recordset.length) {
    throw new Error("Site not found");
  }

  return result.recordset[0];
};

// =====================================
// UPDATE WAGES SETTINGS
// =====================================

exports.updateWagesSettings = async (req) => {
  try {
    const { clientId, siteId } = req.params;

    const {
      multiplyOTHours,
      calculateUniformDays,
      calculateEarnedGrossWithoutOT,
      pfWagesCalculatedOn,
      ESICWagesCalculatedOn,
      CTCCalculate,
      wagesSettings,
    } = req.body;

    if (!clientId || !siteId) {
      throw new Error("Client ID and Site ID are required");
    }

    const pool = await poolPromise;

    // =====================================
    // CHECK SITE
    // =====================================

    const siteCheck = await pool
      .request()

      .input("clientId", sql.Int, clientId)

      .input("siteId", sql.Int, siteId).query(`

            SELECT TOP 1 *

            FROM client_rates

            WHERE id =
            @siteId

            AND client_id =
            @clientId

          `);

    if (!siteCheck.recordset.length) {
      throw new Error("Site not found");
    }

    const site = siteCheck.recordset[0];

    // =====================================
    // UPDATE QUERY
    // =====================================

    await pool
      .request()

      .input("clientId", sql.Int, clientId)

      .input("siteId", sql.Int, siteId)

      .input(
        "multiplyOTHours",
        sql.Bit,
        multiplyOTHours ?? site.multiply_ot_hours,
      )

      .input(
        "calculateUniformDays",
        sql.Bit,
        calculateUniformDays ?? site.calculate_uniform_days,
      )

      .input(
        "calculateEarnedGrossWithoutOT",
        sql.Bit,
        calculateEarnedGrossWithoutOT ?? site.calculate_earnedgross_withoutot,
      )

      .input(
        "pfWagesCalculatedOn",
        sql.VarChar,
        pfWagesCalculatedOn ?? site.pf_wages_calculated_on,
      )

      .input(
        "ESICWagesCalculatedOn",
        sql.VarChar,
        ESICWagesCalculatedOn ?? site.ESIC_wages_calculated_on,
      )

      .input("CTCCalculate", sql.Bit, CTCCalculate ?? site.CTC_calculate)

      .input(
        "wagesSettings",
        sql.VarChar,
        wagesSettings ? JSON.stringify(wagesSettings) : site.wages_header,
      )

      .input("modified_by", sql.Int, req.user.id)

      .input("modified_on", sql.DateTime, new Date()).query(`

          UPDATE client_rates

          SET

            multiply_ot_hours =
            @multiplyOTHours,

            calculate_uniform_days =
            @calculateUniformDays,

            calculate_earnedgross_withoutot =
            @calculateEarnedGrossWithoutOT,

            pf_wages_calculated_on =
            @pfWagesCalculatedOn,

            ESIC_wages_calculated_on =
            @ESICWagesCalculatedOn,

            CTC_calculate =
            @CTCCalculate,

            wages_header =
            @wagesSettings,

            modified_by =
            @modified_by,

            modified_on =
            @modified_on

          WHERE id =
          @siteId

          AND client_id =
          @clientId

        `);

    // =====================================
    // UPDATED DATA
    // =====================================

    const updated = await pool
      .request()

      .input("siteId", sql.Int, siteId).query(`

            SELECT TOP 1 *

            FROM client_rates

            WHERE id =
            @siteId

          `);

    return updated.recordset[0];
  } catch (error) {
    throw error;
  }
};

// =====================================
// Nitin
// =====================================

// =============================
// CLIENT DROPDOWN
// =============================
exports.getClients = async (user) => {
  const pool = await poolPromise;
  const request = pool.request();
  let whereClause = "WHERE active = 0";

  const userId = user?.id;
  const userRole = user?.role;
  const normalizedRole = userRole?.trim().toUpperCase();
  const isSuperAdmin =
    user?.is_superadmin === true ||
    Number(userId) === 1 ||
    normalizedRole === "SUPER ADMIN" ||
    normalizedRole === "SUPERADMIN";

  if (!isSuperAdmin && userId) {
    const userResult = await pool
      .request()
      .input("userId", userId)
      .query(`SELECT company_id FROM users WHERE id = @userId`);

    const rawCompanyId = userResult.recordset[0]?.company_id || "";
    const cleanedCompanyId = String(rawCompanyId).trim();

    if (!cleanedCompanyId) {
      whereClause += " AND 1 = 0";
    } else {
      whereClause += `
        AND (
          TRY_CAST(billing_company_id AS INT) IN (
            SELECT TRY_CAST(LTRIM(RTRIM(value)) AS INT)
            FROM STRING_SPLIT(@allottedCompanyIds, ',')
            WHERE LTRIM(RTRIM(value)) <> ''
          )
          OR billing_company IN (
            SELECT company_name
            FROM companies
            WHERE id IN (
              SELECT TRY_CAST(LTRIM(RTRIM(value)) AS INT)
              FROM STRING_SPLIT(@allottedCompanyIds, ',')
              WHERE LTRIM(RTRIM(value)) <> ''
            )
          )
        )
      `;
      request.input("allottedCompanyIds", cleanedCompanyId);
    }
  }

  const result = await request.query(`
    SELECT
      id,
      company_name
    FROM new_client
    ${whereClause}
    ORDER BY company_name ASC
  `);

  return result.recordset;
};

// =============================
// SITE DROPDOWN
// =============================
exports.getSitesByClient = async (client_id) => {
  const pool = await poolPromise;

  const ids = String(client_id).split(",").map(id => parseInt(id, 10)).filter(id => !isNaN(id));

  if (ids.length === 0) {
    return [];
  }

  const result = await pool.request().query(`
    SELECT
      id,
      site_name
    FROM client_rates
    WHERE client_id IN (${ids.join(",")}) AND active = 0
  `);

  return result.recordset;
};

// =============================
// EMPLOYEE DROPDOWN
// =============================
exports.getEmployeesBySite = async (site_id, client_id) => {
  const pool = await poolPromise;

  let query = `
    SELECT
      e.id,
      e.employee_code,
      e.emp_full_name,
      e.rank
  `;

  if (client_id) {
    query += `,
      c.emp_perday_rate,
      c.emp_basic,
      c.emp_da,
      c.special_allow,
      c.other_allow,
      c.ot_rate,
      c.lww,
      c.bonus,
      c.fixed_leave_wages,
      c.fixed_uniform_wages,
      c.any_other
    `;
  }

  query += `
    FROM employee e
  `;

  if (client_id) {
    query += `
      OUTER APPLY (
        SELECT TOP 1
          c.emp_perday_rate,
          c.emp_basic,
          c.emp_da,
          c.special_allow,
          c.other_allow,
          c.ot_rate,
          c.lww,
          c.bonus,
          c.fixed_leave_wages,
          c.fixed_uniform_wages,
          c.any_other
        FROM client_other_info c
        WHERE c.rate_id = e.site_id
          AND c.client_id = e.client_code
        ORDER BY c.id DESC
      ) c
    `;
  }

  query += `
    WHERE e.site_id = @site_id
      AND e.active = '0'
  `;

  const request = pool.request().input("site_id", sql.NVarChar, site_id);

  if (client_id) {
    request.input("client_id", sql.Int, client_id);
  }

  const result = await request.query(query);

  return result.recordset;
};

exports.updateSite = async (siteId, data, attachment, userId, userName) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  console.log("updateSite called for siteId:", siteId);

  // Helper: safe coerce to bool bit (handles "1", "0", true, false, 1, 0)
  const toBit = (val) => {
    if (val === "1" || val === true || val === 1) return 1;
    return 0;
  };

  // Helper: safe number
  const num = (v) => (v == null || v === "" || isNaN(v) ? 0 : Number(v));

  try {
    if (data.site_id) {
      const siteIdCheck = await pool
        .request()
        .input("site_id", sql.NVarChar, String(data.site_id).toUpperCase())
        .input("rateId", sql.Int, siteId)
        .query(`SELECT id FROM client_rates WHERE new_site_id = @site_id AND id != @rateId`);
      if (siteIdCheck && siteIdCheck.recordset && siteIdCheck.recordset.length > 0) {
        throw new Error(`Site ID '${data.site_id}' already exists.`);
      }
    }

    await transaction.begin();
const clientInfo = await transaction
  .request()
  .input("client_id", sql.Int, data.client_id || data.clientId)
  .query(`
    SELECT company_id, branch_id
    FROM new_client
    WHERE id = @client_id
  `);

const companyId = clientInfo.recordset[0]?.company_id ?? null;
const branchId = clientInfo.recordset[0]?.branch_id ?? null;
    const rates = JSON.parse(data.rates || "[]");
    const otherCharges = JSON.parse(data.otherCharges || "[]");

    try {
      const dbRes = await transaction.request().query("SELECT DB_NAME() AS db, (SELECT COUNT(*) FROM sys.columns WHERE Name = 'cc_pincode' AND Object_ID = Object_ID('client_rates')) AS colCount");
      require('fs').appendFileSync('error.log', 'DB Context: ' + JSON.stringify(dbRes.recordset) + '\n');
    } catch (e) { }


    // =====================================
    // STEP 1: UPDATE client_rates (site main table)
    // =====================================
    await transaction
      .request()
      .input("id", sql.Int, siteId)
      .input("site_name", sql.NVarChar, data.siteName || "")
      .input("work_order_no", sql.NVarChar, data.workOrderNo || "")
      .input("cc_contact_person", sql.NVarChar, data.contactPerson || "")
      .input("cc_address", sql.NVarChar, data.address || "")
      .input("cc_billing_address", sql.NVarChar, data.billingAddress || "")
      .input("cc_contactno", sql.NVarChar, data.contactNo || "")
      .input("cc_emailid", sql.NVarChar, data.emailId || "")
      .input("cc_city", sql.NVarChar, data.city || "")
      .input("cc_state", sql.NVarChar, data.state || "")
      .input("cc_pincode", sql.NVarChar, data.pincode || "")
      .input("cc_country", sql.NVarChar, data.country || "")
      .input("cc_location_name", sql.NVarChar, data.locationName || "")
      .input("cc_loct_Startdate", sql.Date, data.locationStartDate || null)
      .input("cc_loct_Enddate", sql.Date, data.locationEndDate || null)
      .input("cc_sales_person", sql.NVarChar, data.salesPerson || "")
      .input("cc_sales_person_email", sql.NVarChar, data.salesPersonEmail || "")
      .input("cc_sales_person_phone", sql.NVarChar, data.salesPersonPhone || "")
      .input("cc_bill_cycle_Date", sql.NVarChar, data.billCycleDate || "")
      .input("cc_branch_name", sql.NVarChar, data.cc_branch_name || "")
      .input("cc_site_hours", sql.NVarChar, data.cc_site_hours || "")
      .input("company_id", sql.Int, companyId)
.input("branch_id", sql.Int, branchId)
      .input("cc_total_manpower", sql.NVarChar, data.cc_total_manpower || "")
      .input(
  "attendance_upload_type",
  sql.NVarChar,
  data.attendanceUploadType || "",
)
      .input("cc_expected_Date", sql.Date, data.locationEndDate || null)
      .input("cc_loct_status", sql.NVarChar, data.status || "Active")
      .input("cc_cgst", sql.Decimal(18, 2), num(data.cgst))
      .input("cc_sgst", sql.Decimal(18, 2), num(data.sgst))
      .input("cc_igst", sql.Decimal(18, 2), num(data.igst))
      .input("cc_est_billing_amount", sql.Decimal(18, 2), num(data.estimatedBillingAmount))
      // Fix: toBit correctly handles "1"/"0" strings from FormData
      .input("display_ot", sql.Bit, toBit(data.viewOTHours))
      .input("attach_wages", sql.Bit, toBit(data.attachWagesSHeet))
      .input("convert_decimal", sql.Bit, toBit(data.roundOffAmount))
      .input("bill_without_rank", sql.Bit, toBit(data.billWithoutRank))
      .input("non_compliance", sql.Bit, toBit(data.nonComplianceSite))
      .input("apply_leave", sql.Bit, toBit(data.applyLeave))
      .input("billing_nodays", sql.Int, num(data.billingNoDays))
      .input("office_latitude", sql.NVarChar, data.officeLatitude || "")
      .input("office_longitude", sql.NVarChar, data.officeLongitude || "")
      .input("new_site_id", sql.NVarChar, data.siteId || "")
      .input("po_number", sql.NVarChar, data.poNumber || "")
      .input("modified_by", sql.Int, userId || 0)
      .input("modified_by_name", sql.NVarChar, userName || "")
      .input("contract_attachment", sql.NVarChar, attachment).query(`
        UPDATE client_rates
        SET
          site_name=@site_name,
          work_order_no=@work_order_no,
          cc_contact_person=@cc_contact_person,
          cc_address=@cc_address,
          cc_billing_address=@cc_billing_address,
          cc_contactno=@cc_contactno,
          cc_emailid=@cc_emailid,
          cc_city=@cc_city,
          cc_state=@cc_state,
          cc_pincode=@cc_pincode,
          cc_country=@cc_country,
          cc_location_name=@cc_location_name,
          cc_loct_Startdate=@cc_loct_Startdate,
          cc_loct_Enddate=@cc_loct_Enddate,
          cc_sales_person=@cc_sales_person,
          cc_sales_person_email=@cc_sales_person_email,
          cc_sales_person_phone=@cc_sales_person_phone,
          cc_bill_cycle_Date=@cc_bill_cycle_Date,
          cc_branch_name=@cc_branch_name,
          cc_site_hours=@cc_site_hours,
          cc_total_manpower=@cc_total_manpower,
          attendance_upload_type=@attendance_upload_type,
          cc_expected_Date=@cc_expected_Date,
          cc_loct_status=@cc_loct_status,
          company_id = @company_id,
branch_id = @branch_id,
          cc_cgst=@cc_cgst,
          cc_sgst=@cc_sgst,
          cc_igst=@cc_igst,
          cc_est_billing_amount=@cc_est_billing_amount,
          display_ot=@display_ot,
          attach_wages=@attach_wages,
          convert_decimal=@convert_decimal,
          bill_without_rank=@bill_without_rank,
          non_compliance=@non_compliance,
          apply_leave=@apply_leave,
          billing_nodays=@billing_nodays,
          office_latitude=@office_latitude,
          office_longitude=@office_longitude,
          new_site_id=@new_site_id,
          po_number=@po_number,
          modified_by=@modified_by,
          modified_by_name=@modified_by_name,
          modified_on=FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss'),
          contract_attachment=
            CASE
              WHEN @contract_attachment IS NULL
              THEN contract_attachment
              ELSE @contract_attachment
            END
        WHERE id=@id
      `);

    // Get client_id from this site for child table operations
    const siteInfo = await transaction.request().input("id", sql.Int, siteId)
      .query(`SELECT client_id FROM client_rates WHERE id=@id`);
    const clientId = siteInfo.recordset[0]?.client_id;

    await logAction("client_rates", siteId, "UPDATE", transaction);

    // =====================================
    // STEP 2: OPTION A - DELETE then INSERT client_other_info
    // Pehle is site ke saare purane rates delete karo
    // =====================================
    await transaction.request()
      .input("rate_id", sql.Int, siteId)
      .query(`DELETE FROM client_other_info WHERE rate_id = @rate_id`);

    // =====================================
    // STEP 3: INSERT new rates into client_other_info
    // =====================================
    for (const rate of rates) {
      if (!rate.empType && !rate.basic) continue; // empty row skip

      const insertedRate = await new sql.Request(transaction)
        .input("client_id", sql.Int, clientId)
        .input("rate_id", sql.Int, siteId)
        .input("emp_type", sql.NVarChar, rate.empType || "")
        .input("emp_hours", sql.Decimal(18, 2), num(rate.hours))
        .input("emp_nos", sql.Int, num(rate.nos))
        .input("emp_basic", sql.Decimal(18, 2), num(rate.basic))
        .input("emp_basicda", sql.Decimal(18, 2), num(rate.hra))
        .input("emp_da", sql.Decimal(18, 2), num(rate.da))
        .input("special_allow", sql.Decimal(18, 2), num(rate.specialAllowance))
        .input("other_allow", sql.Decimal(18, 2), num(rate.otherAllowance))
        .input("lww", sql.Decimal(18, 2), num(rate.lww))
        .input("bonus", sql.Decimal(18, 2), num(rate.bonus))
        .input("emp_total_cost", sql.Decimal(18, 2), num(rate.gross))
        .input("service_charges_type", sql.NVarChar, rate.serviceChargeType || "")
        .input("service_charges", sql.Decimal(18, 2), num(rate.serviceCharge))
        .input("emp_perday_rate", sql.Decimal(18, 2), num(rate.perDayRate))
        .input("ot_rate", sql.Decimal(18, 2), num(rate.otRate))
        .input("fixed_leave_wages", sql.Decimal(18, 2), num(rate.leaveWages))
        .input("fixed_uniform_wages", sql.Decimal(18, 2), num(rate.uniformWashing))
        .input("any_other", sql.Decimal(18, 2), num(rate.anyOther))
        .input("modified_by", sql.Int, userId || 0)
        .input("modified_by_name", sql.NVarChar, userName || "")
        .query(`
          INSERT INTO client_other_info
          (
            client_id, rate_id, emp_type, emp_hours, emp_nos,
            emp_basic, emp_basicda, emp_da, special_allow, other_allow,
            lww, bonus, emp_total_cost, service_charges_type, service_charges,
            emp_perday_rate, ot_rate, fixed_leave_wages, fixed_uniform_wages,
            any_other, modified_by, modified_by_name,
            created_by, created_by_name, created_on, modified_on
          )
          OUTPUT INSERTED.id
          VALUES
          (
            @client_id, @rate_id, @emp_type, @emp_hours, @emp_nos,
            @emp_basic, @emp_basicda, @emp_da, @special_allow, @other_allow,
            @lww, @bonus, @emp_total_cost, @service_charges_type, @service_charges,
            @emp_perday_rate, @ot_rate, @fixed_leave_wages, @fixed_uniform_wages,
            @any_other, @modified_by, @modified_by_name,
            @modified_by, @modified_by_name,
            FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss'),
            FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss')
          )
        `);

      const otherInfoId = insertedRate.recordset[0]?.id;
      if (otherInfoId) {
        await logAction("client_other_info", otherInfoId, "UPDATE", transaction);
      }
    }

    // =====================================
    // STEP 4: OPTION A - DELETE then INSERT client_service_charges (otherCharges)
    // =====================================
    await transaction.request()
      .input("rate_id", sql.Int, siteId)
      .query(`DELETE FROM client_service_charges WHERE rate_id = @rate_id`);

    // =====================================
    // STEP 5: INSERT new other charges into client_service_charges
    // =====================================
    for (const charge of otherCharges) {
      if (!charge.serviceType && !charge.charges) continue; // empty row skip

      const insertedCharge = await new sql.Request(transaction)
        .input("client_id", sql.Int, clientId)
        .input("rate_id", sql.Int, siteId)
        .input("type_of_services", sql.NVarChar, charge.serviceType || "")
        .input("count_services", sql.NVarChar, charge.chargesType || "Rs")
        .input("charges_services", sql.Decimal(18, 2), num(charge.charges))
        .input("ea_calculateon", sql.NVarChar, charge.calculateOn?.toUpperCase() || "")
        .input("ea_operator", sql.NVarChar, charge.condition?.toUpperCase() || "")
        .input("ea_comp_operator", sql.NVarChar, charge.amountRange || "")
        .input("source", sql.NVarChar, "WEB")
        .input("modified_by", sql.Int, userId || 0)
        .input("modified_by_name", sql.NVarChar, userName || "")
        .query(`
          INSERT INTO client_service_charges
          (
            client_id, rate_id, type_of_services, count_services,
            charges_services, ea_calculateon, ea_operator, ea_comp_operator,
            source, created_by, created_by_name, created_on,
            modified_by, modified_by_name, modified_on
          )
          OUTPUT INSERTED.id
          VALUES
          (
            @client_id, @rate_id, @type_of_services, @count_services,
            @charges_services, @ea_calculateon, @ea_operator, @ea_comp_operator,
            @source, @modified_by, @modified_by_name,
            FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss'),
            @modified_by, @modified_by_name,
            FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss')
          )
        `);

      const serviceChargeId = insertedCharge.recordset[0]?.id;
      if (serviceChargeId) {
        await logAction("client_service_charges", serviceChargeId, "UPDATE", transaction);
      }
    }

    await transaction.commit();
    console.log("updateSite committed successfully for siteId:", siteId);
    return { success: true };

  } catch (err) {
    require('fs').appendFileSync('error.log', 'updateSite ERROR: ' + (err.stack || err) + '\n');
    console.error("updateSite ERROR:", err);
    try { await transaction.rollback(); } catch (rbErr) { console.error("Rollback error:", rbErr); }
    throw err;
  }
};

const toUpper = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim().toUpperCase();
};

exports.updateClientData = async (clientId, data, user) => {
  const pool = await poolPromise;

  let billingCompanyName = "";

  if (data.billingCompany) {
    const billingResult = await pool
      .request()
      .input("id", sql.Int, Number(data.billingCompany))
      .query(`
        SELECT company_name
        FROM companies
        WHERE id = @id
      `);

    if (billingResult.recordset.length > 0) {
      billingCompanyName =
        billingResult.recordset[0].company_name || "";
    }
  }

  await pool
    .request()
    .input("id", sql.Int, Number(clientId))
    .input("company_name", sql.NVarChar, toUpper(data.companyName) || "")
    .input("x_client_code", sql.NVarChar, toUpper(data.clientcode) || "")
    .input("contact_no", sql.NVarChar, toUpper(data.contactNo) || "")
    .input("client_email", sql.NVarChar, toUpper(data.emailId) || "")
    .input(
      "contact_person",
      sql.NVarChar,
      toUpper(data.contactPersonName) || ""
    )
    .input("client_add", sql.NVarChar, toUpper(data.address) || "")
    .input("client_city", sql.NVarChar, toUpper(data.city) || "")
    .input("client_state", sql.NVarChar, toUpper(data.state) || "")
    .input("city_pincode", sql.NVarChar, toUpper(data.pincode) || "")
    .input(
      "client_gst_state_code",
      sql.NVarChar,
      toUpper(data.gstStateCode) || ""
    )
    .input("client_gst_no", sql.NVarChar, toUpper(data.gstNo) || "")
    .input("sac_code", sql.NVarChar, toUpper(data.sacCode) || "")
    .input("other_info", sql.NVarChar, toUpper(data.otherInfo) || "")
    .input("terms", sql.NVarChar, toUpper(data.termsAndConditions) || "")
    .input(
      "billing_company_id",
      sql.NVarChar,
      data.billingCompany ? String(data.billingCompany) : ""
    )
    .input("billing_company", sql.NVarChar, billingCompanyName)

    // Billing Branch fields
    .input(
      "billing_branch_id",
      sql.BigInt,
      data.billingBranch ? Number(data.billingBranch) : null
    )
    .input(
      "billing_branch",
      sql.NVarChar(255),
      toUpper(data.billingBranchName) || ""
    )
.input(
  "company_id",
  sql.Int,
  data.billingCompany ? Number(data.billingCompany) : null
)
.input(
  "branch_id",
  sql.BigInt,
  data.billingBranch ? Number(data.billingBranch) : null
)
    .input("company_bank_name", sql.NVarChar, toUpper(data.companyBankName) || "")
    .input("modified_by", sql.NVarChar, String(user.id))
    .input("modified_by_name", sql.NVarChar, user.first_name || "")
    .query(`
      UPDATE new_client
      SET
        company_name = @company_name,
        x_client_code = @x_client_code,
        contact_no = @contact_no,
        client_email = @client_email,
        contact_person = @contact_person,
        client_add = @client_add,
        client_city = @client_city,
        client_state = @client_state,
        city_pincode = @city_pincode,
        client_gst_state_code = @client_gst_state_code,
        client_gst_no = @client_gst_no,
        sac_code = @sac_code,
        other_info = @other_info,
        terms = @terms,
        billing_company_id = @billing_company_id,
        billing_company = @billing_company,
        billing_branch_id = @billing_branch_id,
        billing_branch = @billing_branch,
        company_id = @company_id,
branch_id = @branch_id,
        company_bank_name = @company_bank_name,
        modified_on = FORMAT(
          DATEADD(MINUTE, 330, GETUTCDATE()),
          'yyyy-MM-dd HH:mm:ss'
        ),
        modified_by = @modified_by,
        modified_by_name = @modified_by_name
      WHERE id = @id
    `);

  await logAction("new_client", clientId, "UPDATE", pool);

  return true;
};
exports.updateBankDetails = async (clientId, data, user) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("id", sql.Int, clientId)
    .input("bank_name", sql.NVarChar, data.bankName || "")
    .input("client_acc_no", sql.NVarChar, data.accountNo || "")
    .input("ifsc_code", sql.NVarChar, data.ifscCode || "")
    .input("bank_branch", sql.NVarChar, data.branch || "")
    .input("bank_city", sql.NVarChar, data.bankCity || "")
    .input("modified_by", sql.NVarChar, user.id)
    .input("modified_by_name", sql.NVarChar, user.first_name)
    .input("micr_code", sql.NVarChar, data.micrCode || "").query(`
      UPDATE new_client
      SET
        bank_name = @bank_name,
        client_acc_no = @client_acc_no,
        ifsc_code = @ifsc_code,
        bank_branch = @bank_branch,
        bank_city = @bank_city,
        modified_by = @modified_by,
        modified_by_name = @modified_by_name,
        modified_on =FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss'),
        micr_code = @micr_code
      WHERE id = @id

      SELECT * FROM new_client WHERE id = @id
    `);

  console.log(result);
  const updatedClientBankDetails = result.recordset[0];
  await logAction("new_client", updatedClientBankDetails.id, "UPDATE");
  return true;
};

exports.updateClientAddSite = async (clientId, data, user, attachment) => {
  const pool = await poolPromise;
  
  // Check unique client code (excluding current client)
  if (data.clientcode) {
    const clientCodeCheck = await pool
      .request()
      .input("clientcode", sql.NVarChar, String(data.clientcode).toUpperCase())
      .input("clientId", sql.Int, clientId)
      .query(`SELECT id FROM new_client WHERE x_client_code = @clientcode AND id != @clientId`);
    if (clientCodeCheck.recordset.length > 0) {
      throw new Error("Client code already exists.");
    }
  }

  // Check unique site id
  if (data.sites && data.sites.length > 0) {
    for (const site of data.sites) {
      if (site.site_id) {
        // If site is new (doesn't have an ID in the DB yet), just check against all
        // If we are updating an existing site, we'd need its DB ID, but updateClientAddSite creates new sites for this client.
        // Assuming sites here are NEW sites being added to the client, or if they are being updated we need to check accordingly.
        const siteIdCheck = await pool
          .request()
          .input("site_id", sql.NVarChar, String(site.site_id).toUpperCase())
          .query(`SELECT id FROM client_rates WHERE new_site_id = @site_id`);
        if (siteIdCheck.recordset.length > 0) {
          throw new Error(`Site ID '${site.site_id}' already exists.`);
        }
      }
    }
  }

  const transaction = new sql.Transaction(pool);
  // console.log("Site Data :", data);
  try {
    await transaction.begin();

    // ====================================
    // UPDATE CLIENT (FORM 1 + FORM 2)
    // ====================================

    const result = await new sql.Request(transaction)
      .input("clientId", sql.Int, clientId)
      .input("companyName", sql.NVarChar, data.companyName)
      .input("contactNo", sql.NVarChar, data.contactNo)
      .input("emailId", sql.NVarChar, data.emailId)
      .input("contactPerson", sql.NVarChar, data.contactPersonName)
      .input("address", sql.NVarChar, data.address)
      .input("city", sql.NVarChar, data.city)
      .input("state", sql.NVarChar, data.state)
      .input("pincode", sql.NVarChar, data.pincode)
      .input("gstStateCode", sql.NVarChar, data.gstStateCode)
      .input("gstNo", sql.NVarChar, data.gstNo)
      .input("bankName", sql.NVarChar, data.bankName)
      .input("accountNo", sql.NVarChar, data.accountNo)
      .input("ifscCode", sql.NVarChar, data.ifscCode)
      .input("branch", sql.NVarChar, data.branch)
      .input("bankCity", sql.NVarChar, data.bankCity)
      .input("micrCode", sql.NVarChar, data.micrCode)
      .input("sacCode", sql.NVarChar, data.sacCode)
      .input("otherInfo", sql.NVarChar, data.otherInfo)
      .input("terms", sql.NVarChar, data.termsAndConditions)
      .input("companyBankName", sql.NVarChar, data.companyBankName)
      .input("modified_by", sql.NVarChar, user.id)
      .input("modified_by_name", sql.NVarChar, user.first_name)
      .input("billingCompanyId", sql.Int, data.billingCompany).query(`
        UPDATE new_client
        SET
            company_name = @companyName,
            contact_no = @contactNo,
            client_email = @emailId,
            contact_person = @contactPerson,
            client_add = @address,
            client_city = @city,
            client_state = @state,
            city_pincode = @pincode,
            client_gst_state_code = @gstStateCode,
            client_gst_no = @gstNo,
            bank_name = @bankName,
            client_acc_no = @accountNo,
            ifsc_code = @ifscCode,
            bank_branch = @branch,
            bank_city = @bankCity,
            micr_code = @micrCode,
            sac_code = @sacCode,
            other_info = @otherInfo,
            modified_by = @modified_by,
            modified_by_name = @modified_by_name,
            modified_on =FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss'),
            terms = @terms,
            company_bank_name = @companyBankName,
            billing_company_id = @billingCompanyId
        WHERE id = @clientId

       SELECT * FROM new_client WHERE id = @clientId;
      `);

    console.log(result.recordset[0].id);

    const updatedClientAddSite = result.recordset[0];
    await logAction(
      "new_client",
      updatedClientAddSite.id,
      "UPDATE",
      transaction,
    );

    // ====================================
    // INSERT NEW SITES ONLY
    // ====================================

    if (data.sites && data.sites.length) {
      for (const site of data.sites) {
        // Existing site skip
        if (site.rate_id) {
          continue;
        }
        // console.log("data :", data);

        const siteResult = await new sql.Request(transaction)
          .input("client_id", sql.Int, clientId)
          .input("cc_contact_person", sql.NVarChar, site.siteContactPerson)
          .input("site_name", sql.NVarChar, site.siteName)
          .input("work_order_no", sql.NVarChar, site.workOrderNo)
          .input("client_code", sql.NVarChar, data.clientcode || "")
          .input("cc_address", sql.NVarChar, site.siteAddress)
          .input("cc_billing_address", sql.NVarChar, site.billingAddress)
          .input("cc_contactno", sql.NVarChar, site.siteContactNo)
          .input("cc_emailid", sql.NVarChar, site.siteEmailId)
          .input("cc_city", sql.NVarChar, site.siteCity || "")
          .input("cc_state", sql.NVarChar, site.siteState || "")
          .input("cc_pincode", sql.NVarChar, site.sitePincode || "")
          .input("cc_country", sql.NVarChar, site.country || "")
          .input("cc_location_name", sql.NVarChar, site.sitezonename)
          .input("cc_branch_name", sql.NVarChar, site.cc_branch_name || "")
          .input("cc_site_hours", sql.NVarChar, site.cc_site_hours || "")
          .input("cc_total_manpower", sql.NVarChar, site.cc_total_manpower || "")
          .input(
  "attendance_upload_type",
  sql.NVarChar,
  site.attendanceUploadType || "",
)
          .input("cc_loct_Startdate", sql.Date, site.locationStartDate)
          .input("cc_expected_Date", sql.Date, site.locationEndDate)
          .input("cc_loct_Enddate", sql.Date, site.locationEndDate)
          .input("cc_sales_person", sql.NVarChar, site.salesPersonName)
          .input("cc_sales_person_email", sql.NVarChar, site.salesPersonEmailId)
          .input(
            "cc_sales_person_phone",
            sql.NVarChar,
            site.salesPersonContactNo,
          )
          .input("cc_bill_cycle_Date", sql.NVarChar, site.billCycleDate)
          .input("cc_loct_status", sql.NVarChar, site.status?.toUpperCase() || "")
          .input("cc_cgst", sql.Decimal(18, 2), site.cgst)
          .input("cc_sgst", sql.Decimal(18, 2), site.sgst)
          .input("cc_igst", sql.Decimal(18, 2), site.igst)
          .input(
            "cc_est_billing_amount",
            sql.Decimal(18, 2),
            site.expectedBillingAmount,
          )
          .input("office_latitude", sql.NVarChar, site.latitude)
          .input("office_longitude", sql.NVarChar, site.longitude)
          .input("billing_nodays", sql.Int, site.daysForBilling)
          .input("new_site_id", sql.NVarChar, site.site_id || "")
          .input("po_number", sql.NVarChar, site.ponumber || "")
          .input("contract_attachment", sql.NVarChar, attachment || null)
          .input("source", sql.NVarChar, "WEB")
          .input("created_by", sql.NVarChar, user.id)
          .input("created_by_name", sql.NVarChar, user.first_name)
          .input("modified_by", sql.NVarChar, user.id)
          .input("modified_by_name", sql.NVarChar, user.first_name)
          .input("display_ot", sql.Bit, site.viewOTHours ? 1 : 0)
          .input("attach_wages", sql.Bit, site.attachWagesSHeet ? 1 : 0)
          .input("convert_decimal", sql.Bit, site.roundOffAmount ? 1 : 0)
          .input("bill_without_rank", sql.Bit, site.billWithoutRank ? 1 : 0)
          .input("non_compliance", sql.Bit, site.nonComplianceSite ? 1 : 0)
          .input("apply_leave", sql.Bit, site.applyLeave ? 1 : 0).query(`
              INSERT INTO client_rates
              (
                  client_id,
                  cc_contact_person,
                  site_name,
                  work_order_no,
                  client_code,
                  cc_address,
                  cc_billing_address,
                  cc_contactno,
                  cc_emailid,
                  cc_city,
                  cc_state,
                  cc_pincode,
                  cc_country,
                  cc_location_name,
                  cc_branch_name,
                  cc_site_hours,
                  cc_total_manpower,
                  attendance_upload_type,
                  cc_loct_Startdate,
                  cc_expected_Date,
                  cc_loct_Enddate,
                  cc_sales_person,
                  cc_sales_person_email,
                  cc_sales_person_phone,
                  cc_bill_cycle_Date,
                  cc_loct_status,
                  cc_cgst,
                  cc_sgst,
                  cc_igst,
                  cc_est_billing_amount,
                  office_latitude,
                  office_longitude,
                  billing_nodays,
                  new_site_id,
                  po_number,
                  contract_attachment,
                  source,
                  display_ot,
                  attach_wages,
                  convert_decimal,
                  bill_without_rank,
                  non_compliance,
                  apply_leave,
                  created_by,
                  created_by_name,
                  created_on,
                  modified_by,
                  modified_by_name,
                  modified_on
              )
              OUTPUT INSERTED.id
              VALUES
              (
                  @client_id,
                  @cc_contact_person,
                  @site_name,
                  @work_order_no,
                  @client_code,
                  @cc_address,
                  @cc_billing_address,
                  @cc_contactno,
                  @cc_emailid,
                  @cc_city,
                  @cc_state,
                  @cc_pincode,
                  @cc_country,
                  @cc_location_name,
                  @cc_branch_name,
                  @cc_site_hours,
                  @cc_total_manpower,
                  @attendance_upload_type,
                  @cc_loct_Startdate,
                  @cc_expected_Date,
                  @cc_loct_Enddate,
                  @cc_sales_person,
                  @cc_sales_person_email,
                  @cc_sales_person_phone,
                  @cc_bill_cycle_Date,
                  @cc_loct_status,
                  @cc_cgst,
                  @cc_sgst,
                  @cc_igst,
                  @cc_est_billing_amount,
                  @office_latitude,
                  @office_longitude,
                  @billing_nodays,
                  @new_site_id,
                  @po_number,
                  @contract_attachment,
                  @source,
                  @display_ot,
                  @attach_wages,
                  @convert_decimal,
                  @bill_without_rank,
                  @non_compliance,
                  @apply_leave,
                  @created_by,
                  @created_by_name,
                  FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss'),
                  @modified_by,
                  @modified_by_name,
                  FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss')
              )
          `);

        const rateId = siteResult.recordset[0].id;
        await logAction("client_rates", rateId, "CREATE", transaction);
        // ====================================
        // client_other_info
        // ====================================

        if (site.rates?.length) {
          for (const rate of site.rates) {
            let clientOtherInfo = await new sql.Request(transaction)
              .input("client_id", sql.Int, clientId)
              .input("rate_id", sql.Int, rateId)

              .input("emp_type", sql.NVarChar, rate.empType || "")
              .input("emp_hours", sql.Decimal(18, 2), Number(rate.hours || 0))
              .input("emp_nos", sql.Int, Number(rate.nos || 0))

              .input("emp_basic", sql.Decimal(18, 2), Number(rate.basic || 0))
              .input("emp_basicda", sql.Decimal(18, 2), Number(rate.hra || 0))
              .input("emp_da", sql.Decimal(18, 2), Number(rate.da || 0))

              .input(
                "special_allow",
                sql.Decimal(18, 2),
                Number(rate.specialAllowance || 0),
              )

              .input(
                "other_allow",
                sql.Decimal(18, 2),
                Number(rate.otherAllowance || 0),
              )

              .input("lww", sql.Decimal(18, 2), Number(rate.lww || 0))
              .input("bonus", sql.Decimal(18, 2), Number(rate.bonus || 0))

              .input(
                "emp_total_cost",
                sql.Decimal(18, 2),
                Number(rate.gross || 0),
              )

              .input(
                "service_charges_type",
                sql.NVarChar,
                rate.serviceChargeType || "",
              )

              .input(
                "service_charges",
                sql.Decimal(18, 2),
                Number(rate.serviceCharge || 0),
              )

              .input(
                "emp_perday_rate",
                sql.Decimal(18, 2),
                Number(rate.perDayRate || 0),
              )

              .input("ot_rate", sql.Decimal(18, 2), Number(rate.otRate || 0))

              .input(
                "fixed_leave_wages",
                sql.Decimal(18, 2),
                Number(rate.leaveWages || 0),
              )

              .input(
                "fixed_uniform_wages",
                sql.Decimal(18, 2),
                Number(rate.uniformWashing || 0),
              )

              .input("modified_by", sql.NVarChar, user.id)
              .input("modified_by_name", sql.NVarChar, user.first_name)

              .input(
                "any_other",
                sql.Decimal(18, 2),
                Number(rate.anyOther || 0),
              ).query(`
                  INSERT INTO client_other_info
                  (
                      client_id,
                      rate_id,
                      emp_type,
                      emp_hours,
                      emp_nos,
                      emp_basic,
                      emp_basicda,
                      emp_da,
                      special_allow,
                      other_allow,
                      bonus,
                      ot_rate,
                      lww,
                      fixed_leave_wages,
                      fixed_uniform_wages,
                      any_other,
                      emp_total_cost,
                      service_charges_type,
                      service_charges,
                      emp_perday_rate,
                      modified_by,
                      modified_by_name,
                      modified_on
                  )
                            OUTPUT INSERTED.*
                  VALUES
                  (
                      @client_id,
                      @rate_id,
                      @emp_type,
                      @emp_hours,
                      @emp_nos,
                      @emp_basic,
                      @emp_basicda,
                      @emp_da,
                      @special_allow,
                      @other_allow,
                      @bonus,
                      @ot_rate,
                      @lww,
                      @fixed_leave_wages,
                      @fixed_uniform_wages,
                      @any_other,
                      @emp_total_cost,
                      @service_charges_type,
                      @service_charges,
                      @emp_perday_rate,
                      @modified_by,
                      @modified_by_name,
                     FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss')
                  )
              `);
            const updatedOtherInfo = clientOtherInfo.recordset[0];
            await logAction(
              "client_other_info",
              updatedOtherInfo.id,
              "UPDATE",
              transaction,
            );
          }
        }

        // ==========================
        // CLIENT SERVICE CHARGES (otherCharges)
        // ==========================
        if (site.otherCharges && site.otherCharges.length > 0) {
          for (const charge of site.otherCharges) {
            if (!charge.serviceType && !charge.charges) continue; // skip empty rows

            const insertCharges = await transaction
              .request()
              .input("client_id", sql.Int, clientId)
              .input("rate_id", sql.Int, rateId)
              .input("type_of_services", sql.NVarChar, charge.serviceType || "")
              .input("count_services", sql.NVarChar, charge.chargesType || "Rs")
              .input(
                "charges_services",
                sql.Decimal(18, 2),
                Number(charge.charges || 0),
              )
              .input("ea_calculateon", sql.NVarChar, charge.calculateOn?.toUpperCase() || "")
              .input("ea_operator", sql.NVarChar, charge.condition?.toUpperCase() || "")
              .input("ea_comp_operator", sql.NVarChar, charge.amountRange || "")
              .input("created_by", sql.NVarChar, user.id)
              .input("created_by_name", sql.NVarChar, user.first_name)
              .input("source", sql.NVarChar, "WEB").query(`
                  INSERT INTO client_service_charges
                  (
                    client_id,
                    rate_id,
                    type_of_services,
                    count_services,
                    charges_services,
                    ea_calculateon,
                    ea_operator,
                    ea_comp_operator,
                    source,
                    created_by,
                    created_on,
                    created_by_name
                  )
                    OUTPUT INSERTED.id
                  VALUES
                  (
                    @client_id,
                    @rate_id,
                    @type_of_services,
                    @count_services,
                    @charges_services,
                    @ea_calculateon,
                    @ea_operator,
                    @ea_comp_operator,
                    @source,
                    @created_by,
                  FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss'),
                    @created_by_name
                  )
                `);

            const serviceChargeId = insertCharges.recordset[0].id;

            await logAction(
              "client_service_charges",
              serviceChargeId,
              "CREATE",
              transaction,
            );
          }
        }
      }
    }

    await transaction.commit();

    return {
      clientId,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};
