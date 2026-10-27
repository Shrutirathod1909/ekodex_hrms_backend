const { DateTime } = require("mssql");
const {
  poolPromise,
  sql,
  UPLOAD_BASE_URL,
  DOC_BASE_URL,
} = require("../config/db");
const logger = require("../utils/logger");
const { getRelativePathFromApi } = require("../utils/img_path");
const { logAction } = require("../utils/auditLogger");
const {
  addCompanyId,
} = require("./superadminIdModel");
const { checkSuperadminProtection, isUserSuperAdmin } = require("../utils/superadminProtection");

async function createCompany(data, file, user) {
  const pool = await poolPromise;

  const cleanValue = (value) => {
    if (
      value === undefined ||
      value === null ||
      value === "" ||
      value === "undefined" ||
      value === "null"
    ) {
      return null;
    }
    return value;
  };

  // Safe uppercase â€” won't crash if value is null/undefined
  const safeUpper = (value) => {
    const clean = cleanValue(value);
    return clean ? String(clean).toUpperCase() : null;
  };

  const logo = file ? getRelativePathFromApi(file) : null;

  // =========================
  // DUPLICATE CHECK
  // =========================
  const check = await pool
    .request()
    .input("company_name", sql.VarChar, safeUpper(data.company_name)).query(`
      SELECT TOP 1 id
      FROM companies
      WHERE company_name = @company_name
    `);

  if (check.recordset.length > 0) {
    throw new Error("Company already exists");
  }

  // =========================
  // INSERT COMPANY
  // =========================

  const result = await pool
    .request()
    .input("company_name", sql.VarChar, safeUpper(data.company_name))
    .input("email_id", sql.VarChar, safeUpper(data.email_id))
    .input("address", sql.VarChar, safeUpper(data.address))
    .input("phone", sql.VarChar, safeUpper(data.phone))
    .input("city", sql.VarChar, safeUpper(data.city))
    .input("country", sql.VarChar, safeUpper(data.country))
    .input("pincode", sql.VarChar, safeUpper(data.pincode))
    .input("state", sql.VarChar, safeUpper(data.state))
    .input("statecode", sql.VarChar, safeUpper(data.statecode))
    .input(
      "contactable_person",
      sql.VarChar,
      safeUpper(data.contactable_person),
    )
    .input("currency", sql.VarChar, safeUpper(data.currency))
    .input("fin_from", sql.VarChar, safeUpper(data.fin_from))
    .input("fin_to", sql.VarChar, safeUpper(data.fin_to))
    .input("gst_no", sql.VarChar, safeUpper(data.gst_no))
    .input("website", sql.VarChar, safeUpper(data.website))
    .input("cin_no", sql.VarChar, safeUpper(data.cin_no))
    .input("vat_tin", sql.VarChar, safeUpper(data.vat_tin))
    .input("cst_tin", sql.VarChar, safeUpper(data.cst_tin))
    .input("iec", sql.VarChar, safeUpper(data.iec))
    .input("terms", sql.VarChar, safeUpper(data.terms))
    .input("invoiceprefix", sql.VarChar, safeUpper(data.invoiceprefix))
    .input("logo", sql.VarChar, logo)
    .input("source", sql.VarChar, data.source || "WEB")
    .input("created_by", sql.Int, user?.id)
    .input("created_by_name", sql.VarChar, user?.name).query(`
      INSERT INTO companies (
        company_name,
        email_id,
        address,
        phone,
        city,
        country,
        pincode,
        state,
        statecode,
        contactable_person,
        currency,
        fin_from,
        fin_to,
        gst_no,
        website,
        cin_no,
        vat_tin,
        cst_tin,
        iec,
        terms,
        invoiceprefix,
        logo,
        active,
        created_on,
        created_by,
        created_by_name,
        source,
        superadmin_status
      )
      VALUES (
        @company_name,
        @email_id,
        @address,
        @phone,
        @city,
        @country,
        @pincode,
        @state,
        @statecode,
        @contactable_person,
        @currency,
        @fin_from,
        @fin_to,
        @gst_no,
        @website,
        @cin_no,
        @vat_tin,
        @cst_tin,
        @iec,
        @terms,
        @invoiceprefix,
        @logo,
        0,
        FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss'),
        @created_by,
        @created_by_name,
        @source,
        '0'
      );
      
      SELECT SCOPE_IDENTITY() AS id;
    `);

  const newId = result.recordset[0].id;
await addCompanyId(newId);
  if (file && logo && logo.includes("new")) {
    const fs = require("fs");
    const path = require("path");
    const oldPath = file.path;
    const newFilename = file.filename.replace("new", newId);
    const newPath = path.join(path.dirname(oldPath), newFilename);
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath);
      // update DB logo
      const newRelativeLogo = logo.replace("new", newId);
      await pool.request().input("id", sql.Int, newId).input("logo", sql.VarChar, newRelativeLogo).query(`UPDATE companies SET logo=@logo WHERE id=@id`);
    }
  }

  const { logAction } = require("../utils/auditLogger");
  await logAction("companies", newId, "CREATE");

  return {
    id: newId,
    message: "Company created successfully",
  };
}

