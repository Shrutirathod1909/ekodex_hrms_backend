const { sql, poolPromise } = require("../config/db");
const {
  createDirectories,
  generateEmployeePdf,
  generateSitePdf,
} = require("./salaryPdf");
const generateTransportBillModel = async (data, userId) => {
  const transaction = new sql.Transaction(await poolPromise);

  try {
    await transaction.begin();

    const request = new sql.Request(transaction);
    // ==========================
    // USER DETAILS
    // ==========================

    const userResult = await new sql.Request(transaction).input(
      "userId",
      sql.BigInt,
      userId,
    ).query(`
    SELECT 
        first_name
    FROM users
    WHERE id=@userId
`);

    const userName = userResult.recordset[0]?.first_name || "";

    const {
      client_id,
      site_id,
      invoice_no,
      invoice_date,
      invoice_month,
      invoice_year,
      bill_title,
      items,
    } = data;

    // ==================================
    // UNIQUE ID GENERATE
    // ==================================

    const uniqueid = `TR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // ==================================
    // SITE DETAILS
    // ==================================

    const siteResult = await request.input("site_id", sql.Int, site_id).query(`
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

    // ==================================
    // AUTO NUMBER
    // ==================================

    const autoResult = await request.query(`
      SELECT ISNULL(MAX(auto_no),0)+1 AS auto_no
      FROM bill_details
    `);

    const auto_no = autoResult.recordset[0].auto_no;

    let finalInvoiceNo = invoice_no;

    if (!finalInvoiceNo) {
      const currentYear = new Date().getFullYear();

      finalInvoiceNo = `SV / ${auto_no} / ${currentYear}-${String(currentYear + 1).slice(-2)}`;
    }

    // ==================================
    // CHECK DUPLICATE INVOICE
    // ==================================

    const duplicateInvoice = await new sql.Request(transaction).input(
      "invoice_no",
      sql.VarChar,
      finalInvoiceNo,
    ).query(`
      SELECT TOP 1 id
      FROM bill_details
      WHERE invoice_no=@invoice_no
        AND active=0
  `);

    if (duplicateInvoice.recordset.length > 0) {
      throw new Error(`Invoice No '${finalInvoiceNo}' already exists.`);
    }

    // ==================================
    // ORDERS INSERT
    // ==================================

    let finaltotal = 0;

    for (const row of items) {
      const total = Number(row.netAmount || 0);

      await new sql.Request(transaction)

        .input("client_id", sql.Int, client_id)

        .input("unit_id", sql.Int, site_id)

        .input("invoice_month", sql.Int, invoice_month)

        .input("invoice_year", sql.Int, invoice_year)

        .input(
          "client_name",
          sql.NVarChar(200),
          String(siteDetail.company_name || ""),
        )

        .input(
          "site_name",
          sql.NVarChar(200),
          String(siteDetail.site_name || ""),
        )

        .input("sac_code", sql.NVarChar, row.hsn || "")

        .input("tb_date", sql.Date, row.date || null)

        .input("tb_from", sql.NVarChar, row.from || "")

        .input("tb_to", sql.NVarChar, row.to || "")

        .input("lr_no", sql.NVarChar, row.lrNo || "")

        .input("tb_weight", sql.NVarChar, row.weight || "")

        .input("tb_vehicle_no", sql.NVarChar, row.vehicleNo || "")

        .input("tb_invoice_no", sql.NVarChar, row.invoiceNo || "")

        .input("total", sql.Decimal(18, 2), total)
        .input("type", sql.VarChar, "Transport")
        .input("status", sql.VarChar, "Active")

        .input("created_by", sql.Int, userId)
        .input("created_by_name", sql.VarChar, userName)
        .input("invoice_date", sql.Date, invoice_date)

        .input("invoice_no", sql.NVarChar, finalInvoiceNo)

        .input("auto_no", sql.Int, auto_no)

        .input("uniqueid", sql.VarChar, uniqueid)

        .input("source", sql.VarChar, "Web").query(`

      INSERT INTO orders
      (

        client_id,
        unit_id,

        invoice_month,
        invoice_year,


        sac_code,
        tb_date,
        tb_from,
        tb_to,
        lr_no,
        tb_weight,
        tb_vehicle_no,
        tb_invoice_no,

        total,

type,
status,
client_name,
site_name,
        created_by,
        created_by_name,
        created_on,

        invoice_date,
        invoice_no,
        auto_no,

        uniqueid,
        source

      )

      VALUES

      (

        @client_id,
        @unit_id,

        @invoice_month,
        @invoice_year,


        @sac_code,
        @tb_date,
        @tb_from,
        @tb_to,
        @lr_no,
        @tb_weight,
        @tb_vehicle_no,
        @tb_invoice_no,

        @total,
@type,
@status,
@client_name,
@site_name,
        @created_by,
        @created_by_name,
        GETDATE(),

        @invoice_date,
        @invoice_no,
        @auto_no,


        @uniqueid,
        @source

      )

      `);

      finaltotal += total;
    }
    await new sql.Request(transaction).input("uniqueid", sql.VarChar, uniqueid)
      .query(`
INSERT INTO orders_log
(

client_id,
unit_id,
type,
invoice_month,
invoice_year,
total_nos,
cost_per_head,
status,
client_name,
site_name,
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
log_created_on
)
SELECT
client_id,
unit_id,
type,
invoice_month,
invoice_year,
total_nos,
cost_per_head,
status,
client_name,
site_name,
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
'Generate Transport Bill',
GETDATE()
FROM orders
WHERE uniqueid=@uniqueid
`);

    // ==================================
    // GST
    // ==================================

    const cgst_perc = Number(siteDetail.cc_cgst || 0);

    const sgst_perc = Number(siteDetail.cc_sgst || 0);

    const igst_perc = Number(siteDetail.cc_igst || 0);

    const cgst = (finaltotal * cgst_perc) / 100;

    const sgst = (finaltotal * sgst_perc) / 100;

    const igst = (finaltotal * igst_perc) / 100;

    const final_amount = Math.round(finaltotal + cgst + sgst + igst);

    // ==================================
    // BILL PERIOD
    // ==================================

    const dd = `${invoice_year}-${String(invoice_month).padStart(2, "0")}-01`;

    let firstdate;

    if (
      siteDetail.cc_loct_Startdate &&
      new Date(siteDetail.cc_loct_Startdate).getMonth() + 1 ==
        Number(invoice_month)
    ) {
      firstdate = new Date(siteDetail.cc_loct_Startdate);
    } else {
      firstdate = new Date(dd);
    }

    const enddate = new Date(invoice_year, invoice_month, 0);

    // ==================================
    // BILL DETAILS INSERT
    // ==================================

    await new sql.Request(transaction)

      .input("client_id", sql.Int, client_id)

      .input("rate_id", sql.Int, site_id)

      .input("invoice_no", sql.NVarChar, finalInvoiceNo)

      .input("invoice_month", sql.Int, invoice_month)

      .input("invoice_year", sql.Int, invoice_year)

      .input("created_by", sql.Int, userId)
      .input(
        "client_name",
        sql.NVarChar(200),
        String(siteDetail.company_name || ""),
      )

      .input("site_name", sql.NVarChar(200), String(siteDetail.site_name || ""))

      .input("created_by_name", sql.VarChar, userName)

      .input("cgst_perc", sql.Decimal(18, 2), cgst_perc)

      .input("sgst_perc", sql.Decimal(18, 2), sgst_perc)

      .input("igst_perc", sql.Decimal(18, 2), igst_perc)

      .input("cgst", sql.Decimal(18, 2), cgst)

      .input("sgst", sql.Decimal(18, 2), sgst)

      .input("igst", sql.Decimal(18, 2), igst)

      .input("total_cost_without_gst", sql.Decimal(18, 2), finaltotal)

      .input("final_amount", sql.Decimal(18, 2), final_amount)

      .input("invoice_date", sql.Date, invoice_date)

      .input("invoice_from", sql.Date, firstdate)

      .input("invoice_to", sql.Date, enddate)

      .input("auto_no", sql.Int, auto_no)

      .input("bill_title", sql.NVarChar, bill_title || "")

      .input("uniqueid", sql.VarChar, uniqueid)

      .input("source", sql.VarChar, "Web").query(`

    INSERT INTO bill_details

    (

      client_id,
      rate_id,

      invoice_no,
      invoice_month,
      invoice_year,
client_name,
site_name,

      created_by,
      created_by_name,
      created_on,


      cgst_perc,
      sgst_perc,
      igst_perc,


      cgst,
      sgst,
      igst,


      invoice_date,
      status,


      total_cost_without_gst,


      invoice_from,
      invoice_to,


      auto_no,
      final_amount,


      billing_type,
      bill_title,


      uniqueid,
      source

    )


    VALUES

    (

      @client_id,
      @rate_id,


      @invoice_no,
      @invoice_month,
      @invoice_year,

@client_name,
@site_name,
      @created_by,
      @created_by_name,
      GETDATE(),


      @cgst_perc,
      @sgst_perc,
      @igst_perc,


      @cgst,
      @sgst,
      @igst,


      @invoice_date,
      'Active',


      @total_cost_without_gst,


      @invoice_from,
      @invoice_to,


      @auto_no,
      @final_amount,


      'Transporter',
      @bill_title,


      @uniqueid,
      @source

    )

    `);
    await new sql.Request(transaction).input("uniqueid", sql.VarChar, uniqueid)
      .query(`
INSERT INTO bill_details_log
(

client_id,
rate_id,
invoice_no,
auto_no,
invoice_month,
invoice_year,
client_name,
site_name,
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
uniqueid,
status,
active,
invoice_date,
costperheadbill,
invoice_from,
invoice_to,
billing_type,
modified_by,
modified_on,
month_days,
bill_title,
source,
active_id,
active_remark,
log_created_on
)
SELECT

client_id,
rate_id,
invoice_no,
auto_no,
invoice_month,
invoice_year,
client_name,
site_name,
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
uniqueid,
status,
active,
invoice_date,
costperheadbill,
invoice_from,
invoice_to,
billing_type,
modified_by,
modified_on,
month_days,
bill_title,
source,
id,
'Generate Transport Bill',
GETDATE()
FROM bill_details
WHERE uniqueid=@uniqueid
`);

    await transaction.commit();

    return {
      auto_no,

      invoice_no: finalInvoiceNo,

      uniqueid,
    };
  } catch (error) {
    await transaction.rollback();

    throw error;
  }
};

const { v4: uuidv4 } = require("uuid");

