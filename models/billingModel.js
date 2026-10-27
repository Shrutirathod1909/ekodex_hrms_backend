const { poolPromise, sql } = require("../config/db");

// ================= GET BILL =================
const getBillByClientSite = async (
  client_id,
  site_id,
  month,
  year
) => {
  const pool = await poolPromise;
  console.log("client id, site id, month, year",client_id,
  site_id,
  month,
  year)

  const result = await pool
    .request()
    .input("client_id", sql.Int, client_id)
    .input("site_id", sql.Int, site_id)
    .input("month", sql.Int, month)
    .input("year", sql.Int, year)
    .query(`
      SELECT
        bd.*,

        -- ORDER DATA
        o.id AS order_id,
        o.client_id AS order_client_id,
        o.unit_id AS order_unit_id,
        o.type AS order_type,

        o.invoice_no AS order_invoice_no,
        o.auto_no AS order_auto_no,

        o.invoice_month AS order_invoice_month,
        o.invoice_year AS order_invoice_year,

        o.total_nos AS order_total_nos,
        o.cost_per_head AS order_cost_per_head,
        o.total AS order_total,

        o.status AS order_status,
        o.invoice_date AS order_invoice_date,

        o.service_charges_type,
        o.service_charges,

        o.no_of_days,

        o.emp_name,
        o.emp_code,
        o.sac_code,

        o.tb_date,
        o.tb_from,
        o.tb_to,
        o.lr_no,
        o.tb_vehicle_no,
        o.tb_weight,
        o.tb_invoice_no,

        o.source AS order_source,
        o.client_name AS order_client_name,
        o.site_name AS order_site_name

      FROM bill_details bd

      LEFT JOIN orders o
        ON o.invoice_no = bd.invoice_no
        AND o.auto_no = bd.auto_no
        AND o.client_id = bd.client_id
        AND o.unit_id = bd.rate_id

      WHERE bd.client_id = @client_id
        AND bd.rate_id = @site_id
        AND bd.invoice_month = @month
        AND bd.invoice_year = @year
        AND bd.active = '0'
    `);

    console.log("Order and billin data", result.recordset)

  return result.recordset;
};

// ================= GET CLIENT =================
const getClient = async (client_id) => {

  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("client_id", sql.Int, client_id)
    .query(`
      SELECT *
      FROM new_client
      WHERE id = @client_id
    `);

  return result.recordset;
};
const getBillingCount = async (
  userId,
  status,
  wo,
  filters = [],
  month = "",
  year = "",
  gstType = "all",
  companyId = null,
  isSuperAdmin = false
) => {
  const pool = await poolPromise;
  const request = pool.request();

  let query = `
    SELECT COUNT(*) AS totalBills
    FROM bill_details bd

    LEFT JOIN new_client nc
      ON bd.client_id = nc.id

    LEFT JOIN client_rates cr
      ON bd.rate_id = cr.id

    WHERE bd.active = 0
  `;

  // =========================================
  // COMPANY FILTER
  // Super Admin: All companies
  // Admin: Own company only
  // =========================================

  if (!isSuperAdmin) {
    if (
      companyId === null ||
      companyId === undefined ||
      companyId === "" ||
      !Number.isSafeInteger(Number(companyId)) ||
      Number(companyId) <= 0
    ) {
      throw new Error("Valid company ID is required");
    }

    request.input(
      "companyId",
      sql.Int,
      Number(companyId)
    );

    query += `
      AND nc.billing_company_id = @companyId
    `;
  }

  // =========================================
  // STATUS FILTER
  // =========================================

  if (status) {
    request.input(
      "status",
      sql.VarChar(50),
      String(status)
    );

    query += `
      AND bd.status = @status
    `;
  }

  // =========================================
  // SEARCH FILTER
  // =========================================

  if (wo) {
    request.input(
      "search",
      sql.NVarChar(200),
      `%${String(wo)}%`
    );

    query += `
      AND (
        bd.invoice_no LIKE @search
        OR bd.bill_title LIKE @search
        OR nc.company_name LIKE @search
        OR nc.x_client_code LIKE @search
        OR cr.site_name LIKE @search
      )
    `;
  }

  // =========================================
  // DYNAMIC FILTERS
  // =========================================

  if (Array.isArray(filters)) {
    filters.forEach((filter, index) => {
      if (
        filter.keyword === undefined ||
        filter.keyword === null ||
        String(filter.keyword).trim() === ""
      ) {
        return;
      }

      const paramName = `filter${index}`;

      request.input(
        paramName,
        sql.NVarChar(200),
        `%${String(filter.keyword).trim()}%`
      );

      const p = `@${paramName}`;

      if (filter.field?.value) {
        switch (filter.field.value) {
          case "invoice_no":
            query += `
              AND bd.invoice_no LIKE ${p}
            `;
            break;

          case "company_name":
          case "client_name":
            query += `
              AND nc.company_name LIKE ${p}
            `;
            break;

          case "site_name":
            query += `
              AND cr.site_name LIKE ${p}
            `;
            break;

          case "x_client_code":
          case "client_code":
            query += `
              AND nc.x_client_code LIKE ${p}
            `;
            break;

          case "client_email":
            query += `
              AND nc.client_email LIKE ${p}
            `;
            break;

          case "cc_location_name":
            query += `
              AND nc.cc_location_name LIKE ${p}
            `;
            break;

          case "contact_person":
            query += `
              AND nc.contact_person LIKE ${p}
            `;
            break;

          case "billing_company":
            query += `
              AND nc.billing_company LIKE ${p}
            `;
            break;

          case "billing_company_id":
            query += `
              AND CAST(nc.billing_company_id AS VARCHAR(100))
                  LIKE ${p}
            `;
            break;

          case "billing_branch":
            query += `
              AND nc.billing_branch LIKE ${p}
            `;
            break;

          case "billing_branch_id":
            query += `
              AND CAST(nc.billing_branch_id AS VARCHAR(100))
                  LIKE ${p}
            `;
            break;
        }
      } else {
        query += `
          AND (
            bd.invoice_no LIKE ${p}
            OR bd.bill_title LIKE ${p}
            OR nc.company_name LIKE ${p}
            OR nc.client_email LIKE ${p}
            OR nc.cc_location_name LIKE ${p}
            OR nc.contact_person LIKE ${p}
            OR nc.x_client_code LIKE ${p}
            OR cr.site_name LIKE ${p}
            OR nc.billing_company LIKE ${p}
            OR CAST(nc.billing_company_id AS VARCHAR(100))
                LIKE ${p}
            OR nc.billing_branch LIKE ${p}
            OR CAST(nc.billing_branch_id AS VARCHAR(100))
                LIKE ${p}
          )
        `;
      }
    });
  }

  // =========================================
  // MONTH FILTER
  // =========================================

  if (month && Number(month) >= 1 && Number(month) <= 12) {
    request.input("month", sql.Int, Number(month));

    query += `
      AND MONTH(bd.invoice_date) = @month
    `;
  }

  // =========================================
  // YEAR FILTER
  // =========================================

  if (year && Number(year) > 0) {
    request.input("year", sql.Int, Number(year));

    query += `
      AND YEAR(bd.invoice_date) = @year
    `;
  }

  // =========================================
  // GST / NON-GST FILTER
  // =========================================

  if (gstType === "gst") {
    query += `
      AND (
        ISNULL(TRY_CAST(bd.cgst AS DECIMAL(18, 2)), 0) > 0
        OR ISNULL(TRY_CAST(bd.sgst AS DECIMAL(18, 2)), 0) > 0
        OR ISNULL(TRY_CAST(bd.igst AS DECIMAL(18, 2)), 0) > 0
      )
    `;
  } else if (gstType === "non-gst") {
    query += `
      AND (
        ISNULL(TRY_CAST(bd.cgst AS DECIMAL(18, 2)), 0) = 0
        AND ISNULL(TRY_CAST(bd.sgst AS DECIMAL(18, 2)), 0) = 0
        AND ISNULL(TRY_CAST(bd.igst AS DECIMAL(18, 2)), 0) = 0
      )
    `;
  }

  // =========================================
  // EXECUTE QUERY
  // =========================================

  console.log("========== BILLING COUNT ==========");
  console.log("Super Admin:", isSuperAdmin);
  console.log(
    "Company ID:",
    isSuperAdmin ? "ALL COMPANIES" : companyId
  );
  console.log(query);
  console.log("===================================");

  const result = await request.query(query);

  return result.recordset[0];
};
// ================= GET SITE =================
const getSite = async (rate_id) => {

  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("rate_id", sql.Int, rate_id)
    .query(`
      SELECT *
      FROM client_rates
      WHERE id = @rate_id
    `);

  return result.recordset;
};
// ================= GET BILLING LIST =================