// async function getCompanies(queryData) {
//   logger.log("========== GET COMPANIES API HIT ==========");
//   logger.log("QUERY DATA:", queryData);

//   const pool = await poolPromise;

//   const { searchFields, fromDate, toDate, active } = queryData;

//   // If active is not passed, don't filter by it. If passed, parse it.
//   let activeValue = null;
//   if (active !== undefined && active !== "") {
//     activeValue = parseInt(active, 10);
//   }

//   logger.log("RAW searchFields:", searchFields);
//   logger.log("FROM DATE:", fromDate);
//   logger.log("TO DATE:", toDate);
//   logger.log("ACTIVE FILTER:", activeValue);

//   let query = `
//     SELECT
//       id,
//       company_name,
//       contactable_person,
//       email_id,
//       phone,
//       city,
//       country,
//       state,
//       statecode,
//       pincode,
//       address,
//       currency,
//       fin_from,
//       fin_to,
//       gst_no,
//       website,
//       cin_no,
//       vat_tin,
//       cst_tin,
//       iec,
//       terms,
//       invoiceprefix,
//       active,
//       logo,
//       created_by,
//       modified_by,
//       created_by_name,
//       modified_by_name,
//       disabled_by_name,
//       disabled_on,
//       created_on,
//       modified_on

//     FROM companies
//     WHERE 1=1
//   `;

//   const request = pool.request();

//   if (activeValue !== null) {
//     query += ` AND active = @activeValue`;
//     request.input("activeValue", sql.Int, activeValue);
//   }

//   // ==============================
//   // SEARCH FILTER LOGGER
//   // ==============================
//   if (searchFields) {
//     let parsedFields = [];

//     try {
//       parsedFields = JSON.parse(searchFields);
//       logger.log("PARSED searchFields:", parsedFields);
//     } catch (err) {
//       logger.log("âŒ JSON PARSE ERROR:", err.message);
//       parsedFields = [];
//     }

//     const fieldMap = {
//       companyName: "company_name",
//       contactPerson: "contactable_person",
//       email: "email_id",
//       phone: "phone",
//       city: "city",
//       country: "country",
//       state: "state",
//       gstNo: "gst_no",
//       website: "website",
//       invoicePrefix: "invoiceprefix",
//     };

//     parsedFields.forEach((item, index) => {
//       logger.log(`\n--- FILTER ${index} ---`);
//       logger.log("ITEM:", item);

//       if (!item?.field || !item?.keyword) {
//         logger.log("âŒ SKIPPED: missing field/keyword");
//         return;
//       }

//       const dbField = fieldMap[item.field];

//       if (!dbField) {
//         logger.log("âŒ SKIPPED: field not mapped ->", item.field);
//         return;
//       }

//       logger.log("âœ” DB FIELD:", dbField);
//       logger.log("âœ” KEYWORD:", item.keyword);

//       query += ` AND ${dbField} LIKE @keyword${index}`;

//       request.input(`keyword${index}`, sql.VarChar, `%${item.keyword.trim()}%`);
//     });
//   }

