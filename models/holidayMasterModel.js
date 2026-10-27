const sql = require("mssql");
const { poolPromise } = require("../config/db");

const holidayMasterModel = {
  // ============================================================
  // GET COMPANIES
  //
  // SUPER ADMIN -> All active companies
  // ADMIN       -> Only assigned company
  // ============================================================
  getCompanies: async ({ role, company_id } = {}) => {
    try {
      const pool = await poolPromise;
      const request = pool.request();

      let query = `
        SELECT
          id,
          company_name
        FROM companies
        WHERE active = 0
      `;

      if (String(role || "").toUpperCase() === "ADMIN") {
        query += ` AND id = @companyId`;
        request.input("companyId", sql.Int, company_id);
      }

      query += `
        ORDER BY company_name ASC
      `;

      const result = await request.query(query);

      return result.recordset;
    } catch (error) {
      console.error("Error in getCompanies:", error);
      throw error;
    }
  },

  // ============================================================
// GET CLIENTS BY COMPANY
//
// companies.id = new_client.billing_company_id
//
// new_client.id            -> client_id
// new_client.company_name  -> client_name
// ============================================================
getClientsByCompany: async ({
  company_id,
  role,
  user_company_id,
} = {}) => {
  try {
    const pool = await poolPromise;

    const request = pool.request();

    // ----------------------------------------------------------
    // ADMIN SECURITY
    // ----------------------------------------------------------
    if (
      String(role || "").toUpperCase() === "ADMIN" &&
      Number(company_id) !== Number(user_company_id)
    ) {
      const error = new Error(
        "Client does not belong to your assigned company"
      );

      error.statusCode = 403;

      throw error;
    }

    request.input(
      "companyId",
      sql.Int,
      company_id
    );

    const result = await request.query(`
      SELECT
        id AS client_id,
        company_name AS client_name,
        billing_company_id,
        billing_company,
        active

      FROM new_client

      WHERE billing_company_id = @companyId
        AND active = 0

      ORDER BY company_name ASC
    `);

    return result.recordset;
  } catch (error) {
    console.error(
      "Error in getClientsByCompany:",
      error
    );

    throw error;
  }
},

  // ============================================================
  // GET SITES BY CLIENT
  //
  // client_rates.client_id = new_client.id
  //
  // client_rates.id        -> site_id
  // client_rates.site_name -> site_name
  //
  // Only active sites
  // active = 0 means active
  // ============================================================
  getSitesByClient: async ({
    client_id,
    role,
    user_company_id,
  } = {}) => {
    try {
      const pool = await poolPromise;
      const request = pool.request();

      request.input("clientId", sql.Int, client_id);

      let query = `
        SELECT
          cr.id AS site_id,
          cr.site_name,
          cr.client_id,
          nc.company_name AS client_name,
          nc.billing_company_id AS company_id
        FROM client_rates cr
        INNER JOIN new_client nc
          ON nc.id = cr.client_id
        WHERE cr.client_id = @clientId
          AND cr.active = 0
          AND nc.active = 0
      `;

      // ADMIN can only access sites of clients
      // belonging to his assigned company.
      if (String(role || "").toUpperCase() === "ADMIN") {
        query += `
          AND nc.billing_company_id = @userCompanyId
        `;

        request.input(
          "userCompanyId",
          sql.Int,
          user_company_id
        );
      }

      query += `
        ORDER BY cr.site_name ASC
      `;

      const result = await request.query(query);

      return result.recordset;
    } catch (error) {
      console.error("Error in getSitesByClient:", error);
      throw error;
    }
  },

  // ============================================================
  // GET HOLIDAY MASTER LIST
  //
  // SUPER ADMIN -> All holidays
  // ADMIN       -> Controller passes only his company_id
  //
  // Filters:
  // financial_year
  // company_id
  // client_id
  // site_id
  // active
  // ============================================================
  getHolidays: async ({
    financial_year,
    company_id,
    client_id,
    site_id,
    active,
  } = {}) => {
    try {
      const pool = await poolPromise;
      const request = pool.request();

      let query = `
        SELECT
          id,
          financial_year,
          holiday_date,
          holiday_name,
          holiday_type,

          company_id,
          company_name,

          client_id,
          client_name,

          site_id,
          site_name,

          description,
          active,

          created_at,
          created_by,
          created_by_name,

          modified_at,
          modified_by,
          modified_by_name

        FROM holiday_master
        WHERE 1 = 1
      `;

      // ----------------------------------------------------------
      // Financial Year
      // ----------------------------------------------------------
      if (financial_year) {
        query += `
          AND financial_year = @financialYear
        `;

        request.input(
          "financialYear",
          sql.VarChar(9),
          financial_year
        );
      }

      // ----------------------------------------------------------
      // Company
      // ----------------------------------------------------------
      if (
        company_id !== undefined &&
        company_id !== null &&
        company_id !== ""
      ) {
        query += `
          AND company_id = @companyId
        `;

        request.input(
          "companyId",
          sql.Int,
          company_id
        );
      }

      // ----------------------------------------------------------
      // Client
      // ----------------------------------------------------------
      if (
        client_id !== undefined &&
        client_id !== null &&
        client_id !== ""
      ) {
        query += `
          AND client_id = @clientId
        `;

        request.input(
          "clientId",
          sql.Int,
          client_id
        );
      }

      // ----------------------------------------------------------
      // Site
      // ----------------------------------------------------------
      if (
        site_id !== undefined &&
        site_id !== null &&
        site_id !== ""
      ) {
        query += `
          AND site_id = @siteId
        `;

        request.input(
          "siteId",
          sql.Int,
          site_id
        );
      }

      // ----------------------------------------------------------
      // Active
      // ----------------------------------------------------------
      if (
        active !== undefined &&
        active !== null &&
        active !== ""
      ) {
        query += `
          AND active = @active
        `;

        request.input(
          "active",
          sql.Int,
          active
        );
      }

      query += `
        ORDER BY
          holiday_date ASC,
          company_name ASC,
          client_name ASC,
          site_name ASC
      `;

      const result = await request.query(query);

      return result.recordset;
    } catch (error) {
      console.error("Error in getHolidays:", error);
      throw error;
    }
  },

  // ============================================================
  // GET HOLIDAY BY ID
  // ============================================================
  getHolidayById: async ({
    id,
    role,
    company_id,
  }) => {
    try {
      const pool = await poolPromise;
      const request = pool.request();

      request.input("id", sql.Int, id);

      let query = `
        SELECT
          id,
          financial_year,
          holiday_date,
          holiday_name,
          holiday_type,

          company_id,
          company_name,

          client_id,
          client_name,

          site_id,
          site_name,

          description,
          active,

          created_at,
          created_by,
          created_by_name,

          modified_at,
          modified_by,
          modified_by_name

        FROM holiday_master
        WHERE id = @id
      `;

      if (String(role || "").toUpperCase() === "ADMIN") {
        query += `
          AND company_id = @companyId
        `;

        request.input(
          "companyId",
          sql.Int,
          company_id
        );
      }

      const result = await request.query(query);

      return result.recordset[0] || null;
    } catch (error) {
      console.error("Error in getHolidayById:", error);
      throw error;
    }
  },

  // ============================================================
  // CREATE HOLIDAY MASTER
  //
  // One holiday can be created for MULTIPLE SITES.
  //
  // Example:
  //
  // company_id = 1
  // client_id = 5
  // site_ids  = [10, 11, 12]
  //
  // Creates:
  //
  // holiday_master -> site 10
  // holiday_master -> site 11
  // holiday_master -> site 12
  //
  // And creates 3 corresponding log rows.
  // ============================================================
  createHoliday: async ({
    financial_year,
    holiday_date,
    holiday_name,
    holiday_type,

    company_id,
    client_id,
    site_ids,

    description,

    created_by,
    created_by_name,

    role,
    user_company_id,
  }) => {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      // ========================================================
      // ADMIN COMPANY ACCESS VALIDATION
      // ========================================================
      if (
        String(role || "").toUpperCase() === "ADMIN" &&
        Number(company_id) !== Number(user_company_id)
      ) {
        const error = new Error(
          "You are not authorized to create holiday for this company"
        );

        error.statusCode = 403;
        throw error;
      }

      // ========================================================
      // VALIDATE COMPANY
      // ========================================================
      const companyResult = await new sql.Request(transaction)
        .input("companyId", sql.Int, company_id)
        .query(`
          SELECT
            id,
            company_name
          FROM companies
          WHERE id = @companyId
            AND active = 0
        `);

      if (companyResult.recordset.length === 0) {
        throw new Error(
          "Selected company not found or inactive"
        );
      }

      const company = companyResult.recordset[0];

      // ========================================================
      // VALIDATE CLIENT
      //
      // new_client.billing_company_id = company.id
      // ========================================================
      const clientResult = await new sql.Request(transaction)
        .input("clientId", sql.Int, client_id)
        .input("companyId", sql.Int, company_id)
        .query(`
          SELECT
            id,
            company_name AS client_name,
            billing_company_id
          FROM new_client
          WHERE id = @clientId
            AND billing_company_id = @companyId
            AND active = 0
        `);

      if (clientResult.recordset.length === 0) {
        throw new Error(
          "Selected client not found, inactive, or does not belong to selected company"
        );
      }

      const client = clientResult.recordset[0];

      // ========================================================
      // VALIDATE SITE IDS
      // ========================================================
      if (!Array.isArray(site_ids) || site_ids.length === 0) {
        throw new Error(
          "At least one site must be selected"
        );
      }

      // Convert to numbers and remove duplicates
      const selectedSiteIds = [
        ...new Set(
          site_ids
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id))
        ),
      ];

      if (selectedSiteIds.length === 0) {
        throw new Error(
          "Invalid site selection"
        );
      }

      // ========================================================
      // GET VALID SITES
      //
      // client_rates.client_id = client.id
      // ========================================================
      const siteResult = await new sql.Request(transaction)
        .input("clientId", sql.Int, client.id)
        .query(`
          SELECT
            id AS site_id,
            site_name,
            client_id
          FROM client_rates
          WHERE client_id = @clientId
            AND active = 0
        `);

      const availableSites = siteResult.recordset;

      const validSites = availableSites.filter((site) =>
        selectedSiteIds.includes(Number(site.site_id))
      );

      if (validSites.length !== selectedSiteIds.length) {
        throw new Error(
          "One or more selected sites are invalid, inactive, or do not belong to selected client"
        );
      }

      const createdRows = [];

      // ========================================================
      // CREATE ONE HOLIDAY FOR EACH SITE
      // ========================================================
      for (const site of validSites) {
        const request = new sql.Request(transaction);

        request.input(
          "financialYear",
          sql.VarChar(9),
          financial_year
        );

        request.input(
          "holidayDate",
          sql.Date,
          holiday_date
        );

        request.input(
          "holidayName",
          sql.VarChar(150),
          holiday_name
        );

        request.input(
          "holidayType",
          sql.VarChar(50),
          holiday_type || null
        );

        request.input(
          "companyId",
          sql.Int,
          company.id
        );

        request.input(
          "companyName",
          sql.VarChar(200),
          company.company_name
        );

        request.input(
          "clientId",
          sql.Int,
          client.id
        );

        request.input(
          "clientName",
          sql.VarChar(200),
          client.client_name
        );

        request.input(
          "siteId",
          sql.Int,
          site.site_id
        );

        request.input(
          "siteName",
          sql.VarChar(200),
          site.site_name
        );

        request.input(
          "description",
          sql.VarChar(500),
          description || null
        );

        request.input(
          "createdBy",
          sql.Int,
          created_by || null
        );

        request.input(
          "createdByName",
          sql.VarChar(200),
          created_by_name || null
        );

        // ======================================================
        // INSERT MAIN HOLIDAY
        //
        // branch_id / branch_name are kept NULL because
        // Holiday Master is now Company -> Client -> Site.
        // ======================================================
        const holidayResult = await request.query(`
          INSERT INTO holiday_master (
            financial_year,
            holiday_date,
            holiday_name,
            holiday_type,

            company_id,
            company_name,

            client_id,
            client_name,

            site_id,
            site_name,

            branch_id,
            branch_name,

            description,
            active,

            created_at,
            created_by,
            created_by_name
          )
          OUTPUT
            INSERTED.id,
            INSERTED.financial_year,
            INSERTED.holiday_date,
            INSERTED.holiday_name,
            INSERTED.holiday_type,

            INSERTED.company_id,
            INSERTED.company_name,

            INSERTED.client_id,
            INSERTED.client_name,

            INSERTED.site_id,
            INSERTED.site_name,

            INSERTED.branch_id,
            INSERTED.branch_name,

            INSERTED.description,
            INSERTED.active,

            INSERTED.created_at,
            INSERTED.created_by,
            INSERTED.created_by_name

          VALUES (
            @financialYear,
            @holidayDate,
            @holidayName,
            @holidayType,

            @companyId,
            @companyName,

            @clientId,
            @clientName,

            @siteId,
            @siteName,

            NULL,
            NULL,

            @description,
            0,

            GETDATE(),
            @createdBy,
            @createdByName
          )
        `);

        const insertedHoliday =
          holidayResult.recordset[0];

        // ======================================================
        // INSERT LOG
        //
        // IMPORTANT:
        // client_id
        // client_name
        // site_id
        // site_name
        //
        // All values are stored in holiday_master_log.
        // ======================================================
        const logRequest =
          new sql.Request(transaction);

        logRequest.input(
          "holidayMasterId",
          sql.Int,
          insertedHoliday.id
        );

        logRequest.input(
          "financialYear",
          sql.VarChar(9),
          insertedHoliday.financial_year
        );

        logRequest.input(
          "holidayDate",
          sql.Date,
          insertedHoliday.holiday_date
        );

        logRequest.input(
          "holidayName",
          sql.VarChar(150),
          insertedHoliday.holiday_name
        );

        logRequest.input(
          "holidayType",
          sql.VarChar(50),
          insertedHoliday.holiday_type
        );

        logRequest.input(
          "companyId",
          sql.Int,
          insertedHoliday.company_id
        );

        logRequest.input(
          "companyName",
          sql.VarChar(200),
          insertedHoliday.company_name
        );

        // NEW CLIENT VALUES
        logRequest.input(
          "clientId",
          sql.Int,
          insertedHoliday.client_id
        );

        logRequest.input(
          "clientName",
          sql.VarChar(200),
          insertedHoliday.client_name
        );

        // NEW SITE VALUES
        logRequest.input(
          "siteId",
          sql.Int,
          insertedHoliday.site_id
        );

        logRequest.input(
          "siteName",
          sql.VarChar(200),
          insertedHoliday.site_name
        );

        logRequest.input(
          "description",
          sql.VarChar(500),
          insertedHoliday.description
        );

        logRequest.input(
          "active",
          sql.Int,
          insertedHoliday.active
        );

        logRequest.input(
          "createdAt",
          sql.DateTime2,
          insertedHoliday.created_at
        );

        logRequest.input(
          "createdBy",
          sql.Int,
          insertedHoliday.created_by
        );

        logRequest.input(
          "createdByName",
          sql.VarChar(200),
          insertedHoliday.created_by_name
        );

        logRequest.input(
          "logCreatedBy",
          sql.Int,
          created_by || null
        );

        logRequest.input(
          "logCreatedByName",
          sql.VarChar(200),
          created_by_name || null
        );

        await logRequest.query(`
          INSERT INTO holiday_master_log (
            holiday_master_id,

            financial_year,
            holiday_date,
            holiday_name,
            holiday_type,

            company_id,
            company_name,

            client_id,
            client_name,

            site_id,
            site_name,

            branch_id,
            branch_name,

            description,
            active,

            created_at,
            created_by,
            created_by_name,

            modified_at,
            modified_by,
            modified_by_name,

            log_action,
            log_created_at,
            log_created_by,
            log_created_by_name
          )
          VALUES (
            @holidayMasterId,

            @financialYear,
            @holidayDate,
            @holidayName,
            @holidayType,

            @companyId,
            @companyName,

            @clientId,
            @clientName,

            @siteId,
            @siteName,

            NULL,
            NULL,

            @description,
            @active,

            @createdAt,
            @createdBy,
            @createdByName,

            NULL,
            NULL,
            NULL,

            'INSERT',
            GETDATE(),
            @logCreatedBy,
            @logCreatedByName
          )
        `);

        createdRows.push(insertedHoliday);
      }

      // ========================================================
      // COMMIT
      // ========================================================
      await transaction.commit();

      return createdRows;
    } catch (error) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error(
          "Rollback error:",
          rollbackError
        );
      }

      console.error(
        "Error in createHoliday:",
        error
      );

      throw error;
    }
  },

  // ============================================================
  // UPDATE HOLIDAY
  //
  // One holiday_master row = one site.
  // Therefore update uses single site_id.
  // ============================================================
  updateHoliday: async ({
    id,

    financial_year,
    holiday_date,
    holiday_name,
    holiday_type,

    company_id,
    client_id,
    site_id,

    description,
    active,

    modified_by,
    modified_by_name,

    role,
    user_company_id,
  }) => {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      // ========================================================
      // ADMIN COMPANY ACCESS
      // ========================================================
      if (
        String(role || "").toUpperCase() === "ADMIN" &&
        Number(company_id) !== Number(user_company_id)
      ) {
        const error = new Error(
          "You are not authorized to update holiday for this company"
        );

        error.statusCode = 403;
        throw error;
      }

      // ========================================================
      // GET EXISTING HOLIDAY
      // ========================================================
      const existingResult =
        await new sql.Request(transaction)
          .input("id", sql.Int, id)
          .query(`
            SELECT *
            FROM holiday_master
            WHERE id = @id
          `);

      if (existingResult.recordset.length === 0) {
        throw new Error("Holiday not found");
      }

      const existingHoliday =
        existingResult.recordset[0];

      // ========================================================
      // ADMIN CANNOT UPDATE ANOTHER COMPANY HOLIDAY
      // ========================================================
      if (
        String(role || "").toUpperCase() === "ADMIN" &&
        Number(existingHoliday.company_id) !==
          Number(user_company_id)
      ) {
        const error = new Error(
          "You are not authorized to update this holiday"
        );

        error.statusCode = 403;
        throw error;
      }

      // ========================================================
      // VALIDATE COMPANY
      // ========================================================
      const companyResult =
        await new sql.Request(transaction)
          .input("companyId", sql.Int, company_id)
          .query(`
            SELECT
              id,
              company_name
            FROM companies
            WHERE id = @companyId
              AND active = 0
          `);

      if (companyResult.recordset.length === 0) {
        throw new Error(
          "Selected company not found or inactive"
        );
      }

      const company =
        companyResult.recordset[0];

      // ========================================================
      // VALIDATE CLIENT
      // ========================================================
      const clientResult =
        await new sql.Request(transaction)
          .input("clientId", sql.Int, client_id)
          .input("companyId", sql.Int, company_id)
          .query(`
            SELECT
              id,
              company_name AS client_name,
              billing_company_id
            FROM new_client
            WHERE id = @clientId
              AND billing_company_id = @companyId
              AND active = 0
          `);

      if (clientResult.recordset.length === 0) {
        throw new Error(
          "Selected client not found, inactive, or does not belong to selected company"
        );
      }

      const client =
        clientResult.recordset[0];

      // ========================================================
      // VALIDATE SITE
      // ========================================================
      const siteResult =
        await new sql.Request(transaction)
          .input("siteId", sql.Int, site_id)
          .input("clientId", sql.Int, client_id)
          .query(`
            SELECT
              id AS site_id,
              site_name,
              client_id
            FROM client_rates
            WHERE id = @siteId
              AND client_id = @clientId
              AND active = 0
          `);

      if (siteResult.recordset.length === 0) {
        throw new Error(
          "Selected site not found, inactive, or does not belong to selected client"
        );
      }

      const site =
        siteResult.recordset[0];

      // ========================================================
      // UPDATE MAIN TABLE
      // ========================================================
      const updateRequest =
        new sql.Request(transaction);

      updateRequest.input(
        "id",
        sql.Int,
        id
      );

      updateRequest.input(
        "financialYear",
        sql.VarChar(9),
        financial_year
      );

      updateRequest.input(
        "holidayDate",
        sql.Date,
        holiday_date
      );

      updateRequest.input(
        "holidayName",
        sql.VarChar(150),
        holiday_name
      );

      updateRequest.input(
        "holidayType",
        sql.VarChar(50),
        holiday_type || null
      );

      updateRequest.input(
        "companyId",
        sql.Int,
        company.id
      );

      updateRequest.input(
        "companyName",
        sql.VarChar(200),
        company.company_name
      );

      updateRequest.input(
        "clientId",
        sql.Int,
        client.id
      );

      updateRequest.input(
        "clientName",
        sql.VarChar(200),
        client.client_name
      );

      updateRequest.input(
        "siteId",
        sql.Int,
        site.site_id
      );

      updateRequest.input(
        "siteName",
        sql.VarChar(200),
        site.site_name
      );

      updateRequest.input(
        "description",
        sql.VarChar(500),
        description || null
      );

      updateRequest.input(
        "active",
        sql.Int,
        active !== undefined ? active : 0
      );

      updateRequest.input(
        "modifiedBy",
        sql.Int,
        modified_by || null
      );

      updateRequest.input(
        "modifiedByName",
        sql.VarChar(200),
        modified_by_name || null
      );

      const updateResult =
        await updateRequest.query(`
          UPDATE holiday_master
          SET
            financial_year = @financialYear,
            holiday_date = @holidayDate,
            holiday_name = @holidayName,
            holiday_type = @holidayType,

            company_id = @companyId,
            company_name = @companyName,

            client_id = @clientId,
            client_name = @clientName,

            site_id = @siteId,
            site_name = @siteName,

            branch_id = NULL,
            branch_name = NULL,

            description = @description,
            active = @active,

            modified_at = GETDATE(),
            modified_by = @modifiedBy,
            modified_by_name = @modifiedByName

          OUTPUT
            INSERTED.id,

            INSERTED.financial_year,
            INSERTED.holiday_date,
            INSERTED.holiday_name,
            INSERTED.holiday_type,

            INSERTED.company_id,
            INSERTED.company_name,

            INSERTED.client_id,
            INSERTED.client_name,

            INSERTED.site_id,
            INSERTED.site_name,

            INSERTED.branch_id,
            INSERTED.branch_name,

            INSERTED.description,
            INSERTED.active,

            INSERTED.created_at,
            INSERTED.created_by,
            INSERTED.created_by_name,

            INSERTED.modified_at,
            INSERTED.modified_by,
            INSERTED.modified_by_name

          WHERE id = @id
        `);

      const updatedHoliday =
        updateResult.recordset[0];

      // ========================================================
      // INSERT UPDATE LOG
      //
      // IMPORTANT:
      // New client/site values are stored here too.
      // ========================================================
      const logRequest =
        new sql.Request(transaction);

      logRequest.input(
        "holidayMasterId",
        sql.Int,
        updatedHoliday.id
      );

      logRequest.input(
        "financialYear",
        sql.VarChar(9),
        updatedHoliday.financial_year
      );

      logRequest.input(
        "holidayDate",
        sql.Date,
        updatedHoliday.holiday_date
      );

      logRequest.input(
        "holidayName",
        sql.VarChar(150),
        updatedHoliday.holiday_name
      );

      logRequest.input(
        "holidayType",
        sql.VarChar(50),
        updatedHoliday.holiday_type
      );

      logRequest.input(
        "companyId",
        sql.Int,
        updatedHoliday.company_id
      );

      logRequest.input(
        "companyName",
        sql.VarChar(200),
        updatedHoliday.company_name
      );

      // CLIENT
      logRequest.input(
        "clientId",
        sql.Int,
        updatedHoliday.client_id
      );

      logRequest.input(
        "clientName",
        sql.VarChar(200),
        updatedHoliday.client_name
      );

      // SITE
      logRequest.input(
        "siteId",
        sql.Int,
        updatedHoliday.site_id
      );

      logRequest.input(
        "siteName",
        sql.VarChar(200),
        updatedHoliday.site_name
      );

      logRequest.input(
        "description",
        sql.VarChar(500),
        updatedHoliday.description
      );

      logRequest.input(
        "active",
        sql.Int,
        updatedHoliday.active
      );

      logRequest.input(
        "createdAt",
        sql.DateTime2,
        updatedHoliday.created_at
      );

      logRequest.input(
        "createdBy",
        sql.Int,
        updatedHoliday.created_by
      );

      logRequest.input(
        "createdByName",
        sql.VarChar(200),
        updatedHoliday.created_by_name
      );

      logRequest.input(
        "modifiedAt",
        sql.DateTime2,
        updatedHoliday.modified_at
      );

      logRequest.input(
        "modifiedBy",
        sql.Int,
        updatedHoliday.modified_by
      );

      logRequest.input(
        "modifiedByName",
        sql.VarChar(200),
        updatedHoliday.modified_by_name
      );

      logRequest.input(
        "logCreatedBy",
        sql.Int,
        modified_by || null
      );

      logRequest.input(
        "logCreatedByName",
        sql.VarChar(200),
        modified_by_name || null
      );

      await logRequest.query(`
        INSERT INTO holiday_master_log (
          holiday_master_id,

          financial_year,
          holiday_date,
          holiday_name,
          holiday_type,

          company_id,
          company_name,

          client_id,
          client_name,

          site_id,
          site_name,

          branch_id,
          branch_name,

          description,
          active,

          created_at,
          created_by,
          created_by_name,

          modified_at,
          modified_by,
          modified_by_name,

          log_action,
          log_created_at,
          log_created_by,
          log_created_by_name
        )
        VALUES (
          @holidayMasterId,

          @financialYear,
          @holidayDate,
          @holidayName,
          @holidayType,

          @companyId,
          @companyName,

          @clientId,
          @clientName,

          @siteId,
          @siteName,

          NULL,
          NULL,

          @description,
          @active,

          @createdAt,
          @createdBy,
          @createdByName,

          @modifiedAt,
          @modifiedBy,
          @modifiedByName,

          'UPDATE',
          GETDATE(),
          @logCreatedBy,
          @logCreatedByName
        )
      `);

      // ========================================================
      // COMMIT
      // ========================================================
      await transaction.commit();

      return updatedHoliday;
    } catch (error) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error(
          "Rollback error:",
          rollbackError
        );
      }

      console.error(
        "Error in updateHoliday:",
        error
      );

      throw error;
    }
  },

  // ============================================================
  // SOFT DELETE HOLIDAY
  //
  // active = 1 => inactive
  //
  // Log will contain:
  // company
  // client
  // site
  // ============================================================
  deleteHoliday: async ({
    id,
    modified_by,
    modified_by_name,

    role,
    company_id,
  }) => {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      // ========================================================
      // GET EXISTING HOLIDAY
      // ========================================================
      const existingResult =
        await new sql.Request(transaction)
          .input("id", sql.Int, id)
          .query(`
            SELECT *
            FROM holiday_master
            WHERE id = @id
          `);

      if (existingResult.recordset.length === 0) {
        throw new Error("Holiday not found");
      }

      const existingHoliday =
        existingResult.recordset[0];

      // ========================================================
      // ADMIN ACCESS VALIDATION
      // ========================================================
      if (
        String(role || "").toUpperCase() === "ADMIN" &&
        Number(existingHoliday.company_id) !==
          Number(company_id)
      ) {
        const error = new Error(
          "You are not authorized to delete this holiday"
        );

        error.statusCode = 403;
        throw error;
      }

      // ========================================================
      // SOFT DELETE
      // active = 1
      // ========================================================
      const updateRequest =
        new sql.Request(transaction);

      updateRequest.input(
        "id",
        sql.Int,
        id
      );

      updateRequest.input(
        "modifiedBy",
        sql.Int,
        modified_by || null
      );

      updateRequest.input(
        "modifiedByName",
        sql.VarChar(200),
        modified_by_name || null
      );

      const result =
        await updateRequest.query(`
          UPDATE holiday_master
          SET
            active = 1,
            modified_at = GETDATE(),
            modified_by = @modifiedBy,
            modified_by_name = @modifiedByName

          OUTPUT
            INSERTED.id,

            INSERTED.financial_year,
            INSERTED.holiday_date,
            INSERTED.holiday_name,
            INSERTED.holiday_type,

            INSERTED.company_id,
            INSERTED.company_name,

            INSERTED.client_id,
            INSERTED.client_name,

            INSERTED.site_id,
            INSERTED.site_name,

            INSERTED.branch_id,
            INSERTED.branch_name,

            INSERTED.description,
            INSERTED.active,

            INSERTED.created_at,
            INSERTED.created_by,
            INSERTED.created_by_name,

            INSERTED.modified_at,
            INSERTED.modified_by,
            INSERTED.modified_by_name

          WHERE id = @id
        `);

      const deletedHoliday =
        result.recordset[0];

      // ========================================================
      // INSERT DELETE LOG
      //
      // IMPORTANT:
      // client_id/client_name/site_id/site_name
      // are stored here.
      // ========================================================
      const logRequest =
        new sql.Request(transaction);

      logRequest.input(
        "holidayMasterId",
        sql.Int,
        deletedHoliday.id
      );

      logRequest.input(
        "financialYear",
        sql.VarChar(9),
        deletedHoliday.financial_year
      );

      logRequest.input(
        "holidayDate",
        sql.Date,
        deletedHoliday.holiday_date
      );

      logRequest.input(
        "holidayName",
        sql.VarChar(150),
        deletedHoliday.holiday_name
      );

      logRequest.input(
        "holidayType",
        sql.VarChar(50),
        deletedHoliday.holiday_type
      );

      logRequest.input(
        "companyId",
        sql.Int,
        deletedHoliday.company_id
      );

      logRequest.input(
        "companyName",
        sql.VarChar(200),
        deletedHoliday.company_name
      );

      // CLIENT
      logRequest.input(
        "clientId",
        sql.Int,
        deletedHoliday.client_id
      );

      logRequest.input(
        "clientName",
        sql.VarChar(200),
        deletedHoliday.client_name
      );

      // SITE
      logRequest.input(
        "siteId",
        sql.Int,
        deletedHoliday.site_id
      );

      logRequest.input(
        "siteName",
        sql.VarChar(200),
        deletedHoliday.site_name
      );

      logRequest.input(
        "description",
        sql.VarChar(500),
        deletedHoliday.description
      );

      logRequest.input(
        "active",
        sql.Int,
        deletedHoliday.active
      );

      logRequest.input(
        "createdAt",
        sql.DateTime2,
        deletedHoliday.created_at
      );

      logRequest.input(
        "createdBy",
        sql.Int,
        deletedHoliday.created_by
      );

      logRequest.input(
        "createdByName",
        sql.VarChar(200),
        deletedHoliday.created_by_name
      );

      logRequest.input(
        "modifiedAt",
        sql.DateTime2,
        deletedHoliday.modified_at
      );

      logRequest.input(
        "modifiedBy",
        sql.Int,
        deletedHoliday.modified_by
      );

      logRequest.input(
        "modifiedByName",
        sql.VarChar(200),
        deletedHoliday.modified_by_name
      );

      logRequest.input(
        "logCreatedBy",
        sql.Int,
        modified_by || null
      );

      logRequest.input(
        "logCreatedByName",
        sql.VarChar(200),
        modified_by_name || null
      );

      await logRequest.query(`
        INSERT INTO holiday_master_log (
          holiday_master_id,

          financial_year,
          holiday_date,
          holiday_name,
          holiday_type,

          company_id,
          company_name,

          client_id,
          client_name,

          site_id,
          site_name,

          branch_id,
          branch_name,

          description,
          active,

          created_at,
          created_by,
          created_by_name,

          modified_at,
          modified_by,
          modified_by_name,

          log_action,
          log_created_at,
          log_created_by,
          log_created_by_name
        )
        VALUES (
          @holidayMasterId,

          @financialYear,
          @holidayDate,
          @holidayName,
          @holidayType,

          @companyId,
          @companyName,

          @clientId,
          @clientName,

          @siteId,
          @siteName,

          NULL,
          NULL,

          @description,
          @active,

          @createdAt,
          @createdBy,
          @createdByName,

          @modifiedAt,
          @modifiedBy,
          @modifiedByName,

          'DELETE',
          GETDATE(),
          @logCreatedBy,
          @logCreatedByName
        )
      `);

      // ========================================================
      // COMMIT
      // ========================================================
      await transaction.commit();

      return deletedHoliday;
    } catch (error) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error(
          "Rollback error:",
          rollbackError
        );
      }

      console.error(
        "Error in deleteHoliday:",
        error
      );

      throw error;
    }
  },
};

