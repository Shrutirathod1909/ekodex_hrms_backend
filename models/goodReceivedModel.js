const { poolPromise, sql } = require("../config/db");

const insertGoodReceived = async (items) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    for (let item of items) {
      const insertGR = new sql.Request(transaction);

      await insertGR
        .input("po_no", sql.VarChar, item.po_no)
        .input("po_date", sql.DateTime, item.po_date)
        .input("supplier", sql.VarChar, item.supplier)
        .input("product_name", sql.VarChar, item.product_name)
        .input("sku_code", sql.VarChar, item.sku_code)
        .input("warehouse_id", sql.Int, item.warehouse_id)
        .input("warehouse_name", sql.VarChar, item.warehouse_name)
        .input("order_qty", sql.Int, item.order_qty)
        .input("received_qty", sql.Int, item.received_qty)
        .input("total_amount", sql.Float, item.total_amount)
        .input("received_date", sql.DateTime, item.received_date)
        .input("received_by", sql.Int, item.received_by)
        .input("received_by_name", sql.VarChar, item.received_by_name)
        .input("created_by", sql.Int, item.created_by)
        .input("created_by_name", sql.VarChar, item.created_by_name)
        .query(`
          INSERT INTO good_received (
            po_no,
            po_date,
            supplier,
            product_name,
            sku_code,
            warehouse_id,
            warehouse_name,
            order_qty,
            received_qty,
            total_amount,
            received_date,
            received_by,
            received_by_name,
            created_by,
            created_by_name,
            created_on
          )
          VALUES (
            @po_no,
            @po_date,
            @supplier,
            @product_name,
            @sku_code,
            @warehouse_id,
            @warehouse_name,
            @order_qty,
            @received_qty,
            @total_amount,
            @received_date,
            @received_by,
            @received_by_name,
            @created_by,
            @created_by_name,
            DATEADD(MINUTE, 330, GETUTCDATE())
          )
        `);

      const updatePOStatus = new sql.Request(transaction);

      await updatePOStatus
        .input("po_no", sql.VarChar, item.po_no)
        .query(`
          UPDATE purchase_orders
          SET
            status = 'COMPLETED',
            modified_on = DATEADD(MINUTE, 330, GETUTCDATE())
          WHERE invoice_no = @po_no
        `);
    }

    await transaction.commit();
    return {
      success: true,
      message: "Good Received updated successfully",
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

const getAllGoodReceived = async () => {
  const pool = await poolPromise;
  const result = await pool.request().query(`
        SELECT 
          gr.*, 
          0 AS paid_amount,
          ISNULL(gr.total_amount, 0) AS balance_amount
        FROM good_received gr
        ORDER BY gr.id DESC
  `);
  return result.recordset;
};

const getByPONo = async (po_no) => {
  const pool = await poolPromise;
  const result = await pool.request()
    .input("po_no", sql.VarChar, po_no)
    .query(`
      SELECT * FROM goods_received_notes
      WHERE po_no = @po_no
    `);
  return result.recordset;
};

const getStockBySku = async (sku_code) => {
  const pool = await poolPromise;
  const result = await pool.request()
    .input("sku_code", sql.VarChar, sku_code)
    .query(`
      SELECT 
        gr.sku_code,
        ISNULL(SUM(gr.received_qty), 0) AS received_qty,
        ISNULL((
          SELECT SUM(ui.qty)
          FROM uniform_issue_items ui
          WHERE ui.sku_code = gr.sku_code
        ), 0) AS issued_qty,
        (
          ISNULL(SUM(gr.received_qty), 0)
          -
          ISNULL((
            SELECT SUM(ui.qty)
            FROM uniform_issue_items ui
            WHERE ui.sku_code = gr.sku_code
          ), 0)
        ) AS available_stock
      FROM goods_received_notes gr
      WHERE gr.sku_code = @sku_code
      GROUP BY gr.sku_code
    `);
  return result.recordset[0];
};

module.exports = {
  getAllGoodReceived,
  getByPONo,
  insertGoodReceived,
  getStockBySku
};