const getBillingList = async (
  userId,
  page,
  perPage,
  status,
  wo,
  filters = [],
  month = "",
  year = "",
  gstType = "all",
  companyId = null,
  isSuperAdmin = false
) => {
  const pool = await poolPromise;
  const request = pool.request();

  let query = `
    SELECT
      bd.id,
      bd.client_id,
      bd.rate_id,
      bd.invoice_no,
      bd.auto_no,
      bd.invoice_month,
      bd.invoice_year,
      bd.created_by,
      bd.created_on,
      bd.total_nos,
      bd.total_cost_without_gst,
      bd.cgst,
      bd.cgst_perc,
      bd.sgst,
      bd.sgst_perc,
      bd.igst,
      bd.igst_perc,
      bd.final_amount,

      ISNULL(ph.paid_amount, 0) AS paid_amount,

      (
        ISNULL(bd.final_amount, 0)
        - ISNULL(ph.paid_amount, 0)
      ) AS balance_amount,

      bd.uniqueid,
      bd.status,
      bd.active,
      bd.invoice_date,
      bd.costperheadbill,
      bd.invoice_from,
      bd.invoice_to,
      bd.billing_type,
      bd.modified_by,
      bd.modified_on,
      bd.month_days,
      bd.bill_title,
      bd.source,

      nc.company_name,
      nc.client_email,
      nc.contact_person,
      nc.x_client_code,

      nc.billing_company AS billing_company,
      nc.billing_company_id AS billing_company_id,
      nc.billing_branch AS billing_branch,
      nc.billing_branch_id AS billing_branch_id,

      cr.site_name

    FROM bill_details bd

    LEFT JOIN new_client nc
      ON bd.client_id = nc.id

    LEFT JOIN client_rates cr
      ON bd.rate_id = cr.id

    LEFT JOIN (
      SELECT
        bill_no,
        SUM(
          TRY_CAST(paid_amount AS DECIMAL(18, 2))
        ) AS paid_amount
      FROM payment_history
      GROUP BY bill_no
    ) ph
      ON ph.bill_no = bd.invoice_no

    WHERE bd.active = 0

    AND EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.auto_no = bd.auto_no
        AND o.active = 0
    )
  `;

  // =========================================
  // COMPANY FILTER
  // Super Admin = All companies
  // Admin = Own company only
  // =========================================

  if (!isSuperAdmin) {
    if (
      companyId === null ||
      companyId === undefined ||
      companyId === "" ||
      !Number.isSafeInteger(Number(companyId)) ||
      Number(companyId) <= 0
    ) {
      throw new Error("Valid company ID is required");
    }

    request.input(
      "companyId",
      sql.Int,
      Number(companyId)
    );

    query += `
      AND nc.billing_company_id = @companyId
    `;
  }

  // =========================================
  // STATUS FILTER
  // =========================================

  if (status) {
    request.input("status", sql.VarChar(50), String(status));

    query += `
      AND bd.status = @status
    `;
  }

  // =========================================
  // SEARCH
  // =========================================

  if (wo) {
    request.input("search", sql.NVarChar(200), `%${wo}%`);

    query += `
      AND (
        bd.invoice_no LIKE @search
        OR bd.bill_title LIKE @search
        OR nc.company_name LIKE @search
        OR nc.x_client_code LIKE @search
        OR cr.site_name LIKE @search
        OR nc.billing_company LIKE @search
        OR CAST(nc.billing_company_id AS VARCHAR(100))
           LIKE @search
        OR nc.billing_branch LIKE @search
        OR CAST(nc.billing_branch_id AS VARCHAR(100))
           LIKE @search
      )
    `;
  }

  // =========================================
  // DYNAMIC FILTERS
  // =========================================

  if (Array.isArray(filters)) {
    filters.forEach((filter, index) => {
      if (
        filter.keyword === undefined ||
        filter.keyword === null ||
        String(filter.keyword).trim() === ""
      ) {
        return;
      }

      const paramName = `filter${index}`;

      request.input(
        paramName,
        sql.NVarChar(200),
        `%${String(filter.keyword).trim()}%`
      );

      const p = `@${paramName}`;

      if (filter.field?.value) {
        switch (filter.field.value) {
          case "invoice_no":
            query += ` AND bd.invoice_no LIKE ${p}`;
            break;

          case "company_name":
          case "client_name":
            query += ` AND nc.company_name LIKE ${p}`;
            break;

          case "site_name":
            query += ` AND cr.site_name LIKE ${p}`;
            break;

          case "x_client_code":
          case "client_code":
            query += ` AND nc.x_client_code LIKE ${p}`;
            break;

          case "client_email":
            query += ` AND nc.client_email LIKE ${p}`;
            break;

          case "cc_location_name":
            query += ` AND nc.cc_location_name LIKE ${p}`;
            break;

          case "contact_person":
            query += ` AND nc.contact_person LIKE ${p}`;
            break;

          case "billing_company":
            query += ` AND nc.billing_company LIKE ${p}`;
            break;

          case "billing_company_id":
            query += `
              AND CAST(nc.billing_company_id AS VARCHAR(100))
                  LIKE ${p}
            `;
            break;

          case "billing_branch":
            query += ` AND nc.billing_branch LIKE ${p}`;
            break;

          case "billing_branch_id":
            query += `
              AND CAST(nc.billing_branch_id AS VARCHAR(100))
                  LIKE ${p}
            `;
            break;
        }
      } else {
        query += `
          AND (
            bd.invoice_no LIKE ${p}
            OR bd.bill_title LIKE ${p}
            OR nc.company_name LIKE ${p}
            OR nc.client_email LIKE ${p}
            OR nc.cc_location_name LIKE ${p}
            OR nc.contact_person LIKE ${p}
            OR nc.x_client_code LIKE ${p}
            OR cr.site_name LIKE ${p}
            OR nc.billing_company LIKE ${p}
            OR CAST(nc.billing_company_id AS VARCHAR(100))
               LIKE ${p}
            OR nc.billing_branch LIKE ${p}
            OR CAST(nc.billing_branch_id AS VARCHAR(100))
               LIKE ${p}
          )
        `;
      }
    });
  }

  // =========================================
  // MONTH FILTER
  // =========================================

  if (month && Number(month) >= 1 && Number(month) <= 12) {
    request.input("month", sql.Int, Number(month));

    query += `
      AND MONTH(bd.invoice_date) = @month
    `;
  }

  // =========================================
  // YEAR FILTER
  // =========================================

  if (year && Number(year) > 0) {
    request.input("year", sql.Int, Number(year));

    query += `
      AND YEAR(bd.invoice_date) = @year
    `;
  }

  // =========================================
  // GST / NON-GST FILTER
  // =========================================

  if (gstType === "gst") {
    query += `
      AND (
        ISNULL(TRY_CAST(bd.cgst AS DECIMAL(18, 2)), 0) > 0
        OR ISNULL(TRY_CAST(bd.sgst AS DECIMAL(18, 2)), 0) > 0
        OR ISNULL(TRY_CAST(bd.igst AS DECIMAL(18, 2)), 0) > 0
      )
    `;
  } else if (gstType === "non-gst") {
    query += `
      AND (
        ISNULL(TRY_CAST(bd.cgst AS DECIMAL(18, 2)), 0) = 0
        AND ISNULL(TRY_CAST(bd.sgst AS DECIMAL(18, 2)), 0) = 0
        AND ISNULL(TRY_CAST(bd.igst AS DECIMAL(18, 2)), 0) = 0
      )
    `;
  }

  // =========================================
  // ORDER AND PAGINATION
  // =========================================

  query += ` ORDER BY bd.id DESC `;

  const safePage = Math.max(0, Number(page) || 0);
  const safePerPage = Math.max(1, Number(perPage) || 10);
  const offset = safePage * safePerPage;

  request.input("offset", sql.Int, offset);
  request.input("perPage", sql.Int, safePerPage);

  query += `
    OFFSET @offset ROWS
    FETCH NEXT @perPage ROWS ONLY
  `;

  console.log("========== BILLING LIST QUERY ==========");
  console.log("Super Admin:", isSuperAdmin);
  console.log("Company ID:", isSuperAdmin ? "ALL" : companyId);
  console.log(query);
  console.log("=========================================");

  const result = await request.query(query);

  return result.recordset;
};
const changeInvoice = async (data, user) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // ==========================
    // GET USER NAME
    // ==========================
    let userName = "";

    const userResult = await new sql.Request(transaction)
      .input("userId", sql.BigInt, user.id)
      .query(`
        SELECT first_name
        FROM users
        WHERE id = @userId
      `);

    if (userResult.recordset.length > 0) {
      userName = userResult.recordset[0].first_name;
    }

    // ==========================
    // CHECK DUPLICATE INVOICE NO
    // ==========================
    const duplicateResult = await new sql.Request(transaction)
      .input("invoice_no", sql.VarChar, data.invoice_no)
      .input("auto_no", sql.VarChar, data.auto_no)
      .query(`
        SELECT TOP 1 auto_no
        FROM bill_details
        WHERE invoice_no = @invoice_no
          AND auto_no <> @auto_no
          AND active = 0
      `);

    if (duplicateResult.recordset.length > 0) {
      await transaction.rollback();

      return {
        success: false,
        message: "Invoice Number Already Exists",
      };
    }
    await new sql.Request(transaction)
      .input("auto_no", sql.VarChar, data.auto_no)
      .input("invoice_no", sql.VarChar, data.invoice_no)
      .input("invoice_date", sql.Date, data.invoice_date)
      .input("invoice_from", sql.Date, data.invoice_from)
      .input("invoice_to", sql.Date, data.invoice_to)
      .input("modified_by", sql.BigInt, user.id)
      .input("modified_by_name", sql.VarChar, userName)
      .query(`
        UPDATE bill_details
        SET
            invoice_no = @invoice_no,
            invoice_date = @invoice_date,
            invoice_from = @invoice_from,
            invoice_to = @invoice_to,
            modified_by = @modified_by,
            modified_by_name = @modified_by_name,
            modified_on = GETDATE()
        WHERE auto_no = @auto_no
      `);
    // ==========================
    // BILL DETAILS LOG
    // ==========================
    await new sql.Request(transaction)
      .input("auto_no", sql.VarChar, data.auto_no)
      .query(`
        INSERT INTO bill_details_log
        (
            client_id,
            rate_id,
            client_name,
            site_name,
            invoice_no,
            auto_no,
            invoice_month,
            invoice_year,
            created_by,
            created_by_name,
            created_on,
            total_nos,
            total_cost_without_gst,
            cgst,
            cgst_perc,
            sgst,
            sgst_perc,
            igst,
            igst_perc,
            final_amount,
            invoice_date,
            invoice_from,
            invoice_to,
            bill_title,
            modified_by,
            modified_by_name,
            modified_on,
            source,
            active_id,
            active_remark,
            log_created_on
        )
        SELECT
            client_id,
            rate_id,
            client_name,
            site_name,
            invoice_no,
            auto_no,
            invoice_month,
            invoice_year,
            created_by,
            created_by_name,
            created_on,
            total_nos,
            total_cost_without_gst,
            cgst,
            cgst_perc,
            sgst,
            sgst_perc,
            igst,
            igst_perc,
            final_amount,
            invoice_date,
            invoice_from,
            invoice_to,
            bill_title,
            modified_by,
            modified_by_name,
            modified_on,
            source,
            id,
            'Invoice Updated',
            GETDATE()
        FROM bill_details
        WHERE auto_no = @auto_no
      `);

    // ==========================
    // UPDATE BILL DETAILS
    // ==========================

  await new sql.Request(transaction)
      .input("auto_no", sql.VarChar, data.auto_no)
      .input("invoice_no", sql.VarChar, data.invoice_no)
      .input("invoice_date", sql.Date, data.invoice_date)
      .input("invoice_from", sql.Date, data.invoice_from)
      .input("invoice_to", sql.Date, data.invoice_to)
      .input("modified_by", sql.BigInt, user.id)
      .input("modified_by_name", sql.VarChar, userName)
      .query(`
        UPDATE orders
        SET
            invoice_no = @invoice_no,
            invoice_date = @invoice_date,
            tb_from = @invoice_from,
            tb_to = @invoice_to,
            modified_by = @modified_by,
            modified_by_name = @modified_by_name,
            modified_on = GETDATE()
        WHERE auto_no = @auto_no
          AND active = 0
      `);

    // ==========================
    // ORDERS LOG
    // ==========================
    await new sql.Request(transaction)
      .input("auto_no", sql.VarChar, data.auto_no)
      .input("modified_by", sql.BigInt, user.id)
      .input("modified_by_name", sql.VarChar, userName)
      .query(`
        INSERT INTO orders_log
        (
            client_id,
            unit_id,
            type,
            client_name,
            site_name,
            invoice_month,
            invoice_year,
            total_nos,
            cost_per_head,
            status,
            created_by,
            created_by_name,
            created_on,
            invoice_date,
            uniqueid,
            service_charges_type,
            service_charges,
            total,
            invoice_no,
            auto_no,
            active,
            no_of_days,
            emp_name,
            emp_code,
            sac_code,
            tb_date,
            tb_from,
            tb_to,
            lr_no,
            tb_vehicle_no,
            tb_weight,
            tb_invoice_no,
            source,
            active_id,
            active_remark,
            modified_by,
            modified_by_name,
            modified_on,
            log_created_on
        )
        SELECT
            client_id,
            unit_id,
            type,
            client_name,
            site_name,
            invoice_month,
            invoice_year,
            total_nos,
            cost_per_head,
            status,
            created_by,
            created_by_name,
            created_on,
            invoice_date,
            uniqueid,
            service_charges_type,
            service_charges,
            total,
            invoice_no,
            auto_no,
            active,
            no_of_days,
            emp_name,
            emp_code,
            sac_code,
            tb_date,
            tb_from,
            tb_to,
            lr_no,
            tb_vehicle_no,
            tb_weight,
            tb_invoice_no,
            source,
            id,
            'Invoice Updated',
            @modified_by,
            @modified_by_name,
            GETDATE(),
            GETDATE()
        FROM orders
        WHERE auto_no = @auto_no
          AND active = 0
      `);

    // ==========================
    // UPDATE ORDERS
    // ==========================
  
    await transaction.commit();

    return {
      success: true,
      message: "Invoice Updated Successfully",
    };

  } catch (err) {

    if (transaction._aborted !== true) {
      await transaction.rollback();
    }

    console.log(err);

    return {
      success: false,
      message: err.message,
    };
  }
};