const updateTransportBill = async (autoNo, data, userId) => {
  const pool = await poolPromise;

  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();
    // ==================================
    // CHECK DUPLICATE INVOICE NUMBER
    // ==================================

    const duplicateInvoice = await new sql.Request(transaction)
      .input("invoice_no", sql.VarChar, data.invoice_no)
      .input("autoNo", sql.VarChar, autoNo).query(`
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

    const userResult = await new sql.Request(transaction).input(
      "userId",
      sql.Int,
      userId,
    ).query(`

SELECT 
first_name
FROM users

WHERE id=@userId

`);

    if (userResult.recordset.length > 0) {
      userName = userResult.recordset[0].first_name;
    }

    // ==================================
    // SOFT DELETE REMOVED ORDERS
    // ==================================
    if (data.deletedRows?.length > 0) {
      const request = new sql.Request(transaction);

      request.input("deleted_by", sql.BigInt, data.modified_by || userId);

      request.input("deleted_by_name", sql.VarChar, userName || "ADMIN");

      const ids = data.deletedRows.map((id, index) => {
        request.input(`del${index}`, sql.BigInt, id);

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

invoice_month,
invoice_year,

total_nos,
cost_per_head,
status,
client_name,
site_name,
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

invoice_month,
invoice_year,

total_nos,
cost_per_head,
status,
client_name,
site_name,
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

    const uniqueid = uuidv4();

    // ==================================
    // GET SITE DETAILS FOR GST
    // ==================================

    const siteResult = await new sql.Request(transaction).input(
      "site_id",
      sql.Int,
      data.site_id,
    ).query(`
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

    // ==================================
    // CALCULATE TOTAL
    // ==================================

    let finaltotal = 0;

    for (const item of data.items || []) {
      finaltotal += Number(item.netAmount || 0);
    }

    // ==================================
    // GST CALCULATION
    // ==================================

    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    const cgst_perc = Number(siteDetail.cc_cgst || 0);

    const sgst_perc = Number(siteDetail.cc_sgst || 0);

    const igst_perc = Number(siteDetail.cc_igst || 0);

    // Maharashtra same state

    // ==================================
    // GST CALCULATION WITHOUT STATE CHECK
    // ==================================

    cgst = Number(((finaltotal * cgst_perc) / 100).toFixed(2));

    sgst = Number(((finaltotal * sgst_perc) / 100).toFixed(2));

    igst = Number(((finaltotal * igst_perc) / 100).toFixed(2));

    const final_amount = Number((finaltotal + cgst + sgst + igst).toFixed(2));

    // ==================================
    // UPDATE BILL DETAILS
    // ==================================

    const billUpdate = await new sql.Request(transaction)

      .input("autoNo", sql.Int, autoNo)

      .input("client_id", sql.Int, data.client_id)

      .input("site_id", sql.Int, data.site_id)

      .input("client_name", sql.VarChar, siteDetail.company_name || "")

      .input("site_name", sql.NVarChar(200), String(siteDetail.site_name || ""))
      .input("invoice_no", sql.VarChar, data.invoice_no)

      .input("invoice_date", sql.Date, data.invoice_date)

      .input("invoice_month", sql.VarChar, data.invoice_month)

      .input("invoice_year", sql.VarChar, data.invoice_year)

      .input("bill_title", sql.VarChar, data.bill_title || "")

      .input("total_cost_without_gst", sql.Decimal(18, 2), finaltotal)

      .input("cgst", sql.Decimal(18, 2), cgst)

      .input("sgst", sql.Decimal(18, 2), sgst)

      .input("igst", sql.Decimal(18, 2), igst)

      .input("cgst_perc", sql.Decimal(18, 2), cgst_perc)

      .input("sgst_perc", sql.Decimal(18, 2), sgst_perc)

      .input("igst_perc", sql.Decimal(18, 2), igst_perc)

      .input("final_amount", sql.Decimal(18, 2), final_amount)

      .input("modified_by", sql.Int, userId)

      .input("uniqueid", sql.VarChar, uniqueid).query(`


UPDATE bill_details

SET


client_id=@client_id,

rate_id=@site_id,
client_name=@client_name,

site_name=@site_name,

invoice_no=@invoice_no,

invoice_date=@invoice_date,

invoice_month=@invoice_month,

invoice_year=@invoice_year,


total_cost_without_gst=
@total_cost_without_gst,


cgst=@cgst,

sgst=@sgst,

igst=@igst,


cgst_perc=@cgst_perc,

sgst_perc=@sgst_perc,

igst_perc=@igst_perc,


final_amount=@final_amount,


bill_title=@bill_title,


uniqueid=@uniqueid,

source='Web',


modified_by=@modified_by,

modified_on=GETDATE()



WHERE auto_no=@autoNo



`);

    // ==================================
    // INSERT OLD BILL DETAILS INTO LOG
    // ==================================

    await new sql.Request(transaction)

      .input("autoNo", sql.Int, autoNo)

      .input("modified_by", sql.Int, userId)

      .input("modified_by_name", sql.VarChar, userName).query(`

INSERT INTO bill_details_log
(
id,
client_id,
rate_id,
invoice_no,
auto_no,
invoice_month,
invoice_year,
client_name,
site_name,
created_by,
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
uniqueid,
status,
active,
invoice_date,
costperheadbill,
invoice_from,
invoice_to,
billing_type,
modified_by,
modified_on,
month_days,
bill_title,
source,
active_id,
active_remark,
log_created_on,
modified_by_name

)

SELECT

id,
client_id,
rate_id,
invoice_no,
auto_no,
invoice_month,
invoice_year,
client_name,
site_name,
created_by,
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
uniqueid,
status,
active,
invoice_date,
costperheadbill,
invoice_from,
invoice_to,
billing_type,

@modified_by,

GETDATE(),

month_days,

bill_title,

source,

id,

'Transport Bill Updated',

GETDATE(),

@modified_by_name


FROM bill_details

WHERE auto_no=@autoNo


`);

    // ==================================
    // UPDATE BILL DETAILS
    // ==================================

    if (billUpdate.rowsAffected[0] === 0) {
      throw new Error("Bill details not updated");
    }

    // ==================================
    // UPDATE / INSERT ORDERS
    // ==================================

    for (const item of data.items || []) {
      if (item.id) {
        // ==================================
        // UPDATE ORDER
        // ==================================

        await new sql.Request(transaction)

          .input("id", sql.Int, item.id)

          .input("tb_date", sql.Date, item.date || null)

          .input("sac_code", sql.VarChar, item.hsn || "")

          .input("tb_from", sql.VarChar, item.from || "")

          .input("tb_to", sql.VarChar, item.to || "")
          .input("client_name", sql.VarChar, siteDetail.company_name || "")
          .input(
            "site_name",
            sql.NVarChar(200),
            String(siteDetail.site_name || ""),
          )
          .input("lr_no", sql.VarChar, item.lrNo || "")

          .input("vehicle", sql.VarChar, item.vehicleNo || "")

          .input("weight", sql.VarChar, item.weight || "")

          .input("tb_invoice_no", sql.VarChar, item.invoiceNo || "")

          .input("total", sql.Decimal(18, 2), Number(item.netAmount || 0))

          .input("uniqueid", sql.VarChar, uniqueid)

          .input("modified_by", sql.Int, userId)

          .input("modified_by_name", sql.VarChar, userName || "ADMIN").query(`

UPDATE orders

SET

tb_date=@tb_date,

sac_code=@sac_code,

tb_from=@tb_from,

tb_to=@tb_to,

lr_no=@lr_no,

tb_vehicle_no=@vehicle,
client_name=@client_name,

site_name=@site_name,
tb_weight=@weight,

tb_invoice_no=@tb_invoice_no,

total=@total,

uniqueid=@uniqueid,

source='Web',

modified_by=@modified_by,

modified_by_name=@modified_by_name,

modified_on=GETDATE()


WHERE id=@id

`);

        // ==================================
        // INSERT OLD ORDER INTO LOG
        // ==================================

        await new sql.Request(transaction)

          .input("id", sql.Int, item.id)

          .input("modified_by", sql.Int, userId)

          .input("modified_by_name", sql.VarChar, userName || "ADMIN").query(`


INSERT INTO orders_log
(

client_id,
unit_id,
type,
invoice_month,
invoice_year,
total_nos,
cost_per_head,
status,
client_name,
site_name,
created_by,
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
log_created_on,

modified_by,
modified_by_name,
modified_on

)


SELECT


client_id,
unit_id,
type,
invoice_month,
invoice_year,
total_nos,
cost_per_head,
status,
client_name,
site_name,
created_by,
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

'Transport Order Updated',

GETDATE(),


@modified_by,

@modified_by_name,

GETDATE()


FROM orders

WHERE id=@id


`);

        console.log("TRANSPORT ORDER UPDATED LOG:", {
          id: item.id,
          modified_by: userId,
          modified_by_name: userName,
          modified_on: new Date(),
        });
      } else {
        // ==================================
        // INSERT NEW ORDER
        // ==================================

        const insertOrder = await new sql.Request(transaction)

          .input("client_id", sql.Int, data.client_id)

          .input("unit_id", sql.Int, data.site_id)

          .input("invoice_no", sql.VarChar, data.invoice_no)

          .input("auto_no", sql.Int, autoNo)
          .input("client_name", sql.VarChar, siteDetail.company_name || "")
          .input(
            "site_name",
            sql.NVarChar(200),
            String(siteDetail.site_name || ""),
          )
          .input("invoice_date", sql.Date, data.invoice_date)

          .input("invoice_month", sql.VarChar, data.invoice_month)

          .input("invoice_year", sql.VarChar, data.invoice_year)

          .input("created_by", sql.Int, userId)

          .input("created_by_name", sql.VarChar, userName || "ADMIN")

          .input("tb_date", sql.Date, item.date || null)

          .input("sac_code", sql.VarChar, item.hsn || "")

          .input("tb_from", sql.VarChar, item.from || "")

          .input("tb_to", sql.VarChar, item.to || "")

          .input("lr_no", sql.VarChar, item.lrNo || "")

          .input("vehicle", sql.VarChar, item.vehicleNo || "")

          .input("weight", sql.VarChar, item.weight || "")

          .input("tb_invoice_no", sql.VarChar, item.invoiceNo || "")

          .input("total", sql.Decimal(18, 2), Number(item.netAmount || 0))

          .input("uniqueid", sql.VarChar, uniqueid).query(`

INSERT INTO orders
(
client_id,
unit_id,
type,
client_name,
site_name,
invoice_no,
auto_no,

invoice_date,

invoice_month,
invoice_year,

created_by,
created_by_name,
created_on,


tb_date,

sac_code,

tb_from,
tb_to,

lr_no,

tb_vehicle_no,

tb_weight,

tb_invoice_no,

total,


active,

status,

uniqueid,

source

)

OUTPUT INSERTED.id


VALUES
(

@client_id,

@unit_id,

'Transporter',

@client_name,
@site_name,
@invoice_no,

@auto_no,


@invoice_date,


@invoice_month,

@invoice_year,


@created_by,

@created_by_name,

GETDATE(),



@tb_date,

@sac_code,


@tb_from,

@tb_to,


@lr_no,


@vehicle,


@weight,


@tb_invoice_no,


@total,


0,


'Active',


@uniqueid,


'Web'

)

`);

        // ==================================
        // GET NEW ORDER ID
        // ==================================

        const orderId = insertOrder.recordset[0].id;

        // ==================================
        // INSERT NEW ORDER LOG
        // ==================================

        await new sql.Request(transaction)

          .input("id", sql.Int, orderId)

          .input("modified_by", sql.Int, userId)

          .input("modified_by_name", sql.VarChar, userName || "ADMIN").query(`


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


log_created_on,


modified_by,

modified_by_name,

modified_on

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


'Transport Order Created',


GETDATE(),


@modified_by,


@modified_by_name,


GETDATE()



FROM orders

WHERE id=@id


`);
      }
    }

    await transaction.commit();

    return {
      success: true,

      message: "Transport bill updated successfully",

      uniqueid,
    };
  } catch (error) {
    await transaction.rollback();

    console.error("Update Transport Bill Error:", error);

    throw error;
  }
};

const getTransportBillById = async (autoNo) => {
  const pool = await poolPromise;

  const billResult = await pool.request().input("autoNo", sql.Int, autoNo)
    .query(`

      SELECT

        bd.id,
        bd.client_id,
        bd.rate_id AS site_id,
        bd.invoice_no,
        bd.auto_no,
        bd.invoice_date,
        bd.invoice_month,
        bd.invoice_year,
        bd.bill_title,

        nc.company_name,
        cr.site_name

      FROM bill_details bd

      LEFT JOIN new_client nc
      ON nc.id = bd.client_id

      LEFT JOIN client_rates cr
      ON cr.id = bd.rate_id

      WHERE bd.auto_no=@autoNo
      AND bd.billing_type='Transporter'

    `);

  const bill = billResult.recordset[0];

  if (!bill) {
    throw new Error("Bill not found");
  }

  const orderResult = await pool.request().input("auto_no", sql.Int, autoNo)
    .query(`

      SELECT
id,
        tb_date,
        sac_code,
        tb_from,
        tb_to,
        lr_no,
        tb_vehicle_no,
        tb_weight,
        tb_invoice_no,
        total

      FROM orders

      WHERE auto_no=@auto_no
      AND active=0

    `);

  return {
    ...bill,

    items: orderResult.recordset.map((row) => ({
      id: row.id,
      date: row.tb_date,

      hsn: row.sac_code,

      from: row.tb_from,

      to: row.tb_to,

      lrNo: row.lr_no,

      vehicleNo: row.tb_vehicle_no,

      weight: row.tb_weight,

      invoiceNo: row.tb_invoice_no,

      netAmount: row.total,
    })),
  };
};
// const generateBillModel = async (data, userId) => {
//   const transaction = new sql.Transaction(await poolPromise);

//   try {
//     await transaction.begin();

//     const request = new sql.Request(transaction);

//     const {
//       client_id,
//       site_id,
//       invoice_no,
//       invoice_date,
//       invoice_month,
//       invoice_year,
//       bill_title,
//       items,
//     } = data;

//     const rows = items;

//     // ==========================
//     // SITE DETAILS
//     // ==========================

//     const siteResult = await request.input("site_id", sql.Int, site_id).query(`
//         SELECT *
//         FROM client_rates
//         WHERE id=@site_id
//       `);

//     const siteDetail = siteResult.recordset[0];

//     if (!siteDetail) {
//       throw new Error("Site not found");
//     }

//     // ==========================
//     // AUTO NUMBER
//     // ==========================

//     const autoResult = await request.query(`
//       SELECT ISNULL(MAX(auto_no),0)+1 AS auto_no
//       FROM bill_details
//     `);

//     const auto_no = autoResult.recordset[0].auto_no;

//     let finalInvoiceNo = invoice_no;

//     if (!finalInvoiceNo) {
//       const currentYear = new Date().getFullYear();

//       finalInvoiceNo = `SV / ${auto_no} / ${currentYear}-${String(
//         currentYear + 1,
//       ).slice(-2)}`;
//     }

//     // ==========================
//     // ORDER INSERT
//     // ==========================

//     let finaltotal = 0;

//     for (const row of rows) {
//       console.log(row);
//       const total = Number(row.total || 0);

//       await new sql.Request(transaction)
//         .input("client_id", sql.VarChar, String(client_id))
//         .input("unit_id", sql.VarChar, String(site_id))
//         .input("type", sql.NVarChar, String(row.rank) || "")
//         .input("invoice_month", sql.VarChar, String(invoice_month))
//         .input("invoice_year", sql.VarChar, String(invoice_year))
//         .input("total_nos", sql.VarChar, String(row.total_nos) || "0")
//         .input("sac_code", sql.NVarChar, String(row.hsn) || "")
//         .input("cost_per_head", sql.VarChar, String(row.cost_per_head) || "0")
//         .input("total", sql.VarChar, String(total))
//         .input("created_by", sql.VarChar, String(userId))
//         .input("invoice_date", sql.Date, invoice_date)
//         .input("invoice_no", sql.NVarChar, finalInvoiceNo)
//         .input("auto_no", sql.VarChar, String(auto_no)).query(`
//           INSERT INTO orders (
//             client_id,
//             unit_id,
//             type,
//             invoice_month,
//             invoice_year,
//             total_nos,
//             sac_code,
//             cost_per_head,
//             total,
//             created_by,
//             created_on,
//             invoice_date,
//             invoice_no,
//             auto_no
//           )
//           VALUES (
//             @client_id,
//             @unit_id,
//             @type,
//             @invoice_month,
//             @invoice_year,
//             @total_nos,
//             @sac_code,
//             @cost_per_head,
//             @total,
//             @created_by,
//             GETDATE(),
//             @invoice_date,
//             @invoice_no,
//             @auto_no
//           )
//         `);

//       finaltotal += total;
//     }

//     // ==========================
//     // GST
//     // ==========================

//     const cgst_perc = Number(siteDetail.cc_cgst || 0);
//     const sgst_perc = Number(siteDetail.cc_sgst || 0);
//     const igst_perc = Number(siteDetail.cc_igst || 0);

//     const cgst = (finaltotal * cgst_perc) / 100;
//     const sgst = (finaltotal * sgst_perc) / 100;
//     const igst = (finaltotal * igst_perc) / 100;

//     const final_amount = Math.round(finaltotal + cgst + sgst + igst);

//     // ==========================
//     // BILL PERIOD
//     // ==========================

//     const firstdate = `${invoice_year}-${String(invoice_month).padStart(
//       2,
//       "0",
//     )}-01`;

//     const enddateResult = new Date(invoice_year, invoice_month, 0);

//     const enddate = enddateResult.toISOString().split("T")[0];

//     // ==========================
//     // BILL INSERT
//     // ==========================
//     const formattedMonth = String(invoice_month).padStart(2, "0");
//     await new sql.Request(transaction)
//       .input("client_id", sql.VarChar, String(client_id))
//       .input("rate_id", sql.VarChar, String(site_id))
//       .input("invoice_no", sql.VarChar, finalInvoiceNo)
//       .input("invoice_month", sql.VarChar, String(formattedMonth))
//       .input("invoice_year", sql.VarChar, String(invoice_year))
//       .input("created_by", sql.VarChar, String(userId))
//       .input("cgst_perc", sql.VarChar, String(cgst_perc))
//       .input("sgst_perc", sql.VarChar, String(sgst_perc))
//       .input("igst_perc", sql.VarChar, String(igst_perc))
//       .input("cgst", sql.VarChar, String(cgst))
//       .input("sgst", sql.VarChar, String(sgst))
//       .input("igst", sql.VarChar, String(igst))
//       .input("invoice_date", sql.Date, invoice_date)
//       .input("total_cost_without_gst", sql.VarChar, String(finaltotal))
//       .input("invoice_from", sql.Date, firstdate)
//       .input("invoice_to", sql.Date, enddate)
//       .input("auto_no", sql.Int, auto_no)
//       .input("final_amount", sql.VarChar, String(final_amount))
//       .input("bill_title", sql.NVarChar, String(bill_title) || "").query(`
//         INSERT INTO bill_details (
//           client_id,
//           rate_id,
//           invoice_no,
//           invoice_month,
//           invoice_year,
//           created_by,
//           created_on,
//           cgst_perc,
//           sgst_perc,
//           igst_perc,
//           cgst,
//           sgst,
//           igst,
//           invoice_date,
//           status,
//           total_cost_without_gst,
//           invoice_from,
//           invoice_to,
//           auto_no,
//           final_amount,
//           billing_type,
//           bill_title
//         )
//         VALUES (
//           @client_id,
//           @rate_id,
//           @invoice_no,
//           @invoice_month,
//           @invoice_year,
//           @created_by,
//           GETDATE(),
//           @cgst_perc,
//           @sgst_perc,
//           @igst_perc,
//           @cgst,
//           @sgst,
//           @igst,
//           @invoice_date,
//           'Active',
//           @total_cost_without_gst,
//           @invoice_from,
//           @invoice_to,
//           @auto_no,
//           @final_amount,
//           'Customize',
//           @bill_title
//         )
//       `);

//     await transaction.commit();

