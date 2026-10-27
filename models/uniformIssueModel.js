const {
  sql,
  poolPromise,
} = require("../config/db");

const UniformIssue = {

  // ================= GET ALL =================
getAll: async () => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT 
        id,
        item_name,
        sku_code,
        color,
        hsn_code,
        qty,
        mrp,
        sale_price,
        employee_name,
        employee_code,
        issue_date,
        transfer_by,
        remarks,
        client_name,
        site_name,
        type_issued,
        size,
        total_amount,
        advance_amount,
        emi_no,
        created_on
      FROM uniform_master
      ORDER BY id DESC
    `);

    return result.recordset;

  } catch (error) {
    throw error;
  }
},
  // ================= GET BY ID =================
  getById: async (id) => {
    try {

      const pool = await poolPromise;

      const result = await pool
        .request()
        .input("id", sql.Int, id)
        .query(`
          SELECT *
          FROM uniform_master
          WHERE id = @id
        `);

      return result.recordset[0];

    } catch (error) {
      throw error;
    }
  },

  // ================= CREATE =================
create: async (data) => {

  let transaction;

  try {

    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);

    await transaction.begin();

    // ===============================
    // 1. INVENTORY FETCH
    // ===============================
    const stockRequest = new sql.Request(transaction);

const stock = await stockRequest

  .input("sku_code", sql.NVarChar, data.sku_code)
  .input("warehouse_name", sql.NVarChar, data.transfer_by)
  .input("warehouse_id", sql.Int, data.warehouse_id)
  .query(`
    SELECT id, available_qty, issued_qty, total_qty
    FROM Inventory
    WHERE sku_code = @sku_code
    AND warehouse_name = @warehouse_name
    AND warehouse_id = @warehouse_id;
  `);

    if (stock.recordset.length === 0) {
      throw new Error("Inventory not found for SKU");
    }

    const inventory_id = stock.recordset[0].id;
    const before_available = stock.recordset[0].available_qty;
    const before_issued = stock.recordset[0].issued_qty;
    const before_total = stock.recordset[0].total_qty;

    // ===============================
    // 2. STOCK CHECK
    // ===============================
    if (before_available < data.qty) {
      throw new Error("Insufficient stock");
    }

    // ===============================
    // 3. STOCK CALCULATION
    // ===============================
    const after_available = before_available - data.qty;
    const after_issued = before_issued + data.qty;
    const after_total = before_total;

    // ===============================
    // 4. UPDATE INVENTORY
    // ===============================
    const updateRequest = new sql.Request(transaction);

    await updateRequest
      .input("qty", sql.Int, data.qty)
      .input("inventory_id", sql.Int, inventory_id)
      .query(`
        UPDATE Inventory
        SET 
          available_qty = available_qty - @qty,
          issued_qty = issued_qty + @qty,
          modified_on = GETDATE()
        WHERE id = @inventory_id
      `);

    // ===============================
    // 5. PRODUCT MASTER -> SIZE FETCH
    // ===============================
    const productRequest = new sql.Request(transaction);

    const product = await productRequest
      .input("sku_code", sql.NVarChar, data.sku_code)
      .query(`
        SELECT height, width, length
        FROM product_master
        WHERE sku_code = @sku_code
      `);

    let size = "";

    if (product.recordset.length > 0) {
      const { height, width, length } = product.recordset[0];
      size = `${height}x${width}x${length}`;
    }

    // ===============================
    // 6. INSERT uniform_master
    // ===============================
   // ===============================
 // 6. INSERT uniform_master
 // ===============================
const insertRequest = new sql.Request(transaction);

await insertRequest

  .input("item_name", sql.NVarChar, data.item_name)

  .input("sku_code", sql.NVarChar, data.sku_code)

  .input("color", sql.NVarChar, data.color)

  .input("hsn_code", sql.NVarChar, data.hsn_code)

  .input("qty", sql.Int, data.qty)

  .input("mrp", sql.Decimal(18, 2), data.mrp)

  .input("sale_price", sql.Decimal(18, 2), data.sale_price)

  .input("size", sql.NVarChar, size)

  // ================= TYPE =================
  .input(
    "type_issued",
    sql.NVarChar,
    data.issue_type
  )

  // ================= EMPLOYEE =================
  .input(
    "employee_name",
    sql.NVarChar,
    data.employee_name
  )

  .input(
    "employee_code",
    sql.NVarChar,
    data.employee_code
  )

  .input(
    "issue_date",
    sql.Date,
    data.issue_date
  )

  .input(
    "transfer_by",
    sql.NVarChar,
    data.transfer_by
  )

  .input(
    "remarks",
    sql.NVarChar,
    data.remarks
  )

  .input(
    "attachment",
    sql.NVarChar,
    data.attachment
  )

  // ================= CLIENT =================
  .input(
    "client_id",
    sql.Int,
    data.client_id
  )

  .input(
    "client_name",
    sql.NVarChar,
    data.client_name
  )

  // ================= SITE =================
  .input(
    "site_id",
    sql.Int,
    data.site_id
  )

  .input(
    "site_name",
    sql.NVarChar,
    data.site_name
  )

  // ================= AMOUNT =================
  .input(
    "total_amount",
    sql.Decimal(18, 2),
    data.total_amount || 0
  )

  .input(
    "advance_amount",
    sql.Decimal(18, 2),
    data.advance_amount || 0
  )

  .input(
    "emi_no",
    sql.Int,
    data.emi_no || 0
  )

  // ================= CREATED =================
  .input(
    "created_by",
    sql.Int,
    data.created_by
  )

  .input(
    "created_by_name",
    sql.NVarChar,
    data.created_by_name
  )

  .query(`

    INSERT INTO uniform_master (

      item_name,
      sku_code,
      color,
      hsn_code,
      qty,
      mrp,
      sale_price,
      size,

      type_issued,

      employee_name,
      employee_code,
      issue_date,
      transfer_by,
      remarks,
      attachment,

      client_id,
      client_name,

      site_id,
      site_name,

      total_amount,
      advance_amount,
      emi_no,

      created_by,
      created_by_name,
      created_on

    )

    VALUES (

      @item_name,
      @sku_code,
      @color,
      @hsn_code,
      @qty,
      @mrp,
      @sale_price,
      @size,

      @type_issued,

      @employee_name,
      @employee_code,
      @issue_date,
      @transfer_by,
      @remarks,
      @attachment,

      @client_id,
      @client_name,

      @site_id,
      @site_name,

      @total_amount,
      @advance_amount,
      @emi_no,

      @created_by,
      @created_by_name,

      GETDATE()
    )
  `);


  // ===============================
// 7. CREATE EMI
// ===============================
if (
  data.issue_type !== "ISSUED FREE UNIFORM" &&
  Number(data.emi_no || 0) > 0 &&
  Number(data.total_amount || 0) >
    Number(data.advance_amount || 0)
){

  const remainingAmount =
    Number(data.total_amount) -
    Number(data.advance_amount || 0);

  const monthlyEMI =
    remainingAmount /
    Number(data.emi_no);

  // EMI END DATE
  const startDate = new Date(
    data.issue_date
  );

  const endDate = new Date(
    startDate
  );

  endDate.setMonth(
    endDate.getMonth() +
      Number(data.emi_no)
  );

  // ===============================
  // INSERT uniform_emi
  // ===============================
  const emiRequest =
    new sql.Request(transaction);

  const emiResult =
    await emiRequest

      .input(
        "employee_code",
        sql.NVarChar,
        data.employee_code
      )

      .input(
        "employee_name",
        sql.NVarChar,
        data.employee_name
      )

      .input(
        "uniform_item",
        sql.NVarChar,
        data.item_name
      )

      .input(
        "total_amount",
        sql.Decimal(18, 2),
        data.total_amount
      )

      .input(
        "emi_months",
        sql.Int,
        data.emi_no
      )

      .input(
        "monthly_emi",
        sql.Decimal(18, 2),
        monthlyEMI
      )

      .input(
        "paid_months",
        sql.Int,
        0
      )

      .input(
        "paid_amount",
        sql.Decimal(18, 2),
        data.advance_amount || 0
      )

      .input(
        "remaining_amount",
        sql.Decimal(18, 2),
        remainingAmount
      )

      .input(
        "start_date",
        sql.Date,
        startDate
      )

      .input(
        "end_date",
        sql.Date,
        endDate
      )

      .input(
        "status",
        sql.NVarChar,
        "RUNNING"
      )

      .input(
        "advance_amount",
        sql.Decimal(18, 2),
        data.advance_amount || 0
      )

      .input(
        "created_by",
        sql.Int,
        data.created_by
      )

      .input(
        "created_by_name",
        sql.NVarChar,
        data.created_by_name
      )

      .query(`

        INSERT INTO uniform_emi (

          employee_code,
          employee_name,
          uniform_item,

          total_amount,
          emi_months,
          monthly_emi,

          paid_months,
          paid_amount,
          remaining_amount,

          start_date,
          end_date,
          status,

          advance_amount,

          created_by,
          created_by_name,
          created_on

        )

        OUTPUT INSERTED.id

        VALUES (

          @employee_code,
          @employee_name,
          @uniform_item,

          @total_amount,
          @emi_months,
          @monthly_emi,

          @paid_months,
          @paid_amount,
          @remaining_amount,

          @start_date,
          @end_date,
          @status,

          @advance_amount,

          @created_by,
          @created_by_name,

          GETDATE()
        )
      `);

  // ===============================
  // EMI ID
  // ===============================
  const uniformEmiId =
    emiResult.recordset[0].id;

  // ===============================
  // INSERT EMI LOG
  // ===============================
  const emiLogRequest =
    new sql.Request(transaction);

  await emiLogRequest

    .input(
      "employee_code",
      sql.NVarChar,
      data.employee_code
    )

    .input(
      "employee_name",
      sql.NVarChar,
      data.employee_name
    )

    .input(
      "uniform_item",
      sql.NVarChar,
      data.item_name
    )

    .input(
      "total_amount",
      sql.Decimal(18, 2),
      data.total_amount
    )

    .input(
      "emi_months",
      sql.Int,
      data.emi_no
    )

    .input(
      "monthly_emi",
      sql.Decimal(18, 2),
      monthlyEMI
    )

    .input(
      "paid_months",
      sql.Int,
      0
    )

    .input(
      "paid_amount",
      sql.Decimal(18, 2),
      data.advance_amount || 0
    )

    .input(
      "remaining_amount",
      sql.Decimal(18, 2),
      remainingAmount
    )

    .input(
      "start_date",
      sql.Date,
      startDate
    )

    .input(
      "end_date",
      sql.Date,
      endDate
    )

    .input(
      "status",
      sql.NVarChar,
      "RUNNING"
    )

    .input(
      "active_id",
      sql.Int,
      uniformEmiId
    )

    .input(
      "active_remark",
      sql.NVarChar,
      "EMI CREATED"
    )

    .input(
      "advance_amount",
      sql.Decimal(18, 2),
      data.advance_amount || 0
    )

    .input(
      "created_by",
      sql.Int,
      data.created_by
    )

    .input(
      "created_by_name",
      sql.NVarChar,
      data.created_by_name
    )

    .query(`

      INSERT INTO uniform_emi_log (

        employee_code,
        employee_name,
        uniform_item,

        total_amount,
        emi_months,
        monthly_emi,

        paid_months,
        paid_amount,
        remaining_amount,

        start_date,
        end_date,
        status,

        active_id,
        active_remark,

        advance_amount,

        created_by,
        created_by_name,
        created_on

      )

      VALUES (

        @employee_code,
        @employee_name,
        @uniform_item,

        @total_amount,
        @emi_months,
        @monthly_emi,

        @paid_months,
        @paid_amount,
        @remaining_amount,

        @start_date,
        @end_date,
        @status,

        @active_id,
        @active_remark,

        @advance_amount,

        @created_by,
        @created_by_name,

        GETDATE()
      )
    `);
}
    // ===============================
    // 7. INVENTORY LOG
    // ===============================
    const logRequest = new sql.Request(transaction);

    await logRequest
      .input("inventory_id", sql.Int, inventory_id)
      .input("sku_code", sql.NVarChar, data.sku_code)
      .input("item_name", sql.NVarChar, data.item_name)
      .input("qty", sql.Int, data.qty)
      .input("active_id", sql.Int, data.created_by)
      .input("active_remark", sql.NVarChar, "Uniform Issued")
      .input("created_by", sql.Int, data.created_by)
      .input("created_by_name", sql.NVarChar, data.created_by_name)
      .query(`
        INSERT INTO Inventory_Log (
          sku_code,
          item_name,
          transaction_type,
          qty,
          total_qty,
          available_qty,
          issued_qty,
          active_id,
          active_remark,
          created_by,
          created_by_name,
          created_on
        )
        VALUES (
          @sku_code,
          @item_name,
          'ISSUED',
          @qty,
          ${after_total},
          ${after_available},
          ${after_issued},
          @active_id,
          @active_remark,
          @created_by,
          @created_by_name,
          GETDATE()
        )
      `);

    await transaction.commit();

    return {
      success: true,
      message: "Uniform issued + inventory updated + log created"
    };

  } catch (error) {

    if (transaction) {
      await transaction.rollback();
    }

    throw error;
  }
},

  // ================= DELETE =================
  delete: async (id) => {
    try {

      const pool = await poolPromise;

      const result = await pool
        .request()
        .input("id", sql.Int, id)
        .query(`
          DELETE FROM uniform_master
          WHERE id = @id
        `);

      return result;

    } catch (error) {
      throw error;
    }
  },

};

module.exports = UniformIssue;