//   // ==============================
//   // DATE FILTER LOGGER
//   // ==============================
//   if (fromDate && toDate) {
//     logger.log("APPLYING DATE FILTER");
//     const startOfDay = `${fromDate} 00:00:00`;
//     const endOfDay = `${toDate} 23:59:59`;

//     query += `
//       AND created_on >= @fromDate AND created_on <= @toDate
//     `;

//     request.input("fromDate", sql.NVarChar, startOfDay);
//     request.input("toDate", sql.NVarChar, endOfDay);
//   }

//   query += ` ORDER BY id DESC `;

//   // ==============================
//   // FINAL QUERY LOG
//   // ==============================
//   logger.log("\n========== FINAL SQL QUERY ==========");
//   logger.log(query);

//   logger.log("\n========== PARAMS ==========");
//   logger.log(request.parameters);

//   const result = await request.query(query);

//   logger.log("RESULT COUNT:", result.recordset.length);

//   // Process logo paths in Javascript
//   const formattedRecords = result.recordset.map((record) => {
//     let finalLogo = null;
//     if (record.logo) {
//       if (record.logo.startsWith("http")) {
//         finalLogo = record.logo;
//       } else {
//         finalLogo = `${DOC_BASE_URL}${record.logo.replace(/\\/g, "/")}`;
//       }
//     }
//     return {
//       ...record,
//       logo_og_path: record.logo,
//       logo: finalLogo,
//     };
//   });

//   return formattedRecords;
// }

