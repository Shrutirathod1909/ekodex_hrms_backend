const { sql, poolPromise } = require("../config/db");

exports.getUnits = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT uom_id, unit_name, standard_abbreviation 
      FROM [unit_of_measure_master] 
      ORDER BY unit_name ASC
    `);

    res.status(200).json({ success: true, data: result.recordset });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch UOM" });
  }
};
