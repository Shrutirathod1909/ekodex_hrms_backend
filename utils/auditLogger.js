const { poolPromise } = require("../config/db");

async function logAction(tableName, recordId, actionType, transaction = false) {
  try {
    const request = transaction
      ? transaction.request()
      : (await poolPromise).request();

    // 1. Fetch column names that exist in BOTH tables using IN to avoid JOIN casting/collation issues
    const res = await request.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = '${tableName}'
      AND COLUMN_NAME IN (
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = '${tableName}_log'
      )
      ORDER BY ORDINAL_POSITION
    `);

    // 2. Filter out the 'id' column from the list of columns to be copied
    const columns = res.recordset
      .filter((r) => r.COLUMN_NAME.toLowerCase() !== "id")
      .map((r) => `[${r.COLUMN_NAME}]`)
      .join(", ");

    const insertRequest = transaction
      ? transaction.request()
      : (await poolPromise).request();

    // 3. Insert into log table (excluding 'id' from the columns list)
    const query = `
      INSERT INTO [${tableName}_log]
      ([activity_id], [activity_remark], ${columns})
      SELECT ${recordId}, '${actionType}', ${columns}
      FROM [${tableName}]
      WHERE [id] = ${recordId}
    `;

    await insertRequest.query(query);

    console.log(`[AUDIT] Logged ${actionType} for ${tableName} id ${recordId}`);
  } catch (error) {
    console.error(
      `[AUDIT ERROR] Failed to log action for ${tableName}:`,
      error,
    );
    throw error;
  }
}

module.exports = { logAction };
