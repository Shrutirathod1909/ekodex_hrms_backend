const attendanceModel = require("../models/attendanceModel");
const clientModel = require("../models/clientModel");
const archiver = require("archiver");
const XLSX = require("xlsx");
const logger = require("../utils/logger");

exports.getSearchKeyword = async (req, res) => {
  try {
    const { search } = req.query;
    console.log(search);
  } catch (error) {
    console.log(error);
  }
};

exports.getAttendanceReport = async (req, res) => {
  try {
    const { fromDate, toDate } = req.body;
    const userId = req.user.id;

    if (!fromDate) {
      return res.status(400).json({
        error: true,
        message: "From Date is required",
      });
    }

    //====================================
    // USER ACCESS
    //====================================

    const user = await attendanceModel.getUserAccess(userId);

    if (!user) {
      return res.status(404).json({
        error: true,
        message: "User not found",
      });
    }

    //====================================
    // GET ATTENDANCE DATA
    //====================================

    const attendanceData = await attendanceModel.getAttendanceReport(
      fromDate,
      toDate || fromDate,
      user,
    );

    if (!attendanceData || attendanceData.length === 0) {
      return res.status(404).json({
        error: true,
        message: "No attendance data found",
      });
    }

    console.log("Attendance Rows:", attendanceData.length);

    //====================================
    // CREATE EXCEL
    //====================================

    const workbook = XLSX.utils.book_new();

    const worksheet = XLSX.utils.json_to_sheet(attendanceData);

    XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance Report");

    const excelBuffer = XLSX.write(workbook, {
      bookType: "csv",
      type: "buffer",
    });

    console.log("Excel Buffer Size:", excelBuffer.length);

    //====================================
    // ZIP NAME
    //====================================

    const excelName = `ERP_Attendance_Report_${fromDate}_${toDate || fromDate}.csv`;

    const zipName = `ERP_Attendance_Report_${fromDate}_${toDate || fromDate}.zip`;

    //====================================
    // ZIP HEADER
    //====================================

    res.writeHead(200, {
      "Content-Type": "application/zip",

      "Content-Disposition": `attachment; filename="${zipName}"`,
    });

    //====================================
    // CREATE ZIP
    //====================================

    const archive = archiver("zip", {
      zlib: {
        level: 9,
      },
    });

    archive.on("error", (err) => {
      console.log("Archive Error:", err);

      res.end();
    });

    // send zip to browser

    archive.pipe(res);

    //====================================
    // ADD EXCEL FILE
    //====================================

    archive.append(excelBuffer, {
      name: excelName,
    });

    //====================================
    // CLOSE ZIP
    //====================================

    archive.finalize();
  } catch (error) {
    console.log("Attendance Export Error:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: true,

        message: error.message,
      });
    }
  }
};

// ============================================
// UPDATE ATTENDANCE
// ============================================

// ============================================
// UPDATE ATTENDANCE
// ============================================

exports.updateAttendance = async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const data = req.body;
    const user = req.user;

    console.log("\n========================================");
    console.log("UPDATE ATTENDANCE API");
    console.log("Attendance ID:", attendanceId);
    console.log("BODY:", JSON.stringify(data, null, 2));
    console.log("========================================\n");

    // ===============================
    // ATTENDANCE ID VALIDATION
    // ===============================

    if (!attendanceId) {
      return res.status(400).json({
        success: false,
        message: "Attendance ID is required",
      });
    }

    // ===============================
    // BODY VALIDATION
    // ===============================

    if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Attendance data is required",
      });
    }

    // ===============================
    // EMPLOYEE VALIDATION
    // ===============================

    if (!data.employee_id) {
      return res.status(400).json({
        success: false,
        message: "Employee ID is required",
      });
    }

    // ===============================
    // MODEL CALL
    // ===============================

    const result = await attendanceModel.updateAttendance(
      attendanceId,
      data,
      user,
    );

    return res.status(200).json({
      success: true,
      message: result.message || "Attendance Updated Successfully",
      data: result,
    });
  } catch (error) {
    console.error("UPDATE ATTENDANCE ERROR:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Attendance update failed",
    });
  }
};

exports.getSiteWiseAttendance = async (req, res) => {
  try {
    const { date } = req.body;
    const userId = req.user.id;

    const result = await attendanceModel.getSiteWiseAttendance(date, userId);

    if (!result || result.length === 0) {
      return res.status(404).json({
        error: true,
        message: "No data found.",
      });
    }

    // JSON to worksheet

    const worksheet = XLSX.utils.json_to_sheet(result);

    // Worksheet to CSV

    const csvData = XLSX.utils.sheet_to_csv(worksheet);

    const csvFileName = `Site_Attendance_${date}.csv`;

    const zipFileName = `Site_Attendance_${date}.zip`;

    // ZIP HEADER

    res.setHeader("Content-Type", "application/zip");

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${zipFileName}"`,
    );

    // CREATE ZIP

    const archive = archiver("zip", {
      zlib: {
        level: 9,
      },
    });

    archive.on("error", (err) => {
      console.error("ZIP ERROR:", err);

      res.end();
    });

    // pipe ZIP response

    archive.pipe(res);

    // Add CSV file into ZIP

    archive.append(Buffer.from(csvData, "utf-8"), {
      name: csvFileName,
    });

    // Finish ZIP

    archive.finalize();
  } catch (err) {
    console.error("Download Site Attendance Error:", err);

    if (!res.headersSent) {
      return res.status(500).json({
        error: true,
        message: err.message,
      });
    }
  }
};

// exports.addAttendance = async (req, res) => {
//   try {
//     let result = [];

//     for (let row of req.body) {
//       const data = await attendanceModel.addAttendance(row, req.user);

//       result.push(data);
//     }

//     res.json({
//       success: true,