module.exports = holidayMasterModel;

// const sql = require("mssql");
// const { poolPromise } = require("../config/db");

// const holidayMasterModel = {
//   // ============================================================
//   // GET ALL ACTIVE COMPANIES
//   // ============================================================
//   getCompanies: async () => {
//     try {
//       const pool = await poolPromise;

//       const result = await pool.request().query(`
//         SELECT
//           id,
//           company_name
//         FROM companies
//         WHERE active = 0
//         ORDER BY company_name ASC
//       `);

//       return result.recordset;
//     } catch (error) {
//       console.error("Error in getCompanies:", error);
//       throw error;
//     }
//   },

//   // ============================================================
//   // GET ACTIVE BRANCHES BY COMPANY
//   // ============================================================
//   getBranchesByCompany: async (companyId) => {
//     try {
//       const pool = await poolPromise;

//       const result = await pool.request().input("companyId", sql.Int, companyId)
//         .query(`
//           SELECT
//             id,
//             branch_name,
//             company_id,
//             company_name
//           FROM branch
//           WHERE company_id = @companyId
//             AND active = 0
//           ORDER BY branch_name ASC
//         `);

//       return result.recordset;
//     } catch (error) {
//       console.error("Error in getBranchesByCompany:", error);
//       throw error;
//     }
//   },