//     return {
//       auto_no,
//       invoice_no: finalInvoiceNo,
//     };
//   } catch (error) {
//     await transaction.rollback();
//     throw error;
//   }
// };
  const generateBillModel = async (data, userId) => {
  console.log("🔥🔥🔥 generateBillModel EXECUTED 🔥🔥🔥");
  console.log("generateBillModel userId:", userId);
  console.log("generateBillModel data:", data);

  const transaction = new sql.Transaction(await poolPromise);

  try {
    await transaction.begin();

    const request = new sql.Request(transaction);

    // ==========================
    // USER DETAILS
    // ==========================

    const userResult = await new sql.Request(transaction)
      .input("userId", sql.BigInt, userId)
      .query(`
        SELECT first_name
        FROM users
        WHERE id = @userId
      `);

    const userName = userResult.recordset[0]?.first_name || "";

    const {
      client_id,
      site_id,
      invoice_no,
      invoice_date,
      invoice_month,
      invoice_year,
      bill_title,
      items,
    } = data;

    const rows = items || [];

    if (!Array.isArray(rows)) {
      throw new Error("Invalid items: items must be an array");
    }

    // ==========================
    // SITE DETAILS
    // ==========================

    const siteResult = await request
      .input("site_id", sql.Int, site_id)
      .query(`
        SELECT
          cr.*,
          nc.company_name,
          cr.site_name
        FROM client_rates cr
        LEFT JOIN new_client nc
          ON TRY_CAST(cr.client_id AS BIGINT) = nc.id
        WHERE cr.id = @site_id
      `);

    const siteDetail = siteResult.recordset[0];

    console.log("========================================");
    console.log("GST DEBUG - SITE DETAILS");
    console.log("site_id:", site_id);
    console.log("client_id:", client_id);
    console.log("siteDetail:", siteDetail);
    console.log("cc_cgst:", siteDetail?.cc_cgst);
    console.log("cc_sgst:", siteDetail?.cc_sgst);
    console.log("cc_igst:", siteDetail?.cc_igst);
    console.log("========================================");

    if (!siteDetail) {
      throw new Error("Site not found");
    }

    // ==========================
    // VALIDATE BILL PERIOD
    // ==========================

    const year = Number(invoice_year);
    const month = Number(invoice_month);

    console.log("BILL PERIOD DEBUG");
    console.log("invoice_year:", invoice_year);
    console.log("invoice_month:", invoice_month);

    if (
      invoice_year === undefined ||
      invoice_year === null ||
      String(invoice_year).trim() === "" ||
      !Number.isInteger(year) ||
      year < 1000 ||
      year > 9999
    ) {
      throw new Error(
        `Invalid invoice_year: ${invoice_year}`
      );
    }

    if (
      invoice_month === undefined ||
      invoice_month === null ||
      String(invoice_month).trim() === "" ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      throw new Error(
        `Invalid invoice_month: ${invoice_month}`
      );
    }

    // ==========================
    // AUTO NUMBER
    // ==========================

    const autoResult = await request.query(`
      SELECT ISNULL(MAX(auto_no), 0) + 1 AS auto_no
      FROM bill_details
    `);

    const auto_no = autoResult.recordset[0].auto_no;

    // ==========================
    // UNIQUE ID
    // ==========================

    const uniqueid =
      "BILL" + Date.now() + Math.floor(Math.random() * 100000);

    let finalInvoiceNo = invoice_no;

    if (!finalInvoiceNo) {
      const currentYear = new Date().getFullYear();

      finalInvoiceNo = `SV / ${auto_no} / ${currentYear}-${String(
        currentYear + 1
      ).slice(-2)}`;
    }

    // ==========================
    // CHECK DUPLICATE INVOICE
    // ==========================

    const duplicateInvoice = await new sql.Request(transaction)
      .input("invoice_no", sql.VarChar, finalInvoiceNo)
      .query(`
        SELECT TOP 1 id
        FROM bill_details
        WHERE invoice_no = @invoice_no
          AND active = 0
      `);

    if (duplicateInvoice.recordset.length > 0) {
      throw new Error(
        `Invoice No '${finalInvoiceNo}' already exists.`
      );
    }

    // ==========================
    // ORDER INSERT
    // ==========================

    let finaltotal = 0;
    let totalNos = 0;

    for (const row of rows) {
      const total = Number(row.total || 0);
      const qty = Number(row.total_nos || 0);
      const costPerHead = Number(row.cost_per_head || 0);

      if (
        !Number.isFinite(total) ||
        !Number.isFinite(qty) ||
        !Number.isFinite(costPerHead)
      ) {
        throw new Error(
          "Invalid numeric value in bill items"
        );
      }

      totalNos += qty;
      finaltotal += total;

      await new sql.Request(transaction)
        .input("client_id", sql.Int, client_id)
        .input("unit_id", sql.Int, site_id)
        .input(
          "type",
          sql.NVarChar,
          String(row.type || row.rank || "")
        )
        .input(
          "client_name",
          sql.NVarChar,
          siteDetail.company_name || ""
        )
        .input(
          "site_name",
          sql.NVarChar(200),
          String(siteDetail.site_name || "")
        )
        .input("invoice_month", sql.Int, month)
        .input("invoice_year", sql.Int, year)
        .input("total_nos", sql.Decimal(18, 2), qty)
        .input(
          "sac_code",
          sql.NVarChar,
          String(row.sac_code || "")
        )
        .input(
          "cost_per_head",
          sql.Decimal(18, 2),
          costPerHead
        )
        .input("total", sql.Decimal(18, 2), total)
        .input(
          "emp_name",
          sql.NVarChar,
          String(row.type || "")
        )
        .input(
          "emp_code",
          sql.VarChar,
          String(row.emp_code || "")
        )
        .input("created_by", sql.BigInt, userId)
        .input("created_by_name", sql.VarChar, userName)
        .input("invoice_date", sql.Date, invoice_date)
        .input("invoice_no", sql.VarChar, finalInvoiceNo)
        .input("auto_no", sql.Int, auto_no)
        .input("uniqueid", sql.VarChar, uniqueid)
        .input("source", sql.VarChar, "Web")
        .query(`
          INSERT INTO orders
          (
            client_id,
            unit_id,
            type,
            invoice_month,
            invoice_year,
            total_nos,
            sac_code,
            cost_per_head,
            total,
            created_by,
            created_by_name,
            created_on,
            invoice_date,
            invoice_no,
            auto_no,
            uniqueid,
            status,
            active,
            emp_name,
            emp_code,
            client_name,
            site_name,
            source
          )
          VALUES
          (
            @client_id,
            @unit_id,
            @type,
            @invoice_month,
            @invoice_year,
            @total_nos,
            @sac_code,
            @cost_per_head,
            @total,
            @created_by,
            @created_by_name,
            GETDATE(),
            @invoice_date,
            @invoice_no,
            @auto_no,
            @uniqueid,
            'Active',
            0,
            @emp_name,
            @emp_code,
            @client_name,
            @site_name,
            @source
          )
        `);

      // ==========================
      // ORDERS LOG
      // ==========================

      await new sql.Request(transaction)
        .input("uniqueid", sql.VarChar, uniqueid)
        .query(`
          INSERT INTO orders_log
          (
            client_id,
            unit_id,
            type,
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
            client_name,
            site_name,
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
            log_created_on
          )
          SELECT
            client_id,
            unit_id,
            type,
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
            client_name,
            site_name,
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
            'Generate Bill',
            GETDATE()
          FROM orders
          WHERE uniqueid = @uniqueid
        `);
    }

    // ==========================
    // GST CALCULATION
    // ==========================

    const cgst_perc = Number(siteDetail.cc_cgst || 0);
    const sgst_perc = Number(siteDetail.cc_sgst || 0);
    const igst_perc = Number(siteDetail.cc_igst || 0);

    const cgst = (finaltotal * cgst_perc) / 100;
    const sgst = (finaltotal * sgst_perc) / 100;
    const igst = (finaltotal * igst_perc) / 100;

    const final_amount = Math.round(
      finaltotal + cgst + sgst + igst
    );

    console.log("========================================");
    console.log("GST CALCULATION DEBUG");
    console.log("finaltotal:", finaltotal);
    console.log("cgst_perc:", cgst_perc);
    console.log("sgst_perc:", sgst_perc);
    console.log("igst_perc:", igst_perc);
    console.log("cgst:", cgst);
    console.log("sgst:", sgst);
    console.log("igst:", igst);
    console.log("final_amount:", final_amount);
    console.log("========================================");

    // ==========================
    // BILL PERIOD
    // ==========================

    const formattedMonth = String(month).padStart(2, "0");

    const firstdate = `${year}-${formattedMonth}-01`;

    const monthDays = new Date(year, month, 0).getDate();

    const enddate = `${year}-${formattedMonth}-${String(
      monthDays
    ).padStart(2, "0")}`;

    const costPerHeadBill =
      totalNos > 0 ? finaltotal / totalNos : 0;

    console.log("BILL DATES");
    console.log("firstdate:", firstdate);
    console.log("enddate:", enddate);
    console.log("monthDays:", monthDays);

    // ==========================
    // BILL INSERT
    // ==========================

    await new sql.Request(transaction)
      .input("client_id", sql.Int, client_id)
      .input("rate_id", sql.Int, site_id)
      .input("invoice_no", sql.VarChar, finalInvoiceNo)
      .input(
        "client_name",
        sql.NVarChar,
        siteDetail.company_name || ""
      )
      .input(
        "site_name",
        sql.NVarChar(200),
        String(siteDetail.site_name || "")
      )
      .input("auto_no", sql.Int, auto_no)
      .input("invoice_month", sql.VarChar, formattedMonth)
      .input("invoice_year", sql.Int, year)
      .input("created_by", sql.BigInt, userId)
      .input("created_by_name", sql.VarChar, userName)
      .input("total_nos", sql.Decimal(18, 2), totalNos)
      .input(
        "total_cost_without_gst",
        sql.Decimal(18, 2),
        finaltotal
      )
      .input("cgst", sql.Decimal(18, 2), cgst)
      .input("cgst_perc", sql.Decimal(18, 2), cgst_perc)
      .input("sgst", sql.Decimal(18, 2), sgst)
      .input("sgst_perc", sql.Decimal(18, 2), sgst_perc)
      .input("igst", sql.Decimal(18, 2), igst)
      .input("igst_perc", sql.Decimal(18, 2), igst_perc)
      .input("final_amount", sql.Decimal(18, 2), final_amount)
      .input("invoice_date", sql.Date, invoice_date)
      .input(
        "costperheadbill",
        sql.Decimal(18, 2),
        costPerHeadBill
      )
      .input("invoice_from", sql.Date, firstdate)
      .input("invoice_to", sql.Date, enddate)
      .input("month_days", sql.Int, monthDays)
      .input(
        "bill_title",
        sql.NVarChar,
        String(bill_title || "")
      )
      .input("uniqueid", sql.VarChar, uniqueid)
      .input("source", sql.VarChar, "Web")
      .query(`
        INSERT INTO bill_details
        (
          client_id,
          rate_id,
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
          uniqueid,
          status,
          active,
          invoice_date,
          costperheadbill,
          invoice_from,
          invoice_to,
          billing_type,
          month_days,
          bill_title,
          client_name,
          site_name,
          source
        )
        VALUES
        (
          @client_id,
          @rate_id,
          @invoice_no,
          @auto_no,
          @invoice_month,
          @invoice_year,
          @created_by,
          @created_by_name,
          GETDATE(),
          @total_nos,
          @total_cost_without_gst,
          @cgst,
          @cgst_perc,
          @sgst,
          @sgst_perc,
          @igst,
          @igst_perc,
          @final_amount,
          @uniqueid,
          'Active',
          0,
          @invoice_date,
          @costperheadbill,
          @invoice_from,
          @invoice_to,
          'Customize',
          @month_days,
          @bill_title,
          @client_name,
          @site_name,
          @source
        )
      `);

    // ==========================
    // BILL DETAILS LOG
    // ==========================

    await new sql.Request(transaction)
      .input("uniqueid", sql.VarChar, uniqueid)
      .query(`
        INSERT INTO bill_details_log
        (
          client_id,
          rate_id,
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
          uniqueid,
          status,
          active,
          invoice_date,
          costperheadbill,
          invoice_from,
          invoice_to,
          billing_type,
          modified_by,
          modified_on,
          month_days,
          bill_title,
          client_name,
          site_name,
          source,
          active_id,
          active_remark,
          log_created_on
        )
        SELECT
          client_id,
          rate_id,
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
          uniqueid,
          status,
          active,
          invoice_date,
          costperheadbill,
          invoice_from,
          invoice_to,
          billing_type,
          modified_by,
          modified_on,
          month_days,
          bill_title,
          client_name,
          site_name,
          source,
          id,
          'Generate Bill',
          GETDATE()
        FROM bill_details
        WHERE uniqueid = @uniqueid
      `);

    // ==========================
    // COMMIT TRANSACTION
    // ==========================

    await transaction.commit();

    return {
      success: true,
      auto_no,
      invoice_no: finalInvoiceNo,
      total_without_gst: finaltotal,
      cgst,
      sgst,
      igst,
      final_amount,
    };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "Transaction rollback error:",
        rollbackError
      );
    }

    console.error("Generate Bill Error:", error);
    throw error;
  }
};

/**
 * Get site/client rate info (client_rates table) by site ID
 */
const getSiteInfo = async (siteId) => {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("siteId", sql.Int, siteId)
    .query(`SELECT * FROM client_rates WHERE id = @siteId`);
  return result.recordset;
};

/**
 * Get site-specific employee rate/rank detail from client_other_info
 */
const getSiteDetail = async (siteId, rank) => {
  console.log("siteId :", siteId);
  console.log("rank :", rank);
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("siteId", sql.Int, siteId)
    .input("rank", sql.NVarChar, rank).query(`
      SELECT * FROM client_other_info
      WHERE rate_id = @siteId AND emp_type = @rank
    `);
  return result.recordset;
};

/**
 * Get employee master record by employee code
 */
const getEmployeeByCode = async (empCode) => {
  // console.log("empCode", empCode);
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("empCode", sql.VarChar, empCode)
    .query(`SELECT * FROM employee WHERE employee_code = @empCode`);
  return result.recordset;
};

const getClientByCode = async (clientCode) => {
  const pool = await poolPromise;

  // We join client_rate with new_client to get the full profile based on client_code
  const result = await pool
    .request()
    .input("clientCode", sql.VarChar, clientCode).query(`
      SELECT nc.* FROM new_client nc
      INNER JOIN client_rates cr ON nc.id = cr.client_id
      WHERE cr.client_code = @clientCode
    `);

  return result.recordset;
};

const getClientById = async (clientId) => {
  try {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("clientId", sql.Int, Number(clientId)).query(`
        SELECT *
        FROM new_client
        WHERE [id] = @clientId
      `);

    console.log("CLIENT RESULT COUNT =", result.recordset?.length || 0);

    console.log("CLIENT DATA =", result.recordset?.[0] || null);

    if (result.recordset.length > 0) {
      return result.recordset[0];
    }

    return null;
  } catch (error) {
    console.error("❌ Database error in getClientById:", error);
    throw error;
  }
};
const getCompanyById = async (id, transaction = null) => {
  try {
    console.log("getCompanyById =>", {
      id,
      hasTransaction: !!transaction,
    });

    let request;

    if (transaction) {
      console.log("🔗 GET COMPANY BY ID USING TRANSACTION");
      request = transaction.request();
    } else {
      console.log("🔗 GET COMPANY BY ID USING NORMAL POOL");

      const pool = await poolPromise;
      request = pool.request();
    }

    request.input("companyId", sql.Int, Number(id));

    const result = await request.query(`
      SELECT *
      FROM companies
      WHERE [id] = @companyId
    `);

    console.log("COMPANY RESULT COUNT =", result.recordset?.length || 0);

    console.log("COMPANY DATA =", result.recordset?.[0] || null);

    if (result.recordset.length > 0) {
      return result.recordset[0];
    }

    return null;
  } catch (error) {
    console.error("❌ Database error in getCompanyById:", error);
    throw error;
  }
};

/**
 * Get the last inserted ID from a given table (for invoice number generation)
 */
const getLastId = async (tableName) => {
  const pool = await poolPromise;
  // NOTE: tableName is not user input — safe to interpolate
  const result = await pool
    .request()
    .query(`SELECT ISNULL(MAX(id), 0) AS last_id FROM ${tableName}`);
  return result.recordset[0].last_id;
};

/**
 * Delete existing wage records before recalculation
 */
