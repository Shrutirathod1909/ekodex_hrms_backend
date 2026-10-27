const { poolPromise, sql } = require("../config/db");

// GET ORDER + PRODUCTS BY INVOICE NO
const getOrderByInvoiceNo = async (invoice_no) => {
  const pool = await poolPromise;

  const result = await pool.request()
    .input("invoice_no", sql.VarChar, invoice_no)
    .query(`
      SELECT 
          po.order_id,
          po.invoice_no,
          po.supplier_name,
          po.order_date,
          po.grand_total,
          po.status,

          pop.pop_id,
          pop.product_name,
          pop.sku,
          pop.qty,
          pop.color,
          pop.height,
          pop.width,
          pop.length,
          pop.gender,
          pop.purchase_price,
          pop.sale_price,
          pop.gst_type,
          pop.gst_percentage,
          pop.total_amount,
          pop.image

      FROM purchase_orders po
      LEFT JOIN purchase_order_products pop 
          ON po.order_id = pop.order_id
      WHERE po.invoice_no = @invoice_no
    `);

  return result.recordset;
};

module.exports = {
  getOrderByInvoiceNo,
};