const getPaymentHistory = async (invoice_no) => {

  const pool = await poolPromise;


  const result = await pool
    .request()

    .input(
      "invoice_no",
      sql.VarChar,
      invoice_no
    )

    .query(`

        SELECT

            payment_historyid,

            bill_no,

            paid_amount,

            tax_type,

            tax_percent,

            tax_paid,

            transaction_type,

            transaction_id,

            bank_name,

            created_on,

            uid,

            payment_date,

            tds,

            source


        FROM payment_history


        WHERE bill_no = @invoice_no


        ORDER BY payment_historyid DESC


    `);


  return result.recordset;

};
const getBillByAutoNo = async (autoNo) => {

  const pool = await poolPromise;

  try {

    // ============================
    // BILL HEADER DATA
    // ============================

    const billResult = await pool.request()

      .input(
        "autoNo",
        sql.VarChar,
        autoNo
      )

      .query(`

                SELECT

                    b.id,
                    b.client_id,
                    b.rate_id,

                    b.invoice_no,
                    b.auto_no,

                    b.invoice_month,
                    b.invoice_year,

                    b.created_by,
                    b.created_on,

                    b.total_nos,
                    b.total_cost_without_gst,

                    b.cgst,
                    b.cgst_perc,

                    b.sgst,
                    b.sgst_perc,

                    b.igst,
                    b.igst_perc,

                    b.final_amount,

                    b.uniqueid,
                    b.status,
                    b.active,

                    b.invoice_date,

                    b.costperheadbill,

                    b.invoice_from,
                    b.invoice_to,

                    b.billing_type,

                    b.modified_by,
                    b.modified_on,

                    b.month_days,

                    b.bill_title,

                    b.source,


                    c.company_name,


                    cr.site_name,

                    cr.id AS site_id


                FROM bill_details b


                LEFT JOIN new_client c
                    ON c.id = b.client_id


                LEFT JOIN client_rates cr
                    ON cr.id = b.rate_id


                WHERE b.auto_no = @autoNo

            `);



    if (billResult.recordset.length === 0) {
      return null;
    }


    const bill = billResult.recordset[0];



    // ============================
    // ITEMS FROM ORDERS TABLE
    // ============================


    const itemResult = await pool.request()

      .input(
        "autoNo",
        sql.VarChar,
        autoNo
      )

      .query(`

                SELECT

                    id,

                    client_id,

                    unit_id,

                    type,

                    emp_name,

                    emp_code,

                    sac_code,

                    total_nos,

                    cost_per_head,

                    total,

                    invoice_month,

                    invoice_year,

                    invoice_no,

                    auto_no


                FROM orders


                WHERE auto_no = @autoNo
AND active = 0

            `);



    return {

      ...bill,

      items: itemResult.recordset

    };


  }
  catch (error) {

    console.log(
      "GET BILL BY AUTO NO ERROR",
      error
    );

    throw error;

  }

};