const deleteEmpWages = async (siteId, month, year, attType) => {
  console.log("🚨 DELETE EMP_WAGES CALLED");

  console.log("DELETE PARAMS =", {
    siteId,
    month,
    year,
    attType,
  });

  try {
    const pool = await poolPromise;

    const request = pool.request();

    request.input("site_id", sql.Decimal(18, 2), Number(siteId));
    request.input("at_month", sql.VarChar(10), String(month).padStart(2, "0"));
    request.input("at_year", sql.Decimal(18, 2), Number(year));
    request.input("at_type", sql.VarChar(100), String(attType || "").trim());

    // CHECK
    const check = await request.query(`
      SELECT id, site_id, client_id, at_month, at_year, at_type
      FROM emp_wages
      WHERE site_id = @site_id
   
        AND at_month = @at_month
        AND at_year = @at_year
        AND LTRIM(RTRIM(ISNULL(at_type, ''))) = @at_type
    `);

    console.log("🔎 MATCHING ROWS =", check.recordset);
    console.log("🔎 MATCHING COUNT =", check.recordset.length);

    if (check.recordset.length === 0) {
      console.log("⚠️ NOTHING TO DELETE");
      return 0;
    }

    // DELETE
    const deleteRequest = pool.request();

    deleteRequest.input("site_id", sql.Decimal(18, 2), Number(siteId));
    deleteRequest.input(
      "at_month",
      sql.VarChar(10),
      String(month).padStart(2, "0"),
    );
    deleteRequest.input("at_year", sql.Decimal(18, 2), Number(year));
    deleteRequest.input(
      "at_type",
      sql.VarChar(100),
      String(attType || "").trim(),
    );

    const result = await deleteRequest.query(`
      DELETE FROM emp_wages
      WHERE site_id = @site_id
        AND at_month = @at_month
        AND at_year = @at_year
        AND LTRIM(RTRIM(ISNULL(at_type, ''))) = @at_type;

      SELECT @@ROWCOUNT AS deleted_count;
    `);

    const deletedCount = result.recordset?.[0]?.deleted_count || 0;

    console.log("🔥 DELETED COUNT =", deletedCount);

    return deletedCount;
  } catch (error) {
    console.error("❌ DELETE EMP_WAGES ERROR =", error);
    throw error;
  }
};
/**
 * Delete existing at_actual_charges before recalculation
 */
const deleteActualCharges = async (siteId, month, year, attType) => {
  console.log("=================================");
  console.log("🔥 DELETE ACTUAL CHARGES");
  console.log("siteId  =", siteId);
  console.log("month   =", month);
  console.log("year    =", year);
  console.log("attType =", attType);
  console.log("=================================");

  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("siteId", sql.Decimal(18, 2), Number(siteId))
    .input("month", sql.Decimal(18, 2), Number(month))
    .input("year", sql.Decimal(18, 2), Number(year))
    .input("attType", sql.VarChar(50), String(attType).trim()).query(`
      DELETE FROM at_actual_charges
      WHERE TRY_CONVERT(DECIMAL(18,2), site_id) = @siteId
        AND TRY_CONVERT(DECIMAL(18,2), at_month) = @month
        AND TRY_CONVERT(DECIMAL(18,2), at_year) = @year
        AND LTRIM(RTRIM(CAST(at_type AS VARCHAR(50)))) =
            LTRIM(RTRIM(@attType));

      SELECT @@ROWCOUNT AS deletedCount;
    `);

  const deletedCount = result.recordset?.[0]?.deletedCount || 0;

  console.log("🔥 DELETED ROWS =", deletedCount);

  return deletedCount;
};

/* ============================================================
 * INSERT EMP WAGES
 * ============================================================ */

const insertEmpWages = async (wagesArr) => {
  console.log("### ---------------------------------------RANK RATE ###");
  console.log("Employee:", wagesArr.emp_name);
  console.log("rank_rate:", wagesArr.rank_rate);
  try {
    const pool = await poolPromise;
    console.log("### ---------------------------------------RANK RATE ###");
    console.log("Employee:", wagesArr.emp_name);
    console.log("rank_rate:", wagesArr.rank_rate);

    /* ========================================================
     * VALIDATION
     * ======================================================== */

    if (!wagesArr || typeof wagesArr !== "object") {
      throw new Error("insertEmpWages: wagesArr is empty or invalid");
    }

    const req = pool.request();

    /* ========================================================
     * HEADER LOGGER
     * ======================================================== */

    console.log("\n");
    console.log("======================================================");
    console.log("              INSERT EMP_WAGES START");
    console.log("======================================================");

    console.log("Employee Code :", wagesArr.emp_code);
    console.log("Employee Name :", wagesArr.emp_name);
    console.log("Employee ID   :", wagesArr.emp_id);
    console.log("Site ID       :", wagesArr.site_id);
    console.log("Client ID     :", wagesArr.client_id);
    console.log("Client Code   :", wagesArr.client_code);
    console.log("Month         :", wagesArr.at_month);
    console.log("Year          :", wagesArr.at_year);
    console.log("Type          :", wagesArr.at_type);

    /* ========================================================
     * IMPORTANT RAW VALUES
     * ======================================================== */

    console.log("\n------------------------------------------------------");
    console.log("RAW SALARY VALUES");
    console.log("------------------------------------------------------");

    console.table({
      basic: wagesArr.basic,
      vda: wagesArr.vda,
      basic_vda: wagesArr.basic_vda,

      hra: wagesArr.hra,

      special_allow: wagesArr.special_allow,
      other_allow: wagesArr.other_allow,
      lww: wagesArr.lww,
      bonus: wagesArr.bonus,

      gross: wagesArr.gross,

      earned_basic: wagesArr.earned_basic,
      earned_da: wagesArr.earned_da,
      earned_basic_da: wagesArr.earned_basic_da,

      earned_hra: wagesArr.earned_hra,

      earned_special_allow: wagesArr.earned_special_allow,

      earned_other_allow: wagesArr.earned_other_allow,

      earned_lww: wagesArr.earned_lww,

      earned_bonus: wagesArr.earned_bonus,

      earned_ot_wages: wagesArr.earned_ot_wages,

      earned_gross: wagesArr.earned_gross,

      any_other: wagesArr.any_other,

      earned_any_other: wagesArr.earned_any_other,

      earned_leave_wages: wagesArr.earned_leave_wages,

      earned_uniform_wages: wagesArr.earned_uniform_wages,

      earned_holiday_pay: wagesArr.earned_holiday_pay,

      earned_incentive: wagesArr.earned_incentive,

      earned_night_allow: wagesArr.earned_night_allow,
    });

    /* ========================================================
     * ATTENDANCE VALUES
     * ======================================================== */

    console.log("\n------------------------------------------------------");
    console.log("ATTENDANCE VALUES");
    console.log("------------------------------------------------------");

    console.table({
      month_days: wagesArr.month_days,

      present_days: wagesArr.present_days,

      paid_holiday: wagesArr.paid_holiday,

      net_days: wagesArr.net_days,

      ot_days: wagesArr.ot_days,

      absent_days: wagesArr.absent_days,

      weekly_off: wagesArr.weekly_off,

      paid_leaves: wagesArr.paid_leaves,

      half_day: wagesArr.half_day,

      total_cl: wagesArr.total_cl,

      total_pl: wagesArr.total_pl,

      total_sl: wagesArr.total_sl,

      total_holiday: wagesArr.total_holiday,
    });

    /* ========================================================
     * DEDUCTION VALUES
     * ======================================================== */

    console.log("\n------------------------------------------------------");
    console.log("DEDUCTION VALUES");
    console.log("------------------------------------------------------");

    console.table({
      pf_wages: wagesArr.pf_wages,

      esic_wages: wagesArr.esic_wages,

      deduct_pf: wagesArr.deduct_pf,

      deduct_pt: wagesArr.deduct_pt,

      deduct_esic: wagesArr.deduct_esic,

      deduct_lwf: wagesArr.deduct_lwf,

      deduct_other: wagesArr.deduct_other,

      deduct_advance: wagesArr.deduct_advance,

      deduct_loan: wagesArr.deduct_loan,

      deduct_uniform: wagesArr.deduct_uniform,

      deduct_id: wagesArr.deduct_id,

      deduct_recovery: wagesArr.deduct_recovery,

      deduct_installment: wagesArr.deduct_installment,

      total_deduction: wagesArr.total_deduction,

      net_take_home: wagesArr.net_take_home,
    });

    /* ========================================================
     * EMPLOYER VALUES
     * ======================================================== */

    console.log("\n------------------------------------------------------");
    console.log("EMPLOYER VALUES");
    console.log("------------------------------------------------------");

    console.table({
      emp_pf: wagesArr.emp_pf,

      emp_esic: wagesArr.emp_esic,

      emp_lwf: wagesArr.emp_lwf,

      emp_gratuty: wagesArr.emp_gratuty,

      emp_ctc: wagesArr.emp_ctc,

      emp_service_charges: wagesArr.emp_service_charges,

      emp_ictc: wagesArr.emp_ictc,

      emp_gst: wagesArr.emp_gst,

      emp_invoice_amount: wagesArr.emp_invoice_amount,

      emp_any_other: wagesArr.emp_any_other,
    });

    /* ========================================================
     * NUMERIC COLUMNS
     * ======================================================== */

    const numericColumns = [
      "basic",
      "vda",
      "basic_vda",
      "special_allow",
      "hra",
      "other_allow",
      "lww",
      "bonus",
      "gross",

      "ot_rate",

      "fixed_leave_wages",
      "per_day_rate",
      "rank_rate",
      "fixed_uniform_wages",

      "present_days",
      "paid_holiday",
      "net_days",
      "ot_days",

      "earned_basic",
      "earned_da",
      "earned_basic_da",
      "earned_special_allow",
      "earned_hra",
      "earned_other_allow",
      "earned_lww",
      "earned_bonus",
      "earned_ot_wages",
      "earned_gross",

      "pf_wages",
      "esic_wages",

      "deduct_pf",
      "deduct_pt",
      "deduct_esic",
      "deduct_lwf",
      "deduct_other",
      "deduct_advance",
      "deduct_loan",
      "deduct_uniform",
      "deduct_id",
      "deduct_recovery",
      "deduct_installment",

      "total_deduction",
      "net_take_home",

      "arrears_payable",
      "salary_payable",

      "emp_pf",
      "emp_esic",
      "emp_lwf",
      "emp_gratuty",
      "emp_ctc",
      "emp_service_charges",
      "emp_ictc",
      "emp_gst",
      "emp_invoice_amount",

      "total_nos",

      "absent_days",
      "weekly_off",
      "paid_leaves",
      "half_day",

      "any_other",

      "earned_leave_wages",
      "earned_uniform_wages",
      "earned_any_other",

      "CGST",
      "SGST",
      "IGST",

      "emp_any_other",

      "total_cl",
      "total_pl",
      "total_sl",
      "total_holiday",

      "earned_holiday_pay",
      "earned_incentive",
      "earned_night_allow",

      "migrant_fee",
      "night_allow",
    ];

    /* ========================================================
     * TEXT COLUMNS
     * ======================================================== */

    const textColumns = [
      "site_id",
      "client_id",
      "at_year",
      "emp_id",

      "month_days",

      "client_code",
      "client_name",

      "at_month",
      "at_type",

      "emp_code",
      "emp_name",
      "rank",

      "billing_type",

      "source",
    ];

    /* ========================================================
     * IMPORTANT SALARY FIELDS
     * ======================================================== */

    const salaryNumericFields = [
      "basic",
      "vda",
      "basic_vda",
      "special_allow",
      "hra",
      "other_allow",
      "lww",
      "bonus",
      "gross",

      "earned_basic",
      "earned_da",
      "earned_basic_da",
      "earned_special_allow",
      "earned_hra",
      "earned_other_allow",
      "earned_lww",
      "earned_bonus",
      "earned_ot_wages",
      "earned_gross",

      "any_other",
      "earned_any_other",

      "total_deduction",
      "net_take_home",
    ];

    /* ========================================================
     * VALIDATE SALARY VALUES
     * ======================================================== */

    console.log("\n------------------------------------------------------");
    console.log("SALARY FIELD VALIDATION");
    console.log("------------------------------------------------------");

    for (const key of salaryNumericFields) {
      const rawValue = wagesArr[key];

      console.log(`[SALARY CHECK] ${key}:`, rawValue);

      if (rawValue !== null && rawValue !== undefined && rawValue !== "") {
        const numberValue = Number(rawValue);

        if (!Number.isFinite(numberValue)) {
          console.error(`[INVALID SALARY] ${key} =`, rawValue);

          throw new Error(`Invalid salary value: ${key} = ${rawValue}`);
        }
      }
    }

    /* ========================================================
     * ADD SQL PARAMETERS
     * ======================================================== */

    const finalDbValues = {};

    for (const [key, value] of Object.entries(wagesArr)) {
      /* ======================================================
       * NUMERIC
       * ====================================================== */

      if (numericColumns.includes(key)) {
        let safeValue;

        if (value === null || value === undefined || value === "") {
          safeValue = 0;
        } else {
          safeValue = Number(value);
        }

        if (!Number.isFinite(safeValue)) {
          console.warn(`[WARNING] Invalid numeric value -> ${key}:`, value);

          safeValue = 0;
        }

        finalDbValues[key] = safeValue;

        req.input(key, sql.Decimal(18, 2), safeValue);

        console.log(`[SQL PARAM] ${key} = ${safeValue}`);

        continue;
      }

      /* ======================================================
       * TEXT
       * ====================================================== */

      if (textColumns.includes(key)) {
        const safeValue =
          value === null || value === undefined ? "" : String(value);

        finalDbValues[key] = safeValue;

        req.input(key, sql.NVarChar, safeValue);

        console.log(`[SQL PARAM] ${key} = "${safeValue}"`);

        continue;
      }

      /* ======================================================
       * AUTO DETECT
       * ====================================================== */

      if (typeof value === "number") {
        const safeValue = Number.isFinite(value) ? value : 0;

        finalDbValues[key] = safeValue;

        req.input(key, sql.Decimal(18, 2), safeValue);
      } else {
        const safeValue =
          value === null || value === undefined ? "" : String(value);

        finalDbValues[key] = safeValue;

        req.input(key, sql.NVarChar, safeValue);
      }
    }

    /* ========================================================
     * FINAL IMPORTANT VALUES
     * ======================================================== */

    console.log("\n======================================================");
    console.log("FINAL VALUES GOING INTO emp_wages");
    console.log("======================================================");

    console.table({
      emp_code: finalDbValues.emp_code,

      emp_name: finalDbValues.emp_name,

      site_id: finalDbValues.site_id,

      client_id: finalDbValues.client_id,

      month: finalDbValues.at_month,

      year: finalDbValues.at_year,

      /* BASIC */

      basic: finalDbValues.basic,

      hra: finalDbValues.hra,

      vda: finalDbValues.vda,

      basic_vda: finalDbValues.basic_vda,

      special_allow: finalDbValues.special_allow,

      other_allow: finalDbValues.other_allow,

      lww: finalDbValues.lww,

      bonus: finalDbValues.bonus,

      gross: finalDbValues.gross,

      /* EARNED */

      earned_basic: finalDbValues.earned_basic,

      earned_da: finalDbValues.earned_da,

      earned_basic_da: finalDbValues.earned_basic_da,

      earned_hra: finalDbValues.earned_hra,

      earned_special_allow: finalDbValues.earned_special_allow,

      earned_other_allow: finalDbValues.earned_other_allow,

      earned_lww: finalDbValues.earned_lww,

      earned_bonus: finalDbValues.earned_bonus,

      earned_ot_wages: finalDbValues.earned_ot_wages,

      earned_gross: finalDbValues.earned_gross,

      /* CHARGES */

      any_other: finalDbValues.any_other,

      earned_any_other: finalDbValues.earned_any_other,

      emp_any_other: finalDbValues.emp_any_other,

      /* DEDUCTIONS */

      pf_wages: finalDbValues.pf_wages,

      esic_wages: finalDbValues.esic_wages,

      deduct_pf: finalDbValues.deduct_pf,

      deduct_pt: finalDbValues.deduct_pt,

      deduct_esic: finalDbValues.deduct_esic,

      total_deduction: finalDbValues.total_deduction,

      net_take_home: finalDbValues.net_take_home,

      /* EMPLOYER */

      emp_pf: finalDbValues.emp_pf,

      emp_esic: finalDbValues.emp_esic,

      emp_lwf: finalDbValues.emp_lwf,

      emp_service_charges: finalDbValues.emp_service_charges,

      emp_ictc: finalDbValues.emp_ictc,

      emp_gst: finalDbValues.emp_gst,

      emp_invoice_amount: finalDbValues.emp_invoice_amount,
    });

    /* ========================================================
     * COLUMNS
     * ======================================================== */

    const columns = Object.keys(wagesArr)
      .map((key) => `[${key}]`)
      .join(", ");

    /* ========================================================
     * PARAMETERS
     * ======================================================== */

    const params = Object.keys(wagesArr)
      .map((key) => `@${key}`)
      .join(", ");

    /* ========================================================
     * FINAL INSERT QUERY
     * ======================================================== */

    const query = `
      INSERT INTO emp_wages
      (
        ${columns}
      )
      VALUES
      (
        ${params}
      )
    `;

    /* ========================================================
     * QUERY LOGGER
     * ======================================================== */

    console.log("\n======================================================");
    console.log("EMP_WAGES INSERT QUERY");
    console.log("======================================================");

    console.log(query);

    /* ========================================================
     * INSERT
     * ======================================================== */

    const result = await req.query(query);

    /* ========================================================
     * SUCCESS LOGGER
     * ======================================================== */

    console.log("\n======================================================");
    console.log("       EMP_WAGES INSERT SUCCESS");
    console.log("======================================================");

    console.log("Employee :", wagesArr.emp_code);
    console.log("Name     :", wagesArr.emp_name);
    console.log("Basic    :", finalDbValues.basic);
    console.log("HRA      :", finalDbValues.hra);
    console.log("Earned Basic :", finalDbValues.earned_basic);
    console.log("Earned HRA :", finalDbValues.earned_hra);
    console.log("Gross :", finalDbValues.gross);
    console.log("Earned Gross :", finalDbValues.earned_gross);

    console.log("Rows Affected :", result.rowsAffected);

    console.log("======================================================\n");

    return result;
  } catch (error) {
    /* ========================================================
     * ERROR LOGGER
     * ======================================================== */

    console.error("\n======================================================");
    console.error("       EMP_WAGES INSERT FAILED");
    console.error("======================================================");

    console.error("Employee Code:", wagesArr?.emp_code);

    console.error("Employee Name:", wagesArr?.emp_name);

    console.error("Error:", error.message);

    console.error("SQL Error:", error);

    console.error("======================================================\n");

    throw error;
  }
};