//   // ============================================================
//   // GET HOLIDAY MASTER LIST
//   // ============================================================
//   getHolidays: async ({
//     financial_year,
//     company_id,
//     branch_id,
//     active,
//   } = {}) => {
//     try {
//       const pool = await poolPromise;

//       const request = pool.request();

//       let query = `
//         SELECT
//           id,
//           financial_year,
//           holiday_date,
//           holiday_name,
//           holiday_type,
//           company_id,
//           company_name,
//           branch_id,
//           branch_name,
//           description,
//           active,
//           created_at,
//           created_by,
//           created_by_name,
//           modified_at,
//           modified_by,
//           modified_by_name
//         FROM holiday_master
//         WHERE 1 = 1
//       `;

//       // Financial Year Filter
//       if (financial_year) {
//         query += ` AND financial_year = @financialYear`;
//         request.input("financialYear", sql.VarChar(9), financial_year);
//       }

//       // Company Filter
//       if (company_id) {
//         query += ` AND company_id = @companyId`;
//         request.input("companyId", sql.Int, company_id);
//       }

//       // Branch Filter
//       if (branch_id) {
//         query += ` AND branch_id = @branchId`;
//         request.input("branchId", sql.Int, branch_id);
//       }

//       // Active Filter
//       if (active !== undefined && active !== null && active !== "") {
//         query += ` AND active = @active`;
//         request.input("active", sql.Int, active);
//       }