//       message: "Attendance Saved Successfully",

//       data: result,
//     });
//   } catch (error) {
//     res.status(400).json({
//       success: false,

//       message: error.message,
//     });
//   }
// };

// exports.addAttendance = async (req, res) => {
//   try {
//     console.log("🔥 CONTROLLER ENTERED");

//     const row = req.body[0];

//     console.log("🔥 BEFORE MODEL");

//     const data = await attendanceModel.addAttendance(
//       row,
//       req.user
//     );

//     console.log("🔥 AFTER MODEL");

//     return res.json({
//       success: true,
//       message: "Attendance Saved Successfully",
//       data,
//     });

//   } catch (error) {
//     console.error("❌ ERROR:", error);

//     return res.status(400).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };

exports.addAttendance = async (req, res) => {
  try {
    console.log("🔥 CONTROLLER ENTERED");

    const result = [];

    for (const row of req.body) {
      console.log("🔥 BEFORE MODEL:", row.employee_id);

      const data = await attendanceModel.addAttendance(
        row,
        req.user
      );

      result.push(data);

      console.log("🔥 AFTER MODEL:", row.employee_id);
    }

    return res.json({
      success: true,
      message: "Attendance Saved Successfully",
      data: result,
    });

  } catch (error) {
    console.error("❌ ERROR:", error);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
exports.index = async (req, res) => {
  let processingStep = "INITIALIZATION";

  try {
    // =====================================================
    // 1. GET AUTHENTICATED USER
    // =====================================================

    const rawUserId = req.user?.id;
    const userId = Number(rawUserId);

    if (
      rawUserId === undefined ||
      rawUserId === null ||
      String(rawUserId).trim() === "" ||
      !Number.isSafeInteger(userId) ||
      userId <= 0
    ) {
      console.error("ATTENDANCE AUTHENTICATION FAILED", {
        user: req.user ?? null,
        hasSession: Boolean(req.session),
      });

      return res.status(401).json({
        success: false,
        message: "Unauthorized: User authentication required",
      });
    }

    console.log("ATTENDANCE USER ID:", userId);
    console.log("ATTENDANCE USER ROLE:", req.user?.role);

    // =====================================================
    // 2. RESET FILTERS
    // =====================================================

    if (req.query.reset !== undefined) {
      processingStep = "RESET_FILTERS_ACTION";

      await attendanceModel.clearSearchFilters(
        userId,
        "attendance"
      );

      await attendanceModel.saveDefaultSearch(
        userId,
        "attendance"
      );
    }

    // =====================================================
    // 3. HANDLE POST SEARCH
    // =====================================================

    else if (
      req.method === "POST" &&
      req.body?.search_fields !== undefined
    ) {
      processingStep = "POST_SEARCH_SUBMISSION";
console.log("ATTENDANCE SEARCH BODY:", {
  search_fields: req.body.search_fields,
  search_keyword: req.body.search_keyword,
  search_from_month: req.body.search_from_month,
  search_from_year: req.body.search_from_year,
});
      await attendanceModel.clearSearchFilters(
        userId,
        "attendance"
      );

      const fields = Array.isArray(req.body.search_fields)
        ? req.body.search_fields
        : [req.body.search_fields];

      const keywords = Array.isArray(req.body.search_keyword)
        ? req.body.search_keyword
        : [req.body.search_keyword ?? ""];

      const dateField = req.body.search_date_field || "";

      for (let i = 0; i < fields.length; i++) {
        const field = fields[i] ?? "";
        const keyword = keywords[i] ?? "";

        if (field !== "" || dateField !== "") {
          await attendanceModel.saveSearchFilter({
            search_field: field,
            search_keyword: keyword,
            search_date_field: dateField,

            search_from_date:
              req.body.search_from_date || "",

            search_to_date:
              req.body.search_to_date || "",

            search_from_month:
              req.body.search_from_month || "",

            search_from_year:
              req.body.search_from_year || "",

            userId,
            refNo: "attendance",
          });
        }
      }
    }

    // =====================================================
    // 4. INITIAL GET FILTER CHECK
    // =====================================================

    else if (req.method === "GET") {
      processingStep = "CHECK_EXISTING_GET_FILTERS";

      const activeSearch =
        await attendanceModel.getUserSearchFilters(
          userId,
          "attendance"
        );

      if (
        !Array.isArray(activeSearch) ||
        activeSearch.length === 0
      ) {
        await attendanceModel.clearSearchFilters(
          userId,
          "attendance"
        );
      }
    }

    // =====================================================
    // 5. PAGINATION
    // =====================================================

    processingStep = "PARSING_PAGINATION_METRICS";

    const sy_word = req.query.wo || "";
    const perPage = 50;

    const parsedPage = Number.parseInt(req.query.page, 10);

    const page =
      Number.isInteger(parsedPage) && parsedPage >= 0
        ? parsedPage
        : 0;

    console.log("ATTENDANCE PAGE:", page);
    console.log("ATTENDANCE PER PAGE:", perPage);

    // =====================================================
    // 6. FETCH ATTENDANCE COUNT
    // =====================================================

    processingStep = "FETCHING_ATTENDANCE_ROW_COUNT";

    const totalRows =
      await attendanceModel.getAttendanceCount(
        "attendance",
        sy_word,
        userId
      );

    console.log("ATTENDANCE TOTAL ROWS:", totalRows);

    // =====================================================
    // 7. FETCH ATTENDANCE LIST
    // =====================================================

    processingStep = "FETCHING_ATTENDANCE_RECORD_LIST";

    const attendanceList =
      await attendanceModel.getAttendanceList(
        "attendance",
        "id",
        page,
        perPage,
        sy_word,
        userId
      );

    // =====================================================
    // 8. FETCH CURRENT SEARCH FILTERS
    // =====================================================

    processingStep = "FETCHING_CURRENT_SEARCH_FILTERS";

    const currentSearchFilters =
      await attendanceModel.getUserSearchFilters(
        userId,
        "attendance"
      );

    // =====================================================
    // 9. SALARY METRICS
    // =====================================================

    processingStep = "FETCHING_DASHBOARD_METRICS";

    const totalApprovedSalary =
      await attendanceModel.getSalaryCountByStatus(
        "Approved",
        sy_word,
        userId
      );

    const totalPendingSalary =
      await attendanceModel.getSalaryCountByStatus(
        "Pending",
        sy_word,
        userId
      );

    // =====================================================
    // 10. LAST TABLE ID
    // =====================================================

    processingStep = "FETCHING_LAST_TABLE_ID";

    const lastMainId =
      await attendanceModel.getLastTableId("attendance");

    // =====================================================
    // 11. SUCCESS RESPONSE
    // =====================================================

    processingStep = "COMPILING_JSON_RESPONSE";

    return res.status(200).json({
      success: true,
      sy_word,
      totalRows,
      perPage,
      currentPage: page,
      user_search: currentSearchFilters,
      attendance: attendanceList,
      total_generated: totalApprovedSalary,
      total_not_generated: totalPendingSalary,
      last_main_table: lastMainId,
    });

  } catch (error) {
    logger.log(`ATTENDANCE ERROR => ${error.stack}`);

    console.error(
      "ATTENDANCE CONTROLLER FAILED STEP:",
      processingStep
    );

    console.error("ERROR:", error.message);
    console.error(error.stack);

    return res.status(500).json({
      success: false,
      failedAtStep: processingStep,
      errorMessage: error.message,
    });
  }
};

exports.getPrintSheetData = async (req, res) => {
  try {
    console.log("getPrintSheetData");

    // 1. Query parameters
    const siteId = req.query.site;
    const month = Number.parseInt(req.query.m, 10);
    const year = Number.parseInt(req.query.y, 10);
    const attType = req.query.type || "Both";

    const branchId = req.session?.branch_id || 1;

    if (
      !siteId ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      !Number.isInteger(year)
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid site, month and year are required.",
      });
    }

    // 2. Month name
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    const monthName = monthNames[month - 1];

    // 3. Fetch attendance and master data
    const [
      attendancePivoted,
      clientDetail,
      branchDetail,
    ] = await Promise.all([
      attendanceModel.getAttendanceDataUnhold(
        siteId,
        month,
        year,
        attType
      ),
      attendanceModel.getMasterDataById(
        "client_rates",
        "id",
        siteId
      ),
      attendanceModel.getMasterDataById(
        "branch",
        "id",
        branchId
      ),
    ]);

    if (!clientDetail || clientDetail.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No client rate profile found for this site.",
      });
    }

    // 4. Client and company information
    const clientId = clientDetail[0].client_id;

    const clientInfo = await attendanceModel.getMasterDataById(
      "new_client",
      "id",
      clientId
    );

    let companyDetail = [];

    if (clientInfo?.length > 0) {
      const billingCompanyId = clientInfo[0].billing_company_id;

      if (billingCompanyId) {
        companyDetail = await attendanceModel.getMasterDataById(
          "companies",
          "id",
          billingCompanyId
        );
      }
    }

    // 5. Employees
    const allEmployees =
      await attendanceModel.getEmployeesByClientAndSite(
        clientId,
        siteId,
        month,
        year
      );

    // 6. Create attendance lookup map
    const attendanceMap = new Map();

    (attendancePivoted || []).forEach((row) => {
      const empCode = String(row.empCode ?? "").trim();

      if (empCode) {
        attendanceMap.set(empCode, row);
      }
    });

    // 7. Normalize daily attendance data
    const normalizeDays = (days) => {
      if (!days || typeof days !== "object" || Array.isArray(days)) {
        return {};
      }

      const normalized = {};

      Object.entries(days).forEach(([day, value]) => {
        if (value && typeof value === "object") {
          normalized[day] = {
            ...value,
            status: String(value.status ?? "")
              .trim()
              .toUpperCase(),
            ot: Number(value.ot ?? 0),
            otHours: Number(value.otHours ?? 0),
          };
        } else {
          normalized[day] = String(value ?? "")
            .trim()
            .toUpperCase();
        }
      });

      return normalized;
    };

    // 8. Build final response
    const finalAttendanceData = (allEmployees || []).map((emp) => {
      const empCode = String(emp.employee_code ?? "").trim();
      const att = attendanceMap.get(empCode);

      const days = normalizeDays(att?.days);

      // Use backend ND if supplied; otherwise calculate from days.
      const calculatedND = Object.values(days).reduce(
        (total, value) => {
          const status =
            value && typeof value === "object"
              ? String(value.status ?? "").trim().toUpperCase()
              : String(value ?? "").trim().toUpperCase();

          if (["P", "P1", "PP"].includes(status)) {
            return total + 1;
          }

          if (["HF", "FH"].includes(status)) {
            return total + 0.5;
          }

          return total;
        },
        0
      );

      const nd =
        att?.nd !== undefined && att?.nd !== null && att?.nd !== ""
          ? Number(att.nd)
          : calculatedND;

      return {
        empName: [
          emp.first_name,
          emp.middle_name,
          emp.last_name,
        ]
          .filter(Boolean)
          .join(" ")
          .trim(),

        empCode,
        rank: emp.rank || "",
        pf: emp.pf_no || "",
        esic: emp.esis_no || "",

        nd: Number.isFinite(nd) ? nd : 0,
        ot: Number(att?.ot ?? 0),
        off: Number(att?.off ?? 0),
        holiday: Number(att?.holiday ?? 0),
        otHrs: Number(att?.otHrs ?? 0),

        days,
      };
    });

    // 9. Debug logs
    console.log("Attendance pivot row count:", attendancePivoted?.length || 0);
    console.log("Employee count:", finalAttendanceData.length);

    console.log(
      "Print sheet sample:",
      finalAttendanceData.slice(0, 2).map((emp) => ({
        empCode: emp.empCode,
        nd: emp.nd,
        ot: emp.ot,
        days: emp.days,
      }))
    );

    // 10. Response
    return res.status(200).json({
      success: true,
      monthname: monthName,
      year,
      month,
      site_id: siteId,
      att_type: attType,
      clientdetail: clientDetail,
      clientinfo: clientInfo,
      branch_detail: branchDetail,
      company_detail: companyDetail,
      at_data: finalAttendanceData,
    });
  } catch (error) {
    console.error(
      "PRINT SHEET DATA ERROR:",
      error.stack || error.message
    );

    logger.log(`PRINT SHEETDATA ERROR => ${error.stack || error.message}`);

    return res.status(500).json({
      success: false,
      message: "Unable to compile attendance sheet data.",
      error: error.message,
    });
  }
};



