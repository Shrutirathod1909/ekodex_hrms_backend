const { sql, poolPromise } = require("../config/db");
const logger = require("../utils/logger");
const { logAction } = require("../utils/auditLogger");
// ================= GET PRODUCTS BY STATUS =================
exports.getAll = async (statusType, page = 1, limit = 10) => {
  const pool = await poolPromise;

  const offset = (page - 1) * limit;

  const isActive = statusType === "inactive" ? 1 : 0;

  const countResult = await pool.request().input("isActive", sql.Bit, isActive)
    .query(`
        SELECT COUNT(*) AS total
        FROM product_master
        WHERE active = @isActive
      `);

  const totalCount = countResult.recordset[0].total;

  const result = await pool
    .request()
    .input("isActive", sql.Bit, isActive)
    .input("offset", sql.Int, offset)
    .input("limit", sql.Int, limit).query(`
      SELECT *
      FROM product_master
      WHERE active = @isActive
      ORDER BY id DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `);

  return {
    products: result.recordset,
    totalCount,
  };
};
exports.getBySupplier = async (supplier_name, page = 1, limit = 10) => {
  const pool = await poolPromise;

  const offset = (page - 1) * limit;

  // DATA
  const result = await pool
    .request()
    .input("supplier_name", sql.VarChar, supplier_name)
    .input("offset", sql.Int, offset)
    .input("limit", sql.Int, limit).query(`
      SELECT *
      FROM product_master
      WHERE supplier_name = @supplier_name
      ORDER BY id DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `);

  // COUNT
  const count = await pool
    .request()
    .input("supplier_name", sql.VarChar, supplier_name).query(`
      SELECT COUNT(*) AS total
      FROM product_master
      WHERE supplier_name = @supplier_name
    `);

  return {
    products: result.recordset,
    totalCount: count.recordset[0].total,
  };
};
// ================= CREATE PRODUCT =================
exports.create = async (data) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("supplier_name", sql.NVarChar, toUpper(data.supplier_name))
    .input("product_name", sql.NVarChar, toUpper(data.product_name))
    .input("sku_code", sql.NVarChar, toUpper(data.sku_code))
    .input("color", sql.NVarChar, data.color)
    .input("height", sql.NVarChar, data.height)
    .input("width", sql.NVarChar, data.width)
    .input("length", sql.NVarChar, data.length)
    .input("gender", sql.NVarChar, toUpper(data.gender))
    .input("hsn_code", sql.NVarChar, data.hsn_code)
    .input("purchase_price", sql.Decimal(18, 2), data.purchase_price)
    .input("sale_price", sql.Decimal(18, 2), data.sale_price)
    .input("gst_percentage", sql.Decimal(5, 2), data.gst_percentage)
    .input("status", sql.NVarChar, toUpper(data.status))
    .input("created_by", sql.Int, data.created_by)
    .input("created_by_name", sql.NVarChar, toUpper(data.created_by_name))
    // ADD THESE TWO LINES:
    .input("uom_id", sql.Int, data.uom_id)
    .input("uom", sql.VarChar, toUpper(data.uom)).query(`
      INSERT INTO product_master
      (
        supplier_name, product_name, sku_code, color, height, width, length,
        gender, hsn_code, purchase_price, sale_price, gst_percentage, status,
        created_by,created_by_name, created_on, active,uom_id, uom
      )
      OUTPUT INSERTED.id
      VALUES
      (
        @supplier_name, @product_name, @sku_code, @color, @height, @width, @length,
        @gender, @hsn_code, @purchase_price, @sale_price, @gst_percentage, @status,
        @created_by,@created_by_name, FORMAT(GETDATE(), 'yyyy-MM-dd h:mm ss'), 0,@uom_id, @uom
      )
    `);

  if (result.rowsAffected[0] === 0) {
    throw new Error("Product not found.");
  } else {
    console.log("result", result.recordset[0].id);
    await logAction("product_master", result.recordset[0].id, "CREATE");
  }

  return result;
};

// ================= DELETE PRODUCT (SOFT-DELETE) =================
exports.delete = async (id, disabled_by, disabled_by_name) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .input("disabled_by", sql.Int, disabled_by)
    .input("disabled_by_name", sql.NVarChar, toUpper(disabled_by_name)).query(`
      UPDATE product_master
      SET 
        active = 1,                 -- Switches from 0 to 1 on deletion
        disabled_on =  FORMAT(GETDATE(), 'yyyy-MM-dd h:mm ss'),
        disabled_by = @disabled_by,
        disabled_by_name = @disabled_by_name
          OUTPUT inserted.id  -- This returns the ID of the updated row
      WHERE id = @id
    `);

  if (result.rowsAffected[0] === 0) {
    throw new Error("Product not found.");
  } else {
    console.log("result", result.recordset[0].id);
    await logAction("product_master", result.recordset[0].id, "DELETE");
  }

  return result;
};