//       query += `
//         ORDER BY
//           holiday_date ASC,
//           company_name ASC,
//           branch_name ASC
//       `;

//       const result = await request.query(query);

//       return result.recordset;
//     } catch (error) {
//       console.error("Error in getHolidays:", error);
//       throw error;
//     }
//   },

//   // ============================================================
//   // GET HOLIDAY BY ID
//   // ============================================================
//   getHolidayById: async (id) => {
//     try {
//       const pool = await poolPromise;

//       const result = await pool.request().input("id", sql.Int, id).query(`
//           SELECT
//             id,
//             financial_year,
//             holiday_date,
//             holiday_name,
//             holiday_type,
//             company_id,
//             company_name,
//             branch_id,
//             branch_name,
//             description,
//             active,
//             created_at,
//             created_by,
//             created_by_name,
//             modified_at,
//             modified_by,
//             modified_by_name
//           FROM holiday_master
//           WHERE id = @id
//         `);

//       return result.recordset[0] || null;
//     } catch (error) {
//       console.error("Error in getHolidayById:", error);
//       throw error;
//     }
//   },

//   // ============================================================
//   // CREATE HOLIDAY MASTER
//   //
//   // One holiday can be created for multiple branches.
//   //
//   // Example:
//   // company_id = 22
//   // branch_ids = [2, 3]
//   //
//   // This creates:
//   // holiday_master row 1 -> branch 2
//   // holiday_master row 2 -> branch 3
//   //
//   // And corresponding log rows for both.
//   // ============================================================
//   createHoliday: async ({
//     financial_year,
//     holiday_date,
//     holiday_name,
//     holiday_type,
//     company_id,
//     branch_ids,
//     description,
//     created_by,
//     created_by_name,
//   }) => {
//     const pool = await poolPromise;
//     const transaction = new sql.Transaction(pool);

