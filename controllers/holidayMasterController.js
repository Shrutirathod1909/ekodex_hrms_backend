const holidayMasterModel = require("../models/holidayMasterModel");
const sql = require("mssql");
const { poolPromise } = require("../config/db");

const holidayMasterController = {
  // ============================================================
  // DATE HELPERS
  // ============================================================

  // DD-MM-YYYY -> YYYY-MM-DD
  convertToSqlDate: (dateString) => {
    if (!dateString) return null;

    const parts = String(dateString).split("-");

    if (parts.length !== 3) {
      return null;
    }

    const [day, month, year] = parts;

    if (
      !/^\d{2}$/.test(day) ||
      !/^\d{2}$/.test(month) ||
      !/^\d{4}$/.test(year)
    ) {
      return null;
    }

    const dayNumber = Number(day);
    const monthNumber = Number(month);
    const yearNumber = Number(year);

    const date = new Date(
      Date.UTC(yearNumber, monthNumber - 1, dayNumber)
    );

    if (
      date.getUTCFullYear() !== yearNumber ||
      date.getUTCMonth() !== monthNumber - 1 ||
      date.getUTCDate() !== dayNumber
    ) {
      return null;
    }

    return `${year}-${month}-${day}`;
  },

  // YYYY-MM-DD / SQL Date -> DD-MM-YYYY
  formatDateForResponse: (dateValue) => {
    if (!dateValue) return null;

    const dateString = String(dateValue).substring(0, 10);

    const parts = dateString.split("-");

    if (parts.length !== 3) {
      return dateValue;
    }

    const [year, month, day] = parts;

    return `${day}-${month}-${year}`;
  },

  // ============================================================
  // ROLE HELPER
  // ============================================================

  getUserAccess: async (req) => {
  const user = req.user || {};

  const role = String(user.role || user.user_role || "")
    .trim()
    .toUpperCase();

  const isSuperAdmin = role === "SUPER ADMIN";
  const isAdmin = role === "ADMIN";

  let companyId =
    user.company_id !== undefined &&
    user.company_id !== null &&
    user.company_id !== ""
      ? Number(user.company_id)
      : null;

  // AuthMiddleware ko change nahi karna hai.
  // Agar req.user me company_id nahi mila,
  // to users table se logged-in user ki company_id nikalo.
  if (
    isAdmin &&
    (!companyId || Number.isNaN(companyId))
  ) {
    const userId =
      user.id ||
      user.user_id ||
      user.userId ||
      null;

    if (userId) {
      const pool = await poolPromise;

      const result = await pool
        .request()
        .input("user_id", sql.BigInt, Number(userId))
        .query(`
          SELECT TOP 1
            company_id
          FROM users
          WHERE id = @user_id
        `);

      const dbCompanyId = result.recordset?.[0]?.company_id;

      if (
        dbCompanyId !== undefined &&
        dbCompanyId !== null &&
        dbCompanyId !== ""
      ) {
        companyId = Number(dbCompanyId);
      }
    }
  }

  return {
    role,
    companyId,
    isSuperAdmin,
    isAdmin,
  };
},

  // ============================================================
  // GET COMPANIES
  // ============================================================

  getCompanies: async (req, res) => {
    try {
      const {
        role,
        companyId,
        isSuperAdmin,
        isAdmin,
      } = await holidayMasterController.getUserAccess(req);

      // Only SUPER ADMIN and ADMIN allowed
      if (!isSuperAdmin && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to access companies",
        });
      }

      if (isAdmin && (!companyId || isNaN(companyId))) {
        return res.status(403).json({
          success: false,
          message:
            "Company is not assigned to the logged-in user",
        });
      }

      const data = await holidayMasterModel.getCompanies({
        role,
        company_id: companyId,
      });

      return res.status(200).json({
        success: true,
        message: "Companies fetched successfully",
        data,
      });
    } catch (error) {
      console.error("Error in getCompanies:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch companies",
        error: error.message,
      });
    }
  },

  // ============================================================
  // GET CLIENTS BY COMPANY
  // ============================================================

  getClientsByCompany: async (req, res) => {
    try {
      const { companyId } = req.params;

      const {
        role,
        companyId: userCompanyId,
        isSuperAdmin,
        isAdmin,
      } = await holidayMasterController.getUserAccess(req);

      // Only SUPER ADMIN and ADMIN allowed
      if (!isSuperAdmin && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to access clients",
        });
      }

      if (!companyId) {
        return res.status(400).json({
          success: false,
          message: "Company ID is required",
        });
      }

      const selectedCompanyId = Number(companyId);

      if (
        isNaN(selectedCompanyId) ||
        selectedCompanyId <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid company ID",
        });
      }

      // ADMIN cannot request another company
      if (
        isAdmin &&
        Number(userCompanyId) !== selectedCompanyId
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You are not authorized to access clients of this company",
        });
      }

      const data =
        await holidayMasterModel.getClientsByCompany({
          company_id: selectedCompanyId,
          role,
          user_company_id: userCompanyId,
        });

      return res.status(200).json({
        success: true,
        message: "Clients fetched successfully",
        data,
      });
    } catch (error) {
      console.error(
        "Error in getClientsByCompany:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Failed to fetch clients",
        error: error.message,
      });
    }
  },

  // ============================================================
  // GET SITES BY CLIENT
  // ============================================================

  getSitesByClient: async (req, res) => {
    try {
      const { clientId } = req.params;

      const {
        role,
        companyId,
        isSuperAdmin,
        isAdmin,
      } =await holidayMasterController.getUserAccess(req);

      if (!isSuperAdmin && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to access sites",
        });
      }

      if (!clientId) {
        return res.status(400).json({
          success: false,
          message: "Client ID is required",
        });
      }

      const selectedClientId = Number(clientId);

      if (
        isNaN(selectedClientId) ||
        selectedClientId <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid client ID",
        });
      }

      const data =
        await holidayMasterModel.getSitesByClient({
          client_id: selectedClientId,
          role,
          user_company_id: companyId,
        });

      return res.status(200).json({
        success: true,
        message: "Sites fetched successfully",
        data,
      });
    } catch (error) {
      console.error(
        "Error in getSitesByClient:",
        error
      );

      if (
        error.message ===
        "Client does not belong to your assigned company"
      ) {
        return res.status(403).json({
          success: false,
          message: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to fetch sites",
        error: error.message,
      });
    }
  },

  // ============================================================
  // GET HOLIDAY LIST
  // ============================================================

  getHolidays: async (req, res) => {
    try {
      const {
        financial_year,
        company_id,
        client_id,
        site_id,
        active,
      } = req.query;

      const {
        role,
        companyId: userCompanyId,
        isSuperAdmin,
        isAdmin,
      } =await holidayMasterController.getUserAccess(req);

      if (!isSuperAdmin && !isAdmin) {
        return res.status(403).json({
          success: false,
          message:
            "You are not authorized to access holidays",
        });
      }

      // ----------------------------------------------------------
      // ADMIN ACCESS
      // ----------------------------------------------------------

      let accessCompanyId;

      if (isAdmin) {
        if (!userCompanyId || isNaN(userCompanyId)) {
          return res.status(403).json({
            success: false,
            message:
              "Company is not assigned to the logged-in user",
          });
        }

        accessCompanyId = userCompanyId;

        // If frontend sends another company ID,
        // don't allow it.
        if (
          company_id &&
          Number(company_id) !== Number(userCompanyId)
        ) {
          return res.status(403).json({
            success: false,
            message:
              "You are not authorized to access holidays of this company",
          });
        }
      }

      // ----------------------------------------------------------
      // SUPER ADMIN
      // ----------------------------------------------------------

      if (isSuperAdmin && company_id) {
        accessCompanyId = Number(company_id);
      }

      const data =
        await holidayMasterModel.getHolidays({
          financial_year,
          company_id: accessCompanyId,
          client_id: client_id
            ? Number(client_id)
            : undefined,
          site_id: site_id
            ? Number(site_id)
            : undefined,
          active:
            active !== undefined && active !== ""
              ? Number(active)
              : undefined,
        });

      const formattedData = data.map((holiday) => ({
        ...holiday,
        holiday_date:
          holidayMasterController.formatDateForResponse(
            holiday.holiday_date
          ),
      }));

      return res.status(200).json({
        success: true,
        message: "Holidays fetched successfully",
        data: formattedData,
      });
    } catch (error) {
      console.error("Error in getHolidays:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch holidays",
        error: error.message,
      });
    }
  },

  // ============================================================
  // GET HOLIDAY BY ID
  // ============================================================

  getHolidayById: async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Holiday ID is required",
        });
      }

      if (isNaN(Number(id))) {
        return res.status(400).json({
          success: false,
          message: "Invalid holiday ID",
        });
      }

      const {
        role,
        companyId,
        isSuperAdmin,
        isAdmin,
      } =await holidayMasterController.getUserAccess(req);

      if (!isSuperAdmin && !isAdmin) {
        return res.status(403).json({
          success: false,
          message:
            "You are not authorized to access holidays",
        });
      }

      const data =
        await holidayMasterModel.getHolidayById({
          id: Number(id),
          role,
          company_id: companyId,
        });

      if (!data) {
        return res.status(404).json({
          success: false,
          message: "Holiday not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Holiday fetched successfully",
        data: {
          ...data,
          holiday_date:
            holidayMasterController.formatDateForResponse(
              data.holiday_date
            ),
        },
      });
    } catch (error) {
      console.error("Error in getHolidayById:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch holiday",
        error: error.message,
      });
    }
  },

  // ============================================================
  // CREATE HOLIDAY
  // ============================================================

  createHoliday: async (req, res) => {
    try {
      const {
        financial_year,
        holiday_date,
        holiday_name,
        holiday_type,
        company_id,
        client_id,
        site_ids,
        description,
      } = req.body;

      const {
        role,
        companyId: userCompanyId,
        isSuperAdmin,
        isAdmin,
      } =await holidayMasterController.getUserAccess(req);

      // ----------------------------------------------------------
      // ROLE VALIDATION
      // ----------------------------------------------------------

      if (!isSuperAdmin && !isAdmin) {
        return res.status(403).json({
          success: false,
          message:
            "You are not authorized to create holidays",
        });
      }

      // ----------------------------------------------------------
      // REQUIRED VALIDATION
      // ----------------------------------------------------------

      if (!financial_year) {
        return res.status(400).json({
          success: false,
          message: "Financial year is required",
        });
      }

      if (!/^\d{4}-\d{2}$/.test(financial_year)) {
        return res.status(400).json({
          success: false,
          message:
            "Financial year must be in YYYY-YY format. Example: 2026-27",
        });
      }

      if (!holiday_date) {
        return res.status(400).json({
          success: false,
          message: "Holiday date is required",
        });
      }

      if (!holiday_name || !holiday_name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Holiday name is required",
        });
      }

      if (!company_id) {
        return res.status(400).json({
          success: false,
          message: "Company is required",
        });
      }

      if (!client_id) {
        return res.status(400).json({
          success: false,
          message: "Client is required",
        });
      }

      if (!Array.isArray(site_ids) || site_ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one site must be selected",
        });
      }

      const companyId = Number(company_id);
      const clientId = Number(client_id);

      if (isNaN(companyId) || companyId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid company ID",
        });
      }

      if (isNaN(clientId) || clientId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid client ID",
        });
      }

      // ----------------------------------------------------------
      // ADMIN COMPANY SECURITY
      // ----------------------------------------------------------

      if (
        isAdmin &&
        Number(userCompanyId) !== Number(companyId)
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You are not authorized to create holiday for this company",
        });
      }

      // ----------------------------------------------------------
      // SITE ID VALIDATION
      // ----------------------------------------------------------

      const normalizedSiteIds = [
        ...new Set(
          site_ids.map((id) => Number(id))
        ),
      ];

      if (
        normalizedSiteIds.some(
          (id) => isNaN(id) || id <= 0
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid site ID",
        });
      }

      // ----------------------------------------------------------
      // FINANCIAL YEAR VALIDATION
      // ----------------------------------------------------------

      const fyStartYear = Number(
        financial_year.substring(0, 4)
      );

      const fyEndYear = Number(
        financial_year.substring(5, 7)
      );

      if (
        fyEndYear !==
        Number(
          String(fyStartYear + 1).slice(-2)
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid financial year. Example: 2026-27",
        });
      }

      // ----------------------------------------------------------
      // DATE CONVERSION
      // ----------------------------------------------------------

      const sqlHolidayDate =
        holidayMasterController.convertToSqlDate(
          holiday_date
        );

      if (!sqlHolidayDate) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid holiday date. Use DD-MM-YYYY format. Example: 15-08-2026",
        });
      }

      // ----------------------------------------------------------
      // FY DATE RANGE
      // ----------------------------------------------------------

      const holidayDateObject = new Date(
        `${sqlHolidayDate}T00:00:00Z`
      );

      const startDate = new Date(
        `${fyStartYear}-04-01T00:00:00Z`
      );

      const endDate = new Date(
        `${fyStartYear + 1}-03-31T23:59:59Z`
      );

      if (
        holidayDateObject < startDate ||
        holidayDateObject > endDate
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Holiday date must be between 01-04-${fyStartYear} and 31-03-${fyStartYear + 1}`,
        });
      }

      // ----------------------------------------------------------
      // CREATE
      // ----------------------------------------------------------
      //
      // created_by / created_by_name are taken from req.user.
      // Frontend cannot spoof these values.
      // ----------------------------------------------------------

      const createdBy = req.user?.id
        ? Number(req.user.id)
        : null;

      const createdByName =
        req.user?.name ||
        req.user?.user_name ||
        req.user?.username ||
        req.user?.employee_name ||
        null;

      const data =
        await holidayMasterModel.createHoliday({
          financial_year,
          holiday_date: sqlHolidayDate,
          holiday_name: holiday_name.trim(),
          holiday_type:
            holiday_type?.trim() || null,
          company_id: companyId,
          client_id: clientId,
          site_ids: normalizedSiteIds,
          description:
            description?.trim() || null,
          created_by: createdBy,
          created_by_name: createdByName,
          role,
          user_company_id: userCompanyId,
        });

      const formattedData = data.map((holiday) => ({
        ...holiday,
        holiday_date:
          holidayMasterController.formatDateForResponse(
            holiday.holiday_date
          ),
      }));

      return res.status(201).json({
        success: true,
        message:
          "Holiday created successfully for selected sites",
        data: formattedData,
      });
    } catch (error) {
      console.error("Error in createHoliday:", error);

      if (
        error.number === 2627 ||
        error.number === 2601
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Holiday already exists for one of the selected sites on this date",
        });
      }

      if (
        error.message ===
        "Selected client not found or inactive"
      ) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }

      if (
        error.message.includes(
          "selected sites are invalid"
        )
      ) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to create holiday",
        error: error.message,
      });
    }
  },

  // ============================================================
  // UPDATE HOLIDAY
  // ============================================================

  updateHoliday: async (req, res) => {
    try {
      const { id } = req.params;

      const {
        financial_year,
        holiday_date,
        holiday_name,
        holiday_type,
        company_id,
        client_id,
        site_id,
        description,
        active,
      } = req.body;

      const {
        role,
        companyId: userCompanyId,
        isSuperAdmin,
        isAdmin,
      } =await holidayMasterController.getUserAccess(req);

      if (!isSuperAdmin && !isAdmin) {
        return res.status(403).json({
          success: false,
          message:
            "You are not authorized to update holidays",
        });
      }

      // ----------------------------------------------------------
      // ID
      // ----------------------------------------------------------

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Holiday ID is required",
        });
      }

      if (isNaN(Number(id))) {
        return res.status(400).json({
          success: false,
          message: "Invalid holiday ID",
        });
      }

      // ----------------------------------------------------------
      // REQUIRED
      // ----------------------------------------------------------

      if (!financial_year) {
        return res.status(400).json({
          success: false,
          message: "Financial year is required",
        });
      }

      if (!/^\d{4}-\d{2}$/.test(financial_year)) {
        return res.status(400).json({
          success: false,
          message:
            "Financial year must be in YYYY-YY format",
        });
      }

      if (!holiday_date) {
        return res.status(400).json({
          success: false,
          message: "Holiday date is required",
        });
      }

      if (!holiday_name || !holiday_name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Holiday name is required",
        });
      }

      if (!company_id) {
        return res.status(400).json({
          success: false,
          message: "Company is required",
        });
      }

      if (!client_id) {
        return res.status(400).json({
          success: false,
          message: "Client is required",
        });
      }

      if (!site_id) {
        return res.status(400).json({
          success: false,
          message: "Site is required",
        });
      }

      const companyId = Number(company_id);
      const clientId = Number(client_id);
      const siteId = Number(site_id);

      if (isNaN(companyId) || companyId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid company ID",
        });
      }

      if (isNaN(clientId) || clientId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid client ID",
        });
      }

      if (isNaN(siteId) || siteId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid site ID",
        });
      }

      // ----------------------------------------------------------
      // ADMIN SECURITY
      // ----------------------------------------------------------

      if (
        isAdmin &&
        Number(userCompanyId) !== Number(companyId)
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You are not authorized to update holiday for this company",
        });
      }

      // ----------------------------------------------------------
      // FINANCIAL YEAR
      // ----------------------------------------------------------

      const fyStartYear = Number(
        financial_year.substring(0, 4)
      );

      const fyEndYear = Number(
        financial_year.substring(5, 7)
      );

      if (
        fyEndYear !==
        Number(
          String(fyStartYear + 1).slice(-2)
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid financial year. Example: 2026-27",
        });
      }

      // ----------------------------------------------------------
      // DATE
      // ----------------------------------------------------------

      const sqlHolidayDate =
        holidayMasterController.convertToSqlDate(
          holiday_date
        );

      if (!sqlHolidayDate) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid holiday date. Use DD-MM-YYYY format. Example: 15-08-2026",
        });
      }

      // ----------------------------------------------------------
      // FY DATE RANGE
      // ----------------------------------------------------------

      const holidayDateObject = new Date(
        `${sqlHolidayDate}T00:00:00Z`
      );

      const startDate = new Date(
        `${fyStartYear}-04-01T00:00:00Z`
      );

      const endDate = new Date(
        `${fyStartYear + 1}-03-31T23:59:59Z`
      );

      if (
        holidayDateObject < startDate ||
        holidayDateObject > endDate
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Holiday date must be between 01-04-${fyStartYear} and 31-03-${fyStartYear + 1}`,
        });
      }

      // ----------------------------------------------------------
      // ACTIVE
      // ----------------------------------------------------------

      let holidayActive = 0;

      if (
        active !== undefined &&
        active !== null
      ) {
        holidayActive = Number(active);
      }

      if (![0, 1].includes(holidayActive)) {
        return res.status(400).json({
          success: false,
          message:
            "Active must be either 0 or 1",
        });
      }

      const modifiedBy = req.user?.id
        ? Number(req.user.id)
        : null;

      const modifiedByName =
        req.user?.name ||
        req.user?.user_name ||
        req.user?.username ||
        req.user?.employee_name ||
        null;

      // ----------------------------------------------------------
      // UPDATE
      // ----------------------------------------------------------

      const data =
        await holidayMasterModel.updateHoliday({
          id: Number(id),
          financial_year,
          holiday_date: sqlHolidayDate,
          holiday_name: holiday_name.trim(),
          holiday_type:
            holiday_type?.trim() || null,
          company_id: companyId,
          client_id: clientId,
          site_id: siteId,
          description:
            description?.trim() || null,
          active: holidayActive,
          modified_by: modifiedBy,
          modified_by_name: modifiedByName,
          role,
          user_company_id: userCompanyId,
        });

      return res.status(200).json({
        success: true,
        message: "Holiday updated successfully",
        data: {
          ...data,
          holiday_date:
            holidayMasterController.formatDateForResponse(
              data.holiday_date
            ),
        },
      });
    } catch (error) {
      console.error("Error in updateHoliday:", error);

      if (
        error.number === 2627 ||
        error.number === 2601
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Holiday already exists for this site on this date",
        });
      }

      if (
        error.message === "Holiday not found"
      ) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      if (
        error.message.includes(
          "not authorized"
        )
      ) {
        return res.status(403).json({
          success: false,
          message: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to update holiday",
        error: error.message,
      });
    }
  },

  // ============================================================
  // DELETE / DEACTIVATE HOLIDAY
  // ============================================================

  deleteHoliday: async (req, res) => {
    try {
      const { id } = req.params;

      const {
        role,
        companyId,
        isSuperAdmin,
        isAdmin,
      } =await holidayMasterController.getUserAccess(req);

      if (!isSuperAdmin && !isAdmin) {
        return res.status(403).json({
          success: false,
          message:
            "You are not authorized to delete holidays",
        });
      }

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Holiday ID is required",
        });
      }

      if (isNaN(Number(id))) {
        return res.status(400).json({
          success: false,
          message: "Invalid holiday ID",
        });
      }

      const modifiedBy = req.user?.id
        ? Number(req.user.id)
        : null;

      const modifiedByName =
        req.user?.name ||
        req.user?.user_name ||
        req.user?.username ||
        req.user?.employee_name ||
        null;

      const data =
        await holidayMasterModel.deleteHoliday({
          id: Number(id),
          modified_by: modifiedBy,
          modified_by_name: modifiedByName,
          role,
          company_id: companyId,
        });

      return res.status(200).json({
        success: true,
        message: "Holiday deleted successfully",
        data: {
          ...data,
          holiday_date:
            holidayMasterController.formatDateForResponse(
              data.holiday_date
            ),
        },
      });
    } catch (error) {
      console.error("Error in deleteHoliday:", error);

      if (
        error.message === "Holiday not found"
      ) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      if (
        error.message.includes(
          "not authorized"
        )
      ) {
        return res.status(403).json({
          success: false,
          message: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to delete holiday",
        error: error.message,
      });
    }
  },
};