exports.getAttendanceReportForDuplicates = async (req, res) => {
  try {
    //-------------------------------------------------------
    // 1. Read Request
    //-------------------------------------------------------
    const {
      from_date,
      to_date,
      site_ids,
      user_id,
    } = req.body || {};

    const userId = req.user?.id || user_id;
    const endDate = to_date || from_date;

    console.log("========== ATTENDANCE REPORT ==========");
    console.log("REQUEST BODY:", req.body);
    console.log("FROM DATE:", from_date);
    console.log("TO DATE:", endDate);
    console.log("USER ID:", userId);
    console.log("REQUEST SITE IDS:", site_ids);

    //-------------------------------------------------------
    // 2. Validate Request
    //-------------------------------------------------------
    if (!userId) {
      return res.status(400).json({
        error: true,
        message: "User ID missing",
      });
    }

    if (!from_date) {
      return res.status(400).json({
        error: true,
        message: "From date required",
      });
    }

    if (!endDate) {
      return res.status(400).json({
        error: true,
        message: "To date required",
      });
    }

    const start = new Date(from_date);
    const end = new Date(endDate);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    ) {
      return res.status(400).json({
        error: true,
        message: "Invalid date format",
      });
    }

    if (start > end) {
      return res.status(400).json({
        error: true,
        message: "From date cannot be greater than To date",
      });
    }

    //-------------------------------------------------------
    // 3. Get User Access
    //-------------------------------------------------------
    const user = await attendanceModel.getUserAccess(userId);

    if (!user) {
      return res.status(404).json({
        error: true,
        message: "User not found",
      });
    }

    //-------------------------------------------------------
    // 4. Get Attendance Report From Model
    //-------------------------------------------------------
    const result =
      await attendanceModel.getAttendanceReportForDuplicates({
        from_date,
        to_date: endDate,
        site_ids,
        user_id: userId,
      });

    //-------------------------------------------------------
    // 5. Debug Model Result
    //-------------------------------------------------------
    console.log(
      "MODEL RESULT:",
      JSON.stringify(result, null, 2)
    );

    console.log(
      "MODEL DATA COUNT:",
      result?.data?.length ?? 0
    );

    console.log("MODEL METRICS:", result?.metrics);

    //-------------------------------------------------------
    // 6. Validate Model Result
    //-------------------------------------------------------
    if (!result || !Array.isArray(result.data)) {
      console.error(
        "Invalid model response. Expected { data: [] }"
      );

      return res.status(500).json({
        error: true,
        message: "Invalid attendance report response",
      });
    }

    if (result.data.length === 0) {
      return res.status(404).json({
        error: true,
        message: "No attendance data found for selected dates and sites",
      });
    }

    //-------------------------------------------------------
    // 7. Clean Data For Excel
    //-------------------------------------------------------
    const cleanData = result.data.map((row) => {
      const obj = {};

      Object.keys(row).forEach((key) => {
        let value = row[key];

        if (value === null || value === undefined) {
          value = "";
        } else if (value instanceof Date) {
          value = Number.isNaN(value.getTime())
            ? ""
            : value.toISOString().substring(0, 10);
        } else if (typeof value === "number") {
          if (!Number.isFinite(value)) {
            value = 0;
          }
        } else if (
          typeof value === "object"
        ) {
          try {
            value = JSON.stringify(value);
          } catch {
            value = "";
          }
        } else if (typeof value === "string") {
          value = value
            .replace(/[\0-\x08\x0B\x0C\x0E-\x1F]/g, "")
            .trim();
        }

        obj[key] = value;
      });

      return obj;
    });

    console.log("CLEAN DATA COUNT:", cleanData.length);

    //-------------------------------------------------------
    // 8. Create Excel Workbook
    //-------------------------------------------------------
    const workbook = XLSX.utils.book_new();

    const worksheet = XLSX.utils.json_to_sheet(cleanData, {
      defval: "",
    });

    //-------------------------------------------------------
    // 9. Auto Column Width
    //-------------------------------------------------------
    if (cleanData.length > 0) {
      worksheet["!cols"] = Object.keys(cleanData[0]).map(
        (key) => {
          let maxLength = key.length;

          cleanData.forEach((row) => {
            const length = String(row[key] ?? "").length;

            if (length > maxLength) {
              maxLength = length;
            }
          });

          return {
            wch: Math.min(maxLength + 2, 40),
          };
        }
      );
    }

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Attendance Report"
    );

    //-------------------------------------------------------
    // 10. Create Excel Buffer
    //-------------------------------------------------------
    const buffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
      compression: true,
    });

    //-------------------------------------------------------
    // 11. Create ZIP File
    //-------------------------------------------------------
    const safeFromDate = String(from_date).replace(
      /[^0-9-]/g,
      ""
    );

    const safeToDate = String(endDate).replace(
      /[^0-9-]/g,
      ""
    );

    const excelFileName =
      `Attendance_Report_${safeFromDate}_${safeToDate}.xlsx`;

    const zipFileName =
      `Attendance_Report_${safeFromDate}_${safeToDate}.zip`;

    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    archive.on("warning", (err) => {
      console.warn("ZIP WARNING:", err);

      if (err.code !== "ENOENT") {
        console.error("ZIP WARNING ERROR:", err);
      }
    });

    archive.on("error", (err) => {
      console.error("ZIP ERROR:", err);

      if (!res.headersSent) {
        res.status(500).json({
          error: true,
          message: "Failed to create ZIP file",
        });
      } else {
        res.destroy(err);
      }
    });

    //-------------------------------------------------------
    // 12. Send ZIP Response
    //-------------------------------------------------------
    res.status(200);

    res.setHeader(
      "Content-Type",
      "application/zip"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${zipFileName}"`
    );

    archive.pipe(res);

    archive.append(buffer, {
      name: excelFileName,
    });

    await archive.finalize();

    console.log("ATTENDANCE REPORT ZIP CREATED:", zipFileName);
    console.log("======================================");

  } catch (error) {
    console.error("Attendance Report Error:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        error: true,
        message: error.message || "Failed to generate attendance report",
      });
    }

    if (!res.writableEnded) {
      res.destroy(error);
    }
  }
};



