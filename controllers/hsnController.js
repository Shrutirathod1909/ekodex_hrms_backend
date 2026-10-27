const { sql, poolPromise } = require("../config/db");

// ================= GET HSN CODES =================
exports.getHsnCodes = async (req, res) => {
  try {
    const pool = await poolPromise;

    // Execute query using the pool, NOT sequelize
    const result = await pool.request().query(`
      SELECT id, hsn_code, description 
      FROM [hsn_master] 
      ORDER BY hsn_code ASC
    `);

    res.status(200).json({
      success: true,
      data: result.recordset, // Access the data from recordset
    });
  } catch (error) {
    console.error("Error fetching HSN codes:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch HSN codes",
    });
  }
};