module.exports = holidayMasterController;

// const holidayMasterModel = require("../models/holidayMasterModel");

// const holidayMasterController = {
//   // ============================================================
//   // DATE HELPERS
//   // ============================================================

//   // DD-MM-YYYY -> YYYY-MM-DD
//   convertToSqlDate: (dateString) => {
//     if (!dateString) return null;

//     const parts = String(dateString).split("-");

//     if (parts.length !== 3) {
//       return null;
//     }

//     const [day, month, year] = parts;

//     if (
//       !/^\d{2}$/.test(day) ||
//       !/^\d{2}$/.test(month) ||
//       !/^\d{4}$/.test(year)
//     ) {
//       return null;
//     }

//     const dayNumber = Number(day);
//     const monthNumber = Number(month);
//     const yearNumber = Number(year);

//     const date = new Date(
//       Date.UTC(yearNumber, monthNumber - 1, dayNumber)
//     );

//     // Prevent invalid dates like 31-02-2026
//     if (
//       date.getUTCFullYear() !== yearNumber ||
//       date.getUTCMonth() !== monthNumber - 1 ||
//       date.getUTCDate() !== dayNumber
//     ) {
//       return null;
//     }

//     return `${year}-${month}-${day}`;
//   },

//   // YYYY-MM-DD / SQL Date -> DD-MM-YYYY
//   formatDateForResponse: (dateValue) => {
//     if (!dateValue) return null;

