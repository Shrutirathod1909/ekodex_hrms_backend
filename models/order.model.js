
// ==========================================
// models/order.model.js
// ==========================================

const sql = require("mssql");

const { poolPromise } = require("../config/db");

// ==========================================
// GET ACTIVE PRODUCTS
// ==========================================

exports.getActiveProducts = async () => {

  const pool = await poolPromise;

  const result = await pool
    .request()
    .query(`
      SELECT
        product_name
      FROM product_master
      WHERE active = 0
      ORDER BY product_name ASC
    `);

  return result.recordset;
};

// ==========================================
// GET ACTIVE SUPPLIERS
// ==========================================

exports.getActiveSuppliers = async () => {

  const pool = await poolPromise;

  const result = await pool
    .request()
    .query(`
      SELECT
        supplier_name
      FROM supplier_master
      WHERE active = 0
      ORDER BY supplier_name ASC
    `);

  return result.recordset;
};


// ==========================================
// models/order.model.js
// ==========================================



// ==========================================
// GET PENDING ORDERS
// ==========================================





// ==========================================
// PRODUCT WISE PO REPORT
// ==========================================
exports.getPendingOrders = async ({
  supplier_name = [],
  product_name = [],
  status = "ALL",
  fromDate = "",
  toDate = ""
}) => {

  const pool = await poolPromise;
  const request = pool.request();

  let query = `
    SELECT
        po.order_id,
        po.invoice_no,
        po.supplier_name,
        po.order_date,
        po.grand_total,
        po.status,
        po.created_at,

        pop.pop_id,
        pop.product_name,
        pop.sku,
        pop.gender,
        pop.gst_percentage,
        pop.color,
        pop.height,
        pop.width,
        pop.length,
        pop.qty,
        pop.purchase_price,
        pop.sale_price,
        pop.total_amount

    FROM purchase_orders po
    LEFT JOIN purchase_order_products pop
      ON po.order_id = pop.order_id

    WHERE 1 = 1
  `;

  // ==========================================
  // STATUS FILTER
  // ==========================================
  if (status && status !== "ALL") {
    query += ` AND po.status = @status `;
    request.input("status", status);
  }

  // ==========================================
  // MULTI SUPPLIER FILTER
  // ==========================================
  if (supplier_name.length > 0) {

    const supplierParams = supplier_name
      .map((_, i) => `@supplier${i}`)
      .join(",");

    query += ` AND po.supplier_name IN (${supplierParams}) `;

    supplier_name.forEach((s, i) => {
      request.input(`supplier${i}`, s);
    });
  }

  // ==========================================
  // 🔥 MULTI PRODUCT FILTER (NEW)
  // ==========================================
  if (product_name.length > 0) {

    const productParams = product_name
      .map((_, i) => `@product${i}`)
      .join(",");

    query += ` AND pop.product_name IN (${productParams}) `;

    product_name.forEach((p, i) => {
      request.input(`product${i}`, p);
    });
  }

  // ==========================================
  // DATE FILTER
  // ==========================================
  if (fromDate && toDate) {
    query += `
      AND CAST(po.order_date AS DATE)
      BETWEEN @fromDate AND @toDate
    `;

    request.input("fromDate", fromDate);
    request.input("toDate", toDate);
  }

  query += `
    ORDER BY po.created_at DESC
  `;

  const result = await request.query(query);
  return result.recordset;
};

exports.getProductWisePOReport = async (statusList = []) => {

  const pool = await poolPromise;
  const request = pool.request();

  let query = `
    SELECT
       
        pop.product_name,

        COUNT(DISTINCT po.order_id) AS total_po,

        SUM(IIF(po.status='Pending', pop.qty, 0)) AS pending_qty,
        SUM(IIF(po.status='Completed', pop.qty, 0)) AS completed_qty,

        SUM(pop.qty) AS total_qty

    FROM purchase_orders po
    INNER JOIN purchase_order_products pop
      ON po.order_id = pop.order_id
  `;

  if (statusList.length > 0) {

    const params = statusList
      .map((_, i) => `@status${i}`)
      .join(",");

    query += ` WHERE po.status IN (${params}) `;

    statusList.forEach((s, i) => {
      request.input(`status${i}`, s);
    });
  }

  query += `
    GROUP BY  pop.product_name
    ORDER BY pop.product_name ASC
  `;

  const result = await request.query(query);
  return result.recordset;
};

exports.getUniformSaleReport = async ({
  supplier_name = [],
  product_name = []
}) => {

  const pool = await poolPromise;
  const request = pool.request();

  let query = `
    SELECT
        um.id,
        um.item_name,
        um.sku_code,
        um.color,
        um.hsn_code,
        um.qty,
        um.mrp,
        um.sale_price,
        um.employee_name,
        um.employee_code,
        um.issue_date,
        um.transfer_by,
        um.remarks,
        um.created_on,

        pm.product_name,
        pm.supplier_name

    FROM uniform_master um
    LEFT JOIN product_master pm
        ON pm.sku_code = um.sku_code
    WHERE 1=1
  `;

  // ================= SUPPLIER FILTER =================
  if (supplier_name.length > 0) {

    const params = supplier_name.map((_, i) => `@s${i}`).join(",");

    query += ` AND pm.supplier_name IN (${params}) `;

    supplier_name.forEach((s, i) => {
      request.input(`s${i}`, s);
    });
  }

  // ================= PRODUCT FILTER =================
  if (product_name.length > 0) {

    const params = product_name.map((_, i) => `@p${i}`).join(",");

    query += ` AND pm.product_name IN (${params}) `;

    product_name.forEach((p, i) => {
      request.input(`p${i}`, p);
    });
  }

  query += ` ORDER BY um.id DESC`;

  const result = await request.query(query);
  return result.recordset;
};