exports.getPrintwithtimeSheetData = async (req, res) => {
  try {
    console.log("getPrintwithtimeSheetData");

    const siteId = req.query.site;
    const month = Number(req.query.m);
    const year = Number(req.query.y);
    const attType = req.query.type || "Both";
    const branchId = req.session?.branch_id || 1;

    // Validate parameters
    if (
      !siteId ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      !Number.isInteger(year) ||
      year < 1900
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid site, month and year are required.",
      });
    }

    const monthNames = [
      "January", "February", "March", "April",
      "May", "June", "July", "August",
      "September", "October", "November", "December",
    ];

    const monthName = monthNames[month - 1];
    const daysInMonth = new Date(year, month, 0).getDate();

    // Fetch data
    const [
      attendancePivoted,
      clientDetail,
      branchDetail,
      empAttendance,
    ] = await Promise.all([
      attendanceModel.getAttendanceDataUnhold(
        siteId, month, year, attType
      ),
      attendanceModel.getMasterDataById(
        "client_rates", "id", siteId
      ),
      attendanceModel.getMasterDataById(
        "branch", "id", branchId
      ),
      attendanceModel.getEmpAttendanceTime(
        siteId, month, year
      ),
    ]);

    console.log("PRINT ATTENDANCE SUMMARY", {
      siteId,
      month,
      year,
      attType,
      pivotCount: attendancePivoted?.length || 0,
      timeCount: empAttendance?.length || 0,
    });

    // Validate client
    if (!clientDetail?.length) {
      return res.status(404).json({
        success: false,
        message: "Client rate profile not found.",
      });
    }

    const clientId = clientDetail[0].client_id;

    const clientInfo = await attendanceModel.getMasterDataById(
      "new_client", "id", clientId
    );

    let companyDetail = [];

    if (clientInfo?.length) {
      const billingCompanyId = clientInfo[0].billing_company_id;

      if (billingCompanyId) {
        companyDetail = await attendanceModel.getMasterDataById(
          "companies", "id", billingCompanyId
        );
      }
    }

    const allEmployees =
      await attendanceModel.getEmployeesByClientAndSite(
        clientId, siteId, month, year
      );

    // Attendance summary map
    const attendanceMap = {};

    (attendancePivoted || []).forEach((row) => {
      const empCode = String(row.empCode || "").trim();

      if (empCode) {
        attendanceMap[empCode] = row;
      }
    });

    // Day-wise time, status and OT maps
    const attendanceTimeMap = {};
    const otMap = {};

    (empAttendance || []).forEach((row) => {
      const empCode = String(row.emp_code || "").trim();
      const day = Number(row.day_no);

      if (
        !empCode ||
        !Number.isInteger(day) ||
        day < 1 ||
        day > daysInMonth
      ) {
        return;
      }

      const key = `${empCode}_${day}`;

      if (!attendanceTimeMap[key]) {
        attendanceTimeMap[key] = [];
      }

      const checkIn = row.check_in_time ?? "";
      const checkOut = row.check_out_time ?? "";

      // If both times are missing, preserve employee status
      const empStatus =
        !checkIn && !checkOut
          ? (row.emp_status ?? "")
          : "";

      attendanceTimeMap[key].push({
        checkIn,
        checkOut,
        emp_status: empStatus,
      });

      if (!otMap[key]) {
        otMap[key] = 0;
      }

      otMap[key] += Number(row.ot_hours || 0);
    });

    // Final printable employee data
    const finalAttendanceData = (allEmployees || []).map((emp) => {
      const empCode = String(
        emp.employee_code || ""
      ).trim();

      const att = attendanceMap[empCode] || {};

      const dayTimes = {};
      const dayOT = {};

      for (let day = 1; day <= daysInMonth; day++) {
        const key = `${empCode}_${day}`;

        dayTimes[day] = attendanceTimeMap[key] || [];
        dayOT[day] = otMap[key] || 0;
      }

      const totalOT = Object.values(dayOT).reduce(
        (total, hours) => total + Number(hours || 0),
        0
      );

      return {
        empName: [
          emp.first_name,
          emp.middle_name,
          emp.last_name,
        ].filter(Boolean).join(" "),

        empCode: emp.employee_code,
        rank: emp.rank || "",
        pf: emp.pf_no || "",
        esic: emp.esis_no || "",

        nd: att.nd || 0,
        off: att.off || 0,
        holiday: att.holiday || 0,
        otHrs: att.otHrs || 0,

        days: att.days || {},
        time: dayTimes,
        dayOT,
        ot: totalOT,
      };
    });

    console.log("FINAL EMPLOYEE COUNT:", finalAttendanceData.length);

    console.log(
      "FIRST EMPLOYEE SEPTEMBER TIME DATA:",
      JSON.stringify(finalAttendanceData[0]?.time, null, 2)
    );

    return res.status(200).json({
      success: true,
      monthname: monthName,
      year,
      month,
      daysInMonth,
      site_id: siteId,
      att_type: attType,
      clientdetail: clientDetail,
      clientinfo: clientInfo,
      branch_detail: branchDetail,
      company_detail: companyDetail,
      at_data: finalAttendanceData,
    });

  } catch (error) {
    console.error(
      "PRINT SHEETDATA ERROR:",
      error.stack || error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to generate attendance print data.",
      error: error.message,
    });
  }
};