const getBillingExcelData = async (gstType = "all") => {

  const pool = await poolPromise;


  const query = `

    SELECT

        bd.invoice_no,
        nc.company_name,
        cr.site_name,

        bd.invoice_date,
        bd.invoice_month,
        bd.invoice_year,


        o.type AS item_description,
        o.sac_code,

        o.total_nos AS qty,

        o.cost_per_head AS rate,

        o.total AS net_amount,


        bd.cgst,
        bd.sgst,
        bd.igst,

        bd.final_amount


    FROM bill_details bd


    LEFT JOIN new_client nc
    ON bd.client_id = nc.id


    LEFT JOIN client_rates cr
    ON bd.rate_id = cr.id


    LEFT JOIN orders o
    ON bd.auto_no = o.auto_no


    WHERE bd.active = 0


    AND
    (

        -- ALL BILL
        @gstType = 'all'


        OR


        -- GST BILL
        (
            @gstType = 'gst'

            AND

            (
                TRY_CONVERT(decimal(18,2), bd.igst) > 0

                OR

                (
                    TRY_CONVERT(decimal(18,2), bd.cgst) > 0

                    AND

                    TRY_CONVERT(decimal(18,2), bd.sgst) > 0
                )

            )

        )


        OR


        -- NON GST BILL
        (
            @gstType = 'non-gst'

            AND

            ISNULL(
                TRY_CONVERT(decimal(18,2), bd.cgst),
                0
            ) = 0


            AND


            ISNULL(
                TRY_CONVERT(decimal(18,2), bd.sgst),
                0
            ) = 0


            AND


            ISNULL(
                TRY_CONVERT(decimal(18,2), bd.igst),
                0
            ) = 0

        )


    )


    ORDER BY bd.id DESC

    `;



  const request = pool.request();


  request.input(
    "gstType",
    sql.VarChar,
    gstType
  );


  const result = await request.query(query);


  return result.recordset;

};
const searchBillingSuggestions = async (field, keyword) => {
  try {
    const pool = await poolPromise;

    let column = "";

    switch (field) {
      case "invoice_no":
        column = "bd.invoice_no";
        break;

      case "client_name":
      case "company_name":
        column = "nc.company_name";
        break;

      case "site_name":
        column = "cr.site_name";
        break;

      case "x_client_code":
        column = "nc.x_client_code";
        break;

      case "billing_company":
        column = "nc.billing_company";
        break;

      case "billing_branch":
        column = "nc.billing_branch";
        break;

      default:
        return [];
    }

    if (!keyword || keyword.trim().length < 2) {
      return [];
    }

    const result = await pool
      .request()
      .input("keyword", sql.VarChar, `%${keyword.trim()}%`)
      .query(`
        SELECT DISTINCT TOP (10)
            ${column} AS value
        FROM bill_details bd

        LEFT JOIN new_client nc
            ON bd.client_id = nc.id

        LEFT JOIN client_rates cr
            ON bd.rate_id = cr.id

        WHERE
            bd.active = 0
            AND EXISTS (
                SELECT 1
                FROM orders o
                WHERE o.auto_no = bd.auto_no
                  AND o.active = 0
            )
            AND ${column} IS NOT NULL
            AND LTRIM(RTRIM(${column})) <> ''
            AND ${column} LIKE @keyword

        ORDER BY ${column};
      `);

    return result.recordset.map((row) => row.value);

  } catch (error) {
    console.log("Search Suggestion Error:", error);
    throw error;
  }
};