//     try {
//       await transaction.begin();

//       // ----------------------------------------------------------
//       // Get Company
//       // ----------------------------------------------------------
//       const companyResult = await new sql.Request(transaction).input(
//         "companyId",
//         sql.Int,
//         company_id,
//       ).query(`
//           SELECT
//             id,
//             company_name
//           FROM companies
//           WHERE id = @companyId
//             AND active = 0
//         `);

//       if (companyResult.recordset.length === 0) {
//         throw new Error("Selected company not found or inactive");
//       }

//       const company = companyResult.recordset[0];

//       // ----------------------------------------------------------
//       // Validate Branches
//       // ----------------------------------------------------------
//       const branchResult = await new sql.Request(transaction).input(
//         "companyId",
//         sql.Int,
//         company_id,
//       ).query(`
//           SELECT
//             id,
//             branch_name,
//             company_id,
//             company_name
//           FROM branch
//           WHERE company_id = @companyId
//             AND active = 0
//         `);

//       const availableBranches = branchResult.recordset;

//       const selectedBranchIds = branch_ids.map((id) => Number(id));

//       const validBranches = availableBranches.filter((branch) =>
//         selectedBranchIds.includes(Number(branch.id)),
//       );

//       if (validBranches.length !== selectedBranchIds.length) {
//         throw new Error(
//           "One or more selected branches are invalid or do not belong to the selected company",
//         );
//       }

