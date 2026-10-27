const sql = require("mssql");
const { poolPromise } = require("../config/db");

const Warehouse = {

  // ===============================
  // GET ALL
  // ===============================
  getAll: async (userId) => {
    try {
      const pool = await poolPromise;

      // GET USER INFO
      const userRes = await pool.request()
        .input("userId", sql.Int, userId)
        .query(`SELECT role, branch_id, client_code FROM users WHERE id = @userId`);
      
      const user = userRes.recordset[0];
      if (!user) return [];

      let queryStr = `
        SELECT 
          id, 
          branch_name AS warehouse_name, 
          @clientCode AS client_code
        FROM branch 
        WHERE active = 0
      `;

      if (user.role?.toLowerCase() !== 'admin') {
        queryStr += ` AND id = @branchId`;
      }
      
      queryStr += ` ORDER BY id DESC`;

      const result = await pool.request()
        .input("clientCode", sql.NVarChar, user.client_code || '')
        .input("branchId", sql.Int, user.branch_id || 0)
        .query(queryStr);

      return result.recordset;

    } catch (error) {
      throw error;
    }
  },

  // ===============================
  // GET BY ID
  // ===============================
  getById: async (id) => {
    try {
      const pool = await poolPromise;

      const result = await pool.request()
        .input("id", sql.Int, id)
        .query(`
          SELECT *
          FROM warehouse_master
          WHERE id = @id
        `);

      return result.recordset[0];

    } catch (error) {
      throw error;
    }
  },

  // ===============================
  // CREATE
  // ===============================
  create: async (data) => {
    try {
      const pool = await poolPromise;

      const result = await pool.request()

        .input("client_name", sql.NVarChar, data.client_name)
        .input("client_code", sql.NVarChar, data.client_code)

        .input("warehouse_name", sql.NVarChar, data.warehouse_name)

        .input("contact_person", sql.NVarChar, data.contact_person)
        .input("mobile_no", sql.NVarChar, data.mobile_no)
        .input("email_id", sql.NVarChar, data.email_id)

        .input("support_mobile_no", sql.NVarChar, data.support_mobile_no)
        .input("support_email", sql.NVarChar, data.support_email)

        .input("gst_no", sql.NVarChar, data.gst_no)

        .input("address1", sql.NVarChar, data.address1)
        .input("address2", sql.NVarChar, data.address2)

        .input("city", sql.NVarChar, data.city)
        .input("state_name", sql.NVarChar, data.state_name)
        .input("country_name", sql.NVarChar, data.country_name)

        .input("pincode", sql.NVarChar, data.pincode)

        .input("Active", sql.Bit, data.Active || 0)

        .input("created_by", sql.Int, data.created_by)
        .input("created_by_name", sql.NVarChar, data.created_by_name)

        .query(`
          INSERT INTO warehouse_master (
            client_name,
            client_code,
            warehouse_name,
            contact_person,
            mobile_no,
            email_id,
            support_mobile_no,
            support_email,
            gst_no,
            address1,
            address2,
            city,
            state_name,
            country_name,
            pincode,
            Active,
            created_by,
            created_by_name
          )
          VALUES (
            @client_name,
            @client_code,
            @warehouse_name,
            @contact_person,
            @mobile_no,
            @email_id,
            @support_mobile_no,
            @support_email,
            @gst_no,
            @address1,
            @address2,
            @city,
            @state_name,
            @country_name,
            @pincode,
            @Active,
            @created_by,
            @created_by_name
          )

          SELECT SCOPE_IDENTITY() AS id
        `);

      return result.recordset[0];

    } catch (error) {
      throw error;
    }
  },

  // ===============================
  // UPDATE
  // ===============================
  update: async (id, data) => {
    try {
      const pool = await poolPromise;

      await pool.request()

        .input("id", sql.Int, id)

        .input("client_name", sql.NVarChar, data.client_name)
        .input("client_code", sql.NVarChar, data.client_code)

        .input("warehouse_name", sql.NVarChar, data.warehouse_name)

        .input("contact_person", sql.NVarChar, data.contact_person)
        .input("mobile_no", sql.NVarChar, data.mobile_no)
        .input("email_id", sql.NVarChar, data.email_id)

        .input("support_mobile_no", sql.NVarChar, data.support_mobile_no)
        .input("support_email", sql.NVarChar, data.support_email)

        .input("gst_no", sql.NVarChar, data.gst_no)

        .input("address1", sql.NVarChar, data.address1)
        .input("address2", sql.NVarChar, data.address2)

        .input("city", sql.NVarChar, data.city)
        .input("state_name", sql.NVarChar, data.state_name)
        .input("country_name", sql.NVarChar, data.country_name)

        .input("pincode", sql.NVarChar, data.pincode)
      .input("Active", sql.Bit, data.Active || 0)
        .input("modified_by", sql.Int, data.modified_by)
        .input("modified_by_name", sql.NVarChar, data.modified_by_name)

        .query(`
          UPDATE warehouse_master
          SET
            client_name = @client_name,
            client_code = @client_code,
            warehouse_name = @warehouse_name,
            contact_person = @contact_person,
            mobile_no = @mobile_no,
            email_id = @email_id,
            support_mobile_no = @support_mobile_no,
            support_email = @support_email,
            gst_no = @gst_no,
            address1 = @address1,
            address2 = @address2,
            city = @city,
            state_name = @state_name,
            country_name = @country_name,
            pincode = @pincode,
            Active = @Active,
            modified_by = @modified_by,
            modified_by_name = @modified_by_name,
            modified_on = DATEADD(MINUTE, 330, GETUTCDATE())
          WHERE id = @id
        `);

      return true;

    } catch (error) {
      throw error;
    }
  },

  // ===============================
  // DELETE
  // ===============================
delete: async (id, user) => {
  try {

    const pool = await poolPromise;

    await pool.request()
      .input("id", sql.Int, id)
      .input("deleted_by", sql.Int, user.id)
      .input("deleted_by_name", sql.NVarChar, user.name)
      .query(`
        UPDATE warehouse_master
        SET 
          Active = 1,
          deleted_by = @deleted_by,
          deleted_by_name = @deleted_by_name,
          deleted_on = DATEADD(MINUTE, 330, GETUTCDATE())
        WHERE id = @id
      `);

    return true;

  } catch (error) {
    throw error;
  }
}

};

module.exports = Warehouse;
