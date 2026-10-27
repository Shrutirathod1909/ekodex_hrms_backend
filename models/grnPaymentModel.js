const {
  sql,
  poolPromise,
} = require("../config/db");

/**
 * CREATE TABLE grn_payment (
 *   id INT IDENTITY(1,1) PRIMARY KEY,
 *   po_no NVARCHAR(100),
 *   supplier_name NVARCHAR(255),
 *   total DECIMAL(18,2),
 *   paid DECIMAL(18,2),
 *   balance DECIMAL(18,2),
 *   payment_date DATE,
 *   payment_type NVARCHAR(50),
 *   transaction_no NVARCHAR(255),
 *   invoice_no NVARCHAR(255),
 *   bank_name NVARCHAR(255),
 *   cheque_no NVARCHAR(255),
 *   created_by INT,
 *   created_by_name NVARCHAR(255),
 *   created_on DATETIME DEFAULT GETDATE()
 * )
 */

// ================= CREATE PAYMENT =================
const createPayment = async (data) => {
  try {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("po_no", sql.NVarChar, data.po_no)
      .input("supplier_name", sql.NVarChar, data.supplier_name)
      .input("total", sql.Decimal(18, 2), data.total)
      .input("paid", sql.Decimal(18, 2), data.paid)
      .input("balance", sql.Decimal(18, 2), data.balance)
      .input("payment_date", sql.Date, data.payment_date)
      .input("payment_type", sql.NVarChar, data.payment_type)
      .input("transaction_no", sql.NVarChar, data.transaction_no)
      .input("invoice_no", sql.NVarChar, data.invoice_no)
      .input("bank_name", sql.NVarChar, data.bank_name)
      .input("cheque_no", sql.NVarChar, data.cheque_no)
      .input("created_by", sql.Int, data.created_by)
      .input("created_by_name", sql.NVarChar, data.created_by_name)
      .query(`
        INSERT INTO grn_payment (
          po_no,
          supplier_name,
          total,
          paid,
          balance,
          payment_date,
          payment_type,
          transaction_no,
          invoice_no,
          bank_name,
          cheque_no,
          created_by,
          created_by_name,
          created_on
        )
        VALUES (
          @po_no,
          @supplier_name,
          @total,
          @paid,
          @balance,
          @payment_date,
          @payment_type,
          @transaction_no,
          @invoice_no,
          @bank_name,
          @cheque_no,
          @created_by,
          @created_by_name,
          GETDATE()
        )
      `);

    return result;
  } catch (error) {
    throw error;
  }
};

// ================= GET ALL PAYMENTS =================
const getAllPayments = async () => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT *
      FROM grn_payment
      ORDER BY id DESC
    `);

    return result.recordset;
  } catch (error) {
    throw error;
  }
};

// ================= GET SINGLE PAYMENT =================
const getPaymentById = async (id) => {
  try {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .query(`
        SELECT *
        FROM grn_payment
        WHERE id = @id
      `);

    return result.recordset[0];
  } catch (error) {
    throw error;
  }
};

// ================= UPDATE PAYMENT =================
const updatePayment = async (id, data) => {
  try {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("po_no", sql.NVarChar, data.po_no)
      .input("supplier_name", sql.NVarChar, data.supplier_name)
      .input("total", sql.Decimal(18, 2), data.total)
      .input("paid", sql.Decimal(18, 2), data.paid)
      .input("balance", sql.Decimal(18, 2), data.balance)
      .input("payment_date", sql.Date, data.payment_date)
      .input("payment_type", sql.NVarChar, data.payment_type)
      .input("transaction_no", sql.NVarChar, data.transaction_no)
      .input("invoice_no", sql.NVarChar, data.invoice_no)
      .input("bank_name", sql.NVarChar, data.bank_name)
      .input("cheque_no", sql.NVarChar, data.cheque_no)
      .query(`
        UPDATE grn_payment
        SET
          po_no = @po_no,
          supplier_name = @supplier_name,
          total = @total,
          paid = @paid,
          balance = @balance,
          payment_date = @payment_date,
          payment_type = @payment_type,
          transaction_no = @transaction_no,
          invoice_no = @invoice_no,
          bank_name = @bank_name,
          cheque_no = @cheque_no
        WHERE id = @id
      `);

    return result;
  } catch (error) {
    throw error;
  }
};

// ================= DELETE PAYMENT =================
const deletePayment = async (id) => {
  try {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .query(`
        DELETE FROM grn_payment
        WHERE id = @id
      `);

    return result;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  createPayment,
  getAllPayments,
  getPaymentById,
  updatePayment,
  deletePayment,
};