//     const dateString = String(dateValue).substring(0, 10);

//     const parts = dateString.split("-");

//     if (parts.length !== 3) {
//       return dateValue;
//     }

//     const [year, month, day] = parts;

//     return `${day}-${month}-${year}`;
//   },

//   // ============================================================
//   // GET ALL ACTIVE COMPANIES
//   // ============================================================
//   getCompanies: async (req, res) => {
//     try {
//       const data = await holidayMasterModel.getCompanies();

//       return res.status(200).json({
//         success: true,
//         message: "Companies fetched successfully",
//         data,
//       });
//     } catch (error) {
//       console.error("Error in getCompanies:", error);

//       return res.status(500).json({
//         success: false,
//         message: "Failed to fetch companies",
//         error: error.message,
//       });
//     }
//   },

//   // ============================================================
//   // GET BRANCHES BY COMPANY
//   // ============================================================
//   getBranchesByCompany: async (req, res) => {
//     try {
//       const { companyId } = req.params;

//       if (!companyId) {
//         return res.status(400).json({
//           success: false,
//           message: "Company ID is required",
//         });
//       }

//       if (isNaN(Number(companyId))) {
//         return res.status(400).json({
//           success: false,
//           message: "Invalid company ID",
//         });
//       }

//       const data =
//         await holidayMasterModel.getBranchesByCompany(
//           Number(companyId)
//         );

