const sql = require("mssql");
const { poolPromise } = require("../config/db");
const { logAction } = require("../utils/auditLogger");

const Supplier = {
  // ================= GET ALL =================
  getAll: async (page, limit, activeValue) => {
    const pool = await poolPromise;
    const offset = (page - 1) * limit;

    // Filter based on the activeValue (0 or 1)
    const whereClause = `WHERE active = @active`;

    // Get total count
    const countResult = await pool
      .request()
      .input("active", activeValue)
      .query(`SELECT COUNT(*) as total FROM supplier_master ${whereClause}`);

    const total = countResult.recordset[0].total;

    // Get paginated data
    const result = await pool
      .request()
      .input("offset", offset)
      .input("limit", limit)
      .input("active", activeValue).query(`
      SELECT * FROM supplier_master 
      ${whereClause} 
      ORDER BY id DESC 
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    return { data: result.recordset, total };
  },
  // ================= getAllDropdown =================
getAllDropdown: async () => {
  const pool = await poolPromise;

  const query = `
    SELECT *
    FROM supplier_master
    WHERE active = 0
    ORDER BY supplier_name ASC
  `;

  const result = await pool.request().query(query);

  return {
    data: result.recordset,
    total: result.recordset.length,
  };
},

  // ================= CREATE =================
  // create: async (data) => {
  //   const pool = await poolPromise;

  //   return (
  //     pool
  //       .request()
  //       .input("supplier_name", sql.VarChar, data.supplier_name)
  //       .input("contact_person_name", sql.VarChar, data.contact_person_name)
  //       .input("phone", sql.VarChar, data.phone)
  //       .input("email", sql.VarChar, data.email)
  //       .input("address", sql.VarChar, data.address)
  //       .input("city", sql.VarChar, data.city)
  //       .input("pincode", sql.VarChar, data.pincode)
  //       .input("state", sql.VarChar, data.state)
  //       .input("logo_url", sql.VarChar, data.logo_url || null)
  //       // BANK
  //       .input("bank_name", sql.VarChar, data.bank_name)
  //       .input("account_no", sql.VarChar, data.account_no)
  //       .input("account_type", sql.VarChar, data.account_type)
  //       .input("swift_code", sql.VarChar, data.swift_code)
  //       .input("micr_no", sql.VarChar, data.micr_no)
  //       .input("ifsc_code", sql.VarChar, data.ifsc_code)

  //       .input("created_by", sql.Int, data.created_by)
  //       .input("created_by_name", sql.NVarChar, data.created_by_name).query(`
  //       INSERT INTO supplier_master (
  //         supplier_name,
  //         contact_person_name,
  //         phone,
  //         email,
  //         address,
  //         city,
  //         pincode,
  //         state,
  //         logo_url,

  //         bank_name,
  //         account_no,
  //         account_type,
  //         swift_code,
  //         micr_no,
  //         ifsc_code,

  //         created_by,
  //         created_by_name,
  //         created_on
  //       )
  //       VALUES (
  //         @supplier_name,
  //         @contact_person_name,
  //         @phone,
  //         @email,
  //         @address,
  //         @city,
  //         @pincode,
  //         @state,
  //         @logo_url,

  //         @bank_name,
  //         @account_no,
  //         @account_type,
  //         @swift_code,
  //         @micr_no,
  //         @ifsc_code,

  //         @created_by,
  //         @created_by_name,
  //         FORMAT(GETDATE(), 'yyyy-MM-dd h:mm ss')
  //       )
  //     `)
  //   );
  // },

  create: async (data) => {
    const pool = await poolPromise;

    // 1. First, check if supplier name or email already exists
    const checkRequest = pool.request();
    const existing = await checkRequest
      .input("supplier_name", sql.VarChar, data.supplier_name)
      .input("email", sql.VarChar, data.email).query(`
      SELECT id FROM supplier_master 
      WHERE supplier_name = @supplier_name OR email = @email
    `);

    if (existing.recordset.length > 0) {
      throw new Error("Supplier with this name or email already exists.");
    }

    // 2. If no duplicates, proceed with the insert
    const supplierInsert = await pool
      .request()
      .input("supplier_name", sql.VarChar, toUpper(data.supplier_name))
      .input(
        "contact_person_name",
        sql.VarChar,
        toUpper(data.contact_person_name),
      )
      .input("phone", sql.VarChar, toUpper(data.phone))
      .input("email", sql.VarChar, data.email)
      .input("address", sql.VarChar, toUpper(data.address))
      .input("city", sql.VarChar, toUpper(data.city))
      .input("pincode", sql.VarChar, toUpper(data.pincode))
      .input("state", sql.VarChar, toUpper(data.state))
      .input("logo_url", sql.VarChar, data.logo_url || null)
      .input("bank_name", sql.VarChar, toUpper(data.bank_name))
      .input("account_no", sql.VarChar, toUpper(data.account_no))
      .input("account_type", sql.VarChar, toUpper(data.account_type))
      .input("swift_code", sql.VarChar, toUpper(data.swift_code))
      .input("micr_no", sql.VarChar, toUpper(data.micr_no))
      .input("ifsc_code", sql.VarChar, toUpper(data.ifsc_code))
      .input("created_by", sql.Int, toUpper(data.created_by))
      .input("created_by_name", sql.NVarChar, toUpper(data.created_by_name))
      .query(`
        INSERT INTO supplier_master (
          supplier_name, contact_person_name, phone, email, address, 
          city, pincode, state, logo_url, bank_name, account_no, 
          account_type, swift_code, micr_no, ifsc_code, 
          created_by, created_by_name, created_on
        )
        OUTPUT INSERTED.id
        VALUES (
          @supplier_name, @contact_person_name, @phone, @email, @address, 
          @city, @pincode, @state, @logo_url, @bank_name, @account_no, 
          @account_type, @swift_code, @micr_no, @ifsc_code, 
          @created_by, @created_by_name, FORMAT(GETDATE(), 'yyyy-MM-dd h:mm ss')
        )
    `);
    console.log("supplierInsert", supplierInsert.recordset[0].id);
    await logAction(
      "supplier_master",
      supplierInsert.recordset[0].id,
      "CREATE",
    );
  },

  // ================= UPDATE =================
  // update: async (id, data) => {
  //   const pool = await poolPromise;

  //   return (
  //     pool
  //       .request()
  //       .input("id", sql.Int, id)
  //       .input("supplier_name", sql.VarChar, data.supplier_name)
  //       .input("contact_person_name", sql.VarChar, data.contact_person_name)
  //       .input("phone", sql.VarChar, data.phone)
  //       .input("email", sql.VarChar, data.email)
  //       .input("address", sql.VarChar, data.address)
  //       .input("city", sql.VarChar, data.city)
  //       .input("pincode", sql.VarChar, data.pincode)
  //       .input("state", sql.VarChar, data.state)
  //       .input("logo_url", sql.VarChar, data.logo_url || null)

  //       // BANK
  //       .input("bank_name", sql.VarChar, data.bank_name)
  //       .input("account_no", sql.VarChar, data.account_no)
  //       .input("account_type", sql.VarChar, data.account_type)
  //       .input("swift_code", sql.VarChar, data.swift_code)
  //       .input("micr_no", sql.VarChar, data.micr_no)
  //       .input("ifsc_code", sql.VarChar, data.ifsc_code)

  //       .input("modified_by", sql.Int, data.modified_by)
  //       .input("modified_by_name", sql.NVarChar, data.modified_by_name).query(`
  //       UPDATE supplier_master
  //       SET
  //         supplier_name = @supplier_name,
  //         contact_person_name = @contact_person_name,
  //         phone = @phone,
  //         email = @email,
  //         address = @address,
  //         city = @city,
  //         pincode = @pincode,
  //         state = @state,
  //         logo_url= @logo_url,

  //         bank_name = @bank_name,
  //         account_no = @account_no,
  //         account_type = @account_type,
  //         swift_code = @swift_code,
  //         micr_no = @micr_no,
  //         ifsc_code = @ifsc_code,

  //         modified_by = @modified_by,
  //             modified_by_name = @modified_by_name,
  //         modified_on = GETDATE()
  //       WHERE id = @id
  //     `)
  //   );
  // },

  update: async (id, data) => {
    const pool = await poolPromise;

    // 1. Check for duplicates that belong to OTHER IDs
    const checkRequest = pool.request();
    const existing = await checkRequest
      .input("id", sql.Int, id)
      .input("supplier_name", sql.VarChar, data.supplier_name)
      .input("email", sql.VarChar, data.email).query(`
      SELECT id FROM supplier_master 
      WHERE (supplier_name = @supplier_name OR email = @email) 
      AND id <> @id
    `);

    if (existing.recordset.length > 0) {
      throw new Error(
        "Another supplier with this name or email already exists.",
      );
    }

    // 2. Perform the Update
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("supplier_name", sql.VarChar, toUpper(data.supplier_name))
      .input(
        "contact_person_name",
        sql.VarChar,
        toUpper(data.contact_person_name),
      )
      .input("phone", sql.VarChar, toUpper(data.phone))
      .input("email", sql.VarChar, data.email)
      .input("address", sql.VarChar, toUpper(data.address))
      .input("city", sql.VarChar, toUpper(data.city))
      .input("pincode", sql.VarChar, toUpper(data.pincode))
      .input("state", sql.VarChar, toUpper(data.state))
      .input("logo_url", sql.VarChar, data.logo_url || null)
      .input("bank_name", sql.VarChar, toUpper(data.bank_name))
      .input("account_no", sql.VarChar, toUpper(data.account_no))
      .input("account_type", sql.VarChar, toUpper(data.account_type))
      .input("swift_code", sql.VarChar, toUpper(data.swift_code))
      .input("micr_no", sql.VarChar, toUpper(data.micr_no))
      .input("ifsc_code", sql.VarChar, toUpper(data.ifsc_code))
      .input("modified_by", sql.Int, toUpper(data.modified_by))
      .input("modified_by_name", sql.NVarChar, toUpper(data.modified_by_name))
      .query(`
        UPDATE supplier_master
        SET
          supplier_name = @supplier_name,
          contact_person_name = @contact_person_name,
          phone = @phone,
          email = @email,
          address = @address,
          city = @city,
          pincode = @pincode,
          state = @state,
          logo_url = @logo_url,
          bank_name = @bank_name,
          account_no = @account_no,
          account_type = @account_type,
          swift_code = @swift_code,
          micr_no = @micr_no,
          ifsc_code = @ifsc_code,
          modified_by = @modified_by,
          modified_by_name = @modified_by_name,
          modified_on = FORMAT(GETDATE(), 'yyyy-MM-dd h:mm ss')
          OUTPUT inserted.id  -- This returns the ID of the updated row
        WHERE id = @id
    `);

    // 3. Verify if the row actually existed and was updated
    if (result.rowsAffected[0] === 0) {
      throw new Error("Supplier not found.");
    } else {
      console.log("result", result.recordset[0].id);
      await logAction("supplier_master", result.recordset[0].id, "UPDATE");
    }

    return result;
  },

  // ================= DELETE =================
  delete: async (id, disabled_by, disabled_by_name) => {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("disabled_by", sql.Int, disabled_by)
      .input("disabled_by_name", sql.NVarChar, toUpper(disabled_by_name))
      .query(`
        UPDATE supplier_master
        SET disabled_by = @disabled_by,
          disabled_by_name = @disabled_by_name,
            disabled_on =  FORMAT(GETDATE(), 'yyyy-MM-dd h:mm ss'),
            active = 1
        OUTPUT inserted.id  -- This returns the ID of the updated row
        WHERE id = @id
      `);
    if (result.rowsAffected[0] === 0) {
      throw new Error("Supplier not found.");
    } else {
      console.log("result", result.recordset[0].id);
      await logAction("supplier_master", result.recordset[0].id, "UPDATE");
    }
  },

  // ================= RESTORE =================
  restore: async (id, disabled_by, disabled_by_name) => {
    const pool = await poolPromise;

    return pool
      .request()
      .input("id", sql.Int, id)
      .input("disabled_by", sql.Int, disabled_by)
      .input("disabled_by_name", sql.NVarChar, toUpper(disabled_by_name))
      .query(`
        UPDATE supplier_master
        SET disabled_by = @disabled_by,
          disabled_by_name = @disabled_by_name,
            disabled_on =  FORMAT(GETDATE(), 'yyyy-MM-dd h:mm ss'),
            active = 0
        WHERE id = @id
      `);
  },

  search: async (search) => {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("search", sql.NVarChar, `%${search}%`).query(`
      SELECT
        id,
        supplier_name,
        contact_person_name,
        phone,
        email,
        address,
        city,
        state,
        pincode,
        bank_name,
        account_no,
        account_type,
        swift_code,
        micr_no,
        ifsc_code
      FROM supplier_master
      WHERE disabled_on IS NULL
      AND (
            supplier_name LIKE @search
         OR contact_person_name LIKE @search
         OR phone LIKE @search
         OR email LIKE @search
         OR city LIKE @search
         OR state LIKE @search
      )
      ORDER BY id DESC
    `);

    return result.recordset;
  },

  // ================= MODEL =================

  bulkCreate: async (suppliersList, createdBy, created_by_name) => {
    const pool = await poolPromise;

    const safe = (v) => (v ? String(v).trim() : "");

    try {
      for (const item of suppliersList) {
        console.log("ROW =", item);

        await pool
          .request()

          .input(
            "supplier_name",
            sql.VarChar(255),
            safe(item["Supplier Name"]) || "Unnamed Supplier",
          )

          .input(
            "contact_person_name",
            sql.VarChar(255),
            safe(item["Contact Person"]),
          )

          .input("phone", sql.VarChar(50), safe(item["Phone"]))

          .input("email", sql.VarChar(100), safe(item["Email"]))

          .input("address", sql.VarChar(sql.MAX), safe(item["Address"]))

          .input("city", sql.VarChar(100), safe(item["City"]))

          .input("state", sql.VarChar(100), safe(item["State"]))

          .input("pincode", sql.VarChar(20), safe(item["Pincode"]))

          .input("bank_name", sql.VarChar(150), safe(item["Bank Name"]))

          .input("account_no", sql.VarChar(50), safe(item["Account Number"]))

          .input("account_type", sql.VarChar(50), safe(item["Account Type"]))

          .input("ifsc_code", sql.VarChar(50), safe(item["IFSC Code"]))

          .input("swift_code", sql.VarChar(50), safe(item["Swift Code"]))

          .input("micr_no", sql.VarChar(50), safe(item["MICR Number"]))

          .input("created_by", sql.Int, parseInt(createdBy, 10))

          .input("created_by_name", sql.NVarChar(255), safe(created_by_name))
          .query(`
          INSERT INTO supplier_master (

            supplier_name,
            contact_person_name,
            phone,
            email,
            address,
            city,
            state,
            pincode,
            bank_name,
            account_no,
            account_type,
            ifsc_code,
            swift_code,
            micr_no,
            created_by,
            created_by_name,
            created_on

          )
          VALUES (

            @supplier_name,
            @contact_person_name,
            @phone,
            @email,
            @address,
            @city,
            @state,
            @pincode,
            @bank_name,
            @account_no,
            @account_type,
            @ifsc_code,
            @swift_code,
            @micr_no,
            @created_by,
            @created_by_name,
             FORMAT(GETDATE(), 'yyyy-MM-dd h:mm ss')

          )
        `);
      }

      return true;
    } catch (err) {
      console.log("❌ INSERT ERROR =", err);

      throw err;
    }
  },
};

const toUpper = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim().toUpperCase();
};

module.exports = Supplier;