//       const createdRows = [];

//       // ----------------------------------------------------------
//       // Insert Holiday For Each Branch
//       // ----------------------------------------------------------
//       for (const branch of validBranches) {
//         const request = new sql.Request(transaction);

//         request.input("financialYear", sql.VarChar(9), financial_year);

//         request.input("holidayDate", sql.Date, holiday_date);

//         request.input("holidayName", sql.VarChar(150), holiday_name);

//         request.input("holidayType", sql.VarChar(50), holiday_type || null);

//         request.input("companyId", sql.Int, company.id);

//         request.input("companyName", sql.VarChar(200), company.company_name);

//         request.input("branchId", sql.Int, branch.id);

//         request.input("branchName", sql.VarChar(200), branch.branch_name);

//         request.input("description", sql.VarChar(500), description || null);

//         request.input("createdBy", sql.Int, created_by || null);

//         request.input(
//           "createdByName",
//           sql.VarChar(200),
//           created_by_name || null,
//         );

//         // --------------------------------------------------------
//         // INSERT MAIN HOLIDAY
//         // --------------------------------------------------------
//         const holidayResult = await request.query(`
//           INSERT INTO holiday_master (
//             financial_year,
//             holiday_date,
//             holiday_name,
//             holiday_type,
//             company_id,
//             company_name,
//             branch_id,
//             branch_name,
//             description,
//             active,
//             created_at,
//             created_by,
//             created_by_name
//           )
//           OUTPUT
//             INSERTED.id,
//             INSERTED.financial_year,
//             INSERTED.holiday_date,
//             INSERTED.holiday_name,
//             INSERTED.holiday_type,
//             INSERTED.company_id,
//             INSERTED.company_name,
//             INSERTED.branch_id,
//             INSERTED.branch_name,
//             INSERTED.description,
//             INSERTED.active,
//             INSERTED.created_at,
//             INSERTED.created_by,
//             INSERTED.created_by_name
//           VALUES (
//             @financialYear,
//             @holidayDate,
//             @holidayName,
//             @holidayType,
//             @companyId,
//             @companyName,
//             @branchId,
//             @branchName,
//             @description,
//             0,
//             GETDATE(),
//             @createdBy,
//             @createdByName
//           )
//         `);

//         const insertedHoliday = holidayResult.recordset[0];

//         // --------------------------------------------------------
//         // INSERT LOG
//         // --------------------------------------------------------
//         const logRequest = new sql.Request(transaction);

//         logRequest.input("holidayMasterId", sql.Int, insertedHoliday.id);

//         logRequest.input(
//           "financialYear",
//           sql.VarChar(9),
//           insertedHoliday.financial_year,
//         );

//         logRequest.input("holidayDate", sql.Date, insertedHoliday.holiday_date);

//         logRequest.input(
//           "holidayName",
//           sql.VarChar(150),
//           insertedHoliday.holiday_name,
//         );

//         logRequest.input(
//           "holidayType",
//           sql.VarChar(50),
//           insertedHoliday.holiday_type,
//         );

//         logRequest.input("companyId", sql.Int, insertedHoliday.company_id);

//         logRequest.input(
//           "companyName",
//           sql.VarChar(200),
//           insertedHoliday.company_name,
//         );

//         logRequest.input("branchId", sql.Int, insertedHoliday.branch_id);

//         logRequest.input(
//           "branchName",
//           sql.VarChar(200),
//           insertedHoliday.branch_name,
//         );

//         logRequest.input(
//           "description",
//           sql.VarChar(500),
//           insertedHoliday.description,
//         );

//         logRequest.input("active", sql.Int, insertedHoliday.active);

//         logRequest.input(
//           "createdAt",
//           sql.DateTime2,
//           insertedHoliday.created_at,
//         );

//         logRequest.input("createdBy", sql.Int, insertedHoliday.created_by);

//         logRequest.input(
//           "createdByName",
//           sql.VarChar(200),
//           insertedHoliday.created_by_name,
//         );

//         logRequest.input("logCreatedBy", sql.Int, created_by || null);

//         logRequest.input(
//           "logCreatedByName",
//           sql.VarChar(200),
//           created_by_name || null,
//         );

//         await logRequest.query(`
//           INSERT INTO holiday_master_log (
//             holiday_master_id,
//             financial_year,
//             holiday_date,
//             holiday_name,
//             holiday_type,
//             company_id,
//             company_name,
//             branch_id,
//             branch_name,
//             description,
//             active,
//             created_at,
//             created_by,
//             created_by_name,
//             modified_at,
//             modified_by,
//             modified_by_name,
//             log_action,
//             log_created_at,
//             log_created_by,
//             log_created_by_name
//           )
//           VALUES (
//             @holidayMasterId,
//             @financialYear,
//             @holidayDate,
//             @holidayName,
//             @holidayType,
//             @companyId,
//             @companyName,
//             @branchId,
//             @branchName,
//             @description,
//             @active,
//             @createdAt,
//             @createdBy,
//             @createdByName,
//             NULL,
//             NULL,
//             NULL,
//             'INSERT',
//             GETDATE(),
//             @logCreatedBy,
//             @logCreatedByName
//           )
//         `);

