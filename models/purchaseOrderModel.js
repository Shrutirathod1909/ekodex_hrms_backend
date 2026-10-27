const sql = require("mssql");
// Destructure your pre-configured connection pool promise directly
const { poolPromise } = require("../config/db");

/**
 * Logs a record snapshot to the _log table.
 * @param {number} orderId - The ID of the record in purchase_orders.
 * @param {string} remark - The action performed (e.g., 'UPDATE', 'DELETE').
 */
async function logPurchaseOrder(orderId, remark) {
  try {
    const pool = await poolPromise;

    // Hardcoded column list (excluding 'id' which is IDENTITY)
    const columns = [
      "invoice_no",
      "supplier_name",
      "order_date",
      "grand_total",
      "status",
      "created_by",
      "created_on",
      "active",
      "company_id",
      "company_name",
      "branch_id",
      "branch_name",
      "created_by_name",
      "modified_by_name",
      "modified_by",
      "modified_on",
      "approved_by_name",
      "approved_by",
      "approved_on",
      "rejected_by_name",
      "rejected_by",
      "rejected_on",
      "disabled_by_name",
      "disabled_by",
      "disabled_on",
    ];

    // Build comma-separated list of columns for the query
    const colList = columns.map((c) => `[${c}]`).join(", ");

    // Execute insert in a fresh, independent request
    await pool
      .request()
      .input("activity_id", orderId)
      .input("activity_remark", remark).query(`
        INSERT INTO [purchase_orders_log] ([activity_id], [activity_remark], ${colList})
        SELECT @activity_id, @activity_remark, ${colList}
        FROM [purchase_orders]
        WHERE [order_id] = @activity_id
      `);

    console.log(`[AUDIT] Successfully logged action for order: ${orderId}`);
  } catch (err) {
    console.error(`[AUDIT ERROR] Failed to log order ${orderId}:`, err);
    // We do not throw here to allow the main application flow to continue
  }
}

// Helper function to safely extract the pre-established database pool
const getPool = async () => {
  try {
    if (!poolPromise) {
      throw new Error(
        "poolPromise is undefined. Check your config/db export properties.",
      );
    }
    // Await your existing module connection pool directly instead of trying to spin up a new one
    return await poolPromise;
  } catch (error) {
    console.error(
      "MSSQL Database Connection Pool Retrieval Failed:",
      error.message,
    );
    throw new Error(`Database connection failed: ${error.message}`);
  }
};

const findAllActive = async () => {
  const pool = await getPool();
  const result = await pool.request().query(`
      SELECT id, company_name
      FROM [companies]
      WHERE active = 0
      ORDER BY company_name ASC
    `);
  return result.recordset;
};