// ================= RESTORE PRODUCT (BRING BACK TO ACTIVE) =================
exports.restore = async (id, user) => {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .input("modified_by", sql.NVarChar, user.id)
    .input("modified_by_name", sql.NVarChar, toUpper(user.first_name)).query(`
      UPDATE product_master 
      SET active = 0, 
          modified_on =  FORMAT(GETDATE(), 'yyyy-MM-dd h:mm ss'),
          modified_by = @modified_by, 
          modified_by_name = @modified_by_name 
            OUTPUT inserted.id  -- This returns the ID of the updated row
      WHERE id = @id
    `);
  if (result.rowsAffected[0] === 0) {
    throw new Error("Product not found.");
  } else {
    console.log("result", result.recordset[0].id);
    await logAction("product_master", result.recordset[0].id, "RESTORE");
  }
  return result;
};
// ================= UPDATE PRODUCT =================
exports.update = async (id, data) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("id", sql.Int, id)

    .input("supplier_name", sql.NVarChar, toUpper(data.supplier_name))
    .input("product_name", sql.NVarChar, toUpper(data.product_name))
    .input("sku_code", sql.NVarChar, toUpper(data.sku_code))
    .input("color", sql.NVarChar, toUpper(data.color))

    .input("height", sql.NVarChar, toUpper(data.height) || null)
    .input("width", sql.NVarChar, toUpper(data.width) || null)
    .input("length", sql.NVarChar, toUpper(data.length) || null)

    .input("gender", sql.NVarChar, toUpper(data.gender) || null)
    .input("hsn_code", sql.NVarChar, toUpper(data.hsn_code) || null)

    .input("purchase_price", sql.Decimal(18, 2), data.purchase_price || 0)

    .input("sale_price", sql.Decimal(18, 2), data.sale_price || 0)

    .input("gst_percentage", sql.Decimal(5, 2), data.gst_percentage || 0)

    .input("status", sql.NVarChar, toUpper(data.status))

    .input("uom_id", sql.Int, data.uom_id || null)

    .input("uom", sql.NVarChar, toUpper(data.uom) || null)

    .input("modified_by", sql.Int, data.modified_by || null)
    .input(
      "modified_by_name",
      sql.NVarChar,
      toUpper(data.modified_by_name) || null,
    ).query(`
      UPDATE product_master
      SET
        supplier_name = @supplier_name,
        product_name = @product_name,
        sku_code = @sku_code,
        color = @color,
        height = @height,
        width = @width,
        length = @length,
        gender = @gender,
        hsn_code = @hsn_code,
        purchase_price = @purchase_price,
        sale_price = @sale_price,
        gst_percentage = @gst_percentage,
        status = @status,
        uom_id = @uom_id,
        uom = @uom,
        modified_by = @modified_by,
        modified_by_name = @modified_by_name,
        modified_on =  FORMAT(GETDATE(), 'yyyy-MM-dd h:mm ss')
          OUTPUT inserted.id  -- This returns the ID of the updated row
      WHERE id = @id
    `);

  if (result.rowsAffected[0] === 0) {
    throw new Error("Product not found.");
  } else {
    console.log("result", result.recordset[0].id);
    await logAction("product_master", result.recordset[0].id, "UPDATE");
  }

  return result;
};
// ================= BULK CREATE PRODUCTS =================
exports.bulkCreate = async (productsArray, created_by, created_by_name) => {
  const pool = await poolPromise;
  const insertedIds = [];

  // Loop through records safely
  for (const data of productsArray) {
    const result = await pool
      .request()
      .input("supplier_name", sql.NVarChar, toUpper(data.supplier_name))
      .input("product_name", sql.NVarChar, toUpper(data.product_name))
      .input("sku_code", sql.NVarChar, toUpper(data.sku_code))
      .input("color", sql.NVarChar, toUpper(data.color) || "#000000")
      .input("height", sql.NVarChar, toUpper(data.height) || null)
      .input("width", sql.NVarChar, toUpper(data.width) || null)
      .input("length", sql.NVarChar, toUpper(data.length) || null)
      .input("gender", sql.NVarChar, toUpper(data.gender) || "UNIVERSAL")
      .input("hsn_code", sql.NVarChar, toUpper(data.hsn_code) || null)
      .input(
        "purchase_price",
        sql.Decimal(18, 2),
        data.purchase_price ? parseFloat(data.purchase_price) : 0,
      )
      .input(
        "sale_price",
        sql.Decimal(18, 2),
        data.sale_price ? parseFloat(data.sale_price) : 0,
      )
      .input(
        "gst_percentage",
        sql.Decimal(5, 2),
        data.gst_percentage ? parseFloat(data.gst_percentage) : 0,
      )
      .input("status", sql.NVarChar, "active")
      .input("created_by", sql.Int, created_by)
      .input("created_by_name", sql.NVarChar, toUpper(created_by_name)).query(`
                INSERT INTO product_master (
                    supplier_name, product_name, sku_code, color, height, width, length, 
                    gender, hsn_code, purchase_price, sale_price, gst_percentage, status, created_by,created_by_name, created_on, active
                ) 
                OUTPUT INSERTED.id 
                VALUES (
                    @supplier_name, @product_name, @sku_code, @color, @height, @width, @length, 
                    @gender, @hsn_code, @purchase_price, @sale_price, @gst_percentage, @status, @created_by,@created_by_name, FORMAT(GETDATE(), 'yyyy-MM-dd h:mm ss'), 0
                )
            `);

    if (result.rowsAffected[0] === 0) {
      throw new Error("Product not found.");
    } else {
      console.log("result", result.recordset[0].id);
      await logAction("product_master", result.recordset[0].id, "CREATE");
    }
  }
  return insertedIds;
};

const toUpper = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim().toUpperCase();
};
