const sql = require("mssql");
const { poolPromise, DOC_BASE_URL } = require("../config/db");

const toUpper = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim().toUpperCase();
};

/* ================= HOLIDAY ================= */


exports.insertHoliday = async (data) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const insertResult = await new sql.Request(transaction)
      .input("state", sql.NVarChar(100), toUpper(data.state))
      .input("rank", sql.NVarChar(100), toUpper(data.rank))
      .input("created_by", sql.NVarChar(50), String(data.created_by || ""))
      .input("created_by_name", sql.NVarChar(150), toUpper(data.created_by_name))
      .input("company_id", sql.NVarChar(50), data.company_id ? String(data.company_id) : null)
      .input("branch_id", sql.NVarChar(50), data.branch_id ? String(data.branch_id) : null)
      .query(`
        INSERT INTO holidays
        (
          state, rank, active, created_by, created_by_name,
          created_on, company_id, branch_id, source
        )
        OUTPUT INSERTED.id
        VALUES
        (
          @state, @rank, '0', @created_by, @created_by_name,
          FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss'),
          @company_id, @branch_id, 'WEB'
        );
      `);

    const holidayId = insertResult.recordset[0].id;

    // Insert main holiday log
    await new sql.Request(transaction)
      .input("id", sql.NVarChar(50), String(holidayId))
      .input("state", sql.NVarChar(100), toUpper(data.state))
      .input("rank", sql.NVarChar(100), toUpper(data.rank))
      .input("created_by", sql.NVarChar(50), String(data.created_by || ""))
      .input("created_by_name", sql.NVarChar(150), toUpper(data.created_by_name))
      .input("company_id", sql.NVarChar(50), data.company_id ? String(data.company_id) : null)
      .input("branch_id", sql.NVarChar(50), data.branch_id ? String(data.branch_id) : null)
      .query(`
        INSERT INTO holidays_log
        (
          id, state, rank, active, created_by, created_on,
          branch_id, company_id, source, created_by_name,
          activity_id, activity_remark
        )
        VALUES
        (
          @id, @state, @rank, '0', @created_by,
          FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss'),
          @branch_id, @company_id, 'WEB', @created_by_name,
          'CREATE', 'Holiday created'
        );
      `);

    await transaction.commit();

    return insertResult;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};



exports.updateHolidayMain = async (data) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const request = new sql.Request(transaction);

    request
      .input("id", sql.Int, data.id)
      .input("state", sql.NVarChar(100), toUpper(data.state))
      .input("rank", sql.NVarChar(100), toUpper(data.rank))
      .input("company_id", sql.NVarChar(50), data.company_id || null)
      .input("branch_id", sql.NVarChar(50), data.branch_id || null)
      .input("modified_by", sql.NVarChar(50), String(data.modified_by || ""))
      .input("modified_by_name", sql.NVarChar(150), data.modified_by_name || "");

    await request.query(`
      UPDATE holidays
      SET state = @state,
          rank = @rank,
          company_id = @company_id,
          branch_id = @branch_id,
          modified_by = @modified_by,
          modified_by_name = @modified_by_name,
          modified_on = FORMAT(
            DATEADD(MINUTE, 330, GETUTCDATE()),
            'yyyy-MM-dd HH:mm:ss'
          )
      WHERE id = @id;

      IF @@ROWCOUNT = 0
        THROW 50001, 'Holiday not found', 1;

      INSERT INTO holidays_log
      (
        id, state, rank, active,
        modified_by, modified_on,
        branch_id, company_id, source,
        modified_by_name, activity_id, activity_remark
      )
      SELECT
        CAST(id AS NVARCHAR(50)),
        state,
        rank,
        active,
        modified_by,
        modified_on,
        CAST(branch_id AS NVARCHAR(50)),
        CAST(company_id AS NVARCHAR(50)),
        'WEB',
        modified_by_name,
        'UPDATE',
        'Holiday updated'
      FROM holidays
      WHERE id = @id;
    `);

    await transaction.commit();
    return { success: true };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};