//       return res.status(200).json({
//         success: true,
//         message: "Branches fetched successfully",
//         data,
//       });
//     } catch (error) {
//       console.error("Error in getBranchesByCompany:", error);

//       return res.status(500).json({
//         success: false,
//         message: "Failed to fetch branches",
//         error: error.message,
//       });
//     }
//   },

//   // ============================================================
//   // GET HOLIDAY LIST
//   // ============================================================
//   getHolidays: async (req, res) => {
//     try {
//       const {
//         financial_year,
//         company_id,
//         branch_id,
//         active,
//       } = req.query;

//       const data = await holidayMasterModel.getHolidays({
//         financial_year,
//         company_id: company_id
//           ? Number(company_id)
//           : undefined,
//         branch_id: branch_id
//           ? Number(branch_id)
//           : undefined,
//         active:
//           active !== undefined && active !== ""
//             ? Number(active)
//             : undefined,
//       });

//       // Convert SQL date to DD-MM-YYYY
//       const formattedData = data.map((holiday) => ({
//         ...holiday,
//         holiday_date:
//           holidayMasterController.formatDateForResponse(
//             holiday.holiday_date
//           ),
//       }));

//       return res.status(200).json({
//         success: true,
//         message: "Holidays fetched successfully",
//         data: formattedData,
//       });
//     } catch (error) {
//       console.error("Error in getHolidays:", error);