async function getCompanies(queryData, userId, userRole) {
  logger.log("========== GET COMPANIES API HIT ==========");
  logger.log("QUERY DATA:", queryData);
  logger.log("USER ID:", userId);
  logger.log("USER ROLE:", userRole);

  const pool = await poolPromise;

  const { searchFields, fromDate, toDate, active } = queryData;

  let activeValue = null;

  if (active !== undefined && active !== "") {
    activeValue = parseInt(active, 10);
  }

  let query = `
    SELECT
      c.id,
      c.company_name,
      c.contactable_person,
      c.email_id,
      c.phone,
      c.city,
      c.country,
      c.state,
      c.statecode,
      c.pincode,
      c.address,
      c.currency,
      c.fin_from,
      c.fin_to,
      c.gst_no,
      c.website,
      c.cin_no,
      c.vat_tin,
      c.cst_tin,
      c.iec,
      c.terms,
      c.invoiceprefix,
      c.active,
      c.logo,
      c.created_by,
      c.modified_by,
      c.created_by_name,
      c.modified_by_name,
      c.disabled_by,
      c.disabled_by_name,
      c.disabled_on,
      c.created_on,
      c.modified_on,
      c.superadmin_status
    FROM companies c
    WHERE 1 = 1
  `;

  const request = pool.request();

  // =====================================================
  // COMPANY ACCESS
  // =====================================================

  const normalizedRole = userRole?.trim().toUpperCase();
  const isSuperAdmin =
    Number(userId) === 1 ||
    normalizedRole === "SUPER ADMIN" ||
    normalizedRole === "SUPERADMIN";

  if (!isSuperAdmin) {
    query += `
      AND (
        TRY_CAST(c.created_by AS INT) = @userId
        OR c.id IN (
          SELECT TRY_CAST(LTRIM(RTRIM(value)) AS INT)
          FROM STRING_SPLIT(
            (
              SELECT ISNULL(company_id, '')
              FROM users
              WHERE id = @userId
            ),
            ','
          )
          WHERE LTRIM(RTRIM(value)) <> ''
        )
      )
    `;

    request.input("userId", sql.Int, userId);

    logger.log(
      "NORMAL USER: Applying assigned company or created_by filter"
    );
  } else {
    logger.log(
      "SUPER ADMIN: Showing all companies"
    );
  }

  // =====================================================
  // ACTIVE FILTER
  // =====================================================

  if (activeValue !== null) {
    query += ` AND c.active = @activeValue`;

    request.input(
      "activeValue",
      sql.Int,
      activeValue
    );
  }

  // =====================================================
  // SEARCH FILTER
  // =====================================================

  if (searchFields) {
    let parsedFields = [];

    try {
      parsedFields = JSON.parse(searchFields);

      logger.log(
        "PARSED searchFields:",
        parsedFields
      );
    } catch (err) {
      logger.log(
        "JSON PARSE ERROR:",
        err.message
      );

      parsedFields = [];
    }

    const fieldMap = {
      companyName: "c.company_name",
      contactPerson: "c.contactable_person",
      email: "c.email_id",
      phone: "c.phone",
      city: "c.city",
      country: "c.country",
      state: "c.state",
      gstNo: "c.gst_no",
      website: "c.website",
      invoicePrefix: "c.invoiceprefix",
    };

    parsedFields.forEach((item, index) => {
      logger.log(`\n--- FILTER ${index} ---`);
      logger.log("ITEM:", item);

      if (!item?.field || !item?.keyword) {
        logger.log(
          "SKIPPED: missing field/keyword"
        );
        return;
      }

      const dbField = fieldMap[item.field];

      if (!dbField) {
        logger.log(
          "SKIPPED: field not mapped ->",
          item.field
        );
        return;
      }

      logger.log("DB FIELD:", dbField);
      logger.log("KEYWORD:", item.keyword);

      query += `
        AND ${dbField} LIKE @keyword${index}
      `;

      request.input(
        `keyword${index}`,
        sql.VarChar,
        `%${item.keyword.trim()}%`
      );
    });
  }

  // =====================================================
  // DATE FILTER
  // =====================================================

  if (fromDate && toDate) {
    logger.log("APPLYING DATE FILTER");

    const startOfDay = `${fromDate} 00:00:00`;
    const endOfDay = `${toDate} 23:59:59`;

    query += `
      AND c.created_on >= @fromDate
      AND c.created_on <= @toDate
    `;

    request.input(
      "fromDate",
      sql.NVarChar,
      startOfDay
    );

    request.input(
      "toDate",
      sql.NVarChar,
      endOfDay
    );
  }

  // =====================================================
  // ORDER
  // =====================================================

  query += ` ORDER BY c.id DESC`;

  // =====================================================
  // LOG QUERY
  // =====================================================

  logger.log(
    "\n========== FINAL SQL QUERY =========="
  );

  logger.log(query);

  logger.log(
    "\n========== PARAMS =========="
  );

  logger.log(request.parameters);

  // =====================================================
  // EXECUTE
  // =====================================================

  const result = await request.query(query);

  logger.log(
    "RESULT COUNT:",
    result.recordset.length
  );

  // =====================================================
  // FORMAT LOGO
  // =====================================================

  const formattedRecords = result.recordset.map(
    (record) => {
      let finalLogo = null;

      if (record.logo) {
        if (record.logo.startsWith("http")) {
          finalLogo = record.logo;
        } else {
          finalLogo = `${DOC_BASE_URL}${record.logo.replace(
            /\\/g,
            "/"
          )}`;
        }
      }

      return {
        ...record,
        logo_og_path: record.logo,
        logo: finalLogo,
      };
    }
  );

  return formattedRecords;
}

async function getAllBranches(client_id) {
  const pool = await poolPromise;

  const result = await pool.request().input("client_id", sql.Int, client_id)
    .query(`
      SELECT DISTINCT
        id,
        site_name,
        client_code,
        cc_site_hours
      FROM client_rates
      WHERE
        client_id = @client_id
        AND active = '0'
      ORDER BY site_name
    `);
  // console.log(result.recordset[0]);
  return result.recordset.map((row) => ({
    id: row.id,
    site_id: row.id,
    cc_site_hours: row.cc_site_hours,
    siteName: row.site_name,
    code: row.client_code,
    label: `${row.site_name} - ${row.client_code}`,
  }));
}
async function getAllCompanies(user) {
  const pool = await poolPromise;
  const isSuperAdmin =
    user?.is_superadmin === true ||
    Number(user?.id) === 1 ||
    String(user?.role).trim().toUpperCase() === "SUPER ADMIN" ||
    String(user?.role).trim().toUpperCase() === "SUPERADMIN";

  const request = pool.request();
  let filter = "WHERE active = '0'";

  if (!isSuperAdmin && user?.id) {
    request.input("userId", sql.Int, user.id);
    filter += ` AND (
      TRY_CAST(created_by AS INT) = @userId
      OR id IN (
        SELECT TRY_CAST(LTRIM(RTRIM(value)) AS INT)
        FROM STRING_SPLIT(
          (SELECT ISNULL(company_id, '') FROM users WHERE id = @userId),
          ','
        )
        WHERE LTRIM(RTRIM(value)) <> ''
      )
    )`;
  }

  const result = await request.query(`
      SELECT id,
        company_name FROM companies ${filter}
      ORDER BY company_name
    `);

  return result.recordset.map((row) => ({
    id: row.id,
    company_name: row.company_name,
    code: row.id,
  }));
}