// ======================================
// UPDATE BILL
// ======================================
const updateBill = async (data) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {

    console.log("DELETED ROWS:", data.deletedRows);
    await transaction.begin();
    const duplicateInvoice = await new sql.Request(transaction)
  .input("invoice_no", sql.VarChar, data.invoice_no)
  .input("autoNo", sql.VarChar, data.autoNo)
  .query(`
    SELECT TOP 1 auto_no
    FROM bill_details
    WHERE invoice_no = @invoice_no
      AND auto_no <> @autoNo
      AND active = 0
  `);

if (duplicateInvoice.recordset.length > 0) {
  throw new Error("Invoice number already exists.");
}
    let userName = "";

    const userResult = await new sql.Request(transaction)
      .input(
        "userId",
        sql.BigInt,
        data.modified_by
      )
      .query(`

SELECT first_name
FROM users
WHERE id=@userId

`);

    if (userResult.recordset.length > 0) {
      userName = userResult.recordset[0].first_name;
    }const request = new sql.Request(transaction);

const siteResult = await request
  .input("site_id", sql.Int, data.site_id)
  .query(`
      SELECT
          cr.*,
          nc.company_name,
          cr.site_name
      FROM client_rates cr
      LEFT JOIN new_client nc
          ON TRY_CAST(cr.client_id AS BIGINT) = nc.id
      WHERE cr.id=@site_id
  `);

const siteDetail = siteResult.recordset[0];

if (!siteDetail) {
  throw new Error("Site not found");
}

const clientName = siteDetail.company_name || "";
const siteName = siteDetail.site_name || "";
    // ==========================
    // SOFT DELETE REMOVED ROWS
    // ==========================
// ==================================
// SOFT DELETE REMOVED ORDERS
// ==================================

if (data.deletedRows?.length > 0) {

  const request = new sql.Request(transaction);


  request.input(
    "deleted_by",
    sql.BigInt,
    data.modified_by || userId
  );


  request.input(
    "deleted_by_name",
    sql.VarChar,
    userName || "ADMIN"
  );


  const ids = data.deletedRows.map((id, index) => {

    request.input(
      `del${index}`,
      sql.BigInt,
      id
    );

    return `@del${index}`;

  });



  // ==================================
  // INSERT DELETE LOG
  // ==================================

  await request.query(`

INSERT INTO orders_log
(
client_id,
unit_id,
type,
client_name,
site_name,
invoice_month,
invoice_year,

total_nos,
cost_per_head,
status,

created_by,
created_by_name,
created_on,

invoice_date,
uniqueid,

service_charges_type,
service_charges,

total,

invoice_no,
auto_no,

active,

no_of_days,

emp_name,
emp_code,

sac_code,

tb_date,
tb_from,
tb_to,

lr_no,

tb_vehicle_no,
tb_weight,
tb_invoice_no,

source,

active_id,
active_remark,

deleted_by,
deleted_by_name,
deleted_on,

log_created_on

)

SELECT

client_id,
unit_id,
type,
client_name,
site_name,
invoice_month,
invoice_year,

total_nos,
cost_per_head,
status,

created_by,
created_by_name,
created_on,

invoice_date,
uniqueid,

service_charges_type,
service_charges,

total,

invoice_no,
auto_no,

active,

no_of_days,

emp_name,
emp_code,

sac_code,

tb_date,
tb_from,
tb_to,

lr_no,

tb_vehicle_no,
tb_weight,
tb_invoice_no,

source,

id,
'Deleted',

@deleted_by,
@deleted_by_name,
GETDATE(),

GETDATE()


FROM orders

WHERE id IN (${ids.join(",")})


`);




  // ==================================
  // SOFT DELETE ORDERS
  // ==================================

  await request.query(`

UPDATE orders

SET

active = 1,

deleted_by = @deleted_by,

deleted_by_name = @deleted_by_name,

deleted_on = GETDATE()

WHERE id IN (${ids.join(",")})


`);


}

    // ==========================
    // CALCULATE TOTALS
    // ==========================

    const totalNos = data.items.reduce(
      (sum, item) => sum + (parseFloat(item.total_nos) || 0),
      0
    );

    const subTotal = data.items.reduce(
      (sum, item) => sum + (parseFloat(item.total) || 0),
      0
    );

    const cgstPerc = 9;
    const sgstPerc = 9;
    const igstPerc = 0;

    const cgst = (subTotal * cgstPerc) / 100;
    const sgst = (subTotal * sgstPerc) / 100;
    const igst = 0;

    const finalAmount = subTotal + cgst + sgst + igst;

    // ==========================
    // UPDATE BILL HEADER
    // ==========================

    await new sql.Request(transaction)
      .input("autoNo", sql.VarChar, data.autoNo)
      .input("invoice_no", sql.VarChar, data.invoice_no)
      .input("invoice_month", sql.Int, data.invoice_month)
      .input("invoice_year", sql.Int, data.invoice_year)
      .input("invoice_date", sql.Date, data.invoice_date)
      .input("bill_title", sql.VarChar, data.bill_title)
      .input(
    "client_name",
    sql.NVarChar(200),
    String(siteDetail.company_name || "")
)

.input(
    "site_name",
    sql.NVarChar(200),
    String(siteDetail.site_name || "")
)
      .input("modified_by", sql.BigInt, data.modified_by || null)
      .input(
        "modified_by_name",
        sql.VarChar,
        userName
      )
      .input("total_nos", sql.Decimal(18, 2), totalNos)
      .input("total_cost_without_gst", sql.Decimal(18, 2), subTotal)

      .input("cgst", sql.Decimal(18, 2), cgst)
      .input("cgst_perc", sql.Decimal(18, 2), cgstPerc)

      .input("sgst", sql.Decimal(18, 2), sgst)
      .input("sgst_perc", sql.Decimal(18, 2), sgstPerc)

      .input("igst", sql.Decimal(18, 2), igst)
      .input("igst_perc", sql.Decimal(18, 2), igstPerc)

      .input("final_amount", sql.Decimal(18, 2), finalAmount)

      .query(`
                UPDATE bill_details
                SET
                    invoice_no = @invoice_no,
                    invoice_month = @invoice_month,
                    invoice_year = @invoice_year,
                    invoice_date = @invoice_date,
                    bill_title = @bill_title,
client_name = @client_name,
site_name = @site_name,
                    total_nos = @total_nos,
                    total_cost_without_gst = @total_cost_without_gst,

                    cgst = @cgst,
                    cgst_perc = @cgst_perc,

                    sgst = @sgst,
                    sgst_perc = @sgst_perc,

                    igst = @igst,
                    igst_perc = @igst_perc,

                    final_amount = @final_amount,

                    modified_by = @modified_by,
                    modified_by_name = @modified_by_name,
                    modified_on = GETDATE()

                WHERE auto_no = @autoNo
            `);

    await new sql.Request(transaction)
      .input("autoNo", sql.VarChar, data.autoNo)
      .input("created_by", sql.BigInt, data.modified_by || null)
      .query(`

INSERT INTO bill_details_log
(

client_id,
rate_id,
client_name,
site_name,
invoice_no,
auto_no,
invoice_month,
invoice_year,
created_by,
created_by_name,
created_on,

total_nos,
total_cost_without_gst,

cgst,
cgst_perc,

sgst,
sgst_perc,

igst,
igst_perc,

final_amount,

invoice_date,
bill_title,

modified_by,
modified_by_name,
modified_on,

source,
active_id,
active_remark,

log_created_on

)

SELECT


client_id,
rate_id,
client_name,
site_name,
invoice_no,
auto_no,
invoice_month,
invoice_year,

created_by,
created_by_name,

created_on,

total_nos,
total_cost_without_gst,

cgst,
cgst_perc,

sgst,
sgst_perc,

igst,
igst_perc,

final_amount,

invoice_date,
bill_title,

modified_by,
modified_by_name,
modified_on,

'web',

id,
'Before Update',

GETDATE()

FROM bill_details

WHERE auto_no=@autoNo

`);

    // ==========================
    // UPDATE / INSERT ORDERS
    // ==========================

    for (const item of data.items) {

     if (item.id) {

  // ==========================
  // UPDATE ORDERS
  // ==========================

  await new sql.Request(transaction)

    .input("id", sql.BigInt, item.id)
    .input("type", sql.VarChar, item.type)
    .input("employee_id", sql.BigInt, item.employee_id || null)
    .input("emp_code", sql.VarChar, item.emp_code || "")
    .input("sac_code", sql.VarChar, item.sac_code)
    .input(
    "client_name",
    sql.NVarChar(200),
    String(siteDetail.company_name || "")
)

.input(
    "site_name",
    sql.NVarChar(200),
    String(siteDetail.site_name || "")
)
    .input("total_nos", sql.Decimal(18, 2), item.total_nos)
    .input("cost_per_head", sql.Decimal(18, 2), item.cost_per_head)
    .input("total", sql.Decimal(18, 2), item.total)

    .input(
      "modified_by",
      sql.BigInt,
      data.modified_by || null
    )

    .input(
      "modified_by_name",
      sql.VarChar,
      userName
    )

    .query(`

UPDATE orders

SET

type = @type,
emp_name = @type,
emp_code = @emp_code,
sac_code = @sac_code,
client_name = @client_name,
site_name = @site_name,
total_nos = @total_nos,
cost_per_head = @cost_per_head,
total = @total,

modified_by = @modified_by,
modified_by_name = @modified_by_name,
modified_on = GETDATE(),

active = 0

WHERE id = @id

`);





  // ==========================
  // ORDER BEFORE UPDATE LOG
  // ==========================

  await new sql.Request(transaction)

    .input("id", sql.BigInt, item.id)

    .query(`

INSERT INTO orders_log
(

client_id,
unit_id,
type,
client_name,
site_name,
invoice_month,
invoice_year,

total_nos,
cost_per_head,

total,

invoice_no,
auto_no,

emp_name,
emp_code,
sac_code,

active_id,
active_remark,

created_by,
created_by_name,
created_on,

modified_by,
modified_by_name,
modified_on,

source,
log_created_on

)

SELECT

client_id,
unit_id,
type,
client_name,
site_name,
invoice_month,
invoice_year,

total_nos,
cost_per_head,

total,

invoice_no,
auto_no,

emp_name,
emp_code,
sac_code,

id,
'Before Update',

created_by,
created_by_name,
created_on,

modified_by,
modified_by_name,
modified_on,

'web',
GETDATE()

FROM orders

WHERE id=@id

`);

}else {

  const uniqueid =
    "BILL" +
    Date.now() +
    Math.floor(Math.random() * 100000);


  const insertResult = await new sql.Request(transaction)

    .input("client_id", sql.BigInt, data.client_id)

    .input("unit_id", sql.BigInt, data.site_id)
.input(
    "client_name",
    sql.NVarChar(200),
    String(siteDetail.company_name || "")
)

.input(
    "site_name",
    sql.NVarChar(200),
    String(siteDetail.site_name || "")
)
    .input(
      "created_by",
      sql.BigInt,
      data.modified_by || null
    )

    .input(
      "created_by_name",
      sql.VarChar,
      userName
    )


    .input("type", sql.VarChar, item.type)

    .input("emp_name", sql.VarChar, item.type)

    .input("emp_code", sql.VarChar, item.emp_code || "")

    .input("sac_code", sql.VarChar, item.sac_code)


    .input("total_nos", sql.Decimal(18,2), item.total_nos)

    .input("cost_per_head", sql.Decimal(18,2), item.cost_per_head)

    .input("total", sql.Decimal(18,2), item.total)


    .input("invoice_month", sql.Int, data.invoice_month)

    .input("invoice_year", sql.Int, data.invoice_year)

    .input("invoice_no", sql.VarChar, data.invoice_no)

    .input("auto_no", sql.VarChar, data.autoNo)


    .input(
      "invoice_date",
      sql.Date,
      data.invoice_date
    )


    .input(
      "status",
      sql.VarChar,
      "Active"
    )


    .input(
      "uniqueid",
      sql.VarChar,
      uniqueid
    )


    .input(
      "source",
      sql.VarChar,
      "web"
    )


    .query(`

INSERT INTO orders
(
client_id,
unit_id,

type,
client_name,
site_name,
emp_name,
emp_code,
sac_code,

total_nos,
cost_per_head,
total,

invoice_month,
invoice_year,
invoice_no,
auto_no,

invoice_date,

status,

uniqueid,

source,

active,

created_by,
created_by_name,
created_on

)

OUTPUT INSERTED.id

VALUES
(
@client_id,
@unit_id,

@type,
@client_name,
@site_name,
@emp_name,
@emp_code,
@sac_code,

@total_nos,
@cost_per_head,
@total,

@invoice_month,
@invoice_year,
@invoice_no,
@auto_no,

@invoice_date,

@status,

@uniqueid,

@source,

0,

@created_by,
@created_by_name,
GETDATE()

)

`);



  const newOrderId = insertResult.recordset[0].id;



  // ==========================
  // INSERT LOG
  // ==========================


  await new sql.Request(transaction)

    .input(
      "id",
      sql.BigInt,
      newOrderId
    )

    .query(`

INSERT INTO orders_log
(
client_id,
unit_id,

type,
client_name,
site_name,
invoice_month,
invoice_year,

total_nos,
cost_per_head,

total,

invoice_no,
auto_no,

invoice_date,

status,

uniqueid,

emp_name,
emp_code,
sac_code,


created_by,
created_by_name,
created_on,


active_id,
active_remark,


source,

log_created_on

)


SELECT

client_id,
unit_id,

type,
client_name,
site_name,
invoice_month,
invoice_year,

total_nos,
cost_per_head,

total,

invoice_no,
auto_no,


invoice_date,

status,

uniqueid,


emp_name,
emp_code,
sac_code,


created_by,
created_by_name,
created_on,


id,

'INSERT',


source,


GETDATE()


FROM orders

WHERE id=@id

`);
console.log("CLIENT ID:", data.client_id);
console.log("UNIT ID:", data.site_id);
}
    }

    await transaction.commit();

    return {
      success: true,
      message: "Bill Updated Successfully"
    };

  } catch (error) {

    await transaction.rollback();
    console.log("UPDATE BILL ERROR", error);
    throw error;
  }
};
// ================= BILLING TOTALS =================
const getBillingTotals = async (
  userId,
  status,
  wo,
  filters = [],
  month = "",
  year = "",
  gstType = "all",
  companyId = null,
  isSuperAdmin = false
) => {
  const pool = await poolPromise;
  const request = pool.request();

  let query = `
    SELECT
      bd.id,
      bd.invoice_no,
      bd.total_cost_without_gst,
      bd.cgst,
      bd.sgst,
      bd.igst,
      bd.final_amount,
      bd.costperheadbill,
      bd.invoice_month,
      bd.invoice_year,
      bd.bill_title,

      nc.company_name,
      nc.client_email,
      nc.contact_person,
      nc.x_client_code,

      bd.invoice_date,

      cr.site_name

    FROM bill_details bd

    LEFT JOIN new_client nc
      ON bd.client_id = nc.id

    LEFT JOIN client_rates cr
      ON bd.rate_id = cr.id

    WHERE bd.active = 0
  `;

  // =========================================
  // COMPANY FILTER
  // Super Admin = All companies
  // Admin = Own company only
  // =========================================

  if (!isSuperAdmin) {
    if (
      companyId === null ||
      companyId === undefined ||
      companyId === "" ||
      !Number.isSafeInteger(Number(companyId)) ||
      Number(companyId) <= 0
    ) {
      throw new Error("Valid company ID is required");
    }

    request.input(
      "companyId",
      sql.Int,
      Number(companyId)
    );

    query += `
      AND nc.billing_company_id = @companyId
    `;
  }

  // =========================================
  // STATUS FILTER
  // =========================================

  if (status) {
    request.input(
      "status",
      sql.VarChar(50),
      String(status)
    );

    query += `
      AND bd.status = @status
    `;
  }

  // =========================================
  // SEARCH FILTER
  // =========================================

  if (wo) {
    request.input(
      "search",
      sql.NVarChar(200),
      `%${String(wo)}%`
    );

    query += `
      AND (
        bd.invoice_no LIKE @search
        OR bd.bill_title LIKE @search
        OR nc.company_name LIKE @search
        OR nc.x_client_code LIKE @search
        OR cr.site_name LIKE @search
      )
    `;
  }

  // =========================================
  // DYNAMIC FILTERS
  // =========================================

  if (Array.isArray(filters)) {
    filters.forEach((filter, index) => {
      if (
        filter.keyword === undefined ||
        filter.keyword === null ||
        String(filter.keyword).trim() === ""
      ) {
        return;
      }

      const paramName = `filter${index}`;

      request.input(
        paramName,
        sql.NVarChar(200),
        `%${String(filter.keyword).trim()}%`
      );

      const p = `@${paramName}`;

      if (filter.field?.value) {
        switch (filter.field.value) {
          case "invoice_no":
            query += `
              AND bd.invoice_no LIKE ${p}
            `;
            break;

          case "company_name":
          case "client_name":
            query += `
              AND nc.company_name LIKE ${p}
            `;
            break;

          case "site_name":
            query += `
              AND cr.site_name LIKE ${p}
            `;
            break;

          case "x_client_code":
          case "client_code":
            query += `
              AND nc.x_client_code LIKE ${p}
            `;
            break;

          case "client_email":
            query += `
              AND nc.client_email LIKE ${p}
            `;
            break;

          case "cc_location_name":
            query += `
              AND nc.cc_location_name LIKE ${p}
            `;
            break;

          case "contact_person":
            query += `
              AND nc.contact_person LIKE ${p}
            `;
            break;

          case "billing_company":
            query += `
              AND nc.billing_company LIKE ${p}
            `;
            break;

          case "billing_company_id":
            query += `
              AND CAST(nc.billing_company_id AS VARCHAR(100))
                  LIKE ${p}
            `;
            break;

          case "billing_branch":
            query += `
              AND nc.billing_branch LIKE ${p}
            `;
            break;

          case "billing_branch_id":
            query += `
              AND CAST(nc.billing_branch_id AS VARCHAR(100))
                  LIKE ${p}
            `;
            break;
        }
      } else {
        query += `
          AND (
            bd.invoice_no LIKE ${p}
            OR bd.bill_title LIKE ${p}
            OR nc.company_name LIKE ${p}
            OR nc.client_email LIKE ${p}
            OR nc.cc_location_name LIKE ${p}
            OR nc.contact_person LIKE ${p}
            OR nc.x_client_code LIKE ${p}
            OR cr.site_name LIKE ${p}
            OR nc.billing_company LIKE ${p}
            OR CAST(nc.billing_company_id AS VARCHAR(100))
                LIKE ${p}
            OR nc.billing_branch LIKE ${p}
            OR CAST(nc.billing_branch_id AS VARCHAR(100))
                LIKE ${p}
          )
        `;
      }
    });
  }

  // =========================================
  // MONTH FILTER
  // =========================================

  if (month && Number(month) >= 1 && Number(month) <= 12) {
    request.input("month", sql.Int, Number(month));

    query += `
      AND MONTH(bd.invoice_date) = @month
    `;
  }

  // =========================================
  // YEAR FILTER
  // =========================================

  if (year && Number(year) > 0) {
    request.input("year", sql.Int, Number(year));

    query += `
      AND YEAR(bd.invoice_date) = @year
    `;
  }

  // =========================================
  // GST / NON-GST FILTER
  // =========================================

  if (gstType === "gst") {
    query += `
      AND (
        ISNULL(TRY_CAST(bd.cgst AS DECIMAL(18, 2)), 0) > 0
        OR ISNULL(TRY_CAST(bd.sgst AS DECIMAL(18, 2)), 0) > 0
        OR ISNULL(TRY_CAST(bd.igst AS DECIMAL(18, 2)), 0) > 0
      )
    `;
  } else if (gstType === "non-gst") {
    query += `
      AND (
        ISNULL(TRY_CAST(bd.cgst AS DECIMAL(18, 2)), 0) = 0
        AND ISNULL(TRY_CAST(bd.sgst AS DECIMAL(18, 2)), 0) = 0
        AND ISNULL(TRY_CAST(bd.igst AS DECIMAL(18, 2)), 0) = 0
      )
    `;
  }

  // =========================================
  // ORDER AND EXECUTE
  // =========================================

  query += `
    ORDER BY bd.id DESC
  `;

  console.log("========== BILLING TOTALS ==========");
  console.log("Super Admin:", isSuperAdmin);
  console.log(
    "Company ID:",
    isSuperAdmin ? "ALL COMPANIES" : companyId
  );
  console.log(query);
  console.log("=====================================");

  const result = await request.query(query);

  return result.recordset;
};



