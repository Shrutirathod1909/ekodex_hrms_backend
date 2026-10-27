const { poolPromise, sql } = require("../config/db");

const getEmployeeDocuments = async (employeeId) => {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("employeeId", sql.Int, employeeId).query(`
      SELECT
        id,
        emp_id,
        doc_type,
        doc_name,
        doc_status,
        verify_status,
        verified_by_id,
        verified_by_name,
        verified_at
      FROM emp_docs
      WHERE TRY_CONVERT(INT, emp_id) = @employeeId
        AND ISNULL(TRY_CONVERT(INT, active), 0) = 0
      ORDER BY id DESC
    `);

  return result.recordset;
};

const getDocumentForVerification = async (documentId) => {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("documentId", sql.BigInt, documentId).query(`
      SELECT TOP (1)
        d.id,
        d.emp_id,
        d.doc_type,
        d.doc_name,
        d.doc_status,
        d.verify_status,
        e.emp_full_name,
        e.first_name,
        e.middle_name,
        e.last_name,
        e.pancard_no,
        e.aadhar_no,
        e.driving_license
      FROM emp_docs d
      INNER JOIN employee e ON TRY_CONVERT(INT, d.emp_id) = e.id
      WHERE d.id = @documentId
        AND ISNULL(TRY_CONVERT(INT, d.active), 0) = 0
    `);

  return result.recordset[0] || null;
};

const getVerifierName = async (userId) => {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("userId", sql.Int, userId).query(`
      SELECT first_name, last_name
      FROM users
      WHERE id = @userId
    `);
  const user = result.recordset[0];

  return user
    ? [user.first_name, user.last_name].filter(Boolean).join(" ").trim()
    : "";
};

const markDocumentVerified = async ({
  documentId,
  verifiedById,
  verifiedByName,
}) => {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("documentId", sql.BigInt, documentId)
    .input("verifiedById", sql.Int, verifiedById)
    .input("verifiedByName", sql.VarChar(200), verifiedByName).query(`
      UPDATE emp_docs
      SET
        verify_status = 'SUCCESS',
        doc_status = 'VERIFIED',
        verified_by_id = @verifiedById,
        verified_by_name = @verifiedByName,
        verified_at = DATEADD(MINUTE, 330, GETUTCDATE())
      OUTPUT
        INSERTED.verify_status,
        INSERTED.doc_status,
        INSERTED.verified_by_id,
        INSERTED.verified_by_name,
        INSERTED.verified_at
      WHERE id = @documentId
        AND ISNULL(TRY_CONVERT(INT, active), 0) = 0
    `);

  if (result.recordset.length === 0) {
    throw new Error("Document was not found or is no longer active");
  }

  return result.recordset[0];
};

module.exports = {
  getEmployeeDocuments,
  getDocumentForVerification,
  getVerifierName,
  markDocumentVerified,
};