/* ============================================================
 * INSERT AT ACTUAL CHARGES
 * ============================================================ */

const insertActualCharge = async (chargeArr) => {
  try {
    const pool = await poolPromise;
    const req = pool.request();

    /* ========================================================
     * VALIDATION
     * ======================================================== */

    if (!chargeArr || typeof chargeArr !== "object") {
      throw new Error("insertActualCharge: chargeArr is empty or invalid");
    }

    console.log("\n");
    console.log("======================================================");
    console.log("        INSERT AT_ACTUAL_CHARGES START");
    console.log("======================================================");

    console.table({
      site_id: chargeArr.site_id,

      client_id: chargeArr.client_id,

      client_code: chargeArr.client_code,

      at_month: chargeArr.at_month,

      at_year: chargeArr.at_year,

      at_type: chargeArr.at_type,

      charges_type: chargeArr.charges_type,

      total_nos: chargeArr.total_nos,

      cost_per_head: chargeArr.cost_per_head,

      total: chargeArr.total,

      source: chargeArr.source,
    });

    /* ========================================================
     * REQUIRED CHARGE VALIDATION
     * ======================================================== */

    const requiredFields = [
      "site_id",
      "client_id",
      "at_month",
      "at_year",
      "charges_type",
      "total_nos",
      "cost_per_head",
      "total",
    ];

    for (const field of requiredFields) {
      if (chargeArr[field] === undefined || chargeArr[field] === null) {
        console.warn(`[CHARGE WARNING] ${field} is NULL/undefined`);
      }
    }

    /* ========================================================
     * ADD PARAMETERS
     * ======================================================== */

    const finalChargeValues = {};

    for (const [key, value] of Object.entries(chargeArr)) {
      /* ======================================================
       * NUMERIC
       * ====================================================== */

      const numericChargeFields = ["total_nos", "cost_per_head", "total"];

      if (numericChargeFields.includes(key)) {
        let safeValue = Number(value);

        if (value === null || value === undefined || value === "") {
          safeValue = 0;
        }

        if (!Number.isFinite(safeValue)) {
          console.warn(`[CHARGE WARNING] Invalid numeric value ${key}:`, value);

          safeValue = 0;
        }

        finalChargeValues[key] = safeValue;

        req.input(key, sql.Decimal(18, 2), safeValue);

        console.log(`[CHARGE PARAM] ${key} = ${safeValue}`);
      } else {
        const safeValue =
          value === null || value === undefined ? "" : String(value);

        finalChargeValues[key] = safeValue;

        req.input(key, sql.NVarChar, safeValue);

        console.log(`[CHARGE PARAM] ${key} = "${safeValue}"`);
      }
    }

    /* ========================================================
     * FORCE CALCULATE TOTAL
     * ======================================================== */

    const totalNos = Number(finalChargeValues.total_nos || 0);

    const costPerHead = Number(finalChargeValues.cost_per_head || 0);

    const calculatedTotal = Number((totalNos * costPerHead).toFixed(2));

    console.log("\n------------------------------------------------------");
    console.log("CHARGE CALCULATION");
    console.log("------------------------------------------------------");

    console.log("Total Nos     :", totalNos);

    console.log("Cost Per Head :", costPerHead);

    console.log("Calculated    :", calculatedTotal);

    console.log("Received Total:", finalChargeValues.total);

    /*
     * If total is missing/zero but
     * total_nos and cost_per_head are available,
     * use calculated total.
     */

    if (!finalChargeValues.total || Number(finalChargeValues.total) === 0) {
      finalChargeValues.total = calculatedTotal;

      /*
       * Re-bind total parameter
       */

      req.input("total", sql.Decimal(18, 2), calculatedTotal);

      console.log("[CHARGE FIX] total updated to:", calculatedTotal);
    }

    /* ========================================================
     * COLUMNS
     * ======================================================== */

    const columns = Object.keys(chargeArr)
      .map((key) => `[${key}]`)
      .join(", ");

    /* ========================================================
     * PARAMS
     * ======================================================== */

    const params = Object.keys(chargeArr)
      .map((key) => `@${key}`)
      .join(", ");

    /* ========================================================
     * QUERY
     * ======================================================== */

    const query = `
      INSERT INTO at_actual_charges
      (
        ${columns}
      )
      VALUES
      (
        ${params}
      )
    `;

    console.log("\n======================================================");
    console.log("AT_ACTUAL_CHARGES INSERT QUERY");
    console.log("======================================================");

    console.log(query);

    /* ========================================================
     * FINAL VALUES
     * ======================================================== */

    console.log("\n------------------------------------------------------");
    console.log("FINAL CHARGE VALUES");
    console.log("------------------------------------------------------");

    console.table({
      site_id: finalChargeValues.site_id,

      client_id: finalChargeValues.client_id,

      client_code: finalChargeValues.client_code,

      at_month: finalChargeValues.at_month,

      at_year: finalChargeValues.at_year,

      at_type: finalChargeValues.at_type,

      charges_type: finalChargeValues.charges_type,

      total_nos: finalChargeValues.total_nos,

      cost_per_head: finalChargeValues.cost_per_head,

      total: finalChargeValues.total,

      source: finalChargeValues.source,
    });

    /* ========================================================
     * INSERT
     * ======================================================== */

    const result = await req.query(query);

    /* ========================================================
     * SUCCESS
     * ======================================================== */

    console.log("\n======================================================");
    console.log("      AT_ACTUAL_CHARGES INSERT SUCCESS");
    console.log("======================================================");

    console.log("Charge Type:", finalChargeValues.charges_type);

    console.log("Total Nos:", finalChargeValues.total_nos);

    console.log("Cost Per Head:", finalChargeValues.cost_per_head);

    console.log("Total:", finalChargeValues.total);

    console.log("Rows Affected:", result.rowsAffected);

    console.log("======================================================\n");

    return result;
  } catch (error) {
    console.error("\n======================================================");
    console.error("      AT_ACTUAL_CHARGES INSERT FAILED");
    console.error("======================================================");

    console.error("Charge Data:", chargeArr);

    console.error("Error:", error.message);

    console.error("SQL Error:", error);

    console.error("======================================================\n");

    throw error;
  }
};
const generateFinalInvoice = async (invoiceData, files, user) => {
  const pool = await poolPromise;

  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    console.log("\n==========================================");
    console.log("FINAL INVOICE GENERATION START");
    console.log("==========================================");

    const request = new sql.Request(transaction);

    const {
      client_id,
      rate_id,
      invoice_no,
      invoice_month,
      invoice_year,
      billing_type,
      month_days,
      bill_title,

      // GST values from frontend are NOT used.
      // GST will be calculated from client_rates.

      total_cost_without_gst,

      invoice_from,
      invoice_to,

      items = [],
    } = invoiceData;

    const total_nos = items.reduce(
  (sum, item) => sum + Number(item.total_nos || 0),
  0
);

console.log("TOTAL NOS :", total_nos);

    // =====================================================
    // REQUEST DATA LOG
    // =====================================================

    console.log("\n==========================================");
    console.log("INVOICE REQUEST DATA");
    console.log("==========================================");

    console.log("client_id              :", client_id);
    console.log("rate_id                :", rate_id);
    console.log("invoice_no             :", invoice_no);
    console.log("invoice_month          :", invoice_month);
    console.log("invoice_year           :", invoice_year);
    console.log("billing_type           :", billing_type);
    console.log("month_days             :", month_days);
    console.log("bill_title             :", bill_title);
    console.log("total_cost_without_gst :", total_cost_without_gst);
    console.log("invoice_from           :", invoice_from);
    console.log("invoice_to             :", invoice_to);
    console.log("items count            :", items.length);

    console.log("==========================================");

    // =====================================================
    // GET AUTO NUMBER
    // =====================================================

    const autoNoResult = await request.query(`
      SELECT
        ISNULL(MAX(auto_no), 0) + 1 AS auto_no
      FROM bill_details
    `);

    const auto_no = autoNoResult.recordset[0].auto_no;

    console.log("\n==========================================");
    console.log("AUTO NUMBER");
    console.log("==========================================");
    console.log("AUTO NO:", auto_no);
    console.log("==========================================");

    // =====================================================
    // INSERT ORDERS
    // =====================================================

    console.log("\n==========================================");
    console.log("INSERTING ORDERS");
    console.log("==========================================");

    

    for (const item of items) {
      console.log("\n------------------------------------------");
      console.log("ORDER ITEM");
      console.log("------------------------------------------");

      console.log("type          :", item.type);
      console.log("total_nos     :", item.total_nos);
      console.log("cost_per_head :", item.cost_per_head);
      console.log("total         :", item.total);


      await new sql.Request(transaction)

        .input("client_id", sql.Int, Number(client_id))

        .input("unit_id", sql.Int, Number(rate_id))

        .input("type", sql.VarChar(100), item.type || "")

        .input("invoice_month", sql.VarChar(20), String(invoice_month))

        .input("invoice_year", sql.VarChar(20), String(invoice_year))

        .input("total_nos", sql.Decimal(18, 2), Number(item.total_nos || 0))

        .input(
          "cost_per_head",
          sql.Decimal(18, 2),
          Number(item.cost_per_head || 0),
        )

        .input("total", sql.Decimal(18, 2), Number(item.total || 0))

        .input("invoice_no", sql.NVarChar(100), invoice_no)

        .input("auto_no", sql.Int, auto_no)

        .input("created_by", sql.Int, Number(user.id)).query(`
          INSERT INTO orders
          (
            client_id,
            unit_id,
            type,

            invoice_month,
            invoice_year,

            total_nos,
            cost_per_head,
            total,

            invoice_no,
            auto_no,

            created_on,
            created_by
          )

          VALUES
          (
            @client_id,
            @unit_id,
            @type,

            @invoice_month,
            @invoice_year,

            @total_nos,
            @cost_per_head,
            @total,

            @invoice_no,
            @auto_no,

            GETDATE(),
            @created_by
          )
        `);

      console.log("ORDER INSERTED SUCCESSFULLY:", item.type);
    }

    console.log("\nALL ORDERS INSERTED SUCCESSFULLY");

    // =====================================================
    // GET GST FROM CLIENT_RATES
    // =====================================================

    console.log("\n");
    console.log("==================================================");
    console.log("              GST FETCH START");
    console.log("==================================================");

    console.log("[GST] Input client_id :", client_id);

    console.log("[GST] Input rate_id   :", rate_id);

    const gstResult = await new sql.Request(transaction)
      .input("rate_id", sql.Int, Number(rate_id))
      .input("client_id", sql.Int, Number(client_id)).query(`
    SELECT
      cr.id,
      cr.client_id,
      cr.site_name,
      nc.company_name AS client_name,
      cr.cc_cgst,
      cr.cc_sgst,
      cr.cc_igst
    FROM client_rates cr
    LEFT JOIN new_client nc
      ON nc.id = cr.client_id
    WHERE cr.id = @rate_id
      AND cr.client_id = @client_id
  `);

    const gstDetail = gstResult.recordset[0];

    console.log("[CLIENT] Client Name :", gstDetail.client_name);
    console.log("[CLIENT] Site Name   :", gstDetail.site_name);

    console.log("\n[GST] client_rates result:");

    console.log(gstDetail);

    if (!gstDetail) {
      throw new Error(`Client rate not found for rate_id ${rate_id}`);
    }

    console.log("\n--------------------------------------------------");

    console.log("[GST] Rate ID       :", gstDetail.id);

    console.log("[GST] Client ID     :", gstDetail.client_id);

    console.log("[GST] Site Name     :", gstDetail.site_name);

    console.log("[GST] CGST %        :", gstDetail.cc_cgst);

    console.log("[GST] SGST %        :", gstDetail.cc_sgst);

    console.log("[GST] IGST %        :", gstDetail.cc_igst);

    console.log("==================================================");

    // =====================================================
    // GST CALCULATION
    // =====================================================

    console.log("\n");
    console.log("==================================================");
    console.log("              GST CALCULATION START");
    console.log("==================================================");

    const subtotal = Number(total_cost_without_gst || 0);

    const cgst_perc = Number(gstDetail.cc_cgst || 0);

    const sgst_perc = Number(gstDetail.cc_sgst || 0);

    const igst_perc = Number(gstDetail.cc_igst || 0);

    console.log("[GST CALC] Subtotal received :", subtotal);

    console.log("[GST CALC] CGST percentage    :", cgst_perc, "%");

    console.log("[GST CALC] SGST percentage    :", sgst_perc, "%");

    console.log("[GST CALC] IGST percentage    :", igst_perc, "%");

    // =====================================================
    // CGST CALCULATION
    // =====================================================

    const cgstRaw = (subtotal * cgst_perc) / 100;

    const cgst = Number(cgstRaw.toFixed(2));

    console.log("\n[CGST CALCULATION]");

    console.log(`Formula: ${subtotal} × ${cgst_perc} / 100`);

    console.log("Raw CGST amount :", cgstRaw);

    console.log("Rounded CGST    :", cgst);

    // =====================================================
    // SGST CALCULATION
    // =====================================================

    const sgstRaw = (subtotal * sgst_perc) / 100;

    const sgst = Number(sgstRaw.toFixed(2));

    console.log("\n[SGST CALCULATION]");

    console.log(`Formula: ${subtotal} × ${sgst_perc} / 100`);

    console.log("Raw SGST amount :", sgstRaw);

    console.log("Rounded SGST    :", sgst);

    // =====================================================
    // IGST CALCULATION
    // =====================================================

    const igstRaw = (subtotal * igst_perc) / 100;

    const igst = Number(igstRaw.toFixed(2));

    console.log("\n[IGST CALCULATION]");

    console.log(`Formula: ${subtotal} × ${igst_perc} / 100`);

    console.log("Raw IGST amount :", igstRaw);

    console.log("Rounded IGST    :", igst);

    // =====================================================
    // FINAL AMOUNT CALCULATION
    // =====================================================

    const calculatedFinalAmount = Number(
      (subtotal + cgst + sgst + igst).toFixed(2),
    );

    console.log("\n[FINAL AMOUNT CALCULATION]");

    console.log(`Formula: ${subtotal} + ${cgst} + ${sgst} + ${igst}`);

    console.log("Subtotal       :", subtotal);

    console.log("CGST           :", cgst);

    console.log("SGST           :", sgst);

    console.log("IGST           :", igst);

    console.log("Final Amount   :", calculatedFinalAmount);

    console.log("==================================================");
    console.log("              GST CALCULATION END");
    console.log("==================================================");

    // =====================================================
    // BILL DETAILS INSERT VALUES LOG
    // =====================================================

    console.log("\n");
    console.log("==================================================");
    console.log("       BILL_DETAILS INSERT VALUES");
    console.log("==================================================");

    console.log("client_id              :", Number(client_id));

    console.log("rate_id                :", Number(rate_id));

    console.log("invoice_no             :", invoice_no);

    console.log("auto_no                :", auto_no);

    console.log("invoice_month          :", invoice_month);

    console.log("invoice_year           :", invoice_year);

    console.log("------------------------------------------");

    console.log("total_cost_without_gst :", subtotal);

    console.log("cgst                   :", cgst);

    console.log("cgst_perc              :", cgst_perc);

    console.log("sgst                   :", sgst);

    console.log("sgst_perc              :", sgst_perc);

    console.log("igst                   :", igst);

    console.log("igst_perc              :", igst_perc);

    console.log("final_amount           :", calculatedFinalAmount);

    console.log("------------------------------------------");

    console.log("billing_type           :", billing_type);

    console.log("month_days             :", month_days);

    console.log("bill_title             :", bill_title);

    console.log("invoice_from           :", invoice_from);

    console.log("invoice_to             :", invoice_to);

    console.log("==================================================");

    // =====================================================
    // INSERT BILL DETAILS
    // =====================================================

    console.log("\nINSERTING BILL DETAILS...");

    await new sql.Request(transaction)

      .input("client_id", sql.Int, Number(client_id))

      .input("rate_id", sql.Int, Number(rate_id))

      .input("invoice_no", sql.NVarChar(100), invoice_no)

      .input("auto_no", sql.Int, auto_no)

      .input("invoice_month", sql.VarChar(20), String(invoice_month))

      .input("invoice_year", sql.VarChar(20), String(invoice_year))

      .input("total_cost_without_gst", sql.Decimal(18, 2), subtotal)

      .input("cgst", sql.Decimal(18, 2), cgst)

      .input("cgst_perc", sql.Decimal(18, 2), cgst_perc)

      .input("sgst", sql.Decimal(18, 2), sgst)

      .input("sgst_perc", sql.Decimal(18, 2), sgst_perc)

      .input("igst", sql.Decimal(18, 2), igst)

      .input("igst_perc", sql.Decimal(18, 2), igst_perc)

      .input("final_amount", sql.Decimal(18, 2), calculatedFinalAmount)

      .input("billing_type", sql.NVarChar(100), billing_type || "")

      .input("month_days", sql.Int, Number(month_days || 0))

      .input("bill_title", sql.NVarChar(255), bill_title || "")

      .input("invoice_from", sql.Date, invoice_from)

      .input("invoice_to", sql.Date, invoice_to)

      .input(
  "client_name",
  sql.NVarChar(255),
  gstDetail.client_name || ""
)

.input(
  "site_name",
  sql.NVarChar(255),
  gstDetail.site_name || ""
)
.input(
  "total_nos",
  sql.Decimal(18, 2),
  total_nos
)

.input(
  "created_by_name",
  sql.NVarChar(255),
  user.name || ""
)

      .input("created_by", sql.Int, Number(user.id)).query(`
        INSERT INTO bill_details
        (
          client_id,
          rate_id,

          invoice_no,
          auto_no,

          invoice_month,
          invoice_year,

          created_on,

          total_cost_without_gst,

          cgst,
          cgst_perc,

          sgst,
          sgst_perc,

          igst,
          igst_perc,

          final_amount,

          status,

          invoice_date,

          invoice_from,
          invoice_to,

          billing_type,

          month_days,

          bill_title,

          client_name,
    site_name,
    total_nos,

created_by_name,

          created_by

        )

        VALUES
        (
          @client_id,
          @rate_id,

          @invoice_no,
          @auto_no,

          @invoice_month,
          @invoice_year,

          GETDATE(),

          @total_cost_without_gst,

          @cgst,
          @cgst_perc,

          @sgst,
          @sgst_perc,

          @igst,
          @igst_perc,

          @final_amount,

          'Active',

          GETDATE(),

          @invoice_from,
          @invoice_to,

          @billing_type,

          @month_days,

          @bill_title,

          @client_name,
@site_name,
@total_nos,

@created_by_name,

          @created_by
        )
      `);

    console.log("BILL_DETAILS INSERTED SUCCESSFULLY");

    // =====================================================
    // VERIFY BILL_DETAILS INSERT
    // =====================================================

    console.log("\n");
    console.log("==================================================");
    console.log("       VERIFYING BILL_DETAILS INSERT");
    console.log("==================================================");

    const insertedBillResult = await new sql.Request(transaction)

      .input("invoice_no", sql.NVarChar(100), invoice_no)

      .input("auto_no", sql.Int, auto_no).query(`
          SELECT
            id,
            client_id,
            rate_id,

            invoice_no,
            auto_no,

            invoice_month,
            invoice_year,

            total_cost_without_gst,

            cgst,
            cgst_perc,

            sgst,
            sgst_perc,

            igst,
            igst_perc,

            final_amount,

            status,

            invoice_from,
            invoice_to,

            billing_type,
            month_days,
            bill_title,

            created_by,
            created_on

          FROM bill_details

          WHERE invoice_no = @invoice_no

          AND auto_no = @auto_no
        `);

    if (insertedBillResult.recordset.length > 0) {
      console.log("[DB VERIFY] Inserted bill_details row:");

      console.log(insertedBillResult.recordset[0]);
    } else {
      console.log("[DB VERIFY] WARNING: bill_details row not found!");
    }

    console.log("==================================================");

    // =====================================================
    // GET EMP_WAGES
    // =====================================================

    console.log("\n==========================================");
    console.log("GETTING EMP_WAGES DATA");
    console.log("==========================================");

    const wagesResult = await new sql.Request(transaction)

      .input("site_id", sql.Int, Number(rate_id))

      .input("client_id", sql.Int, Number(client_id))

      .input("at_month", sql.VarChar(20), String(invoice_month))

      .input("at_year", sql.Int, Number(invoice_year)).query(`
        SELECT *
        FROM emp_wages

        WHERE TRY_CONVERT(DECIMAL(18,2), site_id) =
              TRY_CONVERT(DECIMAL(18,2), @site_id)

        AND TRY_CONVERT(DECIMAL(18,2), client_id) =
            TRY_CONVERT(DECIMAL(18,2), @client_id)

        AND TRY_CONVERT(INT, at_month) =
            TRY_CONVERT(INT, @at_month)

        AND TRY_CONVERT(DECIMAL(18,2), at_year) =
            TRY_CONVERT(DECIMAL(18,2), @at_year)
      `);

    const empWages = wagesResult.recordset || [];

    console.log("TOTAL EMP_WAGES:", empWages.length);

    // =====================================================
    // SALARY SLIP RELATED CODE REMOVED
    // =====================================================
    //
    // salary_slip
    // emp_salary_earning
    // emp_salary_deduction
    //
    // No salary data is inserted/updated here.
    //
    // EMP_WAGES lookup is preserved because it was part
    // of the original active invoice flow.
    //
    // =====================================================

    // =====================================================
    // SAVE SUPPORTING FILES
    // =====================================================

    console.log("\n==========================================");
    console.log("SAVING SUPPORTING FILES");
    console.log("==========================================");

    for (const file of files) {
      console.log("\nSupporting file:");
      console.log("Name:", file.originalname);
      console.log("Path:", file.path);

      await new sql.Request(transaction)

        .input("sp_image", sql.NVarChar(255), file.originalname)

        .input("sp_imagepath", sql.NVarChar(500), file.path)

        .input("invoice_no", sql.NVarChar(100), invoice_no)

        .input("invoice_month", sql.VarChar(20), String(invoice_month))

        .input("invoice_year", sql.VarChar(20), String(invoice_year))

        .input("auto_no", sql.Int, auto_no).query(`
          INSERT INTO bill_supportings
          (
            sp_image,
            sp_imagepath,

            invoice_no,

            invoice_month,
            invoice_year,

            auto_no,

            created_on
          )

          VALUES
          (
            @sp_image,
            @sp_imagepath,

            @invoice_no,

            @invoice_month,
            @invoice_year,

            @auto_no,

            GETDATE()
          )
        `);

      console.log("SUPPORTING FILE INSERTED:", file.originalname);
    }

    // =====================================================
    // UPDATE ATTENDANCE
    // =====================================================

    const attendanceTable =
      billing_type === "ROKADA" ? "manpower_attendance" : "attendance";

    console.log("\n==========================================");
    console.log("UPDATING ATTENDANCE");
    console.log("==========================================");

    console.log("Attendance table :", attendanceTable);

    console.log("site_id          :", Number(rate_id));

    console.log("month            :", String(invoice_month));

    console.log("year             :", String(invoice_year));

    await new sql.Request(transaction)

      .input("site_id", sql.Int, Number(rate_id))

      .input("month", sql.VarChar(20), String(invoice_month))

      .input("year", sql.VarChar(20), String(invoice_year)).query(`
        UPDATE ${attendanceTable}

        SET invoice_status = 'Approved'

        WHERE site_id = @site_id

        AND at_month = @month

        AND at_year = @year
      `);

    console.log("ATTENDANCE UPDATED SUCCESSFULLY");

    // =====================================================
    // COMMIT TRANSACTION
    // =====================================================

    console.log("\n==========================================");
    console.log("COMMITTING TRANSACTION");
    console.log("==========================================");

    await transaction.commit();

    console.log("\n==========================================");
    console.log("FINAL INVOICE SUCCESS");
    console.log("==========================================");

    console.log("Invoice No :", invoice_no);

    console.log("Auto No    :", auto_no);

    console.log("Subtotal   :", subtotal);

    console.log("CGST       :", cgst);

    console.log("SGST       :", sgst);

    console.log("IGST       :", igst);

    console.log("Final Amt  :", calculatedFinalAmount);

    console.log("==========================================");

    return {
      success: true,
      invoice_no,
      auto_no,
    };
  } catch (error) {
    console.error("\n==========================================");
    console.error("FINAL INVOICE ERROR");
    console.error("==========================================");

    console.error("Error Message:", error.message);

    console.error("Full Error:", error);

    try {
      if (transaction && transaction._aborted !== true) {
        console.log("ROLLING BACK TRANSACTION...");

        await transaction.rollback();

        console.log("ROLLBACK SUCCESSFUL");
      }
    } catch (rollbackError) {
      console.error("ROLLBACK ERROR:", rollbackError);
    }

    throw error;
  }
};

