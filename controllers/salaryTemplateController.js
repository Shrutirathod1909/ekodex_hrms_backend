const salaryTemplateModel = require("../models/salaryTemplateModel");
const ExcelJS = require("exceljs");
const formatExcelDate = (value) => {
  if (!value) {
    return null;
  }

  // Already Date object
  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      return null;
    }

    return value;
  }

  const str = String(value).trim();

  // SQL Server format:
  // Aug 12 2026  1:44PM

  const match = str.match(
    /^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i,
  );

  if (!match) {
    console.log("INVALID EXCEL DATE:", value);

    return null;
  }

  const monthMap = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };

  const month =
    monthMap[
      match[1].substring(0, 1).toUpperCase() +
        match[1].substring(1).toLowerCase()
    ];

  const day = parseInt(match[2], 10);

  const year = parseInt(match[3], 10);

  let hour = parseInt(match[4], 10);

  const minute = parseInt(match[5], 10);

  const second = parseInt(match[6] || "0", 10);

  const ampm = match[7].toUpperCase();

  // =================================================
  // 12 HOUR -> 24 HOUR
  // =================================================

  if (ampm === "PM" && hour !== 12) {
    hour += 12;
  }

  if (ampm === "AM" && hour === 12) {
    hour = 0;
  }

  const date = new Date(year, month, day, hour, minute, second);

  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
};
const salaryTemplateController = {
  // =====================================================
  // GET ALL
  // =====================================================
  getAll: async (req, res) => {
    try {
      // =============================================
      // SEARCH PARAMETERS
      // =============================================

      let searchFields = [];

      if (req.query.searchFields) {
        try {
          searchFields = JSON.parse(req.query.searchFields);

          if (!Array.isArray(searchFields)) {
            searchFields = [];
          }
        } catch (parseError) {
          console.error("Search Fields JSON Parse Error:", parseError);

          return res.status(400).json({
            success: false,
            message: "Invalid searchFields format",
          });
        }
      }

      // =============================================
      // DATE FILTER
      // =============================================

      const fromDate = req.query.fromDate || null;

      const toDate = req.query.toDate || null;

      // =============================================
      // LOG
      // =============================================

      console.log("========================================");

      console.log("SALARY TEMPLATE GET ALL");

      console.log("Search Fields:", searchFields);

      console.log("From Date:", fromDate);

      console.log("To Date:", toDate);

      console.log("========================================");

      // =============================================
      // MODEL CALL
      // =============================================

      const data = await salaryTemplateModel.getAll(req.user, {
        searchFields,
        fromDate,
        toDate,
      });

      return res.status(200).json({
        success: true,
        data: data,
      });
    } catch (error) {
      console.error("Salary Template GetAll Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch salary templates",
        error: error.message,
      });
    }
  },

  // =====================================================
  // GET BY ID
  // =====================================================
  getById: async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Salary template ID is required",
        });
      }

      const data = await salaryTemplateModel.getById(id);

      if (!data) {
        return res.status(404).json({
          success: false,
          message: "Salary template not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: data,
      });
    } catch (error) {
      console.error("Salary Template GetById Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch salary template",
        error: error.message,
      });
    }
  },

  // =====================================================
  // CREATE
  // =====================================================
  create: async (req, res) => {
    try {
      const data = req.body;

      if (!data.template_name) {
        return res.status(400).json({
          success: false,
          message: "Template name is required",
        });
      }

      const result = await salaryTemplateModel.create(data, req.user);

      return res.status(201).json({
        success: true,
        message: "Salary template created successfully",
        data: result,
      });
    } catch (error) {
      console.error("Salary Template Create Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create salary template",
        error: error.message,
      });
    }
  },

  // =====================================================
  // UPDATE
  // =====================================================
  update: async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Salary template ID is required",
        });
      }

      const existing = await salaryTemplateModel.getById(id);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Salary template not found",
        });
      }

      const result = await salaryTemplateModel.update(id, req.body, req.user);

      return res.status(200).json({
        success: true,
        message: "Salary template updated successfully",
        data: result,
      });
    } catch (error) {
      console.error("Salary Template Update Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update salary template",
        error: error.message,
      });
    }
  },

  // =====================================================
  // DELETE
  // =====================================================
  delete: async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Salary template ID is required",
        });
      }

      const existing = await salaryTemplateModel.getById(id);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Salary template not found",
        });
      }

      const result = await salaryTemplateModel.delete(id, req.user);

      return res.status(200).json({
        success: true,
        message: "Salary template deleted successfully",
        data: result,
      });
    } catch (error) {
      console.error("Salary Template Delete Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to delete salary template",
        error: error.message,
      });
    }
  },

  // =====================================================
  // RESTORE
  // =====================================================
  restore: async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Salary template ID is required",
        });
      }

      const result = await salaryTemplateModel.restore(id, req.user);

      if (!result) {
        return res.status(404).json({
          success: false,
          message: "Salary template not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Salary template restored successfully",
        data: result,
      });
    } catch (error) {
      console.error("Salary Template Restore Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to restore salary template",
        error: error.message,
      });
    }
  },
  // =====================================================
  // EXPORT SALARY TEMPLATE EXCEL
  // =====================================================

  // =====================================================
  // EXPORT SALARY TEMPLATE EXCEL
  // =====================================================

  exportExcel: async (req, res) => {
    try {
      console.log("====================================");
      console.log("SALARY TEMPLATE EXCEL EXPORT");
      console.log("REQ QUERY:", req.query);
      console.log("====================================");

      // =================================================
      // SEARCH FIELDS
      // =================================================

      let searchFields = [];

      if (req.query.searchFields) {
        try {
          searchFields = JSON.parse(req.query.searchFields);

          if (!Array.isArray(searchFields)) {
            searchFields = [];
          }
        } catch (parseError) {
          console.error("SEARCH JSON PARSE ERROR:", parseError);

          return res.status(400).json({
            success: false,
            message: "Invalid searchFields format.",
          });
        }
      }

      // =================================================
      // DATE FILTER
      // =================================================

      const fromDate = req.query.fromDate || null;

      const toDate = req.query.toDate || null;

      // =================================================
      // GET DATA
      // =================================================

      const data = await salaryTemplateModel.exportExcel(req.user, {
        searchFields,
        fromDate,
        toDate,
      });

      console.log("EXPORT RECORD COUNT:", data.length);

      // =================================================
      // WORKBOOK
      // =================================================

      const workbook = new ExcelJS.Workbook();

      const worksheet = workbook.addWorksheet("Salary Templates");

      // =================================================
      // COLUMNS
      // =================================================

      worksheet.columns = [
        {
          header: "Sr No.",
          key: "sr_no",
          width: 10,
        },

        {
          header: "Template Name",
          key: "template_name",
          width: 30,
        },

        {
          header: "Rank",
          key: "rank",
          width: 25,
        },

        {
          header: "Gross Salary",
          key: "gross_salary",
          width: 18,
        },

        {
          header: "Gross Salary Type",
          key: "gross_salary_type",
          width: 20,
        },

        {
          header: "Basic Salary",
          key: "basic_salary",
          width: 18,
        },

        {
          header: "Basic Salary Type",
          key: "basic_salary_type",
          width: 20,
        },

        {
          header: "Per Day Salary",
          key: "perday_salary",
          width: 18,
        },

        {
          header: "HRA",
          key: "hra",
          width: 18,
        },

        {
          header: "Company ID",
          key: "company_id",
          width: 15,
        },

        {
          header: "Branch ID",
          key: "branch_id",
          width: 15,
        },

        {
          header: "Created On",
          key: "created_on",
          width: 22,
        },
      ];

      // =================================================
      // HEADER STYLE
      // =================================================

      const headerRow = worksheet.getRow(1);

      headerRow.font = {
        bold: true,
      };

      headerRow.alignment = {
        horizontal: "center",
        vertical: "middle",
      };

      // =================================================
      // ADD DATA
      // =================================================

      if (Array.isArray(data) && data.length > 0) {
        data.forEach((row, index) => {
          worksheet.addRow({
            sr_no: index + 1,

            template_name: row.template_name ?? "",

            rank: row.rank ?? "",

            gross_salary: row.gross_salary ?? "",

            gross_salary_type: row.gross_salary_type ?? "",

            basic_salary: row.basic_salary ?? "",

            basic_salary_type: row.basic_salary_type ?? "",

            perday_salary: row.perday_salary ?? "",

            hra: row.hra ?? "",

            company_id: row.company_id ?? "",

            branch_id: row.branch_id ?? "",

            created_on: formatExcelDate(row.created_on),
          });
        });
      }

      // =================================================
      // CREATED ON COLUMN
      // =================================================

      worksheet.getColumn("created_on").alignment = {
        horizontal: "center",
      };

      // =================================================
      // SALARY NUMBER FORMAT
      // =================================================

      worksheet.getColumn("gross_salary").numFmt = "#,##0.00";

      worksheet.getColumn("basic_salary").numFmt = "#,##0.00";

      worksheet.getColumn("perday_salary").numFmt = "#,##0.00";

      worksheet.getColumn("hra").numFmt = "#,##0.00";

      // =================================================
      // ALIGNMENT
      // =================================================

      worksheet.getColumn("sr_no").alignment = {
        horizontal: "center",
      };

      worksheet.getColumn("company_id").alignment = {
        horizontal: "center",
      };

      worksheet.getColumn("branch_id").alignment = {
        horizontal: "center",
      };

      // =================================================
      // FREEZE HEADER
      // =================================================

      worksheet.views = [
        {
          state: "frozen",
          ySplit: 1,
        },
      ];

      // =================================================
      // AUTO FILTER
      // =================================================

      worksheet.autoFilter = {
        from: "A1",
        to: "L1",
      };

      // =================================================
      // REMOVE COMPLETELY EMPTY ROWS
      // =================================================

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          return;
        }

        const values = row.values.slice(1).map((value) => {
          if (value === null || value === undefined) {
            return "";
          }

          return String(value).trim();
        });

        const isEmpty = values.every((value) => value === "");

        if (isEmpty) {
          worksheet.spliceRows(rowNumber, 1);
        }
      });

      // =================================================
      // RESPONSE HEADERS
      // =================================================

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="salary_templates.xlsx"',
      );

      // =================================================
      // WRITE EXCEL
      // =================================================

      await workbook.xlsx.write(res);

      res.end();
    } catch (error) {
      console.error("====================================");

      console.error("SALARY TEMPLATE EXPORT ERROR:", error);

      console.error("====================================");

      if (!res.headersSent) {
        return res.status(500).json({
          success: false,

          message: "Failed to export salary templates.",

          error: error.message,
        });
      }
    }
  },
};

module.exports = salaryTemplateController;