exports.getEmployeesDirectory = async (req, res) => {
  try {
    const employees = await attendanceModel.getAllActiveEmployees();
    console.log(employees);
    return res.status(200).json({
      success: true,
      employees: employees || [],
    });
  } catch (error) {
    logger.log(`EMPLOYEE DIRECTORY ERROR => ${error.stack}`);
    console.error("Controller Employee Fetch Error:", error);
    return res.status(500).json({
      success: false,
      message:
        "Internal server error gathering active employee logs context profiles.",
    });
  }
};

exports.addNewAttendanceEntry = async (req, res) => {
  try {
    const { id, role, email, company, branch } = req.user;
    const {
      date,
      employeeId,
      employeeCode,
      status,
      checkIn,
      checkOut,
      siteId,
      siteName,
      clientId,
      clientName,
    } = req.body;
    // console.log(date, employeeId, status, checkIn, checkOut, "siteId", siteId);
    if (!date || !employeeId || !status) {
      return res.status(400).json({
        success: false,
        message:
          "Date, Employee Identifier and Status configurations cannot be empty parameters.",
      });
    }

    const transactionSummary = await attendanceModel.saveAttendanceRecord({
      date,
      employeeId,
      employeeCode,
      status,
      checkIn,
      checkOut,
      clientName,
      siteName,
      id,
    });

    return res.status(201).json({
      success: true,
      message:
        "Attendance entry saved across data grids and historical logs layers.",
      details: transactionSummary,
    });
  } catch (error) {
    logger.log(`ADD NEW ATTENDANCE ERROR => ${error.stack}`);
    // ✨ FIX: Stringify the entire object or fallback to error.stack to unpack the MSSQL driver errors
    console.error("Attendance Transaction Commit Failure Details:");
    console.error(JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

    return res.status(500).json({
      success: false,
      message:
        "Internal tracking server encountered database update system execution crashes.",
      error: error.message || "Unknown Database Driver Error",
    });
  }
};

exports.downloadTemplate = async (req, res) => {
  try {
    const { client_id, site_id } = req.query;

    if (!client_id || !site_id) {
      return res.status(400).json({
        success: false,
        message: "Please select Client and Site",
      });
    }

    const employees = await attendanceModel.getEmployeesForTemplate(
      client_id,
      site_id
    );

    const filename = `AttendanceTemplate_${Date.now()}.csv`;

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");

    const header = [
      "SR NO",
      "CLIENT CODE",
      "EMPLOYEE NAME",
      "EMPLOYEE CODE",
      "SITE NAME",
      "RANK",
      "MONTH",
      "YEAR",
      ...Array.from({ length: 31 }, (_, i) => String(i + 1)),
    ];

    const escapeCsv = (value) => {
      const str = String(value ?? "");
      return `"${str.replace(/"/g, '""')}"`;
    };

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const csvRows = [header.map(escapeCsv).join(",")];

    employees.forEach((emp, index) => {
      const row = [
        index + 1,
        emp.client_code,
        emp.emp_name,
        emp.emp_code,
        emp.site_name,
        emp.emp_type,
        month,
        year,
        ...Array(31).fill("A"),
      ];

      csvRows.push(row.map(escapeCsv).join(","));
    });

    // Excel मध्ये UTF-8 encoding योग्य राहण्यासाठी BOM
    res.send("\uFEFF" + csvRows.join("\r\n"));
  } catch (error) {
    logger.log(`downloadTemplate ERROR => ${error.stack}`);
    console.error("Download Template Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to download attendance template",
      error: error.message,
    });
  }
};