//       return res.status(500).json({
//         success: false,
//         message: "Failed to fetch holidays",
//         error: error.message,
//       });
//     }
//   },

//   // ============================================================
//   // GET HOLIDAY BY ID
//   // ============================================================
//   getHolidayById: async (req, res) => {
//     try {
//       const { id } = req.params;

//       if (!id) {
//         return res.status(400).json({
//           success: false,
//           message: "Holiday ID is required",
//         });
//       }

//       if (isNaN(Number(id))) {
//         return res.status(400).json({
//           success: false,
//           message: "Invalid holiday ID",
//         });
//       }

//       const data =
//         await holidayMasterModel.getHolidayById(
//           Number(id)
//         );

//       if (!data) {
//         return res.status(404).json({
//           success: false,
//           message: "Holiday not found",
//         });
//       }

//       return res.status(200).json({
//         success: true,
//         message: "Holiday fetched successfully",
//         data: {
//           ...data,
//           holiday_date:
//             holidayMasterController.formatDateForResponse(
//               data.holiday_date
//             ),
//         },
//       });
//     } catch (error) {
//       console.error("Error in getHolidayById:", error);

//       return res.status(500).json({
//         success: false,
//         message: "Failed to fetch holiday",
//         error: error.message,
//       });
//     }
//   },