// const generateFinalInvoice = async (invoiceData, files, user) => {
//   const pool = await poolPromise;

//   const transaction = new sql.Transaction(pool);

//   try {
//     await transaction.begin();

//     console.log("\n==========================================");
//     console.log("FINAL INVOICE GENERATION START");
//     console.log("==========================================");

//     const request = new sql.Request(transaction);

//     const {
//       client_id,
//       rate_id,
//       invoice_no,
//       invoice_month,
//       invoice_year,
//       billing_type,
//       month_days,
//       bill_title,

//       cgst,
//       cgst_perc,

//       sgst,
//       sgst_perc,

//       igst,
//       igst_perc,

//       total_cost_without_gst,
//       final_amount,

//       invoice_from,
//       invoice_to,

//       items = [],
//     } = invoiceData;

//     // =====================================================
//     // GET AUTO NUMBER
//     // =====================================================

//     const autoNoResult = await request.query(`

//         SELECT
//           ISNULL(MAX(auto_no), 0) + 1
//           AS auto_no

//         FROM bill_details

//       `);

//     const auto_no = autoNoResult.recordset[0].auto_no;

//     console.log("AUTO NO:", auto_no);

//     // =====================================================
//     // INSERT ORDERS
//     // =====================================================

//     console.log("\nINSERTING ORDERS...");

//     for (const item of items) {
//       await new sql.Request(transaction)

//         .input("client_id", sql.Int, Number(client_id))

//         .input("unit_id", sql.Int, Number(rate_id))

//         .input("type", sql.VarChar(100), item.type || "")

//         .input("invoice_month", sql.VarChar(20), String(invoice_month))

//         .input("invoice_year", sql.VarChar(20), String(invoice_year))

//         .input("total_nos", sql.Decimal(18, 2), Number(item.total_nos || 0))

//         .input(
//           "cost_per_head",
//           sql.Decimal(18, 2),
//           Number(item.cost_per_head || 0),
//         )

//         .input("total", sql.Decimal(18, 2), Number(item.total || 0))

//         .input("invoice_no", sql.NVarChar(100), invoice_no)

//         .input("auto_no", sql.Int, auto_no)

//         .input("created_by", sql.Int, Number(user.id)).query(`

//           INSERT INTO orders
//           (
//             client_id,
//             unit_id,
//             type,

//             invoice_month,
//             invoice_year,

//             total_nos,
//             cost_per_head,
//             total,

//             invoice_no,
//             auto_no,

//             created_on,
//             created_by
//           )

//           VALUES
//           (
//             @client_id,
//             @unit_id,
//             @type,

//             @invoice_month,
//             @invoice_year,

//             @total_nos,
//             @cost_per_head,
//             @total,

//             @invoice_no,
//             @auto_no,

//             GETDATE(),
//             @created_by
//           )

//         `);
//     }

//     // =====================================================
//     // INSERT BILL DETAILS
//     // =====================================================

//     console.log("\nINSERTING BILL DETAILS...");

//     await new sql.Request(transaction)

//       .input("client_id", sql.Int, Number(client_id))

//       .input("rate_id", sql.Int, Number(rate_id))

//       .input("invoice_no", sql.NVarChar(100), invoice_no)

//       .input("auto_no", sql.Int, auto_no)

//       .input("invoice_month", sql.VarChar(20), String(invoice_month))

//       .input("invoice_year", sql.VarChar(20), String(invoice_year))

//       .input(
//         "total_cost_without_gst",
//         sql.Decimal(18, 2),
//         Number(total_cost_without_gst || 0),
//       )

//       .input("cgst", sql.Decimal(18, 2), Number(cgst || 0))

//       .input("cgst_perc", sql.Decimal(18, 2), Number(cgst_perc || 0))

//       .input("sgst", sql.Decimal(18, 2), Number(sgst || 0))

//       .input("sgst_perc", sql.Decimal(18, 2), Number(sgst_perc || 0))

//       .input("igst", sql.Decimal(18, 2), Number(igst || 0))

//       .input("igst_perc", sql.Decimal(18, 2), Number(igst_perc || 0))

//       .input("final_amount", sql.Decimal(18, 2), Number(final_amount || 0))

//       .input("billing_type", sql.NVarChar(100), billing_type || "")

//       .input("month_days", sql.Int, Number(month_days || 0))

//       .input("bill_title", sql.NVarChar(255), bill_title || "")

//       .input("invoice_from", sql.Date, invoice_from)

//       .input("invoice_to", sql.Date, invoice_to)

//       .input("created_by", sql.Int, Number(user.id)).query(`

//         INSERT INTO bill_details
//         (
//           client_id,
//           rate_id,

//           invoice_no,
//           auto_no,

//           invoice_month,
//           invoice_year,

//           created_on,

//           total_cost_without_gst,

//           cgst,
//           cgst_perc,

//           sgst,
//           sgst_perc,

//           igst,
//           igst_perc,

//           final_amount,

//           status,

//           invoice_date,

//           invoice_from,
//           invoice_to,

//           billing_type,

//           month_days,

//           bill_title,

//           created_by
//         )

//         VALUES
//         (
//           @client_id,
//           @rate_id,

//           @invoice_no,
//           @auto_no,

//           @invoice_month,
//           @invoice_year,

//           GETDATE(),

//           @total_cost_without_gst,

//           @cgst,
//           @cgst_perc,