//         createdRows.push(insertedHoliday);
//       }

//       // ----------------------------------------------------------
//       // COMMIT TRANSACTION
//       // ----------------------------------------------------------
//       await transaction.commit();

//       return createdRows;
//     } catch (error) {
//       // ----------------------------------------------------------
//       // ROLLBACK TRANSACTION
//       // ----------------------------------------------------------
//       try {
//         await transaction.rollback();
//       } catch (rollbackError) {
//         console.error("Rollback error:", rollbackError);
//       }

//       console.error("Error in createHoliday:", error);
//       throw error;
//     }
//   },

//   // ============================================================
//   // UPDATE HOLIDAY
//   //
//   // Update one holiday_master row and create UPDATE log.
//   // ============================================================
//   updateHoliday: async ({
//     id,
//     financial_year,
//     holiday_date,
//     holiday_name,
//     holiday_type,
//     company_id,
//     branch_id,
//     description,
//     active,
//     modified_by,
//     modified_by_name,
//   }) => {
//     const pool = await poolPromise;
//     const transaction = new sql.Transaction(pool);

//     try {
//       await transaction.begin();

//       // ----------------------------------------------------------
//       // Check Existing Holiday
//       // ----------------------------------------------------------
//       const existingResult = await new sql.Request(transaction).input(
//         "id",
//         sql.Int,
//         id,
//       ).query(`
//           SELECT *
//           FROM holiday_master
//           WHERE id = @id
//         `);

//       if (existingResult.recordset.length === 0) {
//         throw new Error("Holiday not found");
//       }

//       // ----------------------------------------------------------
//       // Get Company
//       // ----------------------------------------------------------
//       const companyResult = await new sql.Request(transaction).input(
//         "companyId",
//         sql.Int,
//         company_id,
//       ).query(`
//           SELECT
//             id,
//             company_name
//           FROM companies
//           WHERE id = @companyId
//             AND active = 0
//         `);

//       if (companyResult.recordset.length === 0) {
//         throw new Error("Selected company not found or inactive");
//       }

//       const company = companyResult.recordset[0];

//       // ----------------------------------------------------------
//       // Get Branch
//       // ----------------------------------------------------------
//       const branchResult = await new sql.Request(transaction)
//         .input("branchId", sql.Int, branch_id)
//         .input("companyId", sql.Int, company_id).query(`
//           SELECT
//             id,
//             branch_name,
//             company_id,
//             company_name
//           FROM branch
//           WHERE id = @branchId
//             AND company_id = @companyId
//             AND active = 0
//         `);

//       if (branchResult.recordset.length === 0) {
//         throw new Error(
//           "Selected branch not found, inactive, or does not belong to selected company",
//         );
//       }

//       const branch = branchResult.recordset[0];

//       // ----------------------------------------------------------
//       // UPDATE MAIN TABLE
//       // ----------------------------------------------------------
//       const updateRequest = new sql.Request(transaction);

//       updateRequest.input("id", sql.Int, id);
//       updateRequest.input("financialYear", sql.VarChar(9), financial_year);
//       updateRequest.input("holidayDate", sql.Date, holiday_date);
//       updateRequest.input("holidayName", sql.VarChar(150), holiday_name);
//       updateRequest.input("holidayType", sql.VarChar(50), holiday_type || null);
//       updateRequest.input("companyId", sql.Int, company.id);
//       updateRequest.input(
//         "companyName",
//         sql.VarChar(200),
//         company.company_name,
//       );
//       updateRequest.input("branchId", sql.Int, branch.id);
//       updateRequest.input("branchName", sql.VarChar(200), branch.branch_name);
//       updateRequest.input("description", sql.VarChar(500), description || null);
//       updateRequest.input("active", sql.Int, active !== undefined ? active : 0);
//       updateRequest.input("modifiedBy", sql.Int, modified_by || null);
//       updateRequest.input(
//         "modifiedByName",
//         sql.VarChar(200),
//         modified_by_name || null,
//       );

//       const updateResult = await updateRequest.query(`
//         UPDATE holiday_master
//         SET
//           financial_year = @financialYear,
//           holiday_date = @holidayDate,
//           holiday_name = @holidayName,
//           holiday_type = @holidayType,
//           company_id = @companyId,
//           company_name = @companyName,
//           branch_id = @branchId,
//           branch_name = @branchName,
//           description = @description,
//           active = @active,
//           modified_at = GETDATE(),
//           modified_by = @modifiedBy,
//           modified_by_name = @modifiedByName
//         OUTPUT
//           INSERTED.id,
//           INSERTED.financial_year,
//           INSERTED.holiday_date,
//           INSERTED.holiday_name,
//           INSERTED.holiday_type,
//           INSERTED.company_id,
//           INSERTED.company_name,
//           INSERTED.branch_id,
//           INSERTED.branch_name,
//           INSERTED.description,
//           INSERTED.active,
//           INSERTED.created_at,
//           INSERTED.created_by,
//           INSERTED.created_by_name,
//           INSERTED.modified_at,
//           INSERTED.modified_by,
//           INSERTED.modified_by_name
//         WHERE id = @id
//       `);

//       const updatedHoliday = updateResult.recordset[0];

//       // ----------------------------------------------------------
//       // INSERT UPDATE LOG
//       // ----------------------------------------------------------
//       const logRequest = new sql.Request(transaction);

//       logRequest.input("holidayMasterId", sql.Int, updatedHoliday.id);

//       logRequest.input(
//         "financialYear",
//         sql.VarChar(9),
//         updatedHoliday.financial_year,
//       );

//       logRequest.input("holidayDate", sql.Date, updatedHoliday.holiday_date);

//       logRequest.input(
//         "holidayName",
//         sql.VarChar(150),
//         updatedHoliday.holiday_name,
//       );

//       logRequest.input(
//         "holidayType",
//         sql.VarChar(50),
//         updatedHoliday.holiday_type,
//       );

//       logRequest.input("companyId", sql.Int, updatedHoliday.company_id);

//       logRequest.input(
//         "companyName",
//         sql.VarChar(200),
//         updatedHoliday.company_name,
//       );

//       logRequest.input("branchId", sql.Int, updatedHoliday.branch_id);

//       logRequest.input(
//         "branchName",
//         sql.VarChar(200),
//         updatedHoliday.branch_name,
//       );

//       logRequest.input(
//         "description",
//         sql.VarChar(500),
//         updatedHoliday.description,
//       );

//       logRequest.input("active", sql.Int, updatedHoliday.active);

//       logRequest.input("createdAt", sql.DateTime2, updatedHoliday.created_at);

//       logRequest.input("createdBy", sql.Int, updatedHoliday.created_by);

//       logRequest.input(
//         "createdByName",
//         sql.VarChar(200),
//         updatedHoliday.created_by_name,
//       );

//       logRequest.input("modifiedAt", sql.DateTime2, updatedHoliday.modified_at);

//       logRequest.input("modifiedBy", sql.Int, updatedHoliday.modified_by);

//       logRequest.input(
//         "modifiedByName",
//         sql.VarChar(200),
//         updatedHoliday.modified_by_name,
//       );

//       logRequest.input("logCreatedBy", sql.Int, modified_by || null);