exports.getAttendanceByDate = async (req, res) => {
  try {
    const { siteId, date } = req.query;

    if (!siteId || !date) {
      return res.status(400).json({
        success: false,
        message: "Site and Date are required",
      });
    }

    const data = await attendanceModel.getAttendanceByDate(siteId, date);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("GET ATTENDANCE ERROR:", err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.removeAttendance = async (req, res) => {
  try {
    const { site, m, y } = req.query;

    const userId = req.user?.id; // from JWT auth middleware
    const disabledOn = new Date();

    if (!site || !m || !y) {
      return res.status(400).json({
        success: false,
        message: "Site, month and year are required",
      });
    }

    const result = await attendanceModel.removeAttendance(
      site,
      m,
      y,
      userId,
      disabledOn,
    );

    return res.status(200).json({
      success: true,
      message: "Data Removed Successfully",
      rowsAffected: result.rowsAffected,
    });
  } catch (error) {
    logger.log(`REMOVE ATTENDANCE ERROR => ${error.stack}`);
    console.error("Remove Attendance Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to remove attendance data",
      error: error.message,
    });
  }
};

exports.uploadAttendance = async (req, res) => {
  try {
    console.log("========== ATTENDANCE UPLOAD START ==========");

    const userDetail = await clientModel.getUserById(req.user.id);

    if (!userDetail) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    /* =====================================================
       USER DETAILS
    ===================================================== */

    const branchId = Number(userDetail.branch);
    const userId = Number(userDetail.id);
    const attType = req.body.att_type || "Both";

    /*
      company_id can be:
      "1"
      "1,2"
      1
      [1,2]
    */

    let companyId = userDetail.company_id;

    if (Array.isArray(companyId)) {
      companyId = companyId
        .map((id) => String(id).trim())
        .filter((id) => id !== "")
        .join(",");
    } else {
      companyId = String(companyId || "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => /^\d+$/.test(id))
        .join(",");
    }

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: `Invalid company ID: ${userDetail.company_id}`,
      });
    }

    console.log("========== USER DETAILS ==========");

    console.log({
      branchId,
      companyId,
      originalCompanyId: userDetail.company_id,
      userId,
      attType,
    });

    /* =====================================================
       DELETE PREVIOUS TEMP DATA
       
       IMPORTANT:
       delete function should use NVARCHAR company_id
       because company_id = "1,2"
    ===================================================== */

    await attendanceModel.deleteTempAttendance(
      branchId,
      companyId,
      userId
    );

    /* =====================================================
       FILE VALIDATION
    ===================================================== */

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Attach file to upload",
      });
    }

    console.log("Uploaded File:", {
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path,
    });

    if (req.file.originalname.includes(" ")) {
      return res.status(400).json({
        success: false,
        message: "File name should not contain space",
      });
    }

    /* =====================================================
       READ EXCEL / CSV
    ===================================================== */

    const workbook = XLSX.readFile(req.file.path);

    const sheetName = workbook.SheetNames[0];

    console.log("Sheet Name:", sheetName);

    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
    });

    console.log("Total Excel Rows:", rows.length);

    if (rows.length <= 1) {
      return res.status(400).json({
        success: false,
        message: "Excel contains no data",
      });
    }

    /* =====================================================
       PREPARE DATA
    ===================================================== */

    const uploadArrayData = [];

    for (let i = 1; i < rows.length; i++) {
      try {
        const row = rows[i];

        console.log(
          `Processing Excel Row ${i + 1}:`,
          row
        );

        /* ---------------------------------------------
           EMPLOYEE CODE
        --------------------------------------------- */

        const employee_code = String(
          row[3] || ""
        ).trim();

        if (!employee_code) {
          console.log(
            `Skipping row ${i + 1}: Employee code empty`
          );

          continue;
        }

        /* ---------------------------------------------
           EMPLOYEE NAME
        --------------------------------------------- */

        let employee_name = String(
          row[2] || ""
        ).trim();

        if (!employee_name) {
          const employee =
            await attendanceModel.getEmployeeByCode(
              employee_code
            );

          if (employee) {
            employee_name =
              `${employee.first_name || ""} ${
                employee.last_name || ""
              }`.trim();
          }
        }

        /* ---------------------------------------------
           ONE EXCEL ROW = ONE DATABASE ROW
        --------------------------------------------- */

        uploadArrayData.push({
          client_code: String(
            row[1] || ""
          ).trim(),

          emp_name: employee_name,

          emp_code: employee_code,

          site_name: String(
            row[4] || ""
          ).trim(),

          rank: String(
            row[5] || ""
          ).trim(),

          at_month: String(
            row[6] || ""
          ).trim(),

          at_year: String(
            row[7] || ""
          ).trim(),

          at_1: String(row[8] ?? ""),
          at_2: String(row[9] ?? ""),
          at_3: String(row[10] ?? ""),
          at_4: String(row[11] ?? ""),
          at_5: String(row[12] ?? ""),
          at_6: String(row[13] ?? ""),
          at_7: String(row[14] ?? ""),
          at_8: String(row[15] ?? ""),
          at_9: String(row[16] ?? ""),
          at_10: String(row[17] ?? ""),
          at_11: String(row[18] ?? ""),
          at_12: String(row[19] ?? ""),
          at_13: String(row[20] ?? ""),
          at_14: String(row[21] ?? ""),
          at_15: String(row[22] ?? ""),
          at_16: String(row[23] ?? ""),
          at_17: String(row[24] ?? ""),
          at_18: String(row[25] ?? ""),
          at_19: String(row[26] ?? ""),
          at_20: String(row[27] ?? ""),
          at_21: String(row[28] ?? ""),
          at_22: String(row[29] ?? ""),
          at_23: String(row[30] ?? ""),
          at_24: String(row[31] ?? ""),
          at_25: String(row[32] ?? ""),
          at_26: String(row[33] ?? ""),
          at_27: String(row[34] ?? ""),
          at_28: String(row[35] ?? ""),
          at_29: String(row[36] ?? ""),
          at_30: String(row[37] ?? ""),
          at_31: String(row[38] ?? ""),

          att_type: String(attType),

          created_by: userId,

          branch_id: branchId,

          /*
            IMPORTANT:

            ONE ROW MADHYE:
            company_id = "1,2"
          */

          company_id: companyId,
        });
      } catch (rowError) {
        console.error(
          `Error processing Excel row ${i + 1}`,
          rowError
        );
      }
    }

    /* =====================================================
       VALIDATION
    ===================================================== */

    console.log(
      "Valid Rows Prepared:",
      uploadArrayData.length
    );

    if (uploadArrayData.length > 0) {
      console.log(
        "Sample Row:",
        JSON.stringify(
          uploadArrayData[0],
          null,
          2
        )
      );
    }

    if (!uploadArrayData.length) {
      return res.status(400).json({
        success: false,
        message: "No valid rows found",
      });
    }

    /* =====================================================
       INSERT TEMP ATTENDANCE
    ===================================================== */

    const insertResult =
      await attendanceModel.addTempAttendance(
        uploadArrayData
      );

    console.log(
      "Attendance Insert Result:",
      insertResult
    );

    /* =====================================================
       SUCCESS
    ===================================================== */

    return res.status(200).json({
      success: true,

      totalRows: uploadArrayData.length,

      companyIds: companyId,

      message: `${uploadArrayData.length} rows uploaded successfully. Click on verify data. Do not refresh the page`,
    });
  } catch (error) {
    console.error(
      "========== UPLOAD ATTENDANCE ERROR =========="
    );

    console.error(error);

    console.error(
      "Stack:",
      error.stack
    );

    return res.status(500).json({
      success: false,

      message: error.message,

      error:
        process.env.NODE_ENV === "development"
          ? error.stack
          : undefined,
    });
  }
};
exports.verifyAttendanceData = async (req, res) => {
  try {
    const result = await attendanceModel.verifyAttendanceDataModel(req.user);

    return res.status(200).json({
      success: true,
      message: result.message,
      processed: result.processed,
    });
  } catch (error) {
    console.error("verifyAttendanceData Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// exports.getSiteWiseAttendance = async (req, res) => {
//   try {
//     const userId = req.user.id;

//     const report = await attendanceModel.getSiteWiseAttendance(
//       req.body,
//       userId,
//     );

//     const worksheet = xlsx.utils.json_to_sheet(report);

//     const workbook = xlsx.utils.book_new();

//     xlsx.utils.book_append_sheet(workbook, worksheet, "Site Wise Attendance");

//     const buffer = xlsx.write(workbook, {
//       type: "buffer",
//       bookType: "xlsx",
//     });

//     res.setHeader(
//       "Content-Type",
//       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
//     );

//     res.setHeader(
//       "Content-Disposition",
//       `attachment; filename=Site_Wise_Attendance_${req.body.date}.xlsx`,
//     );

//     return res.send(buffer);
//   } catch (err) {
//     console.log(err);

//     return res.status(500).json({
//       success: false,
//       message: err.message,
//     });
//   }
// };

// exports.getAttendanceReport = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const { fromDate, toDate } = req.body;

//     const user = await attendanceModel.getUserAccess(userId);

//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     const siteIds = (user.site_id || "")
//       .split(",")
//       .map((id) => parseInt(id.trim()))
//       .filter((id) => !isNaN(id))
//       .join(",");

//     if (!fromDate || !siteIds) {
//       return res.status(400).json({
//         error: true,
//         message: "From date and Site IDs are required",
//       });
//     }

//     // Get attendance data
//     const attendanceData = await attendanceModel.getAttendanceReport(
//       fromDate,
//       toDate || fromDate,
//       siteIds,
//     );

//     if (!attendanceData || attendanceData.length === 0) {
//       return res.status(404).json({
//         error: true,
//         message: "No attendance data found.",
//       });
//     }

//     // Create workbook
//     const workbook = XLSX.utils.book_new();

//     // Convert JSON to worksheet
//     const worksheet = XLSX.utils.json_to_sheet(attendanceData);

//     // Optional: Set column widths
//     worksheet["!cols"] = [
//       { wch: 18 }, // DailyAttendanceInOutID
//       { wch: 35 }, // ClientName
//       { wch: 20 }, // BranchName
//       { wch: 15 }, // SiteMasterID
//       { wch: 15 }, // SiteCode
//       { wch: 30 }, // SiteName
//       { wch: 25 }, // DesignationName
//       { wch: 18 }, // ShiftTitle
//       { wch: 15 }, // EmpType
//       { wch: 15 }, // EmpMasterId
//       { wch: 15 }, // EmpCode
//       { wch: 30 }, // EmployeeName
//       { wch: 15 }, // JoiningDate
//       { wch: 15 }, // AttendanceDate
//       { wch: 18 }, // AttendanceStatus
//       { wch: 12 }, // InTime
//       { wch: 20 }, // InPunchedThrough
//       { wch: 12 }, // OutTime
//       { wch: 20 }, // OutPunchedThrough
//       { wch: 15 }, // WorkingHour
//       { wch: 15 }, // Latitude
//       { wch: 15 }, // Longitude
//       { wch: 15 }, // LatitudeOut
//       { wch: 15 }, // LongitudeOut
//       { wch: 12 }, // GeoTagged
//       { wch: 12 }, // IsOtherDuty
//       { wch: 18 }, // RequestDate
//       { wch: 25 }, // RequesterName
//       { wch: 20 }, // AttendanceApprovalStatus
//     ];

//     // Convert JSON to worksheet
//     // const worksheet = XLSX.utils.json_to_sheet(attendanceData);

//     // Convert worksheet to CSV
//     const csvData = XLSX.utils.sheet_to_csv(worksheet);

//     const fileName = `Attendance_Report_${fromDate}_${toDate || fromDate}.csv`;

//     res.setHeader("Content-Type", "text/csv; charset=utf-8");
//     res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

//     return res.send(csvData);
//   } catch (error) {
//     console.error("Export Attendance Error:", error);

//     return res.status(500).json({
//       error: true,
//       message: "Failed to export attendance report.",
//       details: error.message,
//     });
//   }
// };

// exports.uploadAttendance = async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({
//         success: false,
//         message: "Attach file to upload",
//       });
//     }

//     const result = await attendanceModel.handleUpload(
//       req.file.path,
//       req.body.att_type,
//       req.user,
//     );

//     res.json({
//       success: true,
//       message: `${result.count} rows uploaded successfully. Click on verify data.`,
//     });
//   } catch (error) {
//     console.error("UPLOAD ERROR:", error);

//     res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };
