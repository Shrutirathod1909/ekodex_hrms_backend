const { poolPromise, sql } = require("../config/db");

const insertPurchaseOrder = async (poData) => {
  const pool = await poolPromise;

  const result = await pool
    .request()

    .input("invoice_no", sql.VarChar, poData.invoice_no)

    .input("supplier_name", sql.VarChar, poData.supplier_name)

    .input("order_date", sql.DateTime, poData.order_date)

    .input("grand_total", sql.Decimal(18, 2), poData.grand_total)

    .input("status", sql.VarChar, poData.status)

    .input("created_by", sql.Int, poData.created_by)

    .input("created_by_name", sql.VarChar, poData.created_by_name)

    .input("company_id", sql.Int, poData.company_id)

    .input("company_name", sql.VarChar, poData.company_name)

    .input("branch_id", sql.Int, poData.branch_id)

    .input("branch_name", sql.VarChar, poData.branch_name).query(`
      INSERT INTO purchase_orders
      (
        invoice_no,
        supplier_name,
        order_date,
        grand_total,
        status,
        created_by,
        created_by_name,
        created_on,
        active,
        company_id,
        company_name,
        branch_id,
        branch_name
      )

      OUTPUT INSERTED.order_id

      VALUES
      (
        @invoice_no,
        @supplier_name,
        @order_date,
        @grand_total,
        @status,
        @created_by,
        @created_by_name,
        FORMAT(GETDATE(), 'yyyy-MM-dd h:mm ss'),
        0,
        @company_id,
        @company_name,
        @branch_id,
        @branch_name
      )
    `);

  return result.recordset[0].order_id;
};

const insertPurchaseOrderProduct = async (productData) => {
  const pool = await poolPromise;

  await pool
    .request()
    .input("order_id", sql.Int, productData.order_id)
    .input("product_name", sql.VarChar, productData.product_name)
    .input("sku", sql.VarChar, productData.sku)
    .input("qty", sql.Int, productData.qty)
    .input("color", sql.VarChar, productData.color)
    .input("height", sql.VarChar, productData.height)
    .input("width", sql.VarChar, productData.width)
    .input("length", sql.VarChar, productData.length)
    .input("gender", sql.VarChar, productData.gender)
    .input("purchase_price", sql.Decimal(18, 2), productData.purchase_price)
    .input("sale_price", sql.Decimal(18, 2), productData.sale_price)
    .input("gst_type", sql.VarChar, productData.gst_type)
    .input("gst_percentage", sql.Decimal(18, 2), productData.gst_percentage)
    .input("total_amount", sql.Decimal(18, 2), productData.total_amount)
    .input("image", sql.VarChar, productData.image).query(`
      INSERT INTO purchase_order_products
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
      )
    `);
};

module.exports = {
  insertPurchaseOrder,
  insertPurchaseOrderProduct,
};