// ================= PAID AMOUNT =================
const getPaidAmount = async (invoice_no) => {

  const pool = await poolPromise;

  const result = await pool
    .request()
    .input(
      "invoice_no",
      sql.VarChar,
      invoice_no
    )
    .query(`
      SELECT 
        ISNULL(
          SUM(TRY_CAST(paid_amount AS DECIMAL(18,2))),
          0
        ) AS paid_amount
      FROM payment_history
      WHERE bill_no = @invoice_no
    `);


  return result.recordset[0]?.paid_amount || 0;

};
// ================= GET COMPANY =================
const getCompany = async (company_id) => {

  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("company_id", sql.Int, company_id)
    .query(`
      SELECT *
      FROM companies
      WHERE id = @company_id
    `);

  return result.recordset;
};

const getEmployeeWages = async (
  rate_id,
  month,
  year
) => {

  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("rate_id", sql.Int, rate_id)
    .input("month", sql.Int, month)
    .input("year", sql.Int, year)
    .query(`
      SELECT *
      FROM emp_wages
      WHERE site_id = @rate_id
      AND at_month = @month
      AND at_year = @year
    `);

  return result.recordset;
};

// ================= GET SUPPORTINGS =================
const getSupportings = async (auto_no) => {

  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("auto_no", sql.NVarChar(50), auto_no)
    .query(`
      SELECT *
      FROM bill_supportings
      WHERE auto_no = @auto_no
    `);

  return result.recordset;
};
// ================= USER SEARCH =================