async function getAllottedCompanies(user) {
  const pool = await poolPromise;
  const normalizedRole = user?.role?.trim().toUpperCase();
  const isSuperAdmin =
    user?.is_superadmin === true ||
    Number(user?.id) === 1 ||
    normalizedRole === "SUPER ADMIN" ||
    normalizedRole === "SUPERADMIN";

  const request = pool.request();
  let filter = "WHERE (active = '0' OR active = 0 OR active IS NULL)";

  if (!isSuperAdmin) {
    if (!user?.id) {
      return [];
    }

    request.input("userId", sql.Int, user.id);
    filter += ` AND id IN (
      SELECT TRY_CAST(LTRIM(RTRIM(value)) AS INT)
      FROM STRING_SPLIT(
        (SELECT ISNULL(company_id, '') FROM users WHERE id = @userId),
        ','
      )
      WHERE LTRIM(RTRIM(value)) <> ''
    )`;
  }

  const result = await request.query(`
    SELECT id, company_name
    FROM companies
    ${filter}
    ORDER BY company_name ASC
  `);

  return result.recordset.map((row) => ({
    id: row.id,
    company_name: row.company_name,
    name: row.company_name,
    companyName: row.company_name,
  }));
}
async function updateCompany(id, data, file, user) {
  await checkSuperadminProtection("companies", id, user);
  const pool = await poolPromise;

  const cleanValue = (value) => {
    if (
      value === undefined ||
      value === null ||
      value === "" ||
      value === "undefined" ||
      value === "null"
    ) {
      return null;
    }
    return value;
  };

  // Safe uppercase â€” won't crash if value is null/undefined
  const safeUpper = (value) => {
    const clean = cleanValue(value);
    return clean ? String(clean).toUpperCase() : null;
  };

  console.log(file);

  let oldLogo = data.old_logo || null;
  if (oldLogo) {
    if (oldLogo.includes("company_logos/")) {
      oldLogo = `company_logos/${oldLogo.split("company_logos/").pop()}`;
    } else if (oldLogo && !oldLogo.startsWith("company_logos/")) {
      // Just in case it's only a filename
      oldLogo = `company_logos/${oldLogo.replace("api/", "")}`;
    }
  }

  const logo = file ? getRelativePathFromApi(file) : oldLogo;

  // Check Company
  const check = await pool.request().input("id", sql.Int, id).query(`
      SELECT *
      FROM companies
      WHERE id = @id
    `);

  if (check.recordset.length === 0) {
    throw new Error("Company not found");
  }

  // Update
  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .input("company_name", sql.VarChar, safeUpper(data.company_name))
    .input("email_id", sql.VarChar, safeUpper(data.email_id))
    .input("address", sql.VarChar, safeUpper(data.address))
    .input("phone", sql.VarChar, safeUpper(data.phone))
    .input("city", sql.VarChar, safeUpper(data.city))
    .input("country", sql.VarChar, safeUpper(data.country))
    .input("pincode", sql.VarChar, safeUpper(data.pincode))
    .input("state", sql.VarChar, safeUpper(data.state))
    .input("statecode", sql.VarChar, safeUpper(data.statecode))
    .input(
      "contactable_person",
      sql.VarChar,
      safeUpper(data.contactable_person),
    )
    .input("currency", sql.VarChar, safeUpper(data.currency))
    .input("fin_from", sql.VarChar, safeUpper(data.fin_from))
    .input("fin_to", sql.VarChar, safeUpper(data.fin_to))
    .input("gst_no", sql.VarChar, safeUpper(data.gst_no))
    .input("website", sql.VarChar, safeUpper(data.website))
    .input("cin_no", sql.VarChar, safeUpper(data.cin_no))
    .input("vat_tin", sql.VarChar, safeUpper(data.vat_tin))
    .input("cst_tin", sql.VarChar, safeUpper(data.cst_tin))
    .input("iec", sql.VarChar, safeUpper(data.iec))
    .input("terms", sql.VarChar, safeUpper(data.terms))
    .input("invoiceprefix", sql.VarChar, safeUpper(data.invoiceprefix))
    .input("logo", sql.VarChar, logo)
    .input("source", sql.VarChar, data.source || "WEB")
    .input("modified_by", sql.Int, user.id)
    .input("modified_by_name", sql.VarChar, user.name).query(`
      UPDATE companies
      SET
        company_name=@company_name,
        source=@source,
        email_id=@email_id,
        address=@address,
        phone=@phone,
        city=@city,
        country=@country,
        pincode=@pincode,
        state=@state,
        statecode=@statecode,
        contactable_person=@contactable_person,
        currency=@currency,
        fin_from=@fin_from,
        fin_to=@fin_to,
        gst_no=@gst_no,
        website=@website,
        cin_no=@cin_no,
        vat_tin=@vat_tin,
        cst_tin=@cst_tin,
        iec=@iec,
        terms=@terms,
        invoiceprefix=@invoiceprefix,
        logo=@logo,
        modified_on=CONVERT(VARCHAR(19), DATEADD(MINUTE, 330, GETUTCDATE()), 120),
        modified_by=@modified_by,
        modified_by_name=@modified_by_name

      OUTPUT INSERTED.*

      WHERE id=@id
    `);

  const { logAction } = require("../utils/auditLogger");
  await logAction("companies", id, "UPDATE");

  return result.recordset[0];
}
async function deleteCompany(id, disabled_by, user) {
  await checkSuperadminProtection("companies", id, user);
  const pool = await poolPromise;
  const superadminStatus = isUserSuperAdmin(user) ? "1" : "0";

  await pool
    .request()
    .input("id", sql.Int, id)
    .input("disabled_by", sql.Int, disabled_by)
    .input("disabled_by_name", sql.VarChar, (user?.first_name || user?.fullname || user?.name) || null)
    .input("superadmin_status", sql.NVarChar, superadminStatus)
    .query(`
      UPDATE companies
      SET
        active = 1,
        superadmin_status = @superadmin_status,
        disabled_on = FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss'),
        disabled_by = @disabled_by,
        disabled_by_name = @disabled_by_name
      WHERE id = @id
    `);

  const { logAction } = require("../utils/auditLogger");
  await logAction("companies", id, "DELETE", pool);

  return true;
}