exports.softDeleteHoliday = async (id, disabled_by, superadmin_status) => {
  const pool = await poolPromise;

  return pool
    .request()
    .input("id", sql.Int, id)
    .input("disabled_by", sql.VarChar(20), disabled_by)
    .input("superadmin_status", sql.Int, superadmin_status)
    .query(`
      UPDATE holidays
      SET
        active = '1',
        disabled_by = @disabled_by,
        disabled_on = FORMAT(
          DATEADD(MINUTE, 330, GETUTCDATE()),
          'yyyy-MM-dd HH:mm:ss'
        ),
        superadmin_status = @superadmin_status
      WHERE id = @id
    `);
};
exports.getHolidayDetails = async (holiday_id) => {
  const pool = await poolPromise;

  return pool.request().input("holiday_id", sql.VarChar(20), holiday_id).query(`
      SELECT 
        id,
        holiday_name,
        holiday_date,
        image
      FROM holiday_detail
      WHERE holiday_id = @holiday_id
      AND active = '0'
    `);
};


/* ================= DETAILS ================= */
exports.insertHolidayDetail = async (data) => {
  const pool = await poolPromise;

  return pool
    .request()
    .input("holiday_id", sql.VarChar(20), data.holiday_id)
    .input("holiday_name", sql.VarChar(sql.MAX), toUpper(data.name))
    .input("holiday_date", sql.VarChar(sql.MAX), data.date)
    .input("image", sql.VarChar(sql.MAX), data.image || "")
    .query(`
      INSERT INTO holiday_detail
        (holiday_id, holiday_name, holiday_date, image, active)
      OUTPUT INSERTED.id
      VALUES
        (@holiday_id, @holiday_name, @holiday_date, @image, '0')
    `);
};

exports.insertHolidayDetailLog = async (data) => {
  const pool = await poolPromise;

  return pool.request()
    .input("id", sql.NVarChar(50), String(data.id))
    .input("holiday_id", sql.NVarChar(50), String(data.holiday_id))
    .input("holiday_name", sql.NVarChar(200), data.name || "")
    .input("holiday_date", sql.NVarChar(50), String(data.date || ""))
    .input("image", sql.NVarChar(500), data.image || "")
    .query(`
      INSERT INTO holiday_detail_log
      (
        id,
        holiday_id,
        holiday_name,
        holiday_date,
        image,
        active,
        source,
        activity_id,
        activity_remark
      )
      VALUES
      (
        @id,
        @holiday_id,
        @holiday_name,
        @holiday_date,
        @image,
        '0',
        'WEB',
        'CREATE',
        'Holiday detail created'
      )
    `);
};