//           @sgst,
//           @sgst_perc,

//           @igst,
//           @igst_perc,

//           @final_amount,

//           'Active',

//           GETDATE(),

//           @invoice_from,
//           @invoice_to,

//           @billing_type,

//           @month_days,

//           @bill_title,

//           @created_by
//         )

//       `);

//     // =====================================================
//     // GET EMP_WAGES
//     // =====================================================

//     console.log("\n==========================================");
//     console.log("GETTING EMP_WAGES DATA");
//     console.log("==========================================");

//     const wagesResult = await new sql.Request(transaction)

//       .input("site_id", sql.Int, Number(rate_id))

//       .input("client_id", sql.Int, Number(client_id))

//       .input("at_month", sql.VarChar(20), String(invoice_month))

//       .input("at_year", sql.Int, Number(invoice_year)).query(`

//        SELECT *
// FROM emp_wages
// WHERE TRY_CONVERT(DECIMAL(18,2), site_id) =
//       TRY_CONVERT(DECIMAL(18,2), @site_id)

//   AND TRY_CONVERT(DECIMAL(18,2), client_id) =
//       TRY_CONVERT(DECIMAL(18,2), @client_id)

//   AND TRY_CONVERT(INT, at_month) =
//       TRY_CONVERT(INT, @at_month)

//   AND TRY_CONVERT(DECIMAL(18,2), at_year) =
//       TRY_CONVERT(DECIMAL(18,2), @at_year);
//         `);

//     const empWages = wagesResult.recordset || [];

//     console.log("TOTAL EMP_WAGES:", empWages.length);

//     const pdfEmployees = [];
//     // =====================================================
//     // PROCESS EMP_WAGES
//     // =====================================================

//     for (const wage of empWages) {
//       console.log("\n------------------------------------------");

//       console.log("PROCESSING EMPLOYEE:", wage.emp_code);

//       console.log("EMPLOYEE NAME:", wage.emp_name);

//       console.log("------------------------------------------");

//       // ===================================================
//       // CHECK SALARY SLIP EXISTS
//       // ===================================================

//       // const salarySlipCheck = await new sql.Request(transaction)

//       //   .input("emp_id", sql.Int, Number(wage.emp_id))

//       //   .input("site_id", sql.Int, Number(rate_id))

//       //   .input("at_month", sql.VarChar(20), String(invoice_month))

//       //   .input("at_year", sql.Int, Number(invoice_year)).query(`

//       //       SELECT TOP 1 id

//       //       FROM salary_slip

//       //       WHERE emp_id = @emp_id

//       //       AND site_id = @site_id

//       //       AND at_month = @at_month

//       //       AND at_year = @at_year

//       //       AND (
//       //         active = 0
//       //         OR active IS NULL
//       //       )

//       //     `);

//       // // ===================================================
//       // // INSERT SALARY SLIP
//       // // ===================================================

//       // if (salarySlipCheck.recordset.length === 0) {
//       //   console.log("INSERTING SALARY SLIP");

//       //   await new sql.Request(transaction)

//       //     .input("emp_id", sql.Int, Number(wage.emp_id))

//       //     .input("at_month", sql.VarChar(20), String(invoice_month))

//       //     .input("at_year", sql.Int, Number(invoice_year))

//       //     .input("salary_template", sql.Int, 0)

//       //     .input(
//       //       "def_gross_salary",
//       //       sql.Decimal(18, 2),
//       //       Number(wage.gross || 0),
//       //     )

//       //     .input("def_gross_salary_type", sql.NVarChar(50), "FIXED")

//       //     .input(
//       //       "def_basic_salary",
//       //       sql.Decimal(18, 2),
//       //       Number(wage.basic || 0),
//       //     )

//       //     .input("def_basic_salary_type", sql.NVarChar(50), "FIXED")

//       //     .input("basic_rate", sql.Decimal(18, 2), Number(wage.basic || 0))

//       //     .input(
//       //       "no_of_days",
//       //       sql.Decimal(18, 2),
//       //       Number(wage.net_days || wage.month_days || 0),
//       //     )

//       //     .input(
//       //       "total_earning",
//       //       sql.Decimal(18, 2),
//       //       Number(wage.earned_gross || 0),
//       //     )

//       //     .input(
//       //       "total_deduction",
//       //       sql.Decimal(18, 2),
//       //       Number(wage.total_deduction || 0),
//       //     )

//       //     .input("site_id", sql.Int, Number(wage.site_id))

//       //     .input("client_code", sql.NVarChar(100), wage.client_code || "")

//       //     .input("rank", sql.NVarChar(100), wage.rank || "")

//       //     .input("gross_salary", sql.Decimal(18, 2), Number(wage.gross || 0))

//       //     .input("ac_holder_name", sql.NVarChar(255), "")

//       //     .input("card_no", sql.NVarChar(100), "")

//       //     .input("bank_name", sql.NVarChar(255), "")

//       //     .input("remark", sql.NVarChar(500), "")

//       //     .input("hold_salary", sql.Int, 0)

//       //     .input("site_name", sql.NVarChar(255), wage.site_name || "")

//       //     .input("client_name", sql.NVarChar(255), wage.client_name || "")

//       //     .input("source", sql.NVarChar(100), "Invoice").query(`

//       //       INSERT INTO salary_slip
//       //       (
//       //         emp_id,

//       //         at_month,
//       //         at_year,

//       //         salary_template,

//       //         def_gross_salary,
//       //         def_gross_salary_type,

//       //         def_basic_salary,
//       //         def_basic_salary_type,

//       //         basic_rate,

//       //         no_of_days,

//       //         total_earning,

//       //         total_deduction,

//       //         active,

//       //         site_id,

//       //         client_code,

//       //         rank,

//       //         gross_salary,

//       //         ac_holder_name,

//       //         card_no,

//       //         bank_name,

//       //         remark,

//       //         hold_salary,

//       //         site_name,

//       //         client_name,

//       //         source

//       //       )

//       //       VALUES
//       //       (
//       //         @emp_id,

//       //         @at_month,
//       //         @at_year,

//       //         @salary_template,

//       //         @def_gross_salary,
//       //         @def_gross_salary_type,

//       //         @def_basic_salary,
//       //         @def_basic_salary_type,

//       //         @basic_rate,

//       //         @no_of_days,

//       //         @total_earning,

//       //         @total_deduction,

//       //         0,

//       //         @site_id,

//       //         @client_code,

//       //         @rank,

//       //         @gross_salary,

//       //         @ac_holder_name,

//       //         @card_no,

//       //         @bank_name,

//       //         @remark,

//       //         @hold_salary,

//       //         @site_name,

//       //         @client_name,

//       //         @source
//       //       )

//       //     `);
//       // }

//       // ===================================================
//       // DELETE OLD EMPLOYEE EARNINGS
//       // ===================================================

//       // await new sql.Request(transaction)

//       //   .input("emp_id", sql.Int, Number(wage.emp_id))

//       //   .input("at_month", sql.VarChar(20), String(invoice_month))

//       //   .input("at_year", sql.Int, Number(invoice_year)).query(`

//       //     DELETE FROM emp_salary_earning

//       //     WHERE emp_id = @emp_id

//       //     AND source = 'Invoice'

//       //   `);

//       // ===================================================
//       // EMPLOYEE EARNINGS
//       // ===================================================

//       // const earnings = [
//       //   {
//       //     name: "BASIC",
//       //     amount: wage.earned_basic,
//       //   },

//       //   {
//       //     name: "VDA",
//       //     amount: wage.earned_da,
//       //   },

//       //   {
//       //     name: "HRA",
//       //     amount: wage.earned_hra,
//       //   },

//       //   {
//       //     name: "SPECIAL ALLOWANCE",
//       //     amount: wage.earned_special_allow,
//       //   },

//       //   {
//       //     name: "OTHER ALLOWANCE",
//       //     amount: wage.earned_other_allow,
//       //   },

//       //   {
//       //     name: "LWW",
//       //     amount: wage.earned_lww,
//       //   },

//       //   {
//       //     name: "BONUS",
//       //     amount: wage.earned_bonus,
//       //   },

//       //   {
//       //     name: "OT WAGES",
//       //     amount: wage.earned_ot_wages,
//       //   },

//       //   {
//       //     name: "LEAVE WAGES",
//       //     amount: wage.earned_leave_wages,
//       //   },

//       //   {
//       //     name: "UNIFORM WAGES",
//       //     amount: wage.earned_uniform_wages,
//       //   },

//       //   {
//       //     name: "ANY OTHER",
//       //     amount: wage.earned_any_other,
//       //   },

//       //   {
//       //     name: "HOLIDAY PAY",
//       //     amount: wage.earned_holiday_pay,
//       //   },

//       //   {
//       //     name: "INCENTIVE",
//       //     amount: wage.earned_incentive,
//       //   },

//       //   {
//       //     name: "NIGHT ALLOWANCE",
//       //     amount: wage.earned_night_allow,
//       //   },
//       // ];

//       // // ===================================================
//       // // INSERT EMPLOYEE EARNINGS
//       // // ===================================================

//       // for (const earning of earnings) {
//       //   const amount = Number(earning.amount || 0);

//       //   if (amount === 0) {
//       //     continue;
//       //   }

//       //   await new sql.Request(transaction)

//       //     .input("emp_id", sql.Int, Number(wage.emp_id))

//       //     .input("tmpl_id", sql.Int, 0)

//       //     .input("earning_name", sql.NVarChar(255), earning.name)

//       //     .input("earning_rate", sql.Decimal(18, 2), 0)

//       //     .input("earning_amount", sql.Decimal(18, 2), amount)

//       //     .input("source", sql.NVarChar(100), "Invoice").query(`

//       //       INSERT INTO emp_salary_earning
//       //       (
//       //         emp_id,

//       //         tmpl_id,

//       //         earning_name,

//       //         earning_rate,

//       //         earning_amount,

//       //         active,

//       //         source
//       //       )

//       //       VALUES
//       //       (
//       //         @emp_id,

//       //         @tmpl_id,

//       //         @earning_name,

//       //         @earning_rate,

//       //         @earning_amount,

//       //         0,

//       //         @source
//       //       )

//       //     `);
//       // }

//       // ===================================================
//       // DELETE OLD DEDUCTIONS
//       // ===================================================

//       // await new sql.Request(transaction).input(
//       //   "emp_id",
//       //   sql.Int,
//       //   Number(wage.emp_id),
//       // ).query(`

//       //     DELETE FROM emp_salary_deduction

//       //     WHERE emp_id = @emp_id

//       //     AND source = 'Invoice'

//       //   `);

//       // ===================================================
//       // EMPLOYEE DEDUCTIONS
//       // ===================================================

//       // const deductions = [
//       //   {
//       //     name: "PF",
//       //     amount: wage.deduct_pf,
//       //   },

//       //   {
//       //     name: "PT",
//       //     amount: wage.deduct_pt,
//       //   },

//       //   {
//       //     name: "ESIC",
//       //     amount: wage.deduct_esic,
//       //   },

//       //   {
//       //     name: "LWF",
//       //     amount: wage.deduct_lwf,
//       //   },

//       //   {
//       //     name: "OTHER DEDUCTION",
//       //     amount: wage.deduct_other,
//       //   },

//       //   {
//       //     name: "ADVANCE",
//       //     amount: wage.deduct_advance,
//       //   },

//       //   {
//       //     name: "LOAN",
//       //     amount: wage.deduct_loan,
//       //   },

//       //   {
//       //     name: "UNIFORM",
//       //     amount: wage.deduct_uniform,
//       //   },

//       //   {
//       //     name: "ID",
//       //     amount: wage.deduct_id,
//       //   },

//       //   {
//       //     name: "RECOVERY",
//       //     amount: wage.deduct_recovery,
//       //   },

//       //   {
//       //     name: "INSTALLMENT",
//       //     amount: wage.deduct_installment,
//       //   },
//       // ];

//       // ===================================================
//       // INSERT EMPLOYEE DEDUCTIONS
//       // ===================================================

//       //   for (const deduction of deductions) {
//       //     const amount = Number(deduction.amount || 0);

//       //     if (amount === 0) {
//       //       continue;
//       //     }

//       //     await new sql.Request(transaction)

//       //       .input("emp_id", sql.Int, Number(wage.emp_id))

//       //       .input("tmpl_id", sql.Int, 0)

//       //       .input("deduction_name", sql.NVarChar(255), deduction.name)

//       //       .input("deduction_rate", sql.Decimal(18, 2), 0)

//       //       .input("deduction_amount", sql.Decimal(18, 2), amount)

//       //       .input("source", sql.NVarChar(100), "Invoice").query(`

//       //         INSERT INTO emp_salary_deduction
//       //         (
//       //           emp_id,

//       //           tmpl_id,

//       //           deduction_name,

//       //           deduction_rate,

//       //           deduction_amount,

//       //           active,

//       //           source
//       //         )

//       //         VALUES
//       //         (
//       //           @emp_id,

//       //           @tmpl_id,

//       //           @deduction_name,

//       //           @deduction_rate,

//       //           @deduction_amount,

//       //           0,

//       //           @source
//       //         )

//       //       `);
//       //   }

//       //   console.log("EMPLOYEE SALARY DATA INSERTED:", wage.emp_code);
//     }

//     // =====================================================
//     // SAVE SUPPORTING FILES
//     // =====================================================

//     console.log("\nSAVING SUPPORTING FILES...");

//     for (const file of files) {
//       await new sql.Request(transaction)

//         .input("sp_image", sql.NVarChar(255), file.originalname)

//         .input("sp_imagepath", sql.NVarChar(500), file.path)

//         .input("invoice_no", sql.NVarChar(100), invoice_no)

//         .input("invoice_month", sql.VarChar(20), String(invoice_month))

//         .input("invoice_year", sql.VarChar(20), String(invoice_year))

//         .input("auto_no", sql.Int, auto_no).query(`

//           INSERT INTO bill_supportings
//           (
//             sp_image,

//             sp_imagepath,

//             invoice_no,

//             invoice_month,

//             invoice_year,

//             auto_no,

//             created_on
//           )

//           VALUES
//           (
//             @sp_image,

//             @sp_imagepath,

//             @invoice_no,

//             @invoice_month,

//             @invoice_year,

//             @auto_no,

//             GETDATE()
//           )

//         `);
//     }

//     // =====================================================
//     // UPDATE ATTENDANCE
//     // =====================================================

//     const attendanceTable =
//       billing_type === "ROKADA" ? "manpower_attendance" : "attendance";

//     console.log("UPDATING ATTENDANCE TABLE:", attendanceTable);

//     await new sql.Request(transaction)

//       .input("site_id", sql.Int, Number(rate_id))

//       .input("month", sql.VarChar(20), String(invoice_month))

//       .input("year", sql.VarChar(20), String(invoice_year)).query(`

//         UPDATE ${attendanceTable}

//         SET invoice_status = 'Approved'

//         WHERE site_id = @site_id

//         AND at_month = @month

//         AND at_year = @year

//       `);

//     // =====================================================
//     // COMMIT
//     // =====================================================

//     await transaction.commit();

//     console.log("\n==========================================");
//     console.log("FINAL INVOICE SUCCESS");
//     console.log("==========================================");

//     return {
//       success: true,

//       invoice_no,

//       auto_no,
//     };
//   } catch (error) {
//     console.error("FINAL INVOICE ERROR:", error);

//     try {
//       if (transaction && transaction._aborted !== true) {
//         await transaction.rollback();
//       }
//     } catch (rollbackError) {
//       console.error("ROLLBACK ERROR:", rollbackError);
//     }

//     throw error;
//   }
// };
const getMasterDataById = async (tableName, fieldName, fieldValue) => {
  const pool = await poolPromise;

  const query = `
      SELECT *
      FROM ${tableName}
      WHERE ${fieldName} = @fieldValue
      AND active = 0
      ORDER BY id DESC
  `;

  const result = await pool
    .request()
    .input("fieldValue", fieldValue)
    .query(query);

  return result.recordset;
};