// ================= GET ALL DETAILED PO ENTRIES =================
const getAllPurchaseOrders = async (
  page = 1,
  limit = 10,
  activeValue,
  status,
) => {
  try {
    const pool = await getPool();
    const offset = (page - 1) * limit;

    // Define filter clause
    const whereClause = `WHERE active = @active AND status = @status`;

    // 1. Total Count with filters
    const countResult = await pool
      .request()
      .input("active", activeValue)
      .input("status", status)
      .query(`SELECT COUNT(*) AS total FROM purchase_orders ${whereClause}`);

    const totalCount = countResult.recordset[0].total;

    // 2. Paginated data with filters
    const poResult = await pool
      .request()
      .input("offset", offset)
      .input("limit", limit)
      .input("active", activeValue)
      .input("status", status).query(`
        SELECT * FROM purchase_orders
        ${whereClause}
        ORDER BY order_id DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    // 3. Fetch items for the retrieved parent records
    // Note: For performance, consider joining this instead of looping
    const purchaseOrders = [];
    for (const po of poResult.recordset) {
      const itemResult = await pool
        .request()
        .input("order_id", po.order_id)
        .query(
          `SELECT * FROM purchase_order_products WHERE order_id = @order_id AND active = 0`,
        );

      purchaseOrders.push({
        ...po,
        id: po.order_id,
        items: itemResult.recordset,
      });
    }

    return { purchaseOrders, totalCount };
  } catch (error) {
    throw error;
  }
};

// ================= TRANSACTION MASTER-DETAIL INGESTION =================
const createPurchaseOrderBatch = async (
  masterData,
  items,
  user
) => {

  const pool = await getPool();

  const transaction =
    new sql.Transaction(pool);

  try {

    await transaction.begin();


    // ==========================================
    // MASTER PURCHASE ORDER
    // ==========================================

    const masterRequest =
      new sql.Request(transaction);


    masterRequest.input(
      "invoice_no",
      sql.VarChar,
      toUpper(masterData.po_number)
    );


    masterRequest.input(
      "supplier_name",
      sql.VarChar,
      toUpper(masterData.supplier_name)
    );


    masterRequest.input(
      "order_date",
      sql.Date,
      masterData.order_date
    );


    masterRequest.input(
      "grand_total",
      sql.Decimal(18, 2),
      masterData.grand_total
    );


    masterRequest.input(
      "status",
      sql.VarChar,
      toUpper(masterData.status || "PENDING")
    );


    masterRequest.input(
      "company_id",
      sql.Int,
      masterData.company_id
    );


    masterRequest.input(
      "company_name",
      sql.VarChar,
      toUpper(masterData.company_name)
    );


    masterRequest.input(
      "branch_id",
      sql.Int,
      masterData.branch_id
    );


    masterRequest.input(
      "branch_name",
      sql.VarChar,
      toUpper(masterData.branch_name)
    );


    masterRequest.input(
      "created_by",
      sql.VarChar,
      String(user.id)
    );


    masterRequest.input(
      "created_by_name",
      sql.VarChar,
      toUpper(user.first_name || "")
    );


    // ==========================================
    // INSERT MASTER
    // ==========================================

    const masterResult =
      await masterRequest.query(`

        INSERT INTO [purchase_orders]
        (
          invoice_no,
          supplier_name,
          order_date,
          grand_total,
          status,

          company_id,
          company_name,

          branch_id,
          branch_name,

          created_by,
          created_by_name,

          created_on
        )

        OUTPUT INSERTED.order_id

        VALUES
        (
          @invoice_no,
          @supplier_name,
          @order_date,
          @grand_total,
          @status,

          @company_id,
          @company_name,

          @branch_id,
          @branch_name,

          @created_by,
          @created_by_name,

          CONVERT(VARCHAR(19), GETDATE(), 120)
        );

      `);


    // ==========================================
    // GET ORDER ID
    // ==========================================

    if (
      !masterResult.recordset ||
      masterResult.recordset.length === 0
    ) {

      throw new Error(
        "Purchase Order could not be created."
      );

    }


    const orderId =
      masterResult.recordset[0].order_id;


    console.log(
      "PURCHASE ORDER CREATED:",
      orderId
    );


    // ==========================================
    // REMOVE THIS OLD CODE
    // ==========================================

    /*
    if (result.rowsAffected[0] === 0) {
      throw new Error("PurchOrder not found.");
    } else {
      console.log("result", orderId);
      await logPurchaseOrder(id, "CREATE");
    }
    */


    // ==========================================
    // OPTIONAL LOG
    // ==========================================

    // जर logPurchaseOrder function असेल तर:
    //
    // await logPurchaseOrder(orderId, "CREATE");
    //
    // पण function transaction support करत असेल
    // तर transaction pass कर.


    // ==========================================
    // INSERT PURCHASE ORDER PRODUCTS
    // ==========================================

    for (const item of items) {

      const detailRequest =
        new sql.Request(transaction);


      detailRequest.input(
        "order_id",
        sql.Int,
        orderId
      );


      detailRequest.input(
        "product_name",
        sql.VarChar,
        toUpper(item.product_name)
      );


      detailRequest.input(
        "sku",
        sql.VarChar,
        item.sku
          ? toUpper(item.sku)
          : null
      );


      detailRequest.input(
        "qty",
        sql.Int,
        parseInt(item.qty) || 1
      );


      detailRequest.input(
        "color",
        sql.VarChar,
        item.color || null
      );


      // ==========================================
      // HEIGHT
      // ==========================================

      detailRequest.input(
        "height",
        sql.Decimal(10, 2),

        item.height &&
        String(item.height).trim() !== ""

          ? parseFloat(item.height)

          : null
      );


      // ==========================================
      // WIDTH
      // ==========================================

      detailRequest.input(
        "width",
        sql.Decimal(10, 2),

        item.width &&
        String(item.width).trim() !== ""

          ? parseFloat(item.width)

          : null
      );


      // ==========================================
      // LENGTH
      // ==========================================

      detailRequest.input(
        "length",
        sql.Decimal(10, 2),

        item.length &&
        String(item.length).trim() !== ""

          ? parseFloat(item.length)

          : null
      );


      detailRequest.input(
        "gender",
        sql.VarChar,

        item.gender
          ? toUpper(item.gender)
          : null
      );


      // ==========================================
      // PURCHASE PRICE
      // ==========================================

      detailRequest.input(
        "purchase_price",
        sql.Decimal(18, 2),
        parseFloat(item.mrp) || 0
      );


      // ==========================================
      // SALE PRICE
      // ==========================================

      detailRequest.input(
        "sale_price",
        sql.Decimal(18, 2),

        item.sale_price &&
        String(item.sale_price).trim() !== ""

          ? parseFloat(item.sale_price)

          : null
      );


      // ==========================================
      // GST TYPE
      // ==========================================

      detailRequest.input(
        "gst_type",
        sql.VarChar,
        item.gst_type || "CGST/SGST"
      );


      // ==========================================
      // GST PERCENTAGE
      // ==========================================

      detailRequest.input(
        "gst_percentage",
        sql.Decimal(5, 2),
        parseFloat(item.gst) || 18
      );


      // ==========================================
      // TOTAL AMOUNT
      // ==========================================

      detailRequest.input(
        "total_amount",
        sql.Decimal(18, 2),
        parseFloat(item.total_amount) || 0
      );


      // ==========================================
      // IMAGE
      // ==========================================

      detailRequest.input(
        "image",
        sql.VarChar,
        item.image || null
      );


      // ==========================================
      // INSERT PRODUCT
      // ==========================================

      await detailRequest.query(`

        INSERT INTO [purchase_order_products]
        (
          order_id,

          product_name,
          sku,
          qty,
          color,

          height,
          width,
          length,

          gender,

          purchase_price,
          sale_price,

          gst_type,
          gst_percentage,

          total_amount,

          image
        )

        VALUES
        (
          @order_id,

          @product_name,
          @sku,
          @qty,
          @color,

          @height,
          @width,
          @length,

          @gender,

          @purchase_price,
          @sale_price,

          @gst_type,
          @gst_percentage,

          @total_amount,

          @image
        );

      `);

    }


    // ==========================================
    // COMMIT
    // ==========================================

    await transaction.commit();


    return {

      success: true,

      order_id: orderId

    };


  } catch (error) {

    console.error(
      "CREATE PURCHASE ORDER ERROR:",
      error
    );


    await transaction.rollback();

    throw error;

  }

};
const updatePurchaseOrderBatch = async (orderId, masterData, items, user) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // =========================
    // USER INFO (ID + NAME)
    // =========================
    const userId = user?.id || null;
    const userName = user?.first_name;

    // =========================
    // 1. UPDATE MASTER TABLE
    // =========================
    const masterRequest = new sql.Request(transaction);

    masterRequest.input("order_id", sql.Int, orderId);
    masterRequest.input("invoice_no", sql.NVarChar, masterData.po_number);
    masterRequest.input(
      "supplier_name",
      sql.NVarChar,
      toUpper(masterData.supplier_name),
    );
    masterRequest.input("order_date", sql.Date, masterData.order_date);
    masterRequest.input(
      "grand_total",
      sql.Decimal(18, 2),
      masterData.grand_total,
    );
    masterRequest.input(
      "status",
      sql.NVarChar,
      toUpper(masterData.status) || "PENDING",
    );
    masterRequest.input("company_id", sql.Int, masterData.company_id);
    masterRequest.input(
      "company_name",
      sql.NVarChar,
      toUpper(masterData.company_name),
    );
    masterRequest.input("branch_id", sql.Int, masterData.branch_id);
    masterRequest.input(
      "branch_name",
      sql.NVarChar,
      toUpper(masterData.branch_name),
    );

    // =========================
    // AUDIT FIELDS
    // =========================
    masterRequest.input("modified_by", sql.NVarChar, userId);

    masterRequest.input("modified_by_name", sql.NVarChar, userName);
    const result = await masterRequest.query(`
      UPDATE [purchase_orders]
      SET 
        invoice_no = @invoice_no,
        supplier_name = @supplier_name,
        order_date = @order_date,
        grand_total = @grand_total,
        status = @status,
        company_id = @company_id,
        company_name = @company_name,
        branch_id = @branch_id,
        branch_name = @branch_name,
        modified_by = @modified_by,
        modified_by_name = @modified_by_name,
        modified_on  = FORMAT(GETDATE(), 'yyyy-MM-dd h:mm ss')
      WHERE order_id = @order_id;
    `);

    // 3. Verify if the row actually existed and was updated
    if (result.rowsAffected[0] > 0) {
      // Call the log function independently
      logPurchaseOrder(orderId, "UPDATE");
    }

    // =========================
    // 2. DELETE OLD ITEMS
    // =========================
    const deleteRequest = new sql.Request(transaction);
    deleteRequest.input("order_id", sql.Int, orderId);
    deleteRequest.input("disabled_by", sql.Int, user.id);
    deleteRequest.input("disabled_by_name", sql.NVarChar, user.first_name);

    await deleteRequest.query(`
      UPDATE [purchase_order_products]
      SET [active] = 1,
      [disabled_by] = @disabled_by,
      [disabled_by_name] = @disabled_by_name,
      [disabled_on] =  FORMAT(GETDATE(), 'yyyy-MM-dd h:mm ss')
      WHERE order_id = @order_id;
    `);

    // =========================
    // 3. INSERT NEW ITEMS
    // =========================
    for (let item of items) {
      const detailRequest = new sql.Request(transaction);

      detailRequest.input("order_id", sql.Int, orderId);
      detailRequest.input(
        "product_name",
        sql.NVarChar,
        toUpper(item.product_name),
      );
      detailRequest.input("sku", sql.NVarChar, toUpper(item.sku) || null);
      detailRequest.input("qty", sql.Int, parseInt(item.qty) || 1);
      detailRequest.input("color", sql.NVarChar, item.color || null);

      detailRequest.input(
        "height",
        sql.Decimal(10, 2),
        item.height && String(item.height).trim() !== ""
          ? parseFloat(item.height)
          : null,
      );

      detailRequest.input(
        "width",
        sql.Decimal(10, 2),
        item.width && String(item.width).trim() !== ""
          ? parseFloat(item.width)
          : null,
      );

      detailRequest.input(
        "length",
        sql.Decimal(10, 2),
        item.length && String(item.length).trim() !== ""
          ? parseFloat(item.length)
          : null,
      );

      detailRequest.input("gender", sql.NVarChar, toUpper(item.gender) || null);

      detailRequest.input(
        "purchase_price",
        sql.Decimal(18, 2),
        parseFloat(item.mrp) || 0,
      );

      detailRequest.input(
        "sale_price",
        sql.Decimal(18, 2),
        item.sale_price && String(item.sale_price).trim() !== ""
          ? parseFloat(item.sale_price)
          : null,
      );

      detailRequest.input(
        "gst_type",
        sql.NVarChar,
        item.gst_type || "CGST/SGST",
      );

      detailRequest.input(
        "gst_percentage",
        sql.Decimal(5, 2),
        parseFloat(item.gst) || 18.0,
      );

      detailRequest.input(
        "total_amount",
        sql.Decimal(18, 2),
        parseFloat(item.total_amount) || 0,
      );

      detailRequest.input("image", sql.NVarChar, item.image || null);
      detailRequest.input("created_by", sql.NVarChar, user.id || null);
      detailRequest.input(
        "created_by_name",
        sql.NVarChar,
        user.first_name || null,
      );

      await detailRequest.query(`
        INSERT INTO [purchase_order_products] (
          order_id, product_name, sku, qty, color, height, width, length, gender,
          purchase_price, sale_price, gst_type, gst_percentage, total_amount, image, created_by, created_by_name, created_on
        )
        VALUES (
          @order_id, @product_name, @sku, @qty, @color, @height, @width, @length, @gender,
          @purchase_price, @sale_price, @gst_type, @gst_percentage, @total_amount, @image, @created_by, @created_by_name, FORMAT(GETDATE(), 'yyyy-MM-dd h:mm ss')
        );
      `);
    }

    // =========================
    // COMMIT TRANSACTION
    // =========================
    await transaction.commit();

    return {
      success: true,
      message: "Purchase order updated successfully",
      order_id: orderId,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};
// ================= SOFT DELETE PURCHASE ORDER =================
const deletePurchaseOrder = async (orderId, user) => {
  try {
    const pool = await getPool();

    const userId = user?.id || null;
    const userName = user?.first_name || "";

    const result = await pool
      .request()
      .input("order_id", sql.Int, orderId)
      .input("disabled_by", sql.Int, userId)
      .input("disabled_by_name", sql.VarChar, userName).query(`
        UPDATE purchase_orders
        SET 
          active = 1,
          disabled_by = @disabled_by,
          disabled_by_name = @disabled_by_name,
          disabled_on = FORMAT(GETDATE(), 'yyyy-MM-dd h:mm ss')
        WHERE order_id = @order_id
      `);

    if (result.rowsAffected[0] === 0) {
      throw new Error("PurchaseOrder not found.");
    } else {
      console.log("result", orderId);
      await logPurchaseOrder(orderId, "DELETE");
    }

    return {
      success: true,
      rowsAffected: result.rowsAffected[0],
    };
  } catch (error) {
    console.log("DELETE PO ERROR:", error);
    throw error;
  }
};

const getPurchaseOrdersBySupplier = async (supplier_name) => {
  const pool = await getPool();

  const result = await pool
    .request()
    .input("supplier_name", sql.NVarChar, supplier_name)
    .input("Pending", sql.NVarChar, "Pending").query(`
      SELECT
        order_id,
        invoice_no,
        supplier_name,
        grand_total,
        status
      FROM purchase_orders
      WHERE supplier_name = @supplier_name
      AND status = @Pending
      AND active = 0
      ORDER BY order_id DESC
    `);

  return result.recordset;
};

const getPurchaseOrderProducts = async (orderId) => {
  const pool = await getPool();

  const result = await pool.request().input("orderId", sql.Int, orderId).query(`
      SELECT 
        pop.pop_id, 
        pop.product_name, 
        pop.sku, 
        pop.qty, 
        pop.purchase_price, 
        pop.total_amount,
        po.company_id,
        po.company_name,
        po.branch_id,
        po.branch_name
      FROM purchase_order_products pop WHERE active = 0
      JOIN purchase_orders po ON pop.order_id = po.order_id
      WHERE pop.order_id = @orderId AND active = 0
    `);

  return result.recordset;
};

const getBranchesByCompany = async (companyId) => {
  const pool = await getPool();
  const result = await pool.request().input("companyId", companyId).query(`
      SELECT id, branch_name 
      FROM [branch] 
      WHERE company_id = @companyId AND active = 0
      ORDER BY branch_name ASC
    `);
  return result.recordset;
};

// =============================
// UPDATE PURCHASE ORDER STATUS
// =============================
const updatePurchaseOrderStatus = async (id, status, userId, user) => {
  try {
    const db = await poolPromise;

    console.log("➡ STATUS:", status.toUpperCase());
    console.log("➡ USER:", user);

    // ❌ return; काढा

    let query = `
      UPDATE purchase_orders
      SET 
        status = @status,
        modified_on = FORMAT(GETDATE(), 'yyyy-MM-dd h:mm ss'),
        modified_by = @userId,
        modified_by_name = @userName
    `;

    // APPROVED
    if (status.toLowerCase() === "approved") {
      query += `
        , approved_by = @userId,
          approved_by_name = @userName,
          approved_on = FORMAT(GETDATE(), 'yyyy-MM-dd h:mm ss')
      `;
    }

    // REJECTED
    if (status.toLowerCase() === "rejected") {
      query += `
        , rejected_by = @userId,
          rejected_by_name = @userName,
          rejected_on = FORMAT(GETDATE(), 'yyyy-MM-dd h:mm ss')
      `;
    }

    query += `
      OUTPUT inserted.order_id
      WHERE order_id = @id
    `;

    console.log("FINAL QUERY =>", query);

    const request = db.request();

    request.input("id", sql.Int, Number(id));
    request.input("status", sql.NVarChar(50), toUpper(status));
    request.input("userId", sql.Int, Number(userId));
    request.input(
      "userName",
      sql.NVarChar(255),
      toUpper(user?.first_name || "")
    );

    const result = await request.query(query);

    console.log("ROWS AFFECTED =>", result.rowsAffected);
    console.log("UPDATED RECORD =>", result.recordset);

    if (result.rowsAffected[0] === 0) {
      throw new Error("PurchaseOrder not found.");
    }

    await logPurchaseOrder(
      id,
      status.toUpperCase()
    );

    return result;

  } catch (error) {
    console.error("SQL ERROR =>", error);
    throw error;
  }
};

const toUpper = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim().toUpperCase();
};

module.exports = {
  updatePurchaseOrderStatus,
  getBranchesByCompany,
  getAllPurchaseOrders,
  createPurchaseOrderBatch,
  updatePurchaseOrderBatch,
  getPurchaseOrdersBySupplier,
  getPurchaseOrderProducts,
  deletePurchaseOrder,
  findAllActive,
};
