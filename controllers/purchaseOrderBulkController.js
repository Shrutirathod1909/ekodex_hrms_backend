// controllers/purchaseOrderBulkController.js

const XLSX = require("xlsx");
const fs = require("fs");

const {
  insertPurchaseOrder,
  insertPurchaseOrderProduct,
} = require("../models/purchaseOrderBulkModel");

const bulkUploadPurchaseOrders = async (req, res) => {
  try {
    console.log("req.user =>", req.user);

    // =========================
    // FILE CHECK
    // =========================
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Excel file is required",
      });
    }

    // =========================
    // READ EXCEL FILE
    // =========================
    const workbook = XLSX.readFile(req.file.path);

    const sheetName = workbook.SheetNames[0];

    const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    console.log("EXCEL DATA =>", sheetData);

    // =========================
    // LOOP THROUGH EXCEL ROWS
    // =========================
    for (const row of sheetData) {
      console.log("ROW =>", row);

      // =========================
      // INSERT PURCHASE ORDER
      // =========================

      const orderId = await insertPurchaseOrder({
        invoice_no: String(row.invoice_no || ""),

        supplier_name: String(row.supplier_name || ""),

        order_date: row.order_date ? new Date(row.order_date) : null,

        grand_total: Number(row.total_amount || 0),

        status: String(row.status || "Pending"),

        // =========================
        // USER DETAILS
        // =========================

        created_by: Number(req.user?.id || 1),

        created_by_name: String(req.user?.name || ""),

        // =========================
        // COMPANY DETAILS
        // =========================

        company_id: 1,

        company_name: String(row.company_name || req.user?.company || ""),

        branch_id: 1,

        branch_name: String(row.branch_name || req.user?.branch || ""),
      });

      console.log("PURCHASE ORDER INSERTED =>", orderId);

      // =========================
      // INSERT PRODUCT
      // =========================

      await insertPurchaseOrderProduct({
        order_id: Number(orderId),

        product_name: String(row.product_name || ""),

        sku: String(row.sku || ""),

        qty: Number(row.qty || 0),

        color: String(row.color || ""),

        height: String(row.height || ""),

        width: String(row.width || ""),

        length: String(row.length || ""),

        gender: String(row.gender || ""),

        purchase_price: Number(row.purchase_price || 0),

        sale_price: Number(row.sale_price || 0),

        gst_type: String(row.gst_type || ""),

        gst_percentage: Number(row.gst_percentage || 0),

        total_amount: Number(row.total_amount || 0),

        image: String(row.image || ""),
      });

      console.log("PRODUCT INSERTED SUCCESSFULLY");
    }

    // =========================
    // DELETE UPLOADED FILE
    // =========================
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    // =========================
    // SUCCESS RESPONSE
    // =========================
    return res.status(200).json({
      success: true,
      message: "Bulk upload completed successfully",
    });
  } catch (error) {
    console.log("BULK UPLOAD ERROR =>", error);

    console.log("ERROR MESSAGE =>", error.message);

    console.log("ERROR SQL =>", error.sqlMessage);

    return res.status(500).json({
      success: false,
      message: "Bulk upload failed",
      error: error.message,
      sql: error.sqlMessage,
    });
  }
};

module.exports = {
  bulkUploadPurchaseOrders,
};