const getEmpWagesBySite = async (siteId, month, year) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("siteId", siteId)
    .input("month", month)
    .input("year", year).query(`
      SELECT *
      FROM emp_wages
      WHERE site_id = @siteId
      AND at_month = @month
      AND at_year = @year
    `);

  return result.recordset;
};

const bankDetailOnInvoice = async (companyId, accountNo) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("companyId", companyId)
    .input("accountNo", accountNo).query(`
      SELECT *
      FROM company_bank_detail
      WHERE company_id = @companyId
      AND ac_no = @accountNo
    `);

  return result.recordset;
};

const getOrderInfo = async (autoNo) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().input("autoNo", sql.Int, autoNo).query(`
        SELECT
            id,
            client_id,
            unit_id,
            type,
            invoice_month,
            invoice_year,

            SUM(ISNULL(TRY_CAST(total_nos AS DECIMAL(18,2)),0)) AS total_nos,

            cost_per_head,

            no_of_days,

            SUM(ISNULL(TRY_CAST(total AS DECIMAL(18,2)),0)) AS total,

            service_charges_type,
            service_charges,
            sac_code,

            invoice_no,
            auto_no,
            invoice_date,

            emp_name,
            emp_code,

            tb_date,
            tb_from,
            tb_to,
            lr_no,
            tb_vehicle_no,
            tb_weight,
            tb_invoice_no

        FROM orders

        WHERE auto_no = @autoNo
          AND active = 0

        GROUP BY
            id,
            client_id,
            unit_id,
            type,
            invoice_month,
            invoice_year,
            cost_per_head,
            no_of_days,
            service_charges_type,
            service_charges,
            sac_code,
            invoice_no,
            auto_no,
            invoice_date,
            emp_name,
            emp_code,
            tb_date,
            tb_from,
            tb_to,
            lr_no,
            tb_vehicle_no,
            tb_weight,
            tb_invoice_no

        ORDER BY id ASC
      `);

    return result.recordset;
  } catch (error) {
    console.error("getOrderInfo Error:", error);
    throw error;
  }
};

const removeBillingAction = async (autoNo, billingType, userId) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // =====================================
    // GET USER DETAILS
    // =====================================

    const userResult = await new sql.Request(transaction).input(
      "userId",
      sql.BigInt,
      userId,
    ).query(`
        SELECT 
          id,
          first_name
        FROM users
        WHERE id = @userId
      `);

    if (userResult.recordset.length === 0) {
      throw new Error("User not found");
    }

    const user = userResult.recordset[0];

    // =====================================
    // GET BILL DETAILS
    // =====================================

    const billResult = await new sql.Request(transaction).input(
      "autoNo",
      sql.BigInt,
      autoNo,
    ).query(`
        SELECT TOP 1
          rate_id,
          invoice_month,
          invoice_year
        FROM bill_details
        WHERE auto_no = @autoNo
      `);

    if (billResult.recordset.length === 0) {
      throw new Error("Bill not found");
    }

    const bill = billResult.recordset[0];

    // =====================================
    // INSERT BILL DETAILS LOG BEFORE DELETE
    // =====================================

    await new sql.Request(transaction).input("autoNo", sql.BigInt, autoNo)
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
    deleted_by,
      deleted_by_name,
      deleted_on,
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
      
      deleted_by,
      deleted_by_name,
      deleted_on,

      'web',

      id,
      'Before Delete',

      GETDATE()

    FROM bill_details

    WHERE auto_no = @autoNo

    `);

    // =====================================
    // INSERT ORDERS LOG BEFORE DELETE
    // =====================================

    await new sql.Request(transaction)

      .input("autoNo", sql.BigInt, autoNo)

      .input("deleted_by", sql.BigInt, user.id)

      .input("deleted_by_name", sql.VarChar, user.first_name).query(`


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

     deleted_by,
      deleted_by_name,
      deleted_on,

      GETDATE()


    FROM orders

    WHERE auto_no = @autoNo


    `);

    // =====================================
    // SOFT DELETE BILL DETAILS
    // =====================================

    await new sql.Request(transaction)

      .input("autoNo", sql.BigInt, autoNo)

      .input("deleted_on", sql.DateTime, new Date())

      .input("deleted_by_name", sql.VarChar, user.first_name)

      .input("deleted_by", sql.BigInt, user.id).query(`

      UPDATE bill_details

      SET

        active = 1,

        deleted_on = @deleted_on,

        deleted_by_name = @deleted_by_name,

        deleted_by = @deleted_by


      WHERE auto_no = @autoNo

      `);

    // =====================================
    // SOFT DELETE ORDERS
    // =====================================

    await new sql.Request(transaction)

      .input("autoNo", sql.BigInt, autoNo)

      .input("deleted_on", sql.DateTime, new Date())

      .input("deleted_by_name", sql.VarChar, user.first_name)

      .input("deleted_by", sql.BigInt, user.id).query(`

      UPDATE orders

      SET

        active = 1,

        deleted_on = @deleted_on,

        deleted_by_name = @deleted_by_name,

        deleted_by = @deleted_by


      WHERE auto_no = @autoNo

      `);

    // =====================================
    // RESET ATTENDANCE STATUS
    // =====================================

    if (billingType !== "ROKADA") {
      await new sql.Request(transaction)

        .input("siteId", sql.Int, bill.rate_id)

        .input("month", sql.Int, bill.invoice_month)

        .input("year", sql.Int, bill.invoice_year).query(`

      UPDATE attendance

      SET invoice_status='Pending'

      WHERE site_id=@siteId

      AND at_month=@month

      AND at_year=@year

      `);
    } else {
      await new sql.Request(transaction)

        .input("siteId", sql.Int, bill.rate_id)

        .input("month", sql.Int, bill.invoice_month)

        .input("year", sql.Int, bill.invoice_year).query(`

      UPDATE manpower_attendance

      SET invoice_status='Pending'

      WHERE site_id=@siteId

      AND at_month=@month

      AND at_year=@year

      `);
    }

    await transaction.commit();

    return true;
  } catch (error) {
    await transaction.rollback();

    console.log("Remove Billing Error:", error);

    throw error;
  }
};

// get emp_wages-Pf
const getEmpWagesPf = async (siteId, month, year, atType) => {
  const pool = await poolPromise;

  console.log("========== GET EMP WAGES PF ==========");
  console.log("siteId:", siteId);
  console.log("month:", month);
  console.log("year:", year);
  console.log("atType:", atType);
  console.log("======================================");

  const result = await pool
    .request()
    .input("siteId", sql.NVarChar, String(siteId))
    .input("month", sql.NVarChar, String(month))
    .input("year", sql.NVarChar, String(year))
    .input("atType", sql.NVarChar, String(atType)).query(`
      SELECT
        COUNT(id) AS total_nos,
        ISNULL(
          SUM(TRY_CONVERT(decimal(18,2), emp_pf)),
          0
        ) AS totalpf
      FROM emp_wages
      WHERE site_id = @siteId
        AND TRY_CONVERT(int, at_month) = TRY_CONVERT(int, @month)
        AND TRY_CONVERT(int, at_year) = TRY_CONVERT(int, @year)
        AND LTRIM(RTRIM(at_type)) = LTRIM(RTRIM(@atType))
        AND TRY_CONVERT(decimal(18,2), net_days) > 0
    `);

  console.log("PF QUERY RESULT:", result.recordset[0]);

  return (
    result.recordset[0] || {
      total_nos: 0,
      totalpf: 0,
    }
  );
};

// get emp_wages-Bonus
const getEmpWagesBonus = async (siteId, month, year, atType) => {
  const pool = await poolPromise;

  console.log("========== GET EMP WAGES BONUS ==========");
  console.log("siteId:", siteId);
  console.log("month:", month);
  console.log("year:", year);
  console.log("atType:", atType);
  console.log("=========================================");

  const result = await pool
    .request()
    .input("siteId", sql.NVarChar, String(siteId))
    .input("month", sql.NVarChar, String(month))
    .input("year", sql.NVarChar, String(year))
    .input("atType", sql.NVarChar, String(atType)).query(`
      SELECT
        COUNT(id) AS total_nos,
        ISNULL(
          SUM(TRY_CONVERT(decimal(18,2), bonus)),
          0
        ) AS totalbonus
      FROM emp_wages
      WHERE site_id = @siteId
        AND TRY_CONVERT(int, at_month) = TRY_CONVERT(int, @month)
        AND TRY_CONVERT(int, at_year) = TRY_CONVERT(int, @year)
        AND LTRIM(RTRIM(at_type)) = LTRIM(RTRIM(@atType))
        AND TRY_CONVERT(decimal(18,2), net_days) > 0
    `);

  console.log("BONUS QUERY RESULT:", result.recordset[0]);

  return (
    result.recordset[0] || {
      total_nos: 0,
      totalbonus: 0,
    }
  );
};

// get service charge
const getEmpWagesServiceCharges = async (siteId, month, year, atType) => {
  const pool = await poolPromise;

  console.log("========== GET EMP WAGES SERVICE CHARGES ==========");
  console.log("siteId:", siteId);
  console.log("month:", month);
  console.log("year:", year);
  console.log("atType:", atType);
  console.log("====================================================");

  const result = await pool
    .request()
    .input("siteId", sql.NVarChar, String(siteId))
    .input("month", sql.NVarChar, String(month))
    .input("year", sql.NVarChar, String(year))
    .input("atType", sql.NVarChar, String(atType)).query(`
      SELECT
        COUNT(id) AS total_nos,
        ISNULL(
          SUM(TRY_CONVERT(decimal(18,2), emp_service_charges)),
          0
        ) AS totalservice_charges
      FROM emp_wages
      WHERE site_id = @siteId
        AND TRY_CONVERT(int, at_month) = TRY_CONVERT(int, @month)
        AND TRY_CONVERT(int, at_year) = TRY_CONVERT(int, @year)
        AND LTRIM(RTRIM(at_type)) = LTRIM(RTRIM(@atType))
        AND TRY_CONVERT(decimal(18,2), net_days) > 0
    `);

  console.log("SERVICE CHARGES QUERY RESULT:", result.recordset[0]);

  return (
    result.recordset[0] || {
      total_nos: 0,
      totalservice_charges: 0,
    }
  );
};

// get emp_wages-Pt
const getEmpWagesPt = async (siteId, month, year, atType) => {
  const pool = await poolPromise;

  console.log("========== GET EMP WAGES PT ==========");
  console.log("siteId:", siteId);
  console.log("month:", month);
  console.log("year:", year);
  console.log("atType:", atType);
  console.log("======================================");

  const result = await pool
    .request()
    .input("siteId", sql.NVarChar, String(siteId))
    .input("month", sql.NVarChar, String(month))
    .input("year", sql.NVarChar, String(year))
    .input("atType", sql.NVarChar, String(atType)).query(`
      SELECT
        COUNT(id) AS total_nos,
        ISNULL(
          SUM(TRY_CONVERT(decimal(18,2), deduct_pt)),
          0
        ) AS totalpt
      FROM emp_wages
      WHERE site_id = @siteId
        AND TRY_CONVERT(int, at_month) =
            TRY_CONVERT(int, @month)
        AND TRY_CONVERT(int, at_year) =
            TRY_CONVERT(int, @year)
        AND LTRIM(RTRIM(at_type)) =
            LTRIM(RTRIM(@atType))
        AND TRY_CONVERT(decimal(18,2), net_days) > 0
    `);

  console.log("PT QUERY RESULT:", result.recordset[0]);

  return (
    result.recordset[0] || {
      total_nos: 0,
      totalpt: 0,
    }
  );
};

// get emp_wages-OT

const getEmpWagesOt = async (siteId, month, year, atType) => {
  const pool = await poolPromise;

  console.log("========== GET EMP WAGES OT ==========");
  console.log("siteId:", siteId);
  console.log("month:", month);
  console.log("year:", year);
  console.log("atType:", atType);
  console.log("======================================");

  const result = await pool
    .request()
    .input("siteId", sql.NVarChar, String(siteId))
    .input("month", sql.NVarChar, String(month))
    .input("year", sql.NVarChar, String(year))
    .input("atType", sql.NVarChar, String(atType)).query(`
      SELECT
        COUNT(id) AS total_nos,

        ISNULL(
          SUM(TRY_CONVERT(decimal(18,2), earned_ot_wages)),
          0
        ) AS totalot,

        ISNULL(
          SUM(TRY_CONVERT(decimal(18,2), ot_days)),
          0
        ) AS totalotdays,

        ISNULL(
          MAX(TRY_CONVERT(decimal(18,2), ot_rate)),
          0
        ) AS ot_rate

      FROM emp_wages
      WHERE site_id = @siteId
        AND TRY_CONVERT(int, at_month) =
            TRY_CONVERT(int, @month)
        AND TRY_CONVERT(int, at_year) =
            TRY_CONVERT(int, @year)
        AND LTRIM(RTRIM(at_type)) =
            LTRIM(RTRIM(@atType))
        AND TRY_CONVERT(decimal(18,2), net_days) > 0
    `);

  console.log("OT QUERY RESULT:", result.recordset[0]);

  return (
    result.recordset[0] || {
      total_nos: 0,
      totalot: 0,
      totalotdays: 0,
      ot_rate: 0,
    }
  );
};

// get emp_wages-ESIC

const getEmpWagesEsic = async (siteId, month, year, atType) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("siteId", sql.Int, Number(siteId))
    .input("month", sql.Int, Number(month))
    .input("year", sql.Int, Number(year))
    .input("atType", sql.NVarChar, String(atType).trim())
    .query(`
      SELECT
        COUNT(*) AS total_nos,
        ISNULL(
          SUM(TRY_CONVERT(decimal(18,2), emp_esic)),
          0
        ) AS totalesic
      FROM emp_wages
      WHERE site_id = @siteId
        AND TRY_CONVERT(int, at_month) = @month
        AND TRY_CONVERT(int, at_year) = @year
        AND LTRIM(RTRIM(at_type)) = @atType
        AND TRY_CONVERT(decimal(18,2), net_days) > 0
    `);

  return result.recordset?.[0] ?? {
    total_nos: 0,
    totalesic: 0,
  };
};


// get at_actual_charges by site
const getAtActualChargesBySite = async (siteId, month, year, atType) => {
  const pool = await poolPromise;

  console.log("========== GET AT ACTUAL CHARGES ==========");
  console.log("siteId:", siteId);
  console.log("year:", year);
  console.log("Month:", month);
  console.log("At Type:", atType);
  console.log("============================================");

  const result = await pool
    .request()
    .input("siteId", sql.NVarChar, String(siteId))
    .input("month", sql.NVarChar, String(month))
    .input("year", sql.NVarChar, String(year))
    .input("atType", sql.NVarChar, String(atType)).query(`
      SELECT 
        charges_type,
        total
      FROM at_actual_charges
      WHERE LTRIM(RTRIM(site_id)) = @siteId
        AND TRY_CONVERT(int, at_month) = TRY_CONVERT(int, @month)
        AND TRY_CONVERT(int, at_year) = TRY_CONVERT(int, @year)
        AND LTRIM(RTRIM(at_type)) = LTRIM(RTRIM(@atType))
      ORDER BY id DESC
    `);

  console.log("AT ACTUAL CHARGES RESULT:", result.recordset[0]);

  return (
    result.recordset[0] || {
      charges_type: "",
      total: 0,
    }
  );
};

module.exports = {
  getAtActualChargesBySite,
  getEmpWagesOt,
  getEmpWagesBonus,
  getEmpWagesPf,
  getEmpWagesServiceCharges,
  getEmpWagesPt,
  getEmpWagesEsic,
  generateFinalInvoice,
  getSiteInfo,
  getSiteDetail,
  getEmployeeByCode,
  getLastId,
  getClientByCode,
  getClientById,
  getCompanyById,
  deleteEmpWages,
  deleteActualCharges,
  insertEmpWages,
  insertActualCharge,
  getMasterDataById,
  getEmpWagesBySite,
  bankDetailOnInvoice,
  getOrderInfo,
  removeBillingAction,
  generateBillModel,
  generateTransportBillModel,
  getTransportBillById,
  updateTransportBill,
};
