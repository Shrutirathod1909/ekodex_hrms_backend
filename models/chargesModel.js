const { poolPromise, sql } = require("../config/db");
const { logAction } = require("../utils/auditLogger");
const ChargesModel = {
  getAll: async (whereClause = "") => {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT *
      FROM charges_master
      ${whereClause}
      ORDER BY id DESC
    `);

    return result.recordset;
  },

  create: async (data, user) => {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input(
        "charges_master",
        sql.NVarChar(sql.MAX),
        toUpper(data.charges_master) || "",
      )
      .input(
        "label_display",
        sql.NVarChar(sql.MAX),
        toUpper(data.label_display) || "",
      )
      .input("branch_id", sql.NVarChar(20), user.branch_id || "")
      .input("company_id", sql.NVarChar(20), user.company_id || "")
      .input("created_by", sql.NVarChar(20), String(user.id) || "")
      .input("created_by_name", sql.NVarChar(20), String(user.first_name))
      .input("source", sql.NVarChar(20), "WEB").query(`
        INSERT INTO charges_master
        (charges_master, label_display, active, created_by, created_by_name, created_on, branch_id, company_id,source)
        OUTPUT INSERTED.id
        VALUES
        (@charges_master, @label_display, '0', @created_by, @created_by_name,  FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss'), @branch_id, @company_id,@source)
      `);
    // 3. Verify if the row actually existed and was updated
    if (result.rowsAffected[0] === 0) {
      throw new Error("Charges not found.");
    } else {
      console.log("result", result.recordset[0].id);
      await logAction("charges_master", result.recordset[0].id, "CREATE");
    }
  },

  update: async (id, data, user) => {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input(
        "charges_master",
        sql.NVarChar(sql.MAX),
        toUpper(data.charges_master) || "",
      )
      .input(
        "label_display",
        sql.NVarChar(sql.MAX),
        toUpper(data.label_display) || "",
      )
      .input("modified_by", sql.NVarChar(20), String(user.id))
      .input("modified_by_name", sql.NVarChar(20), String(user.first_name))
      .query(`
        UPDATE charges_master
        SET
          charges_master = @charges_master,
          label_display = @label_display,
          modified_by = @modified_by,
          modified_by_name = @modified_by_name,
          modified_on =FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss')
        WHERE id = @id
      `);

    console.log("result", result.recordset);
    await logAction("charges_master", id, "UPDATE");
  },

  remove: async (id, user) => {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("disabled_by", sql.NVarChar(20), String(user.id))
      .input("disabled_by_name", sql.NVarChar(20), String(user.first_name))
      .query(`
        UPDATE charges_master
        SET
          active = '1',
          disabled_by = @disabled_by,
          disabled_by_name = @disabled_by_name,
          disabled_on = FORMAT(GETDATE(), 'yyyy-MM-dd h:mm ss')
        WHERE id = @id
      `);
    await logAction("charges_master", id, "DELETE");
  },
};

module.exports = ChargesModel;
const toUpper = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim().toUpperCase();
};