exports.fetchHolidaysRaw = async (
  fromDate,
  toDate,
  searchFields,
  user
) => {
  const pool = await poolPromise;

  let query = `
    SELECT
      h.id,
      h.state,
      h.rank,
      h.company_id,
      h.branch_id,
      h.superadmin_status,
      h.created_by,
      h.created_by_name,
      CONVERT(VARCHAR(19), h.created_on, 120) AS created_on,
      CONVERT(VARCHAR(19), h.modified_on, 120) AS modified_on,
      h.modified_by,
      h.modified_by_name,
      CONVERT(VARCHAR(19), h.disabled_on, 120) AS disabled_on,
      h.disabled_by_name,
      hd.id AS detail_id,
      hd.holiday_name,
      hd.holiday_date,
      CASE
        WHEN hd.image IS NOT NULL AND hd.image <> ''
        THEN '${DOC_BASE_URL}holidays/' + hd.image
        ELSE hd.image
      END AS image
    FROM holidays h
    LEFT JOIN holiday_detail hd
      ON h.id = hd.holiday_id
    WHERE h.active = '0'
      AND ISNULL(hd.active, '0') = '0'
  `;

  const request = pool.request();

  // Super Admin detection
  const role = String(user?.role || "")
    .trim()
    .toUpperCase();

  const isSuperAdmin =
    user?.is_superadmin === true ||
    Number(user?.id) === 1 ||
    role === "SUPER ADMIN" ||
    role === "SUPERADMIN";

  // Hide Super Admin deleted holidays from other users
  if (!isSuperAdmin) {
    query += `
      AND ISNULL(h.superadmin_status, 0) <> 1
    `;
  }

  // Company and branch access filtering
  if (!isSuperAdmin && user?.id) {
    const userRes = await pool
      .request()
      .input("uId", sql.Int, user.id)
      .query(`
        SELECT company_id, branch_id
        FROM users
        WHERE id = @uId
      `);

    const rawCompanyId =
      userRes.recordset[0]?.company_id ||
      user.company_id ||
      "";

    const rawBranchId =
      userRes.recordset[0]?.branch_id ||
      user.branch_id ||
      "";

    const userCompIds = String(rawCompanyId)
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);

    const userBranchIds = String(rawBranchId)
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);

    if (userCompIds.length === 0) {
      query += `
        AND TRY_CAST(h.created_by AS INT) = @userId
      `;

      request.input("userId", sql.Int, user.id);
    } else {
      const compInClause = userCompIds.join(",");

      let branchCondition = "1 = 1";

      if (userBranchIds.length > 0) {
        const branchInClause = userBranchIds.join(",");

        branchCondition = `
          (
            h.branch_id IS NULL
            OR LTRIM(RTRIM(h.branch_id)) = ''
            OR LTRIM(RTRIM(h.branch_id)) = '0'
            OR TRY_CAST(h.branch_id AS INT) IN (${branchInClause})
            OR EXISTS (
              SELECT 1
              FROM STRING_SPLIT(ISNULL(h.branch_id, ''), ',')
              WHERE TRY_CAST(LTRIM(RTRIM(value)) AS INT)
                IN (${branchInClause})
            )
          )
        `;
      }

      query += `
        AND (
          TRY_CAST(h.created_by AS INT) = @userId
          OR (
            (
              TRY_CAST(h.company_id AS INT) IN (${compInClause})
              OR EXISTS (
                SELECT 1
                FROM STRING_SPLIT(ISNULL(h.company_id, ''), ',')
                WHERE TRY_CAST(LTRIM(RTRIM(value)) AS INT)
                  IN (${compInClause})
              )
            )
            AND ${branchCondition}
          )
        )
      `;

      request.input("userId", sql.Int, user.id);
    }
  }

  // Date filter
  if (fromDate && toDate) {
    query += `
      AND h.created_on >= @fromDate
      AND h.created_on < DATEADD(DAY, 1, CAST(@toDate AS DATE))
    `;

    request.input("fromDate", sql.Date, fromDate);
    request.input("toDate", sql.Date, toDate);
  }

  // Search filters
  if (searchFields && searchFields.length > 0) {
    searchFields.forEach((f, i) => {
      if (!f.field || !String(f.keyword || "").trim()) {
        return;
      }

      const param = `kw${i}`;
      const keyword = `%${String(f.keyword).trim()}%`;

      switch (f.field) {
        case "company":
          query += `
            AND EXISTS (
              SELECT 1
              FROM STRING_SPLIT(ISNULL(h.company_id, ''), ',') AS hc
              INNER JOIN companies AS co
                ON co.id = TRY_CAST(LTRIM(RTRIM(hc.value)) AS INT)
              WHERE co.company_name LIKE @${param}
            )
          `;

          request.input(param, sql.NVarChar, keyword);
          break;

        case "branch":
          query += `
            AND EXISTS (
              SELECT 1
              FROM STRING_SPLIT(ISNULL(h.branch_id, ''), ',') AS hb
              INNER JOIN branch AS br
                ON br.id = TRY_CAST(LTRIM(RTRIM(hb.value)) AS INT)
              WHERE br.branch_name LIKE @${param}
            )
          `;

          request.input(param, sql.NVarChar, keyword);
          break;

        case "state":
          query += ` AND h.state LIKE @${param}`;
          request.input(param, sql.NVarChar, keyword);
          break;

        case "rank":
          query += ` AND h.rank LIKE @${param}`;
          request.input(param, sql.NVarChar, keyword);
          break;

        default:
          break;
      }
    });
  }

  query += ` ORDER BY h.created_on DESC`;

  const result = await request.query(query);

  return result.recordset;
};


exports.inactiveOldDetails = async (holiday_id) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const request = new sql.Request(transaction);

    request.input("holiday_id", sql.VarChar(20), String(holiday_id));

    await request.query(`
      INSERT INTO holiday_detail_log
      (
        id, holiday_id, holiday_name, holiday_date,
        image, active, source, activity_id, activity_remark
      )
      SELECT
        CAST(id AS NVARCHAR(50)),
        CAST(holiday_id AS NVARCHAR(50)),
        holiday_name,
        holiday_date,
        image,
        '1',
        'WEB',
        'UPDATE',
        'Previous holiday detail marked inactive'
      FROM holiday_detail
      WHERE holiday_id = @holiday_id
        AND active = '0';

      UPDATE holiday_detail
      SET active = '1'
      WHERE holiday_id = @holiday_id
        AND active = '0';
    `);

    await transaction.commit();
    return { success: true };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