//   // ============================================================
//   // CREATE HOLIDAY
//   // ============================================================
//   createHoliday: async (req, res) => {
//     try {
//       const {
//         financial_year,
//         holiday_date,
//         holiday_name,
//         holiday_type,
//         company_id,
//         branch_ids,
//         description,
//         created_by,
//         created_by_name,
//       } = req.body;

//       // ----------------------------------------------------------
//       // REQUIRED FIELD VALIDATION
//       // ----------------------------------------------------------
//       if (!financial_year) {
//         return res.status(400).json({
//           success: false,
//           message: "Financial year is required",
//         });
//       }

//       if (!/^\d{4}-\d{2}$/.test(financial_year)) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Financial year must be in YYYY-YY format. Example: 2026-27",
//         });
//       }

//       if (!holiday_date) {
//         return res.status(400).json({
//           success: false,
//           message: "Holiday date is required",
//         });
//       }

//       if (!holiday_name || !holiday_name.trim()) {
//         return res.status(400).json({
//           success: false,
//           message: "Holiday name is required",
//         });
//       }

//       if (!company_id) {
//         return res.status(400).json({
//           success: false,
//           message: "Company is required",
//         });
//       }

//       if (!Array.isArray(branch_ids) || branch_ids.length === 0) {
//         return res.status(400).json({
//           success: false,
//           message: "At least one branch must be selected",
//         });
//       }

//       // ----------------------------------------------------------
//       // COMPANY ID VALIDATION
//       // ----------------------------------------------------------
//       if (isNaN(Number(company_id))) {
//         return res.status(400).json({
//           success: false,
//           message: "Invalid company ID",
//         });
//       }

//       // ----------------------------------------------------------
//       // BRANCH IDS VALIDATION
//       // ----------------------------------------------------------
//       const normalizedBranchIds = [
//         ...new Set(
//           branch_ids.map((id) => Number(id))
//         ),
//       ];