const getUserSearch = async (userId, refNo) => {

  const pool = await poolPromise;

  const result = await pool.request()
    .input("userId", sql.Int, userId)
    .input("refNo", sql.VarChar, refNo)
    .query(`
      SELECT *
      FROM user_search
      WHERE search_by = @userId
      AND ref_no = @refNo
    `);

  return result.recordset;
};


const deleteSearch = async (userId, refNo) => {

  const pool = await poolPromise;

  await pool.request()
    .input("userId", sql.Int, userId)
    .input("refNo", sql.VarChar, refNo)
    .query(`
      DELETE FROM user_search
      WHERE search_by = @userId
      AND ref_no = @refNo
    `);

};


const insertSearch = async (data) => {

  const pool = await poolPromise;

  await pool.request()

    .input("search_fields", sql.VarChar, data.search_fields || "")
    .input("search_keyword", sql.VarChar, data.search_keyword || "")
    .input("search_date_field", sql.VarChar, data.search_date_field || "")
    .input("search_from_date", sql.VarChar, data.search_from_date || "")
    .input("search_to_date", sql.VarChar, data.search_to_date || "")
    .input("search_from_month", sql.Int, data.search_from_month || 0)
    .input("search_from_year", sql.Int, data.search_from_year || 0)
    .input("search_by", sql.Int, data.search_by)
    .input("ref_no", sql.VarChar, data.ref_no)

    .query(`
      INSERT INTO user_search
      (
        search_fields,
        search_keyword,
        search_date_field,
        search_from_date,
        search_to_date,
        search_from_month,
        search_from_year,
        search_by,
        ref_no
      )
      VALUES
      (
        @search_fields,
        @search_keyword,
        @search_date_field,
        @search_from_date,
        @search_to_date,
        @search_from_month,
        @search_from_year,
        @search_by,
        @ref_no
      )
    `);

};


