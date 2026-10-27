const { poolPromise } = require("../config/db");
const logger = require("../utils/logger");
const sql = require("mssql");
const VoucherModel = {
  async getAllCompanies() {
    const pool = await poolPromise;

    const query = `

        SELECT 
            nc.id,
            nc.company_name,
            nc.company_id,
      -- CLIENT BANK (from new_client)
        nc.bank_name AS client_bank_name,
        nc.client_acc_no,
        nc.ifsc_code AS client_ifsc,
        nc.bank_branch,
        nc.bank_city,
        nc.micr_code,
            cbd.id AS bank_id,
            cbd.bank_name,
            cbd.ac_no,
            cbd.ifsc_code,
            cbd.branch_city,
            cbd.micr_no

        FROM new_client nc

        LEFT JOIN company_bank_detail cbd
            ON nc.company_id = cbd.company_id
            AND cbd.active = '0'

        WHERE nc.active = '0'

        ORDER BY nc.company_name

    `;

    const result = await pool.request().query(query);

    return result.recordset;
  },
  async getAllBranches(clientId) {
    const pool = await poolPromise;

    const query = `
            SELECT DISTINCT id, site_name, client_code
            FROM client_rates
            WHERE client_id = @clientId
            AND active = '0'
            ORDER BY site_name
        `;

    const result = await pool
      .request()
      .input("clientId", clientId)
      .query(query);

    return result.recordset;
  },
  async getAllChargesType() {
    const pool = await poolPromise;

    const query = `
        SELECT DISTINCT
            id,
            charges_master
        FROM charges_master
        WHERE active = 0
        ORDER BY charges_master
    `;

    const result = await pool.request().query(query);

    return result.recordset;
  },
  async getEmployees(client_id, site_id) {
    const pool = await poolPromise;

    let query = `
        SELECT
        id,
        emp_full_name,
        employee_code,
        client_id,
        site_id,bank_name,
    account_no,ac_holder_name,

    client_name,
        site_name,
        client_code


        FROM employee
        WHERE em_status = 'Working'
        AND emp_stages = 'Offer Letter Issued'
    `;

    const request = pool.request();

    if (client_id) {
      query += ` AND client_id = @client_id`;
      request.input("client_id", client_id);
    }

    if (site_id) {
      query += ` AND site_id = @site_id`;
      request.input("site_id", site_id);
    }

    query += ` ORDER BY emp_full_name`;

    const result = await request.query(query);

    return result.recordset;
  },
  // ================= GET ALL ADVANCES =================
  async getAllVouchers({ search = "", fromDate = "", toDate = "" }) {
    const pool = await poolPromise;

    let query = `
        SELECT *
        FROM emp_advance
        WHERE 1=1
    `;

    if (search) {
      query += `
            AND (
                voucher_no LIKE '%${search}%'
                OR emp_name LIKE '%${search}%'
                OR company_name LIKE '%${search}%'
                OR site_name LIKE '%${search}%'
            )
        `;
    }

    if (fromDate) {
      query += ` AND CAST(payment_date AS DATE) >= '${fromDate}' `;
    }

    if (toDate) {
      query += ` AND CAST(payment_date AS DATE) <= '${toDate}' `;
    }

    query += ` ORDER BY id DESC`;

    const result = await pool.request().query(query);
    return result.recordset;
  },
  // ================= GET SINGLE VOUCHER =================

  // ================= CREATE VOUCHER =================
async createVoucher(data) {
  try {
    const pool = await poolPromise;

    // ============================================
    // ENSURE REQUIRED SQL PARAMETERS EXIST
    // ============================================

    const fields = [
      "client_id",
      "site_id",
      "emp_code",
      "adv_date",
      "payment_detail",
      "amount",
      "emp_id",
      "emp_name",
      "branch_id",
      "company_id",
      "particular",
      "cheque_no",
      "credited_to",
      "type",
      "gang_name",
      "commission_paid",
      "mode",
      "status",
      "company_name",
      "from_bank",
      "to_bank",
      "vendor_comm",
      "site_name",
      "client_name",
      "payment_date",
      "bank_name",
      "bank_ac_no",
      "proof_images",
      "client_code",
      "ac_holder_name",
      "ifsc_code",
      "from_bank_acno",
      "from_bank_ifsc",
      "bank_branch",
      "actual_voucher_amt",
      "utr_no",
      "beneficiary_name",
      "paid_amt",
      "vendor_id",
      "vendor_name",
      "source",
      "created_by",
      "created_by_name",
      "created_on",
    ];

    // Set missing fields to null
    fields.forEach((field) => {
      if (data[field] === undefined) {
        data[field] = null;
      }
    });

    // ============================================
    // GET NEXT VOUCHER NUMBER
    // ============================================

    const lastResult = await pool.request().query(`
      SELECT TOP 1 voucher_no
      FROM emp_advance
      WHERE voucher_no IS NOT NULL
      ORDER BY id DESC
    `);

    const lastVoucher =
      lastResult.recordset[0]?.voucher_no || "0000";

    const nextVoucher = (
      parseInt(lastVoucher, 10) + 1
    )
      .toString()
      .padStart(4, "0");

    data.voucher_no = nextVoucher;

    logger.log("NEW VOUCHER =", nextVoucher);
    logger.log("Company ID =", data.company_id);
    logger.log("Branch ID =", data.branch_id);
    logger.log("Client ID =", data.client_id);
    logger.log("Site ID =", data.site_id);
    logger.log("UTR No =", data.utr_no);

    // ============================================
    // MAIN INSERT - emp_advance
    // ============================================

    const query = `
      INSERT INTO emp_advance (
        client_id,
        site_id,
        emp_code,
        adv_date,
        payment_detail,
        amount,
        active,
        emp_id,
        emp_name,
        branch_id,
        company_id,
        particular,
        voucher_no,
        cheque_no,
        credited_to,
        type,
        gang_name,
        commission_paid,
        mode,
        status,
        company_name,
        from_bank,
        to_bank,
        vendor_comm,
        site_name,
        client_name,
        payment_date,
        bank_name,
        bank_ac_no,
        proof_images,
        client_code,
        ac_holder_name,
        ifsc_code,
        from_bank_acno,
        from_bank_ifsc,
        bank_branch,
        actual_voucher_amt,
        utr_no,
        beneficiary_name,
        paid_amt,
        vendor_id,
        vendor_name,
        source,
        created_by,
        created_by_name,
        created_on
      )
      VALUES (
        @client_id,
        @site_id,
        @emp_code,
        @adv_date,
        @payment_detail,
        @amount,
        0,
        @emp_id,
        @emp_name,
        @branch_id,
        @company_id,
        @particular,
        @voucher_no,
        @cheque_no,
        @credited_to,
        @type,
        @gang_name,
        @commission_paid,
        @mode,
        @status,
        @company_name,
        @from_bank,
        @to_bank,
        @vendor_comm,
        @site_name,
        @client_name,
        @payment_date,
        @bank_name,
        @bank_ac_no,
        @proof_images,
        @client_code,
        @ac_holder_name,
        @ifsc_code,
        @from_bank_acno,
        @from_bank_ifsc,
        @bank_branch,
        @actual_voucher_amt,
        @utr_no,
        @beneficiary_name,
        @paid_amt,
        @vendor_id,
        @vendor_name,
        @source,
        @created_by,
        @created_by_name,
        @created_on
      )
    `;

    const request = pool.request();

    Object.entries(data).forEach(([key, value]) => {
      request.input(key, value ?? null);
    });

    await request.query(query);

    logger.log("emp_advance INSERTED SUCCESSFULLY");

    // ============================================
    // LOG INSERT - emp_advance_log
    // ============================================

    try {
      const logQuery = `
        INSERT INTO emp_advance_log (
          client_id,
          site_id,
          emp_code,
          adv_date,
          payment_detail,
          amount,
          emp_id,
          emp_name,
          branch_id,
          company_id,
          particular,
          voucher_no,
          cheque_no,
          credited_to,
          type,
          gang_name,
          commission_paid,
          mode,
          status,
          company_name,
          from_bank,
          to_bank,
          vendor_comm,
          site_name,
          client_name,
          payment_date,
          bank_name,
          bank_ac_no,
          proof_images,
          client_code,
          ac_holder_name,
          ifsc_code,
          from_bank_acno,
          from_bank_ifsc,
          bank_branch,
          actual_voucher_amt,
          utr_no,
          beneficiary_name,
          vendor_id,
          vendor_name,
          source,
          created_by,
          created_by_name,
          activity
        )
        VALUES (
          @client_id,
          @site_id,
          @emp_code,
          @adv_date,
          @payment_detail,
          @amount,
          @emp_id,
          @emp_name,
          @branch_id,
          @company_id,
          @particular,
          @voucher_no,
          @cheque_no,
          @credited_to,
          @type,
          @gang_name,
          @commission_paid,
          @mode,
          @status,
          @company_name,
          @from_bank,
          @to_bank,
          @vendor_comm,
          @site_name,
          @client_name,
          @payment_date,
          @bank_name,
          @bank_ac_no,
          @proof_images,
          @client_code,
          @ac_holder_name,
          @ifsc_code,
          @from_bank_acno,
          @from_bank_ifsc,
          @bank_branch,
          @actual_voucher_amt,
          @utr_no,
          @beneficiary_name,
          @vendor_id,
          @vendor_name,
          @source,
          @created_by,
          @created_by_name,
          'CREATE'
        )
      `;

      const logRequest = pool.request();

      Object.entries(data).forEach(([key, value]) => {
        logRequest.input(key, value ?? null);
      });

      const logResult = await logRequest.query(logQuery);

      logger.log("emp_advance_log INSERT SUCCESS");
      logger.log("Log rows affected:", logResult.rowsAffected);
    } catch (logError) {
      logger.log("LOG INSERT ERROR =", logError);
    }

    // ============================================
    // SUCCESS RESPONSE
    // ============================================

    return {
      success: true,
      message: "Voucher created successfully",
      voucher_no: nextVoucher,
    };
  } catch (error) {
    logger.log("CREATE ERROR =", error);

    return {
      success: false,
      message: error.message,
    };
  }
},
  async updateVoucher(id, data) {
    logger.log("========================================");
    logger.log("🚀 UPDATE VOUCHER START");
    logger.log("🆔 VOUCHER ID:", id);
    logger.log("📥 REQUEST DATA:", JSON.stringify(data, null, 2));
    logger.log("========================================");

    try {
      const pool = await poolPromise;
      logger.log("✅ DB CONNECTION SUCCESS");

      // ================= UPDATE QUERY =================
      const query = `
            UPDATE emp_advance
            SET
                client_id = @client_id,
                site_id = @site_id,
                emp_code = @emp_code,
                adv_date = @adv_date,
                payment_detail = @payment_detail,
                amount = @amount,
                emp_id = @emp_id,
                emp_name = @emp_name,
                branch_id = @branch_id,
                company_id = @company_id,
                particular = @particular,
                cheque_no = @cheque_no,
                credited_to = @credited_to,
                type = @type,
                gang_name = @gang_name,
                commission_paid = @commission_paid,
                mode = @mode,
                status = @status,
                company_name = @company_name,
                from_bank = @from_bank,
                to_bank = @to_bank,
                vendor_comm = @vendor_comm,
                site_name = @site_name,
                client_name = @client_name,
                payment_date = @payment_date,
                schedule_date = @schedule_date,
                bank_name = @bank_name,
                bank_ac_no = @bank_ac_no,
                proof_images = @proof_images,
                client_code = @client_code,
                ac_holder_name = @ac_holder_name,
                ifsc_code = @ifsc_code,
                from_bank_acno = @from_bank_acno,
                from_bank_ifsc = @from_bank_ifsc,
                bank_branch = @bank_branch,
                actual_voucher_amt = @actual_voucher_amt,
                utr_no = @utr_no,
                beneficiary_name = @beneficiary_name,
                paid_amt = @paid_amt,
                vendor_id = @vendor_id,
                vendor_name = @vendor_name,
                source = @source,
                modified_by = @modified_by,
                  modified_by_name = @modified_by_name,
                modified_on = @modified_on
            WHERE id = @id
        `;

      const request = pool.request();

      // 🔥 MUST ADD ID FIRST
      request.input("id", id);

      // ================= INPUT BINDING =================
      Object.entries(data).forEach(([key, value]) => {
        request.input(key, value ?? null);
      });

      const result = await request.query(query);

      logger.log("📊 UPDATE RESULT:", result.rowsAffected);

      if (result.rowsAffected[0] === 0) {
        return {
          success: false,
          message: "No record found to update",
        };
      }

      // ================= LOG INSERT =================
      logger.log("========================================");
      logger.log("📝 INSERTING LOG ENTRY");
      logger.log("========================================");

      const logQuery = `
            INSERT INTO emp_advance_log (
                client_id,
                site_id,
                emp_code,
                adv_date,
                payment_detail,
                amount,
                emp_id,
                emp_name,
                branch_id,
                company_id,
                particular,
                cheque_no,
                credited_to,
                type,
                gang_name,
                commission_paid,
                mode,
                status,
                company_name,
                from_bank,
                to_bank,
                vendor_comm,
                site_name,
                client_name,
                payment_date,
                schedule_date,
                bank_name,
                bank_ac_no,
                proof_images,
                client_code,
                ac_holder_name,
                ifsc_code,
                from_bank_acno,
                from_bank_ifsc,
                bank_branch,
                actual_voucher_amt,
                utr_no,
                beneficiary_name,
               
                vendor_id,
                vendor_name,
                source,
                voucher_no,
               
                modified_by,
                modified_on
            )
            VALUES (
                @client_id,
                @site_id,
                @emp_code,
                @adv_date,
                @payment_detail,
                @amount,
                @emp_id,
                @emp_name,
                @branch_id,
                @company_id,
                @particular,
                @cheque_no,
                @credited_to,
                @type,
                @gang_name,
                @commission_paid,
                @mode,
                @status,
                @company_name,
                @from_bank,
                @to_bank,
                @vendor_comm,
                @site_name,
                @client_name,
                @payment_date,
                @schedule_date,
                @bank_name,
                @bank_ac_no,
                @proof_images,
                @client_code,
                @ac_holder_name,
                @ifsc_code,
                @from_bank_acno,
                @from_bank_ifsc,
                @bank_branch,
                @actual_voucher_amt,
                @utr_no,
                @beneficiary_name,
          
                @vendor_id,
                @vendor_name,
                @source,
                @voucher_no,
          
                @modified_by,
                @modified_on
            )
        `;

      const logRequest = pool.request();

      // 🔥 SAFE LOG DATA MAP
      logRequest.input("client_id", data.client_id || null);
      logRequest.input("site_id", data.site_id || null);
      logRequest.input("emp_code", data.emp_code || null);
      logRequest.input("adv_date", data.adv_date || null);
      logRequest.input("payment_detail", data.payment_detail || null);
      logRequest.input("amount", data.amount || 0);
      logRequest.input("emp_id", data.emp_id || null);
      logRequest.input("emp_name", data.emp_name || null);
      logRequest.input("branch_id", data.branch_id || null);
      logRequest.input("company_id", data.company_id || null);
      logRequest.input("particular", data.particular || null);
      logRequest.input("cheque_no", data.cheque_no || null);
      logRequest.input("credited_to", data.credited_to || null);
      logRequest.input("type", data.type || null);
      logRequest.input("gang_name", data.gang_name || null);
      logRequest.input("commission_paid", data.commission_paid || 0);
      logRequest.input("mode", data.mode || null);
      logRequest.input("status", data.status || null);
      logRequest.input("company_name", data.company_name || null);
      logRequest.input("from_bank", data.from_bank || null);
      logRequest.input("to_bank", data.to_bank || null);
      logRequest.input("vendor_comm", data.vendor_comm || 0);
      logRequest.input("site_name", data.site_name || null);
      logRequest.input("client_name", data.client_name || null);
      logRequest.input("payment_date", data.payment_date || null);
      logRequest.input("schedule_date", data.schedule_date || null);
      logRequest.input("bank_name", data.bank_name || null);
      logRequest.input("bank_ac_no", data.bank_ac_no || null);
      logRequest.input("proof_images", data.proof_images || null);
      logRequest.input("client_code", data.client_code || null);
      logRequest.input("ac_holder_name", data.ac_holder_name || null);
      logRequest.input("ifsc_code", data.ifsc_code || null);
      logRequest.input("from_bank_acno", data.from_bank_acno || null);
      logRequest.input("from_bank_ifsc", data.from_bank_ifsc || null);
      logRequest.input("bank_branch", data.bank_branch || null);
      logRequest.input("actual_voucher_amt", data.actual_voucher_amt || 0);
      logRequest.input("utr_no", data.utr_no || null);
      logRequest.input("beneficiary_name", data.beneficiary_name || null);
      logRequest.input("vendor_id", data.vendor_id || null);
      logRequest.input("vendor_name", data.vendor_name || null);
      logRequest.input("source", data.source || null);
      logRequest.input("voucher_no", data.voucher_no || null);
      logRequest.input("modified_by", data.modified_by || 0);
      logRequest.input("modified_on", new Date());

      await logRequest.query(logQuery);

      logger.log("✅ LOG INSERT SUCCESS");

      return {
        success: true,
        message: "Voucher updated successfully",
      };
    } catch (error) {
      logger.log("❌ UPDATE ERROR:", error.message);

      return {
        success: false,
        message: error.message,
      };
    }
  },
  async deleteVoucher(id, disabled_by, deleted_by_name) {
    const pool = await poolPromise;

    try {
      // ============================================
      // SOFT DELETE FIRST
      // ============================================

      const result = await pool
        .request()
        .input("id", sql.Int, id)
        .input("disabled_by", sql.Int, disabled_by)
        .input("deleted_by_name", sql.VarChar, deleted_by_name).query(`
        UPDATE emp_advance
        SET
          active = 1,
          status = 'Deleted',
          disabled_by = @disabled_by,
          deleted_by_name = @deleted_by_name,
          disabled_on = GETDATE()
        WHERE id = @id
      `);

      // ============================================
      // GET COMMON COLUMNS
      // ============================================

      const columnsResult = await pool.request().query(`
      SELECT a.COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS a
      INNER JOIN INFORMATION_SCHEMA.COLUMNS b
        ON a.COLUMN_NAME = b.COLUMN_NAME
      WHERE a.TABLE_NAME = 'emp_advance'
        AND b.TABLE_NAME = 'emp_advance_log'
        AND a.COLUMN_NAME != 'id'
      ORDER BY a.ORDINAL_POSITION
    `);

      const columns = columnsResult.recordset.map((col) => col.COLUMN_NAME);

      const columnList = columns.join(", ");

      // ============================================
      // INSERT UPDATED DATA INTO LOG
      // ============================================

      await pool.request().input("id", sql.Int, id).query(`
        INSERT INTO emp_advance_log (${columnList})

        SELECT ${columnList}
        FROM emp_advance
        WHERE id = @id
      `);

      return result;
    } catch (error) {
      logger.log("DELETE ERROR =", error);

      throw error;
    }
  },

  async approveVoucher(id, approved_by, approved_by_name) {
    const pool = await poolPromise;

    try {
      // ============================================
      // APPROVE FIRST
      // ============================================

      const result = await pool
        .request()
        .input("id", sql.Int, id)
        .input("approved_by", sql.Int, approved_by)
        .input("approved_by_name", sql.VarChar, approved_by_name).query(`
    UPDATE emp_advance
    SET
      status = 'Approved',
      approved_by = @approved_by,
      approved_by_name = @approved_by_name,
      approved_on = GETDATE(),
      active = 0
    WHERE id = @id
      AND active = 0
  `);

      // ============================================
      // GET COMMON COLUMNS
      // ============================================

      const columnsResult = await pool.request().query(`
  SELECT a.COLUMN_NAME
  FROM INFORMATION_SCHEMA.COLUMNS a
  INNER JOIN INFORMATION_SCHEMA.COLUMNS b
    ON a.COLUMN_NAME = b.COLUMN_NAME
  WHERE a.TABLE_NAME = 'emp_advance'
    AND b.TABLE_NAME = 'emp_advance_log'
    AND a.COLUMN_NAME != 'id'
  ORDER BY a.ORDINAL_POSITION
`);

      const columns = columnsResult.recordset.map((col) => col.COLUMN_NAME);

      const columnList = columns.join(", ");

      logger.log("COLUMN LIST =", columnList);

      // ============================================
      // INSERT UPDATED DATA INTO LOG TABLE
      // ============================================

      await pool.request().input("id", sql.Int, id).query(`
    INSERT INTO emp_advance_log (${columnList})

    SELECT ${columnList}
    FROM emp_advance
    WHERE id = @id
  `);

      return result;
    } catch (error) {
      logger.log("APPROVE ERROR =", error);

      throw error;
    }
  },
  async rejectVoucher(id, payload) {
    const pool = await poolPromise;

    try {
      // ============================================
      // GET COMMON COLUMNS
      // ============================================

      const columnsResult = await pool.request().query(`
      SELECT a.COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS a
      INNER JOIN INFORMATION_SCHEMA.COLUMNS b
        ON a.COLUMN_NAME = b.COLUMN_NAME
      WHERE a.TABLE_NAME = 'emp_advance'
        AND b.TABLE_NAME = 'emp_advance_log'
        AND a.COLUMN_NAME NOT IN ('id')
      ORDER BY a.ORDINAL_POSITION
    `);

      const columns = columnsResult.recordset.map(
        (col) => `[${col.COLUMN_NAME}]`,
      );

      const columnList = columns.join(", ");

      // ============================================
      // UPDATE REJECT STATUS FIRST
      // ============================================

      const result = await pool
        .request()

        .input("id", sql.Int, id)

        .input("rejected_by", sql.Int, payload.rejected_by)

        .input("rejected_by_name", sql.VarChar, payload.rejected_by_name)

        .input("rejected_on", sql.DateTime, new Date()).query(`
        UPDATE emp_advance
        SET
          status = 'Rejected',
          rejected_by = @rejected_by,
          rejected_by_name = @rejected_by_name,
          rejected_on = @rejected_on
        WHERE id = @id
      `);

      logger.log("REJECT UPDATE =", result.rowsAffected);

      // ============================================
      // INSERT UPDATED DATA INTO LOG
      // ============================================

      const logResult = await pool.request().input("id", sql.Int, id).query(`

        INSERT INTO emp_advance_log (
          ${columnList}
        )

        SELECT
          ${columnList}
        FROM emp_advance
        WHERE id = @id

      `);

      logger.log("LOG INSERT =", logResult.rowsAffected);

      return result;
    } catch (err) {
      logger.log("REJECT ERROR =", err.message);

      logger.log("FULL ERROR =", err);

      throw err;
    }
  },
  async getApprovedVoucherData() {
    try {
      const pool = await poolPromise;

      if (!pool) {
        throw new Error("Database connection not initialized");
      }

      const query = `
       SELECT
  voucher_no,
  beneficiary_name,
  bank_ac_no,
  ifsc_code,
  amount,
  mode,
  payment_date,
  utr_no,
  status
FROM emp_advance
WHERE status IS NOT NULL
  AND LOWER(status) = 'approved'
ORDER BY payment_date DESC
      `;

      logger.log("🔥 Executing Approved Voucher Query");

      const result = await pool.request().query(query);

      logger.log(`✅ Records Found: ${result.recordset.length}`);

      return result.recordset;
    } catch (error) {
      logger.log("❌ getApprovedVoucherData ERROR:", error.message);
      throw error;
    }
  },
  async bulkInsertEmpAdvance(data) {
    try {
      const pool = await poolPromise;

      const inserted = [];

      for (let item of data) {
        const request = pool.request();
        request.input(
          "client_id",
          sql.Int,
          item.client_id ? parseInt(item.client_id) : null,
        );

        request.input(
          "site_id",
          sql.Int,
          item.site_id ? parseInt(item.site_id) : null,
        );

        request.input("emp_code", item.emp_code || null);
        request.input("adv_date", item.adv_date || null);
        request.input("payment_detail", item.payment_detail || null);
        request.input("amount", item.amount || 0);
        request.input("emp_name", item.emp_name || null);
        request.input(
          "emp_id",
          sql.Int,
          item.emp_id ? parseInt(item.emp_id) : null,
        );
        request.input("branch_id", item.branch_id || null);
        request.input("company_id", item.company_id || null);
        request.input(
          "created_by",
          sql.Int,
          item.created_by ? parseInt(item.created_by) : null,
        );

        request.input("particular", item.particular || null);
        request.input("voucher_no", item.voucher_no || null);
        request.input("cheque_no", item.cheque_no || null);

        request.input("credited_to", item.credited_to || null);
        request.input("type", item.type || null);
        request.input("gang_name", item.gang_name || null);

        request.input("commission_paid", item.commission_paid || null);
        request.input("mode", item.mode || null);
        request.input("status", item.status || "Pending");

        request.input("company_name", item.company_name || null);

        request.input("from_bank", item.from_bank || null);
        request.input("to_bank", item.to_bank || null);

        request.input("vendor_comm", item.vendor_comm || 0);

        request.input("site_name", item.site_name || null);
        request.input("client_name", item.client_name || null);
        request.input("created_by_name", item.created_by_name || null);

        request.input("client_code", item.client_code || null);

        request.input(
          "active",
          sql.Int,
          item.active ? parseInt(item.active) : 0,
        );
        request.input("bank_name", item.bank_name || null);
        request.input("bank_ac_no", item.bank_ac_no || null);

        request.input("ac_holder_name", item.ac_holder_name || null);
        request.input("ifsc_code", item.ifsc_code || null);

        request.input("from_bank_acno", item.from_bank_acno || null);
        request.input("from_bank_ifsc", item.from_bank_ifsc || null);

        request.input("vendor_name", item.vendor_name || null);

        const result = await request.query(`
  INSERT INTO emp_advance (
    client_id,
    site_id,
    emp_code,
    adv_date,
    payment_detail,
    amount,
    emp_id,
    emp_name,
    branch_id,
    company_id,
    created_by,
    created_on,
    particular,
    voucher_no,
    cheque_no,
    credited_to,
    type,
    gang_name,
    commission_paid,
    mode,
    status,
    company_name,
    from_bank,
    to_bank,
    vendor_comm,
    site_name,
    client_name,
    bank_name,
    bank_ac_no,
    ac_holder_name,
    ifsc_code,
    from_bank_acno,
    from_bank_ifsc,
    vendor_name,
    active,
    client_code,
    created_by_name
  )
  VALUES (
    @client_id,
    @site_id,
    @emp_code,
    @adv_date,
    @payment_detail,
    @amount,
    @emp_id,
    @emp_name,
    @branch_id,
    @company_id,
    @created_by,
    GETDATE(),
    @particular,
    @voucher_no,
    @cheque_no,
    @credited_to,
    @type,
    @gang_name,
    @commission_paid,
    @mode,
    @status,
    @company_name,
    @from_bank,
    @to_bank,
    @vendor_comm,
    @site_name,
    @client_name,
    @bank_name,
    @bank_ac_no,
    @ac_holder_name,
    @ifsc_code,
    @from_bank_acno,
    @from_bank_ifsc,
    @vendor_name,
    @active,
    @client_code,
    @created_by_name
  )
`);

        inserted.push(result);
      }

      return inserted;
    } catch (error) {
      console.log(error);
      console.log(error.response?.data);
      console.log(error.message);

      throw error;
    }
  },
  async getLastVoucherNo() {
    try {
      const pool = await poolPromise;

      const result = await pool.request().query(`
      SELECT TOP 1 voucher_no
      FROM emp_advance
      WHERE ISNUMERIC(voucher_no) = 1
      ORDER BY CAST(voucher_no AS INT) DESC
    `);

      return result.recordset[0]?.voucher_no || "0000";
    } catch (error) {
      console.log(error);

      throw error;
    }
  },
};

module.exports = VoucherModel;