//       if (
//         normalizedBranchIds.some(
//           (id) => isNaN(id) || id <= 0
//         )
//       ) {
//         return res.status(400).json({
//           success: false,
//           message: "Invalid branch ID",
//         });
//       }

//       // ----------------------------------------------------------
//       // FINANCIAL YEAR VALIDATION
//       // Example: 2026-27
//       // Start: 01-04-2026
//       // End:   31-03-2027
//       // ----------------------------------------------------------
//       const fyStartYear = Number(
//         financial_year.substring(0, 4)
//       );

//       const fyEndYear = Number(
//         financial_year.substring(5, 7)
//       );

//       if (
//         fyEndYear !==
//         Number(String(fyStartYear + 1).slice(-2))
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Invalid financial year. Example: 2026-27",
//         });
//       }

//       // ----------------------------------------------------------
//       // CONVERT DD-MM-YYYY -> YYYY-MM-DD
//       // ----------------------------------------------------------
//       const sqlHolidayDate =
//         holidayMasterController.convertToSqlDate(
//           holiday_date
//         );

//       if (!sqlHolidayDate) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Invalid holiday date. Use DD-MM-YYYY format. Example: 15-08-2026",
//         });
//       }

//       // ----------------------------------------------------------
//       // FY DATE RANGE VALIDATION
//       // ----------------------------------------------------------
//       const holidayDateObject = new Date(
//         `${sqlHolidayDate}T00:00:00Z`
//       );

//       const startDate = new Date(
//         `${fyStartYear}-04-01T00:00:00Z`
//       );

//       const endDate = new Date(
//         `${fyStartYear + 1}-03-31T23:59:59Z`
//       );

//       if (
//         holidayDateObject < startDate ||
//         holidayDateObject > endDate
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             `Holiday date must be between 01-04-${fyStartYear} and 31-03-${fyStartYear + 1}`,
//         });
//       }

//       // ----------------------------------------------------------
//       // CREATE HOLIDAY
//       // ----------------------------------------------------------
//       const data =
//         await holidayMasterModel.createHoliday({
//           financial_year,
//           holiday_date: sqlHolidayDate,
//           holiday_name: holiday_name.trim(),
//           holiday_type:
//             holiday_type?.trim() || null,
//           company_id: Number(company_id),
//           branch_ids: normalizedBranchIds,
//           description:
//             description?.trim() || null,
//           created_by: created_by
//             ? Number(created_by)
//             : null,
//           created_by_name:
//             created_by_name?.trim() || null,
//         });

//       // Return date as DD-MM-YYYY
//       const formattedData = data.map((holiday) => ({
//         ...holiday,
//         holiday_date:
//           holidayMasterController.formatDateForResponse(
//             holiday.holiday_date
//           ),
//       }));

//       return res.status(201).json({
//         success: true,
//         message:
//           "Holiday created successfully for selected branches",
//         data: formattedData,
//       });
//     } catch (error) {
//       console.error("Error in createHoliday:", error);

//       // SQL Server duplicate key errors
//       if (
//         error.number === 2627 ||
//         error.number === 2601
//       ) {
//         return res.status(409).json({
//           success: false,
//           message:
//             "Holiday already exists for one of the selected branches on this date",
//         });
//       }

//       return res.status(500).json({
//         success: false,
//         message: "Failed to create holiday",
//         error: error.message,
//       });
//     }
//   },

//   // ============================================================
//   // UPDATE HOLIDAY
//   // ============================================================
//   updateHoliday: async (req, res) => {
//     try {
//       const { id } = req.params;

//       const {
//         financial_year,
//         holiday_date,
//         holiday_name,
//         holiday_type,
//         company_id,
//         branch_id,
//         description,
//         active,
//         modified_by,
//         modified_by_name,
//       } = req.body;

//       // ----------------------------------------------------------
//       // ID VALIDATION
//       // ----------------------------------------------------------
//       if (!id) {
//         return res.status(400).json({
//           success: false,
//           message: "Holiday ID is required",
//         });
//       }

//       if (isNaN(Number(id))) {
//         return res.status(400).json({
//           success: false,
//           message: "Invalid holiday ID",
//         });
//       }

//       // ----------------------------------------------------------
//       // REQUIRED FIELD VALIDATION
//       // ----------------------------------------------------------
//       if (!financial_year) {
//         return res.status(400).json({
//           success: false,
//           message: "Financial year is required",
//         });
//       }

//       if (!/^\d{4}-\d{2}$/.test(financial_year)) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Financial year must be in YYYY-YY format",
//         });
//       }

//       if (!holiday_date) {
//         return res.status(400).json({
//           success: false,
//           message: "Holiday date is required",
//         });
//       }

//       if (!holiday_name || !holiday_name.trim()) {
//         return res.status(400).json({
//           success: false,
//           message: "Holiday name is required",
//         });
//       }

//       if (!company_id) {
//         return res.status(400).json({
//           success: false,
//           message: "Company is required",
//         });
//       }

//       if (!branch_id) {
//         return res.status(400).json({
//           success: false,
//           message: "Branch is required",
//         });
//       }