async function restoreCompany(id, user) {
  const pool = await poolPromise;

  const targetRes = await pool
    .request()
    .input("id", sql.Int, id)
    .query("SELECT id, superadmin_status FROM companies WHERE id = @id");
  const target = targetRes.recordset[0];

  if (target && String(target.superadmin_status) === "1" && !isUserSuperAdmin(user)) {
    throw new Error(
      "Access Denied: Records deactivated by Superadmin can only be restored by Superadmin."
    );
  }

  await pool
    .request()
    .input("id", sql.Int, id)
    .input("modified_by", sql.Int, user?.id || null)
    .input("modified_by_name", sql.VarChar, (user?.first_name || user?.fullname || user?.name) || null).query(`
      UPDATE companies
      SET
        active = 0,
        superadmin_status = '0',
        disabled_by = NULL,
        disabled_by_name = NULL,
        disabled_on = NULL,
        modified_on = FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss'),
        modified_by = @modified_by,
        modified_by_name = @modified_by_name
      WHERE id = @id
    `);

  const { logAction } = require("../utils/auditLogger");
  await logAction("companies", id, "RESTORE", pool);

  return true;
}


async function exportCompanies(
  searchFields,
  fromDate,
  toDate,
  user,
  activeStatus = 0
) {
  const pool = await poolPromise;
  const request = pool.request();

  const isSuperAdmin =
    user?.is_superadmin === true ||
    Number(user?.id) === 1 ||
    String(user?.role).trim().toUpperCase() === "SUPER ADMIN" ||
    String(user?.role).trim().toUpperCase() === "SUPERADMIN";

  // Validate status
  const status = Number(activeStatus) === 1 ? 1 : 0;

  request.input("activeStatus", sql.Int, status);

  let query = `
    SELECT id, company_name, email_id, address, phone, city, country,
           pincode, state, currency, contactable_person, pancard_no,
           registration_no, gst_no, swift_ac_no, website
    FROM companies
    WHERE active = @activeStatus
  `;

  if (!isSuperAdmin && user?.id) {
    request.input("userId", sql.Int, user.id);

    query += ` AND (
      TRY_CAST(created_by AS INT) = @userId
      OR id IN (
        SELECT TRY_CAST(LTRIM(RTRIM(value)) AS INT)
        FROM STRING_SPLIT(
          (SELECT ISNULL(company_id, '')
           FROM users WHERE id = @userId),
          ','
        )
        WHERE LTRIM(RTRIM(value)) <> ''
      )
    )`;
  }

  // Search filters
  if (searchFields && searchFields.length > 0) {
    searchFields.forEach((item, index) => {
      const colMap = {
        companyName: "company_name",
        city: "city",
        pincode: "pincode",
        contactPerson: "contactable_person",
        email: "email_id",
      };

      const columnName = colMap[item.field];

      // Ignore unsupported search fields
      if (!columnName || !item.keyword) return;

      const paramName = `search${index}`;

      query += ` AND ${columnName} LIKE @${paramName}`;

      request.input(paramName, `%${item.keyword}%`);
    });
  }

  // Date filters
  if (fromDate && toDate) {
    query += `
      AND created_on >= @from
      AND created_on < DATEADD(DAY, 1, @to)
    `;

    request.input("from", `${fromDate} 00:00:00`);
    request.input("to", `${toDate} 00:00:00`);
  }

  query += ` ORDER BY id DESC`;

  const result = await request.query(query);

  return result.recordset;
}


