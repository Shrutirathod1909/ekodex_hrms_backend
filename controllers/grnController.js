const grnModel = require("../models/grnModel");

// GET BY INVOICE NO
const getGRNByInvoiceNo = async (req, res) => {
  try {
    const { invoice_no } = req.params;

    const data = await grnModel.getOrderByInvoiceNo(invoice_no);

    if (!data || data.length === 0) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    // GROUP ORDER + PRODUCTS
    const order = {
      order_id: data[0].order_id,
      invoice_no: data[0].invoice_no,
      supplier_name: data[0].supplier_name,
      order_date: data[0].order_date,
      grand_total: data[0].grand_total,
      status: data[0].status,

      products: data.map((item) => ({
        pop_id: item.pop_id,
        product_name: item.product_name,
        sku: item.sku,
        qty: item.qty,
        color: item.color,
        height: item.height,
        width: item.width,
        length: item.length,
        gender: item.gender,
        purchase_price: item.purchase_price,
        sale_price: item.sale_price,
        gst_type: item.gst_type,
        gst_percentage: item.gst_percentage,
        total_amount: item.total_amount,
        image: item.image,
      })),
    };

    return res.json(order);

  } catch (error) {
    console.log("GRN ERROR:", error);
    return res.status(500).json({
      message: "Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  getGRNByInvoiceNo,
};