//       // ----------------------------------------------------------
//       // FINANCIAL YEAR VALIDATION
//       // ----------------------------------------------------------
//       const fyStartYear = Number(
//         financial_year.substring(0, 4)
//       );

//       const fyEndYear = Number(
//         financial_year.substring(5, 7)
//       );

//       if (
//         fyEndYear !==
//         Number(String(fyStartYear + 1).slice(-2))
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Invalid financial year. Example: 2026-27",
//         });
//       }

//       // ----------------------------------------------------------
//       // CONVERT DD-MM-YYYY -> YYYY-MM-DD
//       // ----------------------------------------------------------
//       const sqlHolidayDate =
//         holidayMasterController.convertToSqlDate(
//           holiday_date
//         );

//       if (!sqlHolidayDate) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Invalid holiday date. Use DD-MM-YYYY format. Example: 15-08-2026",
//         });
//       }

//       // ----------------------------------------------------------
//       // FY DATE RANGE VALIDATION
//       // ----------------------------------------------------------
//       const holidayDateObject = new Date(
//         `${sqlHolidayDate}T00:00:00Z`
//       );

//       const startDate = new Date(
//         `${fyStartYear}-04-01T00:00:00Z`
//       );

//       const endDate = new Date(
//         `${fyStartYear + 1}-03-31T23:59:59Z`
//       );

//       if (
//         holidayDateObject < startDate ||
//         holidayDateObject > endDate
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             `Holiday date must be between 01-04-${fyStartYear} and 31-03-${fyStartYear + 1}`,
//         });
//       }

//       // ----------------------------------------------------------
//       // ACTIVE VALIDATION
//       // 0 = Active
//       // 1 = Inactive
//       // ----------------------------------------------------------
//       let holidayActive = 0;

//       if (
//         active !== undefined &&
//         active !== null
//       ) {
//         holidayActive = Number(active);
//       }

//       if (![0, 1].includes(holidayActive)) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Active must be either 0 or 1",
//         });
//       }

//       // ----------------------------------------------------------
//       // UPDATE HOLIDAY
//       // ----------------------------------------------------------
//       const data =
//         await holidayMasterModel.updateHoliday({
//           id: Number(id),
//           financial_year,
//           holiday_date: sqlHolidayDate,
//           holiday_name: holiday_name.trim(),
//           holiday_type:
//             holiday_type?.trim() || null,
//           company_id: Number(company_id),
//           branch_id: Number(branch_id),
//           description:
//             description?.trim() || null,
//           active: holidayActive,
//           modified_by: modified_by
//             ? Number(modified_by)
//             : null,
//           modified_by_name:
//             modified_by_name?.trim() || null,
//         });

//       return res.status(200).json({
//         success: true,
//         message: "Holiday updated successfully",
//         data: {
//           ...data,
//           holiday_date:
//             holidayMasterController.formatDateForResponse(
//               data.holiday_date
//             ),
//         },
//       });
//     } catch (error) {
//       console.error("Error in updateHoliday:", error);

//       if (
//         error.number === 2627 ||
//         error.number === 2601
//       ) {
//         return res.status(409).json({
//           success: false,
//           message:
//             "Holiday already exists for this branch on this date",
//         });
//       }

//       if (
//         error.message === "Holiday not found"
//       ) {
//         return res.status(404).json({
//           success: false,
//           message: error.message,
//         });
//       }

//       return res.status(500).json({
//         success: false,
//         message: "Failed to update holiday",
//         error: error.message,
//       });
//     }
//   },

//   // ============================================================
//   // DELETE / DEACTIVATE HOLIDAY
//   // ============================================================
//   deleteHoliday: async (req, res) => {
//     try {
//       const { id } = req.params;

//       const {
//         modified_by,
//         modified_by_name,
//       } = req.body;

//       if (!id) {
//         return res.status(400).json({
//           success: false,
//           message: "Holiday ID is required",
//         });
//       }

//       if (isNaN(Number(id))) {
//         return res.status(400).json({
//           success: false,
//           message: "Invalid holiday ID",
//         });
//       }

//       const data =
//         await holidayMasterModel.deleteHoliday({
//           id: Number(id),
//           modified_by: modified_by
//             ? Number(modified_by)
//             : null,
//           modified_by_name:
//             modified_by_name?.trim() || null,
//         });

//       return res.status(200).json({
//         success: true,
//         message: "Holiday deleted successfully",
//         data: {
//           ...data,
//           holiday_date:
//             holidayMasterController.formatDateForResponse(
//               data.holiday_date
//             ),
//         },
//       });
//     } catch (error) {
//       console.error("Error in deleteHoliday:", error);

//       if (
//         error.message === "Holiday not found"
//       ) {
//         return res.status(404).json({
//           success: false,
//           message: error.message,
//         });
//       }

//       return res.status(500).json({
//         success: false,
//         message: "Failed to delete holiday",
//         error: error.message,
//       });
//     }
//   },
// };

// module.exports = holidayMasterController;