async function addBankDetails(companyId, banksArray, user) {
  const pool = await poolPromise;

  console.log("[MODEL addBankDetails] companyId:", companyId, "banksArray:", JSON.stringify(banksArray));
  // 1. Validate Array
  const banks = Array.isArray(banksArray) ? banksArray : [banksArray];

  // 2. Wrap in a Transaction to ensure data integrity
  const transaction = new sql.Transaction(pool);
  try {
    // Fetch company_name for logging outside transaction to prevent deadlock
    const companyNameResult = await pool
      .request()
      .input("cid", sql.Int, companyId)
      .query(`SELECT TOP 1 company_name FROM companies WHERE id = @cid`);
    const companyName = companyNameResult.recordset[0]?.company_name || "";

    await transaction.begin();

    // 3. Fetch existing active records for this company
    const existingResult = await transaction
      .request()
      .input("companyId", sql.Int, companyId)
      .query(`SELECT id FROM company_bank_detail WHERE company_id = @companyId AND active = 0`);
    const existingIds = existingResult.recordset.map((row) => row.id);
    const receivedIds = [];

    // Safe uppercase function
    const safeUpper = (val) => val ? String(val).toUpperCase().trim() : null;

    // 4. Process incoming records
    for (const data of banks) {
      if (!data.bank_name && !data.ac_no && !data.ifsc_code) continue;

      const safeAcNo = safeUpper(data.ac_no);
      const safeAcType = safeUpper(data.ac_type);
      const safeBankName = safeUpper(data.bank_name);
      const safeIfsc = safeUpper(data.ifsc_code);
      const safeMicr = safeUpper(data.micr_no);
      const safeBranchCity = safeUpper(data.branch_city);
      const safeBranchAddress = safeUpper(data.branch_address);
      const safeSwift = safeUpper(data.swift_ac_no);

      if (data.id) {
        // UPDATE Existing
        receivedIds.push(data.id);
        await transaction
          .request()
          .input("id", sql.Int, data.id)
          .input("company_id", sql.Int, companyId)
          .input("ac_no", sql.VarChar, safeAcNo)
          .input("ac_type", sql.VarChar, safeAcType)
          .input("bank_name", sql.VarChar, safeBankName)
          .input("ifsc_code", sql.VarChar, safeIfsc)
          .input("micr_no", sql.VarChar, safeMicr)
          .input("branch_city", sql.VarChar, safeBranchCity)
          .input("branch_address", sql.VarChar, safeBranchAddress)
          .input("swift_ac_no", sql.VarChar, safeSwift)
          .query(`
            UPDATE company_bank_detail 
            SET ac_no = @ac_no, ac_type = @ac_type, bank_name = @bank_name, 
                ifsc_code = @ifsc_code, micr_no = @micr_no, branch_city = @branch_city, 
                branch_address = @branch_address, swift_ac_no = @swift_ac_no
            WHERE id = @id AND company_id = @company_id
          `);
        
        // Log as UPDATE
        await logAction("company_bank_detail", data.id, "UPDATE", transaction);
      } else {
        // INSERT New
        const insertedRow = await transaction
          .request()
          .input("company_id", sql.Int, companyId)
          .input("company_name", sql.VarChar, companyName)
          .input("ac_no", sql.VarChar, safeAcNo)
          .input("ac_type", sql.VarChar, safeAcType)
          .input("bank_name", sql.VarChar, safeBankName)
          .input("ifsc_code", sql.VarChar, safeIfsc)
          .input("micr_no", sql.VarChar, safeMicr)
          .input("branch_city", sql.VarChar, safeBranchCity)
          .input("branch_address", sql.VarChar, safeBranchAddress)
          .input("swift_ac_no", sql.VarChar, safeSwift)
          .input("source", sql.VarChar, "WEB").query(`
            INSERT INTO company_bank_detail 
            (company_id, company_name, ac_no, ac_type, bank_name, ifsc_code, micr_no, branch_city, active, branch_address, swift_ac_no, source)
            OUTPUT INSERTED.id
            VALUES 
            (@company_id, @company_name, @ac_no, @ac_type, @bank_name, @ifsc_code, @micr_no, @branch_city, 0, @branch_address, @swift_ac_no, @source)
          `);

        const newBankId = insertedRow.recordset[0]?.id;
        if (newBankId) {
          // Log as CREATE
          await logAction("company_bank_detail", newBankId, "CREATE", transaction);
        }
      }
    }

    // 5. Soft Delete missing records
    const idsToDelete = existingIds.filter(id => !receivedIds.includes(id));
    for (const deleteId of idsToDelete) {
      await transaction
        .request()
        .input("id", sql.Int, deleteId)
        .input("company_id", sql.Int, companyId)
        .query(`UPDATE company_bank_detail SET active = 1 WHERE id = @id AND company_id = @company_id`);
      
      // Log as DELETE
      await logAction("company_bank_detail", deleteId, "DELETE", transaction);
    }

    await transaction.commit();

    return {
      statusCode: 200,
      response: { success: true, message: "Bank details synced successfully" },
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function getCompanyBankDetails(companyId) {
  const pool = await poolPromise;

  const result = await pool.request().input("companyId", sql.Int, companyId)
    .query(`
      SELECT *
      FROM company_bank_detail
      WHERE
        company_id = @companyId
        AND active = 0
      ORDER BY id DESC
    `);

  return result.recordset;
}

module.exports = {
  createCompany,
  getCompanies,
  getAllBranches,
  getAllCompanies,
  getAllottedCompanies,
  updateCompany,
  deleteCompany,
  restoreCompany,
  addBankDetails,
  getCompanyBankDetails,
  exportCompanies,
};
