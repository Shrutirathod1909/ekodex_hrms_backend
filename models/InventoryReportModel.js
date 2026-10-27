// ======================================================
// models/inventoryReportModel.js
// ======================================================

const sql = require("mssql");
const { poolPromise } = require("../config/db");

const InventoryReportModel = {

  // ======================================================
  // GET INVENTORY REPORT
  // ======================================================
getInventoryReport: async () => {

  try {

    const pool = await poolPromise;

    const result = await pool.request().query(`

      SELECT
          id,
          sku_code,
          item_name,
          transaction_type,
          qty,
          purchase_price,
          total_qty,
          available_qty,
          issued_qty,
          created_on

      FROM inventory_log

      ORDER BY sku_code, created_on ASC

    `);

    return result.recordset;

  } catch (error) {
    throw error;
  }
}

};

module.exports = InventoryReportModel;