const getUserRights = async (
  module,
  page,
  userId
) => {

  const pool = await poolPromise;

  const result = await pool.request()
    .input("userId", sql.Int, userId)
    .query(`
 SELECT *
 FROM users
 WHERE id=@userId
 `);

  return result.recordset;

};

const addPaymentHistory = async (data, userId) => {

  const pool = await poolPromise;

  const result = await pool.request()

    .input("bill_no", sql.VarChar, data.bill_no)
    .input("paid_amount", sql.Decimal(18, 2), data.amount)
    .input("tax_type", sql.VarChar, data.tax_type || null)
    .input("tax_percent", sql.Decimal(18, 2), data.tax_percent || null)
    .input("tax_paid", sql.Decimal(18, 2), data.tax_paid || null)

    .input(
      "transaction_type",
      sql.VarChar,
      data.transaction_type
    )

    .input(
      "transaction_id",
      sql.VarChar,
      data.transaction_id || null
    )

    .input(
      "bank_name",
      sql.VarChar,
      data.bank_name || null
    )

    .input(
      "payment_date",
      sql.Date,
      data.payment_date
    )

    .input(
      "tds",
      sql.Decimal(18, 2),
      data.tds || 0
    )

    .input(
      "source",
      sql.VarChar,
      data.source || 'web'
    )

    .input(
      "uid",
      sql.VarChar,
      userId
    )


    .query(`

        INSERT INTO payment_history
        (
            bill_no,
            paid_amount,
            tax_type,
            tax_percent,
            tax_paid,
            transaction_type,
            transaction_id,
            bank_name,
            created_on,
            uid,
            payment_date,
            tds,
            source
        )

        VALUES
        (
            @bill_no,
            @paid_amount,
            @tax_type,
            @tax_percent,
            @tax_paid,
            @transaction_type,
            @transaction_id,
            @bank_name,
            GETDATE(),
            @uid,
            @payment_date,
            @tds,
            @source
        )

    `);


  return result;

};

const buildSearchConditions = () => {

  return "";

};
module.exports = {
  getBillByClientSite,
  getClient,
  getSite,
  getCompany,
  getEmployeeWages,
  getSupportings,
  getBillingCount,
  getBillingList,
  getBillingTotals,
  getPaidAmount,
  getUserSearch,
  addPaymentHistory,
  deleteSearch,
  insertSearch,
  getUserRights,
  buildSearchConditions,
  getBillByAutoNo,
  updateBill,
  getPaymentHistory,
  changeInvoice,
  getBillingExcelData,
  searchBillingSuggestions
};