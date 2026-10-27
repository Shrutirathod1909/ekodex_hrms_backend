const salaryModel = require("../models/salaryModel");

const salaryController = {
  getSiteWiseSalary: async (req, res) => {
    try {
      const { month, year, site_id = "", client_id = "" } = req.query;

      // =============================================
      // VALIDATION
      // =============================================

      if (
        month === undefined ||
        month === "" ||
        year === undefined ||
        year === ""
      ) {
        return res.status(400).json({
          success: false,

          message: "Month and year are required",
        });
      }

      // =============================================
      // GET DATA
      // =============================================

      const data = await salaryModel.getSiteWiseSalary({
        month,
        year,
        site_id,
        client_id,
      });

      // =============================================
      // TOTAL SUMMARY
      // =============================================

      const summary = {
        total_sites: data.length,

        total_employees: data.reduce(
          (sum, row) => sum + Number(row.total_employees || 0),
          0,
        ),

        total_earned_gross: data.reduce(
          (sum, row) => sum + Number(row.total_earned_gross || 0),
          0,
        ),

        total_deduction: data.reduce(
          (sum, row) => sum + Number(row.total_deduction || 0),
          0,
        ),

        total_net_take_home: data.reduce(
          (sum, row) => sum + Number(row.total_net_take_home || 0),
          0,
        ),

        total_salary_payable: data.reduce(
          (sum, row) => sum + Number(row.total_salary_payable || 0),
          0,
        ),

        total_pf: data.reduce((sum, row) => sum + Number(row.total_pf || 0), 0),

        total_esic: data.reduce(
          (sum, row) => sum + Number(row.total_esic || 0),
          0,
        ),

        total_ot_wages: data.reduce(
          (sum, row) => sum + Number(row.total_ot_wages || 0),
          0,
        ),

        total_emp_ctc: data.reduce(
          (sum, row) => sum + Number(row.total_emp_ctc || 0),
          0,
        ),

        total_service_charges: data.reduce(
          (sum, row) => sum + Number(row.total_service_charges || 0),
          0,
        ),

        total_cgst: data.reduce(
          (sum, row) => sum + Number(row.total_cgst || 0),
          0,
        ),

        total_sgst: data.reduce(
          (sum, row) => sum + Number(row.total_sgst || 0),
          0,
        ),

        total_igst: data.reduce(
          (sum, row) => sum + Number(row.total_igst || 0),
          0,
        ),

        total_invoice_amount: data.reduce(
          (sum, row) => sum + Number(row.total_invoice_amount || 0),
          0,
        ),
      };

      // =============================================
      // RESPONSE
      // =============================================

      return res.status(200).json({
        success: true,

        message: "Site wise salary fetched successfully",

        filters: {
          month,
          year,
          site_id,
          client_id,
        },

        summary,

        data,
      });
    } catch (error) {
      console.error("==========================================");
      console.error("getSiteWiseSalary ERROR");
      console.error("Message:", error.message);
      console.error("Number:", error.number);
      console.error("State:", error.state);
      console.error("Class:", error.class);
      console.error("Line:", error.line);
      console.error("Procedure:", error.procName);
      console.error("Original Error:", error.originalError);
      console.error("==========================================");

      return res.status(500).json({
        success: false,

        message: "Failed to fetch site wise salary",

        error: error.message,

        sqlError: {
          number: error.number,
          state: error.state,
          class: error.class,
          line: error.line,
          procedure: error.procName,
        },
      });
    }
  },

  getSiteSalaryEmployees: async (req, res) => {
    try {
      const { site_id, month, year } = req.query;

      // =============================================
      // VALIDATION
      // =============================================

      if (!site_id || !month || !year) {
        return res.status(400).json({
          success: false,

          message: "site_id, month and year are required",
        });
      }

      // =============================================
      // GET EMPLOYEES
      // =============================================

      const data = await salaryModel.getSiteSalaryEmployees({
        site_id,
        month,
        year,
      });

      // =============================================
      // FIRST RECORD
      // =============================================

      const firstEmployee = data.length > 0 ? data[0] : null;

      // =============================================
      // BILLING COMPANY
      // =============================================

      const billingCompany = firstEmployee
        ? {
            id: firstEmployee.billing_company_db_id,

            name:
              firstEmployee.billing_company_name ||
              firstEmployee.billing_company,

            email: firstEmployee.billing_email,

            address: firstEmployee.billing_address,

            phone: firstEmployee.billing_phone,

            city: firstEmployee.billing_city,

            state: firstEmployee.billing_state,

            pincode: firstEmployee.billing_pincode,

            country: firstEmployee.billing_country,

            statecode: firstEmployee.billing_statecode,

            gst_no: firstEmployee.billing_gst_no,

            pan: firstEmployee.billing_pan,

            registration_no: firstEmployee.billing_registration_no,

            contact_person: firstEmployee.billing_contact_person,

            website: firstEmployee.billing_website,

            logo: firstEmployee.billing_logo,

            cin_no: firstEmployee.billing_cin_no,

            terms: firstEmployee.billing_terms,

            invoiceprefix: firstEmployee.billing_invoice_prefix,
          }
        : null;

      // =============================================
      // SITE / CLIENT
      // =============================================

      const site = firstEmployee
        ? {
            site_id: firstEmployee.site_id,

            client_id: firstEmployee.client_id,

            site_name:
              firstEmployee.client_company_name || firstEmployee.client_name,

            client_code: firstEmployee.client_code,
          }
        : null;

      // =============================================
      // RESPONSE
      // =============================================

      return res.status(200).json({
        success: true,

        message: "Site employee salary fetched successfully",

        count: data.length,

        site,

        billingCompany,

        data,
      });
    } catch (error) {
      console.error("==========================================");

      console.error("getSiteSalaryEmployees ERROR");

      console.error("Message:", error.message);

      console.error("Number:", error.number);

      console.error("State:", error.state);

      console.error("Class:", error.class);

      console.error("Line:", error.line);

      console.error("Procedure:", error.procName);

      console.error("Original Error:", error.originalError);

      console.error("==========================================");

      return res.status(500).json({
        success: false,

        message: "Failed to fetch site employee salary",

        error: error.message,

        sqlError: {
          number: error.number,

          state: error.state,

          class: error.class,

          line: error.line,

          procedure: error.procName,
        },
      });
    }
  },

  getEmployeeWiseSalary: async (req, res) => {
    try {
      const {
        month,
        year,
        site_id,
        client_id,
        client_name,
        site_name,
        employee_name,
        employee_code,
      } = req.query;

      if (
        month === undefined ||
        month === "" ||
        year === undefined ||
        year === ""
      ) {
        return res.status(400).json({
          success: false,
          message: "Month and year are required",
        });
      }

      const result = await salaryModel.getEmployeeWiseSalary({
        month,
        year,
        site_id,
        client_id,
        client_name,
        site_name,
        employee_name,
        employee_code,
      });

      console.log("EMPLOYEE MODEL RESULT:", result);

      return res.status(200).json({
        success: true,
        message: "Employee wise salary fetched successfully",
        count: result.data.length,
        summary: result.summary,
        data: result.data,
      });
    } catch (error) {
      console.error("getEmployeeWiseSalary ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch employee wise salary",
        error: error.message,
      });
    }
  },
  // getEmployeeWiseSalary: async (req, res) => {
  //   try {
  //     const {
  //       month,
  //       year,
  //       site_id,
  //       client_id,
  //       client_name,
  //       site_name,
  //       employee_name,
  //       employee_code,
  //     } = req.query;

  //     if (
  //       month === undefined ||
  //       month === "" ||
  //       year === undefined ||
  //       year === ""
  //     ) {
  //       return res.status(400).json({
  //         success: false,
  //         message: "Month and year are required",
  //       });
  //     }

  //     const data = await salaryModel.getEmployeeWiseSalary({
  //       month,
  //       year,
  //       site_id,
  //       client_id,
  //       client_name,
  //       site_name,
  //       employee_name,
  //       employee_code,
  //     });

  //     return res.status(200).json({
  //       success: true,
  //       message: "Employee wise salary fetched successfully",
  //       count: data.length,
  //       data,
  //     });
  //   } catch (error) {
  //     console.error("getEmployeeWiseSalary ERROR:", error);

  //     return res.status(500).json({
  //       success: false,
  //       message: "Failed to fetch employee wise salary",
  //       error: error.message,
  //     });
  //   }
  // },
  // =====================================================
  // GENERATE SALARY
  // =====================================================
  generateSalary: async (req, res) => {
    console.log("\n==========================================");
    console.log("🚀 SALARY GENERATE API CALLED");
    console.log("REQUEST BODY:", req.body);
    console.log("==========================================\n");

    try {
      const { site_id, month, year, billingDays } = req.body;

      // =================================================
      // VALIDATION
      // =================================================

      if (!site_id) {
        return res.status(400).json({
          success: false,
          message: "site_id is required",
        });
      }

      if (!month || !year) {
        return res.status(400).json({
          success: false,
          message: "month and year are required",
        });
      }

      const numericSiteId = Number(site_id);
      const numericMonth = Number(month);
      const numericYear = Number(year);

      // =================================================
      // SITE VALIDATION
      // =================================================

      if (!Number.isInteger(numericSiteId) || numericSiteId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid site_id",
        });
      }

      // =================================================
      // MONTH VALIDATION
      // =================================================

      if (
        !Number.isInteger(numericMonth) ||
        numericMonth < 1 ||
        numericMonth > 12
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid month",
        });
      }

      // =================================================
      // YEAR VALIDATION
      // =================================================

      if (!Number.isInteger(numericYear) || numericYear < 2000) {
        return res.status(400).json({
          success: false,
          message: "Invalid year",
        });
      }

      // =================================================
      // BILLING DAYS VALIDATION
      // =================================================

      const validBillingDays = [
        "With Sunday",

        "Without Sunday",

        "As Per Billing Contract",
      ];

      const selectedBillingDays = validBillingDays.includes(billingDays)
        ? billingDays
        : "With Sunday";

      // =================================================
      // START LOG
      // =================================================

      console.log("\n==========================================");
      console.log("💰 GENERATING SALARY");
      console.log("SITE ID:", numericSiteId);
      console.log("MONTH:", numericMonth);
      console.log("YEAR:", numericYear);
      console.log("BILLING DAYS:", selectedBillingDays);
      console.log("==========================================\n");

      // =================================================
      // MODEL CALL
      // =================================================

      console.log("📞 CALLING salaryModel.generateSalaryBySite()...");

      const startTime = Date.now();

      const result = await salaryModel.generateSalaryBySite(
        numericSiteId,

        numericMonth,

        numericYear,

        selectedBillingDays,
      );

      const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);

      // =================================================
      // SUCCESS LOG
      // =================================================

      console.log("\n==========================================");
      console.log("✅ SALARY GENERATED SUCCESSFULLY");
      console.log("GENERATED:", result?.generated || 0);
      console.log("EXECUTION TIME:", executionTime, "seconds");
      console.log("==========================================\n");

      // =================================================
      // SUCCESS RESPONSE
      // =================================================

      return res.status(200).json({
        success: true,

        message: "Salary generated successfully",

        generated: result?.generated || 0,

        pdf: result?.pdf || {
          employeeGenerated: 0,

          employeeFailed: 0,

          siteGenerated: false,

          siteUrl: "",
        },

        employees: result?.employees || [],
      });
    } catch (error) {
      // =================================================
      // COMPLETE ERROR LOGGING
      // =================================================

      console.error("\n==========================================");

      console.error("❌ SALARY CONTROLLER ERROR");

      console.error("MESSAGE:", error?.message);

      console.error("NAME:", error?.name);

      console.error("CODE:", error?.code);

      console.error("NUMBER:", error?.number);

      console.error("STATE:", error?.state);

      // =================================================
      // ORIGINAL SQL ERROR
      // =================================================

      if (error?.originalError) {
        console.error("ORIGINAL ERROR:", error.originalError);
      }

      // =================================================
      // PRECEDING SQL ERRORS
      // =================================================

      if (error?.precedingErrors) {
        console.error("PRECEDING ERRORS:", error.precedingErrors);
      }

      // =================================================
      // FULL STACK
      // =================================================

      console.error("STACK:", error?.stack);

      console.error("==========================================\n");

      // =================================================
      // ERROR RESPONSE
      // =================================================

      return res.status(500).json({
        success: false,

        message: error?.message || "Failed to generate salary",

        errorCode: error?.code || null,
      });
    }
  },

  // =====================================================
  // PRINT SALARY BY EMPLOYEE
  // Supports single employee and site employees
  // =====================================================

  getPrintSalaryByEmployee: async (req, res) => {
    try {
      const { employee_id, site_id, month, year } = req.query;

      // =====================================================
      // VALIDATION
      // =====================================================

      if (
        month === undefined ||
        month === "" ||
        year === undefined ||
        year === ""
      ) {
        return res.status(400).json({
          success: false,
          message: "Month and year are required",
        });
      }

      if (!employee_id && !site_id) {
        return res.status(400).json({
          success: false,
          message: "Either employee_id or site_id is required",
        });
      }

      // =====================================================
      // MODEL
      // =====================================================

      const data = await salaryModel.getPrintSalaryByEmployee({
        employee_id,
        site_id,
        month,
        year,
      });

      // =====================================================
      // NO DATA
      // =====================================================

      if (!data || data.length === 0) {
        return res.status(404).json({
          success: false,
          message:
            "No salary data found for the selected employee/site, month and year",
          data: [],
        });
      }

      // =====================================================
      // RESPONSE
      // =====================================================

      return res.status(200).json({
        success: true,

        message: employee_id
          ? "Employee salary print data fetched successfully"
          : "Site employee salary print data fetched successfully",

        count: data.length,

        filters: {
          employee_id: employee_id || null,
          site_id: site_id || null,
          month,
          year,
        },

        data,
      });
    } catch (error) {
      console.error("getPrintSalaryByEmployee CONTROLLER ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch salary print data",
        error: error.message,
      });
    }
  },
};

module.exports = salaryController;