//       logRequest.input(
//         "logCreatedByName",
//         sql.VarChar(200),
//         modified_by_name || null,
//       );

//       await logRequest.query(`
//         INSERT INTO holiday_master_log (
//           holiday_master_id,
//           financial_year,
//           holiday_date,
//           holiday_name,
//           holiday_type,
//           company_id,
//           company_name,
//           branch_id,
//           branch_name,
//           description,
//           active,
//           created_at,
//           created_by,
//           created_by_name,
//           modified_at,
//           modified_by,
//           modified_by_name,
//           log_action,
//           log_created_at,
//           log_created_by,
//           log_created_by_name
//         )
//         VALUES (
//           @holidayMasterId,
//           @financialYear,
//           @holidayDate,
//           @holidayName,
//           @holidayType,
//           @companyId,
//           @companyName,
//           @branchId,
//           @branchName,
//           @description,
//           @active,
//           @createdAt,
//           @createdBy,
//           @createdByName,
//           @modifiedAt,
//           @modifiedBy,
//           @modifiedByName,
//           'UPDATE',
//           GETDATE(),
//           @logCreatedBy,
//           @logCreatedByName
//         )
//       `);

//       // ----------------------------------------------------------
//       // COMMIT
//       // ----------------------------------------------------------
//       await transaction.commit();

//       return updatedHoliday;
//     } catch (error) {
//       try {
//         await transaction.rollback();
//       } catch (rollbackError) {
//         console.error("Rollback error:", rollbackError);
//       }

//       console.error("Error in updateHoliday:", error);
//       throw error;
//     }
//   },

//   // ============================================================
//   // SOFT DELETE / DEACTIVATE HOLIDAY
//   //
//   // active = 1 means inactive.
//   //
//   // We are NOT physically deleting the main row because
//   // holiday_master_log has FK -> holiday_master(id).
//   // ============================================================
//   deleteHoliday: async ({ id, modified_by, modified_by_name }) => {
//     const pool = await poolPromise;
//     const transaction = new sql.Transaction(pool);

//     try {
//       await transaction.begin();

//       // ----------------------------------------------------------
//       // Get Existing Holiday
//       // ----------------------------------------------------------
//       const existingResult = await new sql.Request(transaction).input(
//         "id",
//         sql.Int,
//         id,
//       ).query(`
//           SELECT *
//           FROM holiday_master
//           WHERE id = @id
//         `);

//       if (existingResult.recordset.length === 0) {
//         throw new Error("Holiday not found");
//       }

//       // ----------------------------------------------------------
//       // SOFT DELETE
//       // active = 1 => Inactive
//       // ----------------------------------------------------------
//       const updateRequest = new sql.Request(transaction);

//       updateRequest.input("id", sql.Int, id);
//       updateRequest.input("modifiedBy", sql.Int, modified_by || null);
//       updateRequest.input(
//         "modifiedByName",
//         sql.VarChar(200),
//         modified_by_name || null,
//       );

//       const result = await updateRequest.query(`
//         UPDATE holiday_master
//         SET
//           active = 1,
//           modified_at = GETDATE(),
//           modified_by = @modifiedBy,
//           modified_by_name = @modifiedByName
//         OUTPUT
//           INSERTED.id,
//           INSERTED.financial_year,
//           INSERTED.holiday_date,
//           INSERTED.holiday_name,
//           INSERTED.holiday_type,
//           INSERTED.company_id,
//           INSERTED.company_name,
//           INSERTED.branch_id,
//           INSERTED.branch_name,
//           INSERTED.description,
//           INSERTED.active,
//           INSERTED.created_at,
//           INSERTED.created_by,
//           INSERTED.created_by_name,
//           INSERTED.modified_at,
//           INSERTED.modified_by,
//           INSERTED.modified_by_name
//         WHERE id = @id
//       `);

//       const deletedHoliday = result.recordset[0];

//       // ----------------------------------------------------------
//       // INSERT DELETE LOG
//       // ----------------------------------------------------------
//       const logRequest = new sql.Request(transaction);

//       logRequest.input("holidayMasterId", sql.Int, deletedHoliday.id);

//       logRequest.input(
//         "financialYear",
//         sql.VarChar(9),
//         deletedHoliday.financial_year,
//       );

//       logRequest.input("holidayDate", sql.Date, deletedHoliday.holiday_date);

//       logRequest.input(
//         "holidayName",
//         sql.VarChar(150),
//         deletedHoliday.holiday_name,
//       );

//       logRequest.input(
//         "holidayType",
//         sql.VarChar(50),
//         deletedHoliday.holiday_type,
//       );

//       logRequest.input("companyId", sql.Int, deletedHoliday.company_id);

//       logRequest.input(
//         "companyName",
//         sql.VarChar(200),
//         deletedHoliday.company_name,
//       );

//       logRequest.input("branchId", sql.Int, deletedHoliday.branch_id);

//       logRequest.input(
//         "branchName",
//         sql.VarChar(200),
//         deletedHoliday.branch_name,
//       );

//       logRequest.input(
//         "description",
//         sql.VarChar(500),
//         deletedHoliday.description,
//       );

//       logRequest.input("active", sql.Int, deletedHoliday.active);

//       logRequest.input("createdAt", sql.DateTime2, deletedHoliday.created_at);

//       logRequest.input("createdBy", sql.Int, deletedHoliday.created_by);

//       logRequest.input(
//         "createdByName",
//         sql.VarChar(200),
//         deletedHoliday.created_by_name,
//       );

//       logRequest.input("modifiedAt", sql.DateTime2, deletedHoliday.modified_at);

//       logRequest.input("modifiedBy", sql.Int, deletedHoliday.modified_by);

//       logRequest.input(
//         "modifiedByName",
//         sql.VarChar(200),
//         deletedHoliday.modified_by_name,
//       );

//       logRequest.input("logCreatedBy", sql.Int, modified_by || null);

//       logRequest.input(
//         "logCreatedByName",
//         sql.VarChar(200),
//         modified_by_name || null,
//       );

//       await logRequest.query(`
//         INSERT INTO holiday_master_log (
//           holiday_master_id,
//           financial_year,
//           holiday_date,
//           holiday_name,
//           holiday_type,
//           company_id,
//           company_name,
//           branch_id,
//           branch_name,
//           description,
//           active,
//           created_at,
//           created_by,
//           created_by_name,
//           modified_at,
//           modified_by,
//           modified_by_name,
//           log_action,
//           log_created_at,
//           log_created_by,
//           log_created_by_name
//         )
//         VALUES (
//           @holidayMasterId,
//           @financialYear,
//           @holidayDate,
//           @holidayName,
//           @holidayType,
//           @companyId,
//           @companyName,
//           @branchId,
//           @branchName,
//           @description,
//           @active,
//           @createdAt,
//           @createdBy,
//           @createdByName,
//           @modifiedAt,
//           @modifiedBy,
//           @modifiedByName,
//           'DELETE',
//           GETDATE(),
//           @logCreatedBy,
//           @logCreatedByName
//         )
//       `);

//       await transaction.commit();

//       return deletedHoliday;
//     } catch (error) {
//       try {
//         await transaction.rollback();
//       } catch (rollbackError) {
//         console.error("Rollback error:", rollbackError);
//       }

//       console.error("Error in deleteHoliday:", error);
//       throw error;
//     }
//   },
// };

// module.exports = holidayMasterModel;
