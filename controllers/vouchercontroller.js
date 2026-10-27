const VoucherModel = require("../models/Vouchermodels");
const { poolPromise } = require("../config/db");
const logger = require("../utils/logger");
const sql = require("mssql");
const ExcelJS = require("exceljs");
const XLSX = require("xlsx");
const VoucherController = {
  async getCompanies(req, res) {
    try {
      logger.info("🔥 getCompanies API HIT");

      const data = await VoucherModel.getAllCompanies();

      const companyMap = {};

      data.forEach((row) => {
        if (!companyMap[row.id]) {
          companyMap[row.id] = {
            id: row.id,
            title: row.company_name,
            company_id: row.company_id,
            client_code: row.id,
            client_bank:
              row.client_bank_name && row.client_acc_no
                ? {
                    bank_name: row.client_bank_name,
                    acc_no: row.client_acc_no,
                    ifsc: row.client_ifsc,
                    branch: row.bank_branch,
                    city: row.bank_city,
                    micr: row.micr_code,
                  }
                : null,
            banks: [],
          };
        }

        // BANK DETAILS
        if (row.bank_id) {
          companyMap[row.id].banks.push({
            bank_id: row.bank_id,
            bank_name: row.bank_name,
            client_acc_no: row.ac_no,
            ifsc_code: row.ifsc_code,
            bank_city: row.branch_city,
            micr_code: row.micr_no,
          });
        }
      });

      const formatted = Object.values(companyMap);

      logger.info(`Companies fetched: ${formatted.length}`);

      res.json({
        error: false,
        message: "Companies fetched successfully!!",
        user: formatted,
      });
    } catch (err) {
      logger.error("❌ getCompanies ERROR", err);

      res.status(500).json({
        error: true,
        message: err.message,
        user: [],
      });
    }
  },

  async getBranches(req, res) {
    try {
      const { client_id } = req.body;

      logger.info("🔥 getBranches API HIT", { client_id });

      if (!client_id) {
        logger.warn("⚠️ client_id missing");
        return res.status(400).json({
          error: true,
          message: "client_id parameter required",
        });
      }

      const data = await VoucherModel.getAllBranches(client_id);

      logger.info(`Branches fetched: ${data.length}`);

      const formatted = data.map((row) => ({
        id: row.id,
        site_id: row.id,
        site_name: row.site_name,
        title: `${row.site_name}-${row.client_code}`,
        client_code: row.client_code,
      }));

      res.json({
        error: false,
        message: data.length
          ? "Branches fetched successfully!!"
          : "No branches found",
        user: formatted,
      });
    } catch (err) {
      logger.error("❌ getBranches ERROR", err);

      res.status(500).json({
        error: true,
        message: err.message,
        user: [],
      });
    }
  },
  // ================= GET CHARGES TYPE =================
  async getAllChargesType(req, res) {
    try {
      logger.info("🔥 getAllChargesType API HIT");

      const data = await VoucherModel.getAllChargesType();

      logger.info(`Charges Type fetched: ${data.length}`);

      res.status(200).json({
        success: true,
        message: "Charges Type List Fetch Successfully",
        data: data,
      });
    } catch (error) {
      logger.error("❌ getAllChargesType ERROR", error);

      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },
  // ================= GET EMPLOYEES =================
  async getEmployees(req, res) {
    try {
      logger.info("🔥 getEmployees API HIT");

      const { client_id, site_id } = req.body; // or req.query

      const data = await VoucherModel.getEmployees(client_id, site_id);

      logger.info(`Employees fetched: ${data.length}`);

      res.status(200).json({
        success: true,
        message: "Employee List Fetch Successfully",
        data: data,
      });
    } catch (error) {
      logger.error("❌ getEmployees ERROR", error);

      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },
  async getAllVouchers(req, res) {
    try {
      const { search = "", fromDate = "", toDate = "" } = req.query;

      const data = await VoucherModel.getAllVouchers({
        search,
        fromDate,
        toDate,
      });

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  // ================= GET SINGLE =================
  async getVoucher(req, res) {
    try {
      const id = req.params.id;

      const data = await VoucherModel.getVoucherById(id);

      if (!data) {
        return res.status(404).json({
          success: false,
          message: "Voucher not found",
        });
      }

      res.json({
        success: true,
        data,
      });
    } catch (err) {
      logger.log(err);
      res.status(500).json({
        success: false,
        message: "Server Error",
      });
    }
  },

  // ================= CREATE =================

async createVoucher(req, res) {
  try {
    const {
      company_id,
      branch_id,
      client_id,
      site_id,
    } = req.body;

    console.log("Company ID:", company_id);
    console.log("Branch ID:", branch_id);
    console.log("Client ID:", client_id);
    console.log("Site ID:", site_id);

    // Set default status from backend
    const voucherData = {
      ...req.body,
      status: "Pending",
    };

    const result = await VoucherModel.createVoucher(voucherData);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.message,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Voucher created successfully",
      status: "Pending",
      result,
    });

  } catch (error) {
    console.error("CREATE VOUCHER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
},

  async updateVoucher(req, res) {
    try {
      const id = req.params.id;

      const result = await VoucherModel.updateVoucher(id, req.body);

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  // ================= DELETE =================
  async deleteVoucher(req, res) {
    try {
      const { id } = req.params;

      const { disabled_by, deleted_by_name } = req.body;

      logger.info("DELETE VOUCHER REQUEST", {
        id,
        disabled_by,
        deleted_by_name,
      });

      const result = await VoucherModel.deleteVoucher(
        id,
        disabled_by,
        deleted_by_name,
      );

      // ✅ NO ROW UPDATED
      if (result.rowsAffected[0] === 0) {
        logger.warn("DELETE VOUCHER NOT FOUND OR ALREADY DELETED", {
          id,
        });

        return res.status(404).json({
          success: false,
          message: "Voucher not found or already deleted",
        });
      }

      logger.info("DELETE VOUCHER SUCCESS", {
        id,
        rowsAffected: result.rowsAffected[0],
      });

      return res.status(200).json({
        success: true,
        message: "Voucher deleted successfully",
        status: "Deleted",
      });
    } catch (error) {
      logger.error("DELETE VOUCHER ERROR", {
        message: error.message,
        stack: error.stack,
        id: req.params.id,
      });

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },
  async approveVoucher(req, res) {
    try {
      const { id } = req.params;

      const { approved_by, approved_by_name } = req.body;

      logger.info("APPROVE REQUEST", {
        id,
        approved_by,
        approved_by_name,
      });

      // ✅ MODEL CALL
      const result = await VoucherModel.approveVoucher(
        id,
        approved_by,
        approved_by_name,
      );

      // ✅ NO ROW UPDATED
      if (result.rowsAffected[0] === 0) {
        logger.warn("APPROVE FAILED", { id });

        return res.status(404).json({
          success: false,
          message: "Voucher not found or already approved",
        });
      }

      logger.info("APPROVE SUCCESS", {
        id,
        rowsAffected: result.rowsAffected[0],
      });

      return res.status(200).json({
        success: true,
        message: "Voucher approved successfully",
        status: "Approved",
      });
    } catch (error) {
      logger.error("APPROVE ERROR", {
        message: error.message,
        stack: error.stack,
        id: req.params.id,
      });

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },
  async rejectVoucherController(req, res) {
    try {
      const id = req.params.id;

      const { rejected_by, rejected_by_name } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Voucher ID required",
        });
      }

      const result = await VoucherModel.rejectVoucher(id, {
        rejected_by,
        rejected_by_name,
      });

      if (result.rowsAffected[0] === 0) {
        return res.status(404).json({
          success: false,
          message: "Voucher not found",
        });
      }

      return res.json({
        success: true,
        message: "Voucher Rejected Successfully",
        data: result,
      });
    } catch (err) {
      logger.log("CONTROLLER REJECT ERROR:", err);

      return res.status(500).json({
        success: false,
        message: "Server Error",
        error: err.message,
      });
    }
  },

  async downloadUTRTemplate(req, res) {
    try {
      logger.log("🚀 DOWNLOAD UTR TEMPLATE STARTED");

      const data = await VoucherModel.getApprovedVoucherData();

      logger.log("📦 DATA RECEIVED:", data);

      if (!data || data.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No approved vouchers found",
        });
      }

      const templateData = data.map((item) => ({
        "Voucher No": item.voucher_no || "",
        "Beneficiary Name": item.beneficiary_name || "",
        "Beneficiary Ac No": item.bank_ac_no || "",
        IFSC: item.ifsc_code || "",
        Amt: item.amount || "",
        "Pay Mode": item.mode || "",
        Date: item.payment_date
          ? new Date(item.payment_date).toISOString().split("T")[0]
          : "",
        "UTR No": item.utr_no || "",
      }));

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(templateData);

      XLSX.utils.book_append_sheet(workbook, worksheet, "UTR Upload");

      const buffer = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      res.setHeader(
        "Content-Disposition",
        "attachment; filename=UTR_Template.xlsx",
      );

      return res.send(buffer);
    } catch (error) {
      // 🔥 VERY IMPORTANT
      console.log("❌ FULL ERROR:", error);
      console.log("❌ STACK:", error.stack);

      logger.log("❌ TEMPLATE DOWNLOAD FAILED:", error.message);

      return res.status(500).json({
        success: false,
        message: error.message, // 👈 show real error
        stack: error.stack, // 👈 temporary for debugging
      });
    }
  },

  async uploadUTRFile(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Excel file is required",
        });
      }

      const workbook = XLSX.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];

      const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        defval: "",
      });

      const pool = await poolPromise;

      let updated = 0;
      let skipped = 0;

      // 🔥 USER INFO
      const userId = req.user?.id || req.body?.user_id || null;
      const userName =
        req.user?.name || req.user?.username || req.body?.user_name || "System";

      for (const row of sheetData) {
        const voucher_no_raw = String(row["Voucher No"] || "").trim();

        const voucher_no = voucher_no_raw
          ? voucher_no_raw.padStart(4, "0")
          : "";

        const utr_no = String(row["UTR No"] || "").trim();

        console.log(voucher_no, "voucher no");
        console.log(utr_no, "utr no");

        if (!voucher_no || !utr_no) {
          skipped++;
          continue;
        }

        if (
          utr_no.toLowerCase() === "undefined" ||
          utr_no.toLowerCase() === "null"
        ) {
          skipped++;
          continue;
        }

        try {
          const result = await pool
            .request()
            .input("voucher_no", sql.VarChar(50), voucher_no)
            .input("utr_no", sql.VarChar(50), utr_no)
            .input("utr_updated_by", sql.Int, userId)
            .input("utr_updated_by_name", sql.VarChar(100), userName)
            .input("utr_updated_on", sql.DateTime, new Date()).query(`
            UPDATE emp_advance
            SET 
              utr_no = @utr_no,
              status = 'Payment done',
              utr_updated_by = @utr_updated_by,
              utr_updated_by_name = @utr_updated_by_name,
              utr_updated_on = @utr_updated_on
            WHERE voucher_no = @voucher_no
          `);

          if (result.rowsAffected[0] > 0) {
            updated++;
          } else {
            skipped++;
          }
        } catch (dbErr) {
          console.error("DB ERROR:", dbErr);
          skipped++;
        }
      }

      return res.json({
        success: true,
        message: "UTR uploaded successfully",
        updated,
        skipped,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },
  async exportEmployees(req, res) {
    try {
      const { client_id, site_id } = req.query;

      const data = await VoucherModel.getEmployees(client_id, site_id);

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Employees");

      // HEADER
      sheet.columns = [
        { header: "SR NO", key: "sr", width: 8 },
        { header: "CLIENT NAME", key: "client_name", width: 20 },
        { header: "SITE NAME", key: "site_name", width: 20 },
        { header: "CLIENT CODE", key: "client_code", width: 15 },

        { header: "EMPLOYEE NAME", key: "emp_name", width: 25 },
        { header: "EMPLOYEE CODE", key: "emp_code", width: 18 },

        { header: "DATE", key: "date", width: 15 },
        { header: "PAYMENT DETAIL", key: "payment_detail", width: 25 },
        { header: "AMOUNT", key: "amount", width: 12 },

        { header: "BANK NAME", key: "bank_name", width: 20 },
        { header: "BANK HOLDER NAME", key: "ac_holder_name", width: 25 },
        { header: "IFSC CODE", key: "ifsc", width: 15 },
        { header: "ACCOUNT NO", key: "account_no", width: 20 },

        { header: "VENDOR / GANG NAME", key: "vendor_name", width: 25 },
        { header: "VENDOR COMMISSION", key: "vendor_commission", width: 18 },

        { header: "FROM BANK", key: "from_bank", width: 20 },
        { header: "FROM BANK ACCOUNT NO", key: "from_bank_acc", width: 22 },
        { header: "FROM BANK IFSC CODE", key: "from_bank_ifsc", width: 20 },
      ];

      // DATA
      data.forEach((emp, index) => {
        sheet.addRow({
          sr: index + 1,
          client_name: emp.client_name,
          site_name: emp.site_name,
          emp_name: emp.emp_full_name,
          emp_code: emp.employee_code,
          bank_name: emp.bank_name,
          account_no: emp.account_no,
          ifsc: emp.bank_ifsc,
          holder: emp.ac_holder_name,
        });
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      res.setHeader(
        "Content-Disposition",
        "attachment; filename=employees.xlsx",
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.log(error);
      console.log(error.response?.data);
      res.status(500).json({ success: false, message: error.message });
    }
  },
  async bulkUploadEmpAdvance(req, res) {
    try {
      logger.info("🔥 Emp Advance Bulk Upload HIT");

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      const client_id = req.body.client_id;
      const site_id = req.body.site_id;

      // EMPLOYEE LIST
      const employees = await VoucherModel.getEmployees(client_id, site_id);

      // LAST VOUCHER NO
      const lastVoucher = await VoucherModel.getLastVoucherNo();

      let startNo = 0;

      if (lastVoucher) {
        const num = parseInt(lastVoucher);

        startNo = isNaN(num) ? 0 : num;
      }

      // READ EXCEL
      const workbook = XLSX.readFile(req.file.path);

      const sheetName = workbook.SheetNames[0];

      const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

      if (!rawData.length) {
        return res.status(400).json({
          success: false,
          message: "Empty Excel file",
        });
      }

      // MAP DATA
      const sheetData = rawData.map((row, index) => {
        // FIND EMPLOYEE
        const emp = employees.find(
          (e) =>
            String(e.employee_code).trim() ===
            String(row["EMPLOYEE CODE"]).trim(),
        );

        return {
          client_id,
          site_id,

          emp_id: emp?.id || null,

          client_name: row["CLIENT NAME"] || null,

          site_name: row["SITE NAME"] || null,

          client_code: row["CLIENT CODE"] || null,

          emp_name: row["EMPLOYEE NAME"] || null,

          emp_code: row["EMPLOYEE CODE"] || null,

          adv_date: row["DATE"] || null,

          payment_detail: row["PAYMENT DETAIL"] || null,

          amount: row["AMOUNT"] || 0,

          bank_name: row["BANK NAME"] || null,

          ac_holder_name: row["BANK HOLDER NAME"] || null,

          ifsc_code: row["IFSC CODE"] || null,

          bank_ac_no: row["ACCOUNT NO"] || null,

          vendor_name: row["VENDOR / GANG NAME"] || null,

          vendor_comm: row["VENDOR COMMISSION"] || 0,

          from_bank: row["FROM BANK"] || null,

          from_bank_acno: row["FROM BANK ACCOUNT NO"] || null,

          from_bank_ifsc: row["FROM BANK IFSC CODE"] || null,

          // AUTO VOUCHER NO
          voucher_no: String(startNo + index + 1).padStart(4, "0"),

          created_by: req.user?.id || null,

          created_by_name: req.user?.email || "Admin",
          status: "pending",

          active: 0,
        };
      });

      // INSERT
      const result = await VoucherModel.bulkInsertEmpAdvance(sheetData);

      return res.status(200).json({
        success: true,
        message: "Bulk Upload Successful",
        inserted: result.length,
      });
    } catch (error) {
      console.log("======== ERROR START ========");

      console.log(error);

      console.log("MESSAGE =>", error.message);

      console.log("STACK =>", error.stack);

      console.log("======== ERROR END ========");

      return res.status(500).json({
        success: false,
        message: "Bulk Upload Failed",
        error: error.message,
      });
    }
  },
};
module.exports = VoucherController;
