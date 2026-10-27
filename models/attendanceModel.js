const { sql, poolPromise } = require("../config/db");
const XLSX = require("xlsx");
const { logAction } = require("../utils/auditLogger");
const logger = require("../utils/logger");
/**
 * Safely constructs SQL Server query filters using parameterized values
 */
// function buildFilterQuery(userSearch, searchWord, request) {
//   let whereClause = " WHERE att.active = 0 ";
//   try {
//     if (searchWord && searchWord.trim() !== "") {
//       whereClause += " AND TRIM(nc.company_name) LIKE @searchWord + '%' ";
//       request.input("searchWord", sql.VarChar, searchWord.trim());
//     }

//     if (Array.isArray(userSearch) && userSearch.length > 0) {
//       userSearch.forEach((filter, index) => {
//         if (filter && filter.search_fields && filter.search_fields !== "") {
//           const fieldParam = `keyword_${index}`;
//           if (filter.search_fields === "client_name") {
//             whereClause += ` AND LOWER(nc.company_name) LIKE '%' + @${fieldParam} + '%' `;
//           } else {
//             const safeField = filter.search_fields.replace(
//               /[^a-zA-Z0-9_]/g,
//               "",
//             );
//             whereClause += ` AND LOWER(cr.${safeField}) LIKE '%' + @${fieldParam} + '%' `;
//           }
//           request.input(
//             fieldParam,
//             sql.VarChar,
//             (filter.search_keyword || "").toLowerCase(),
//           );
//         }
//       });

//       if (userSearch[0]?.search_date_field) {
//         request.input("fromDate", sql.VarChar, userSearch[0].search_from_date);
//         request.input("toDate", sql.VarChar, userSearch[0].search_to_date);

//         const safeDateField = userSearch[0].search_date_field.replace(
//           /[^a-zA-Z0-9_]/g,
//           "",
//         );
//         if (safeDateField === "attendance_date") {
//           whereClause += ` AND (att.at_day >= DAY(@fromDate) AND att.at_month = MONTH(@fromDate) AND att.at_year = YEAR(@fromDate))
//                                      AND (att.at_day <= DAY(@toDate) AND att.at_month = MONTH(@toDate) AND att.at_year = YEAR(@toDate))`;
//         } else {
//           whereClause += ` AND CAST(cr.${safeDateField} AS DATE) >= @fromDate
//                                      AND CAST(cr.${safeDateField} AS DATE) <= @toDate `;
//         }
//       }

//       if (userSearch[0]?.search_from_month) {
//         request.input(
//           "fromMonth",
//           sql.VarChar,
//           userSearch[0].search_from_month,
//         );
//         request.input("fromYear", sql.VarChar, userSearch[0].search_from_year);
//         whereClause += ` AND att.at_month = @fromMonth AND att.at_year = @fromYear `;
//       }
//     }
//     return whereClause;
//   } catch (filterError) {
//     throw new Error(`Filter Construction Error: ${filterError.message}`);
//   }
// }


function getSelectedAttendanceMonth(userSearch, request) {
  const dateFilter = Array.isArray(userSearch)
    ? userSearch[0]
    : null;

  let selectedMonth = null;
  let selectedYear = null;

  if (
    dateFilter?.search_from_month !== undefined &&
    dateFilter.search_from_month !== ""
  ) {
    const month = Number.parseInt(
      dateFilter.search_from_month,
      10
    );

    const year = Number.parseInt(
      dateFilter.search_from_year,
      10
    );

    if (
      Number.isInteger(month) &&
      month >= 1 &&
      month <= 12 &&
      Number.isInteger(year) &&
      year >= 1900 &&
      year <= 9999
    ) {
      selectedMonth = month;
      selectedYear = year;
    }
  }

  request.input("filterMonth", sql.Int, selectedMonth);
  request.input("filterYear", sql.Int, selectedYear);

  return { selectedMonth, selectedYear };
}

function normalizeAttendanceWhere(rawWhereClause) {
  if (
    typeof rawWhereClause !== "string" ||
    !rawWhereClause.trim()
  ) {
    return "";
  }

  const cleaned = rawWhereClause
    .trim()
    .replace(/^WHERE\s+/i, "")
    .replace(/^AND\s+/i, "")
    .trim();

  return cleaned ? `AND (${cleaned})` : "";
}

function buildFilterQuery(userSearch, searchWord, request) {
  let whereClause = " WHERE 1=1 ";

  try {
    // 1. Global search
    if (
      typeof searchWord === "string" &&
      searchWord.trim() !== ""
    ) {
      whereClause += `
        AND LOWER(ISNULL(nc.company_name, ''))
        LIKE '%' + @searchWord + '%'
      `;

      request.input(
        "searchWord",
        sql.VarChar,
        searchWord.trim().toLowerCase()
      );
    }

    // 2. Field-wise search
    if (Array.isArray(userSearch) && userSearch.length > 0) {
      userSearch.forEach((filter, index) => {
        if (!filter?.search_fields) {
          return;
        }

        const fieldMap = {
          client_name: "nc.company_name",
          billing_company: "nc.billing_company",
          billing_branch: "nc.billing_branch",
          site_name: "cr.site_name",
          client_code: "cr.client_code",
        };

        const column = fieldMap[filter.search_fields];

        if (!column) {
          throw new Error(
            `Unsupported attendance search field: ${filter.search_fields}`
          );
        }

        const keyword = String(
          filter.search_keyword || ""
        ).trim().toLowerCase();

        if (keyword !== "") {
          const fieldParam = `keyword_${index}`;

          whereClause += `
            AND LOWER(ISNULL(${column}, ''))
            LIKE '%' + @${fieldParam} + '%'
          `;

          request.input(
            fieldParam,
            sql.VarChar,
            keyword
          );
        }
      });

      // 3. Date-range filter for site dates only.
      // Attendance date filtering is handled separately
      // inside AttendanceSummary to preserve empty sites.
      const dateFilter = userSearch[0];

      if (
        dateFilter?.search_date_field &&
        dateFilter.search_from_date &&
        dateFilter.search_to_date
      ) {
        const dateFieldMap = {
          site_date: "cr.site_date",
          created_at: "cr.created_at",
        };

        const dateColumn =
          dateFieldMap[dateFilter.search_date_field];

        if (dateFilter.search_date_field === "attendance_date") {
          // Intentionally do not add attendance_date
          // conditions to the outer WHERE clause.
          // The selected month/year filter is applied
          // inside AttendanceSummary.
        } else {
          if (!dateColumn) {
            throw new Error(
              `Unsupported date search field: ${dateFilter.search_date_field}`
            );
          }

          request.input(
            "fromDate",
            sql.Date,
            dateFilter.search_from_date
          );

          request.input(
            "toDate",
            sql.Date,
            dateFilter.search_to_date
          );

          whereClause += `
            AND TRY_CONVERT(DATE, ${dateColumn})
                >= @fromDate
            AND TRY_CONVERT(DATE, ${dateColumn})
                <= @toDate
          `;
        }
      }

      // IMPORTANT:
      // Do not add search_from_month/search_from_year
      // conditions to this outer WHERE clause.
      // They are applied in AttendanceSummary.
    }

    return whereClause;
  } catch (filterError) {
    throw new Error(
      `Filter Construction Error: ${filterError.message}`
    );
  }
}

/**
 * Resolves the shared connection pool and opens a transaction request
 */
async function getPoolRequest() {
  try {
    const pool = await poolPromise;
    return pool.request();
  } catch (err) {
    console.error(
      "❌ Failed to resolve active database connection channel:",
      err.message,
    );
    throw new Error(`Database Connection Pool Failure: ${err.message}`);
  }
}

// ============================================================
// EMPLOYEE LEAVE CALCULATION
// 1 Present day = 1 P day
// leave_eligibility_days P days = 1 leave
// 1 earned leave = 1 row in emp_leave_tbl
// ============================================================

// ============================================================
// RECALCULATE EMPLOYEE LEAVES BASED ON PRESENT DAYS
// emp_attendance:
//     active = 0 => ACTIVE
//     active = 1 => INACTIVE
//
// emp_leave_tbl:
//     active = 0 => ACTIVE
//     active = 1 => INACTIVE
//
// RULE:
//     eligibility days = 1 leave
//     Example:
//       26 P  => 1 leave
//       52 P  => 2 leaves
//       60 P  => 2 leaves + 8 remaining P days
// ============================================================

// async function recalculateEmployeeLeaves(employeeId, user = {}) {
//   const pool = await poolPromise;

//   const logPrefix = `[LEAVE-CALC][EMP:${employeeId}]`;

//   console.log("\n==================================================");
//   console.log(`${logPrefix} START`);
//   console.log("==================================================");

//   try {
//     if (!employeeId) {
//       console.log(`${logPrefix} ❌ Employee ID missing`);
//       return {
//         success: false,
//         message: "Employee ID is required",
//       };
//     }

//     // --------------------------------------------------------
//     // 1. GET EMPLOYEE
//     // --------------------------------------------------------
//     console.log(`${logPrefix} 🔍 Fetching employee...`);

//     const employeeResult = await pool
//       .request()
//       .input("employeeId", sql.BigInt, employeeId).query(`
//         SELECT TOP 1
//           id,
//           employee_code,
//           emp_full_name,
//           first_name,
//           middle_name,
//           last_name,
//           rank,
//           branch_id,
//           company_id,
//           site_id,
//           site_name
//         FROM employee
//         WHERE id = @employeeId
//       `);

//     if (!employeeResult.recordset.length) {
//       console.log(`${logPrefix} ❌ Employee not found`);

//       return {
//         success: false,
//         message: "Employee not found",
//       };
//     }

//     const employee = employeeResult.recordset[0];

//     const empName =
//       employee.emp_full_name ||
//       [employee.first_name, employee.middle_name, employee.last_name]
//         .filter(Boolean)
//         .join(" ")
//         .trim();

//     console.log(`${logPrefix} 👤 Employee: ${empName}`);
//     console.log(`${logPrefix} 🆔 Employee Code: ${employee.employee_code}`);
//     console.log(`${logPrefix} 🏷️ Rank/Employee Type: ${employee.rank}`);
//     console.log(`${logPrefix} 🏢 Site: ${employee.site_name}`);
//     console.log(`${logPrefix} 📍 Site ID: ${employee.site_id}`);

//     // --------------------------------------------------------
//     // 2. GET LEAVE ELIGIBILITY FROM EMP_TYPE
//     //
//     // employee.rank = emp_type.emp_type
//     // --------------------------------------------------------
//     console.log(`${logPrefix} 🔍 Fetching leave eligibility...`);

//     const eligibilityResult = await pool
//       .request()
//       .input("rank", sql.VarChar, employee.rank).query(`
//         SELECT TOP 1
//           id,
//           emp_type,
//           leave_eligibility_days
//         FROM emp_type
//         WHERE LTRIM(RTRIM(emp_type)) = LTRIM(RTRIM(@rank))
//       `);

//     if (!eligibilityResult.recordset.length) {
//       console.log(
//         `${logPrefix} ❌ No emp_type configuration found for rank: ${employee.rank}`,
//       );

//       return {
//         success: false,
//         message: `Leave eligibility not configured for employee type: ${employee.rank}`,
//       };
//     }

//     const eligibility = eligibilityResult.recordset[0];

//     const eligibilityDays = Number(eligibility.leave_eligibility_days);

//     console.log(
//       `${logPrefix} 📅 Leave Eligibility: ${eligibilityDays} Present Days = 1 Leave`,
//     );

//     if (!eligibilityDays || eligibilityDays <= 0) {
//       console.log(
//         `${logPrefix} ❌ Invalid leave eligibility days: ${eligibilityDays}`,
//       );

//       return {
//         success: false,
//         message: "Invalid leave eligibility days",
//       };
//     }

//     // --------------------------------------------------------
//     // 3. GET DISTINCT PRESENT DAYS
//     //
//     // IMPORTANT:
//     // emp_attendance.active = 0 means ACTIVE
//     //
//     // Duplicate attendance rows on same date are counted once.
//     // --------------------------------------------------------
//     console.log(`${logPrefix} 🔍 Fetching active Present attendance...`);

//     const attendanceResult = await pool
//       .request()
//       .input("employeeId", sql.BigInt, employeeId).query(`
//         SELECT DISTINCT
//           CAST(check_in_date AS DATE) AS attendance_date
//         FROM emp_attendance
//         WHERE employee_id = @employeeId
//           AND active = 0
//           AND UPPER(
//                 LTRIM(
//                   RTRIM(
//                     ISNULL(emp_status, '')
//                   )
//                 )
//               ) = 'P'
//           AND check_in_date IS NOT NULL
//         ORDER BY CAST(check_in_date AS DATE)
//       `);

//     const presentDates = attendanceResult.recordset.map(
//       (row) => row.attendance_date,
//     );

//     const totalPresentDays = presentDates.length;

//     console.log(
//       `${logPrefix} ✅ Total DISTINCT Present Days: ${totalPresentDays}`,
//     );

//     if (presentDates.length > 0) {
//       console.log(`${logPrefix} 📆 First P Date: ${presentDates[0]}`);

//       console.log(
//         `${logPrefix} 📆 Last P Date: ${presentDates[presentDates.length - 1]}`,
//       );
//     }

//     // --------------------------------------------------------
//     // 4. CALCULATE EARNED LEAVES
//     // --------------------------------------------------------
//     const earnedLeaves = Math.floor(totalPresentDays / eligibilityDays);

//     const remainingPresentDay = totalPresentDays % eligibilityDays;

//     console.log(`${logPrefix} 🧮 CALCULATION`);
//     console.log(`${logPrefix}    Total P Days       = ${totalPresentDays}`);
//     console.log(`${logPrefix}    Eligibility Days   = ${eligibilityDays}`);
//     console.log(`${logPrefix}    Earned Leaves      = ${earnedLeaves}`);
//     console.log(`${logPrefix}    Remaining P Days   = ${remainingPresentDay}`);

//     // --------------------------------------------------------
//     // 5. GET EXISTING ACTIVE LEAVE ROWS
//     //
//     // IMPORTANT:
//     // emp_leave_tbl.active = 0 means ACTIVE
//     // --------------------------------------------------------
//     console.log(
//       `${logPrefix} 🔍 Fetching ACTIVE records from emp_leave_tbl...`,
//     );

//     const leaveResult = await pool
//       .request()
//       .input("employeeId", sql.BigInt, employeeId).query(`
//         SELECT
//           id,
//           emp_id,
//           emp_code,
//           emp_name,
//           site_id,
//           site_name,
//           last_date,
//           leave_count,
//           leave_from_to,
//           status,
//           active,
//           created_by,
//           created_at,
//           modified_by,
//           modified_at,
//           remaining_present_day
//         FROM emp_leave_tbl
//         WHERE emp_id = @employeeId
//           AND active = 0
//         ORDER BY id ASC
//       `);

//     const existingLeaves = leaveResult.recordset;

//     const usedLeaves = existingLeaves.filter(
//       (leave) =>
//         String(leave.status || "")
//           .trim()
//           .toLowerCase() === "used",
//     );

//     const availableLeaves = existingLeaves.filter(
//       (leave) =>
//         String(leave.status || "")
//           .trim()
//           .toLowerCase() === "available",
//     );

//     console.log(
//       `${logPrefix} 📊 Existing ACTIVE Leave Rows: ${existingLeaves.length}`,
//     );

//     console.log(`${logPrefix}    Used Leaves      = ${usedLeaves.length}`);

//     console.log(`${logPrefix}    Available Leaves = ${availableLeaves.length}`);

//     // --------------------------------------------------------
//     // 6. QUALIFYING PRESENT DATES
//     //
//     // Example eligibility = 26:
//     //
//     // 26th P date => Leave 1
//     // 52nd P date => Leave 2
//     // 78th P date => Leave 3
//     // --------------------------------------------------------
//     const qualifyingDates = [];

//     for (let i = 1; i <= earnedLeaves; i++) {
//       const index = i * eligibilityDays - 1;

//       if (presentDates[index]) {
//         qualifyingDates.push(presentDates[index]);
//       }
//     }

//     console.log(`${logPrefix} 🎯 Qualifying Leave Dates:`, qualifyingDates);

//     // --------------------------------------------------------
//     // 7. REQUIRED AVAILABLE LEAVES
//     //
//     // Used leave rows are preserved.
//     // Only remaining earned leaves are available.
//     // --------------------------------------------------------
//     const requiredAvailableLeaves = Math.max(
//       earnedLeaves - usedLeaves.length,
//       0,
//     );

//     console.log(
//       `${logPrefix} 📌 Required Available Leaves = ${requiredAvailableLeaves}`,
//     );

//     // --------------------------------------------------------
//     // 8. SOFT DELETE EXTRA AVAILABLE LEAVE ROWS
//     //
//     // emp_leave_tbl:
//     //     active = 0 => ACTIVE
//     //     active = 1 => INACTIVE
//     //
//     // First create log, then make leave inactive.
//     // --------------------------------------------------------
//     if (availableLeaves.length > requiredAvailableLeaves) {
//       const extraLeaves = availableLeaves.slice(requiredAvailableLeaves);

//       console.log(
//         `${logPrefix} ⚠️ Extra Available Leave Rows: ${extraLeaves.length}`,
//       );

//       for (const leave of extraLeaves) {
//         console.log(`${logPrefix} 🗑️ Making Leave ID ${leave.id} INACTIVE`);

//         // --------------------------------------------
//         // INSERT LOG BEFORE UPDATE
//         // --------------------------------------------
//         await pool
//           .request()
//           .input("emp_leave_tbl_id", sql.BigInt, leave.id)
//           .input("emp_id", sql.BigInt, employee.id)
//           .input("emp_code", sql.VarChar, employee.employee_code)
//           .input("emp_name", sql.VarChar, empName)
//           .input("site_id", sql.BigInt, employee.site_id)
//           .input("site_name", sql.VarChar, employee.site_name)
//           .input("last_date", sql.Date, leave.last_date)
//           .input("leave_count", sql.Int, leave.leave_count || 1)
//           .input("leave_from_to", sql.Date, leave.leave_from_to)
//           .input("status", sql.VarChar, leave.status)
//           .input("active", sql.Bit, leave.active)
//           .input("remaining_present_day", sql.Int, remainingPresentDay)
//           .input("created_by", sql.VarChar, leave.created_by)
//           .input("created_at", sql.DateTime, leave.created_at)
//           .input("modified_by", sql.VarChar, user.name || user.id || "SYSTEM")
//           .input("modified_at", sql.DateTime, new Date())
//           .input(
//             "log_action",
//             sql.VarChar,
//             "LEAVE_DEACTIVATED_DURING_RECALCULATION",
//           ).query(`
//             INSERT INTO emp_leave_log_tbl (
//               emp_leave_tbl_id,
//               emp_id,
//               emp_code,
//               emp_name,
//               site_id,
//               site_name,
//               last_date,
//               leave_count,
//               leave_from_to,
//               status,
//               active,
//               remaining_present_day,
//               created_by,
//               created_at,
//               modified_by,
//               modified_at,
//               log_action
//             )
//             VALUES (
//               @emp_leave_tbl_id,
//               @emp_id,
//               @emp_code,
//               @emp_name,
//               @site_id,
//               @site_name,
//               @last_date,
//               @leave_count,
//               @leave_from_to,
//               @status,
//               @active,
//               @remaining_present_day,
//               @created_by,
//               @created_at,
//               @modified_by,
//               @modified_at,
//               @log_action
//             )
//           `);

//         // --------------------------------------------
//         // SOFT DELETE
//         // active = 1 => INACTIVE
//         // --------------------------------------------
//         await pool
//           .request()
//           .input("id", sql.BigInt, leave.id)
//           .input("modified_by", sql.VarChar, user.name || user.id || "SYSTEM")
//           .query(`
//             UPDATE emp_leave_tbl
//             SET
//               active = 1,
//               modified_by = @modified_by,
//               modified_at = GETDATE()
//             WHERE id = @id
//           `);

//         console.log(`${logPrefix} ✅ Leave ID ${leave.id} marked INACTIVE`);
//       }
//     }

//     // --------------------------------------------------------
//     // 9. REFRESH AVAILABLE LEAVES
//     // --------------------------------------------------------
//     const activeAvailableLeaves = availableLeaves.slice(
//       0,
//       requiredAvailableLeaves,
//     );

//     console.log(
//       `${logPrefix} 🔄 Active Available Rows After Cleanup: ${activeAvailableLeaves.length}`,
//     );

//     // --------------------------------------------------------
//     // 10. UPDATE EXISTING AVAILABLE LEAVES
//     //     OR INSERT NEW LEAVES
//     // --------------------------------------------------------
//     for (let i = 0; i < requiredAvailableLeaves; i++) {
//       const qualifyingDate = qualifyingDates[usedLeaves.length + i] || null;

//       if (activeAvailableLeaves[i]) {
//         const existingLeave = activeAvailableLeaves[i];

//         console.log(
//           `${logPrefix} ✏️ Updating Available Leave ID ${existingLeave.id}`,
//         );

//         console.log(`${logPrefix}    Last Date => ${qualifyingDate}`);

//         await pool
//           .request()
//           .input("id", sql.BigInt, existingLeave.id)
//           .input("last_date", sql.Date, qualifyingDate)
//           .input("remaining_present_day", sql.Int, remainingPresentDay)
//           .input("modified_by", sql.VarChar, user.name || user.id || "SYSTEM")
//           .query(`
//             UPDATE emp_leave_tbl
//             SET
//               last_date = @last_date,
//               leave_count = 1,
//               status = 'Available',
//               active = 0,
//               remaining_present_day = @remaining_present_day,
//               modified_by = @modified_by,
//               modified_at = GETDATE()
//             WHERE id = @id
//           `);

//         console.log(`${logPrefix} ✅ Leave ID ${existingLeave.id} updated`);
//       } else {
//         console.log(`${logPrefix} ➕ Creating NEW Available Leave`);

//         console.log(`${logPrefix}    Last Date => ${qualifyingDate}`);

//         const insertResult = await pool
//           .request()
//           .input("emp_id", sql.BigInt, employee.id)
//           .input("emp_code", sql.VarChar, employee.employee_code)
//           .input("emp_name", sql.VarChar, empName)
//           .input("site_id", sql.BigInt, employee.site_id)
//           .input("site_name", sql.VarChar, employee.site_name)
//           .input("last_date", sql.Date, qualifyingDate)
//           .input("leave_count", sql.Int, 1)
//           .input("leave_from_to", sql.Date, null)
//           .input("status", sql.VarChar, "Available")
//           .input("active", sql.Bit, 0)
//           .input("created_by", sql.VarChar, user.name || user.id || "SYSTEM")
//           .input("created_at", sql.DateTime, new Date())
//           .input("remaining_present_day", sql.Int, remainingPresentDay).query(`
//             INSERT INTO emp_leave_tbl (
//               emp_id,
//               emp_code,
//               emp_name,
//               site_id,
//               site_name,
//               last_date,
//               leave_count,
//               leave_from_to,
//               status,
//               active,
//               created_by,
//               created_at,
//               remaining_present_day
//             )
//             VALUES (
//               @emp_id,
//               @emp_code,
//               @emp_name,
//               @site_id,
//               @site_name,
//               @last_date,
//               @leave_count,
//               @leave_from_to,
//               @status,
//               @active,
//               @created_by,
//               @created_at,
//               @remaining_present_day
//             );

//             SELECT SCOPE_IDENTITY() AS id;
//           `);

//         const newLeaveId = insertResult.recordset?.[0]?.id;

//         console.log(`${logPrefix} ✅ NEW Leave Created | ID: ${newLeaveId}`);
//       }
//     }

//     // --------------------------------------------------------
//     // 11. UPDATE REMAINING PRESENT DAY
//     //     ON ALL ACTIVE LEAVE ROWS
//     //
//     // active = 0 => ACTIVE
//     // --------------------------------------------------------
//     if (existingLeaves.length > 0) {
//       console.log(
//         `${logPrefix} 🔄 Updating remaining_present_day on ACTIVE leave rows...`,
//       );

//       await pool
//         .request()
//         .input("employeeId", sql.BigInt, employeeId)
//         .input("remaining_present_day", sql.Int, remainingPresentDay)
//         .input("modified_by", sql.VarChar, user.name || user.id || "SYSTEM")
//         .query(`
//           UPDATE emp_leave_tbl
//           SET
//             remaining_present_day = @remaining_present_day,
//             modified_by = @modified_by,
//             modified_at = GETDATE()
//           WHERE emp_id = @employeeId
//             AND active = 0
//         `);

//       console.log(`${logPrefix} ✅ remaining_present_day updated`);
//     }

//     // --------------------------------------------------------
//     // 12. FINAL SUMMARY
//     // --------------------------------------------------------
//     const finalLeaveResult = await pool
//       .request()
//       .input("employeeId", sql.BigInt, employeeId).query(`
//         SELECT
//           id,
//           emp_id,
//           emp_code,
//           emp_name,
//           site_id,
//           site_name,
//           last_date,
//           leave_count,
//           leave_from_to,
//           status,
//           active,
//           remaining_present_day
//         FROM emp_leave_tbl
//         WHERE emp_id = @employeeId
//           AND active = 0
//         ORDER BY id ASC
//       `);

//     const finalLeaves = finalLeaveResult.recordset;

//     console.log("\n--------------------------------------------------");
//     console.log(`${logPrefix} ✅ FINAL RESULT`);
//     console.log("--------------------------------------------------");
//     console.log(`${logPrefix} Employee       : ${empName}`);
//     console.log(`${logPrefix} Employee Code  : ${employee.employee_code}`);
//     console.log(`${logPrefix} Employee Type  : ${employee.rank}`);
//     console.log(`${logPrefix} Eligibility    : ${eligibilityDays} P = 1 Leave`);
//     console.log(`${logPrefix} Total P Days   : ${totalPresentDays}`);
//     console.log(`${logPrefix} Earned Leaves  : ${earnedLeaves}`);
//     console.log(`${logPrefix} Remaining P    : ${remainingPresentDay}`);
//     console.log(`${logPrefix} Used Leaves    : ${usedLeaves.length}`);
//     console.log(`${logPrefix} Active Leaves  : ${finalLeaves.length}`);

//     console.log(
//       `${logPrefix} Active Leave IDs:`,
//       finalLeaves.map((x) => x.id),
//     );

//     console.log("==================================================");
//     console.log(`${logPrefix} END`);
//     console.log("==================================================\n");

//     return {
//       success: true,
//       employeeId: employee.id,
//       employeeCode: employee.employee_code,
//       employeeName: empName,
//       employeeType: employee.rank,
//       eligibilityDays,
//       totalPresentDays,
//       earnedLeaves,
//       usedLeaves: usedLeaves.length,
//       availableLeaves: Math.max(earnedLeaves - usedLeaves.length, 0),
//       remainingPresentDay,
//       leaves: finalLeaves,
//     };
//   } catch (error) {
//     console.error("\n==================================================");
//     console.error(`${logPrefix} ❌ ERROR`);
//     console.error(`${logPrefix}`, error);
//     console.error("==================================================\n");

//     throw error;
//   }
// }

module.exports = {
  // recalculateEmployeeLeaves,
  getSiteInfo: async (siteId) => {
    try {
      const pool = await poolPromise;

      const result = await pool.request().input("siteId", sql.Int, siteId)
        .query(`
        SELECT *
        FROM client_rates
        WHERE id = @siteId
      `);

      return result.recordset[0] || null;
    } catch (error) {
      throw new Error(`Database error on getSiteInfo: ${error.message}`);
    }
  },

  clearSearchFilters: async (userId, refNo) => {
    try {
      const request = await getPoolRequest();
      request.input("userId", sql.Int, userId);
      request.input("refNo", sql.VarChar, refNo);
      return await request.query(
        `DELETE FROM user_search WHERE search_by = @userId AND ref_no = @refNo`,
      );
    } catch (err) {
      console.error(`❌ DB Error in clearSearchFilters:`, err.message);
      throw new Error(`Database clearSearchFilters failure: ${err.message}`);
    }
  },
  getAttendanceByDate: async (siteId, date) => {
    const pool = await poolPromise;

    let day, month, year;

    if (typeof date === "string") {
      if (date.includes("/")) {
        const parts = date.split("/");
        day = parseInt(parts[0]);
        month = parseInt(parts[1]);
        year = parseInt(parts[2]);
      } else if (date.includes("-")) {
        const parts = date.split("-");
        year = parseInt(parts[0]);
        month = parseInt(parts[1]);
        day = parseInt(parts[2]);
      }
    }

    const result = await pool
      .request()
      .input("siteId", sql.Int, siteId)
      .input("day", sql.Int, day)
      .input("month", sql.Int, month)
      .input("year", sql.Int, year).query(`

SELECT

    e.id AS employee_id,
    e.employee_code,
    e.emp_full_name,
    e.rank,

a.id AS emp_attendance_id,
    a.site_id,
    a.client_id,
    a.site_name,
    a.client_name,
    a.client_code,
    a.branch_name,

    a.check_in_date,
    a.check_in_time,

    a.check_out_date,
    a.check_out_time,

    ISNULL(
        TRY_CONVERT(decimal(10,2), a.emp_worked_hours),
        0
    ) AS emp_worked_hours,

    COALESCE(
        TRY_CONVERT(decimal(10,2), a.site_hours),
        TRY_CONVERT(decimal(10,2), cr.cc_site_hours),
        0
    ) AS site_hours,

    ISNULL(
        TRY_CONVERT(decimal(10,2), a.ot_hours),
        0
    ) AS ot_hours,

    CASE
        WHEN ISNULL(
            TRY_CONVERT(decimal(10,2), a.ot_hours),
            0
        ) > 0
        THEN 1
        ELSE 0
    END AS ot,

    CASE
        WHEN a.id IS NULL THEN 'A'
        ELSE a.emp_status
    END AS status

FROM employee e

LEFT JOIN emp_attendance a
ON e.id = a.employee_id
AND a.site_id = @siteId
AND a.check_in_date >= DATEFROMPARTS(@year,@month,@day)
AND a.check_in_date <
DATEADD(
    DAY,
    1,
    DATEFROMPARTS(@year,@month,@day)
)

LEFT JOIN client_rates cr
ON cr.id = e.site_id

WHERE
e.site_id = @siteId
AND e.active = 0
AND e.employee_code IS NOT NULL
AND LTRIM(RTRIM(e.employee_code)) <> ''
    AND UPPER(LTRIM(RTRIM(e.em_status))) = 'WORKING'
AND emp_stages='OFFER LETTER ISSUED'

ORDER BY
e.emp_full_name

`);

    return result.recordset;
  },
  // Fetch all unique active employees using correct database schema columns
  getAllActiveEmployees: async () => {
    try {
      const request = await getPoolRequest();

      const result = await request.query(`
      SELECT
        id
      ,employee_code
      ,initial
      ,first_name
      ,middle_name
      ,last_name
      ,gender
      ,dob
      ,date_of_joining
      ,address
      ,city
      ,state
      ,pincode
      ,country
      ,phone1
      ,phone2
      ,email_id
      ,contact_person
      ,contact_mobile
      ,p_address
      ,p_city
      ,p_state
      ,p_pincode
      ,p_country
      ,p_phone1
      ,p_phone2
      ,contact_relation
      ,contact_email
      ,marital_status
      ,mrg_date
      ,cast
      ,category
      ,native_place
      ,blood_group
      ,driving_license
      ,pancard_no
      ,aadhar_no
      ,passport_no
      ,uan_no
      ,passport_valid_date
      ,lang1
      ,lang2
      ,lang3
      ,lang4
      ,lang5
      ,hobby1
      ,hobby2
      ,hobby3
      ,hobby4
      ,bank_name
      ,account_no
      ,bank_address
      ,bank_city
      ,bank_state
      ,bank_ifsc
      ,bank_micr
      ,cancelled_cheque_image
      ,active
      ,branch_id
      ,company_id
      ,created_by
      ,created_on
      ,modified_by
      ,modified_on
      ,disabled_by
      ,disabled_on
      ,rank
      ,department
      ,client_id
      ,site_id
      ,reporting_manager
      ,reporting_user
      ,separation_type
      ,separate_reason
      ,date_of_separation
      ,notice_period
      ,last_working_date_sp
      ,handover_given_to
      ,salary_template
      ,gross_salary
      ,gross_salary_type
      ,basic_salary
      ,basic_salary_type
      ,sal_from_date
      ,sal_to_date
      ,pf_no
      ,esis_no
      ,pf_applicable
      ,ac_holder_name
      ,card_no
      ,da_term
      ,basic_term
      ,gang_name
      ,em_status
      ,perday_salary
      ,password
      ,user_id
      ,doc_name
      ,client_code
      ,father_name
      ,esis_date
      ,uan_date
      ,emp_full_name
      ,migrant_status
      ,convert_emp
      ,site_name
      ,client_name
      ,emp_stages
      ,verify_on
      ,verify_name
      ,verify_by
      ,source
      ,resume_img_path
      ,appointment_letter_img_path
      ,Verify_remarks
      ,manager_login
      ,offer_letter_ref_no
      FROM [employee]
      WHERE active = 0
    `);

      return result.recordset;
    } catch (err) {
      console.error("❌ DB Error in getAllActiveEmployees:", err.message);
      throw new Error(`Database getAllActiveEmployees failure: ${err.message}`);
    }
  },

 deleteTempAttendance: async (
  branchId,
  companyId,
  userId
) => {
  const pool = await poolPromise;

  /* =====================================================
     NORMALIZE VALUES
  ===================================================== */

  const numericBranchId = Number(branchId);
  const numericUserId = Number(userId);

  let companyIdString;

  if (Array.isArray(companyId)) {
    companyIdString = companyId
      .flatMap((id) => String(id).split(","))
      .map((id) => id.trim())
      .filter((id) => /^\d+$/.test(id))
      .join(",");
  } else {
    companyIdString = String(companyId ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => /^\d+$/.test(id))
      .join(",");
  }

  /* =====================================================
     VALIDATION
  ===================================================== */

  if (
    !Number.isInteger(numericBranchId) ||
    numericBranchId <= 0
  ) {
    throw new Error(
      `Invalid branchId: ${branchId}`
    );
  }

  if (
    !Number.isInteger(numericUserId) ||
    numericUserId <= 0
  ) {
    throw new Error(
      `Invalid userId: ${userId}`
    );
  }

  if (!companyIdString) {
    throw new Error(
      `Invalid companyId: ${companyId}`
    );
  }

  console.log(
    "========== DELETE TEMP ATTENDANCE =========="
  );

  console.log({
    branchId: numericBranchId,
    companyId: companyIdString,
    userId: numericUserId,
  });

  /* =====================================================
     DELETE
  ===================================================== */

  const result = await pool
    .request()

    .input(
      "branchId",
      sql.BigInt,
      numericBranchId
    )

    .input(
      "companyId",
      sql.NVarChar(500),
      companyIdString
    )

    .input(
      "userId",
      sql.BigInt,
      numericUserId
    )

    .query(`
      DELETE FROM temp_attendance
      WHERE branch_id = @branchId
        AND company_id = @companyId
        AND created_by = @userId
    `);

  console.log(
    "Deleted Temp Attendance Rows:",
    result.rowsAffected
  );

  return true;
},


  getEmployeeByCode: async (employeeCode) => {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("employee_code", sql.NVarChar, employeeCode).query(`
      SELECT TOP 1
        first_name,
        last_name
      FROM employee
      WHERE employee_code = @employee_code
    `);

    return result.recordset[0] || null;
  },

  // updated addtempAttendance for number hours
addTempAttendance: async (rows) => {
  const pool = await poolPromise;

  console.log(
    "========== ADD TEMP ATTENDANCE =========="
  );

  console.log("Total Rows:", rows.length);

  if (!Array.isArray(rows) || rows.length === 0) {
    return false;
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    try {
      /* =====================================================
         NORMALIZE NUMERIC VALUES
      ===================================================== */

      const createdBy = Number(row.created_by);
      const branchId = Number(row.branch_id);

      /*
        IMPORTANT:
        company_id can be:
        "1"
        "1,2"
        [1,2]
      */

      let companyId = row.company_id;

      if (Array.isArray(companyId)) {
        companyId = companyId
          .flatMap((id) => String(id).split(","))
          .map((id) => id.trim())
          .filter((id) => /^\d+$/.test(id))
          .join(",");
      } else {
        companyId = String(companyId ?? "")
          .split(",")
          .map((id) => id.trim())
          .filter((id) => /^\d+$/.test(id))
          .join(",");
      }

      /* =====================================================
         VALIDATION
      ===================================================== */

      if (!Number.isInteger(createdBy) || createdBy <= 0) {
        throw new Error(
          `Invalid created_by: ${row.created_by}`
        );
      }

      if (!Number.isInteger(branchId) || branchId <= 0) {
        throw new Error(
          `Invalid branch_id: ${row.branch_id}`
        );
      }

      if (!companyId) {
        throw new Error(
          `Invalid company_id: ${row.company_id}`
        );
      }

      console.log(
        `Inserting row ${i + 1}:`,
        {
          emp_code: row.emp_code,
          branchId,
          companyId,
          createdBy,
        }
      );

      /* =====================================================
         INSERT
      ===================================================== */

      await pool
        .request()

        .input(
          "client_code",
          sql.NVarChar,
          String(row.client_code ?? "")
        )

        .input(
          "emp_name",
          sql.NVarChar,
          String(row.emp_name ?? "")
        )

        .input(
          "emp_code",
          sql.NVarChar,
          String(row.emp_code ?? "")
        )

        .input(
          "site_name",
          sql.NVarChar,
          String(row.site_name ?? "")
        )

        .input(
          "rank",
          sql.NVarChar,
          String(row.rank ?? "")
        )

        .input(
          "at_month",
          sql.NVarChar,
          String(row.at_month ?? "")
        )

        .input(
          "at_year",
          sql.NVarChar,
          String(row.at_year ?? "")
        )

        /* =====================================================
           ATTENDANCE DAYS
        ===================================================== */

        .input("at_1", sql.NVarChar, String(row.at_1 ?? ""))
        .input("at_2", sql.NVarChar, String(row.at_2 ?? ""))
        .input("at_3", sql.NVarChar, String(row.at_3 ?? ""))
        .input("at_4", sql.NVarChar, String(row.at_4 ?? ""))
        .input("at_5", sql.NVarChar, String(row.at_5 ?? ""))
        .input("at_6", sql.NVarChar, String(row.at_6 ?? ""))
        .input("at_7", sql.NVarChar, String(row.at_7 ?? ""))
        .input("at_8", sql.NVarChar, String(row.at_8 ?? ""))
        .input("at_9", sql.NVarChar, String(row.at_9 ?? ""))
        .input("at_10", sql.NVarChar, String(row.at_10 ?? ""))
        .input("at_11", sql.NVarChar, String(row.at_11 ?? ""))
        .input("at_12", sql.NVarChar, String(row.at_12 ?? ""))
        .input("at_13", sql.NVarChar, String(row.at_13 ?? ""))
        .input("at_14", sql.NVarChar, String(row.at_14 ?? ""))
        .input("at_15", sql.NVarChar, String(row.at_15 ?? ""))
        .input("at_16", sql.NVarChar, String(row.at_16 ?? ""))
        .input("at_17", sql.NVarChar, String(row.at_17 ?? ""))
        .input("at_18", sql.NVarChar, String(row.at_18 ?? ""))
        .input("at_19", sql.NVarChar, String(row.at_19 ?? ""))
        .input("at_20", sql.NVarChar, String(row.at_20 ?? ""))
        .input("at_21", sql.NVarChar, String(row.at_21 ?? ""))
        .input("at_22", sql.NVarChar, String(row.at_22 ?? ""))
        .input("at_23", sql.NVarChar, String(row.at_23 ?? ""))
        .input("at_24", sql.NVarChar, String(row.at_24 ?? ""))
        .input("at_25", sql.NVarChar, String(row.at_25 ?? ""))
        .input("at_26", sql.NVarChar, String(row.at_26 ?? ""))
        .input("at_27", sql.NVarChar, String(row.at_27 ?? ""))
        .input("at_28", sql.NVarChar, String(row.at_28 ?? ""))
        .input("at_29", sql.NVarChar, String(row.at_29 ?? ""))
        .input("at_30", sql.NVarChar, String(row.at_30 ?? ""))
        .input("at_31", sql.NVarChar, String(row.at_31 ?? ""))

        /* =====================================================
           OTHER FIELDS
        ===================================================== */

        .input(
          "att_type",
          sql.NVarChar,
          String(row.att_type ?? "")
        )

        .input(
          "created_by",
          sql.BigInt,
          createdBy
        )

        .input(
          "branch_id",
          sql.BigInt,
          branchId
        )

        /*
          IMPORTANT:
          company_id MUST be NVARCHAR
          because value can be "1,2"
        */

        .input(
          "company_id",
          sql.NVarChar(500),
          companyId
        )

        .query(`
          INSERT INTO temp_attendance
          (
            client_code,
            emp_name,
            emp_code,
            site_name,
            rank,
            at_month,
            at_year,

            at_1,
            at_2,
            at_3,
            at_4,
            at_5,
            at_6,
            at_7,
            at_8,
            at_9,
            at_10,
            at_11,
            at_12,
            at_13,
            at_14,
            at_15,
            at_16,
            at_17,
            at_18,
            at_19,
            at_20,
            at_21,
            at_22,
            at_23,
            at_24,
            at_25,
            at_26,
            at_27,
            at_28,
            at_29,
            at_30,
            at_31,

            att_type,
            created_by,
            created_on,
            branch_id,
            company_id
          )

          VALUES
          (
            @client_code,
            @emp_name,
            @emp_code,
            @site_name,
            @rank,
            @at_month,
            @at_year,

            @at_1,
            @at_2,
            @at_3,
            @at_4,
            @at_5,
            @at_6,
            @at_7,
            @at_8,
            @at_9,
            @at_10,
            @at_11,
            @at_12,
            @at_13,
            @at_14,
            @at_15,
            @at_16,
            @at_17,
            @at_18,
            @at_19,
            @at_20,
            @at_21,
            @at_22,
            @at_23,
            @at_24,
            @at_25,
            @at_26,
            @at_27,
            @at_28,
            @at_29,
            @at_30,
            @at_31,

            @att_type,
            @created_by,
            GETDATE(),
            @branch_id,
            @company_id
          )
        `);

      console.log(
        `✅ Row ${i + 1} inserted successfully`
      );

      console.log(
        `   Employee: ${row.emp_code}`
      );

      console.log(
        `   Company IDs: ${companyId}`
      );

    } catch (err) {
      console.error(
        `❌ Error on row ${i + 1}`
      );

      console.error(
        "Employee Code:",
        row.emp_code
      );

      console.error(
        "Company ID:",
        row.company_id
      );

      console.error(
        "Branch ID:",
        row.branch_id
      );

      console.error(
        "Data:",
        row
      );

      console.error(
        "SQL Error:",
        err
      );

      throw new Error(
        `Failed at Excel Row ${
          i + 2
        } (Employee Code: ${
          row.emp_code
        }) : ${err.message}`
      );
    }
  }

  console.log(
    "========== ALL ATTENDANCE ROWS INSERTED =========="
  );

  return true;
},

  // addTempAttendance: async (rows) => {
  //   const pool = await poolPromise;
  //   console.log(rows);
  //   for (let i = 0; i < rows.length; i++) {
  //     const row = rows[i];

  //     try {
  //       await pool
  //         .request()
  //         .input("client_code", sql.NVarChar, String(row.client_code || ""))
  //         .input("emp_name", sql.NVarChar, row.emp_name || "")
  //         .input("emp_code", sql.NVarChar, row.emp_code || "")
  //         .input("site_name", sql.NVarChar, row.site_name || "")
  //         .input("rank", sql.NVarChar, row.rank || "")
  //         .input("at_month", sql.NVarChar, String(row.at_month || ""))
  //         .input("at_year", sql.NVarChar, String(row.at_year || ""))

  //         .input("at_1", sql.NVarChar, row.at_1 || "")
  //         .input("at_2", sql.NVarChar, row.at_2 || "")
  //         .input("at_3", sql.NVarChar, row.at_3 || "")
  //         .input("at_4", sql.NVarChar, row.at_4 || "")
  //         .input("at_5", sql.NVarChar, row.at_5 || "")
  //         .input("at_6", sql.NVarChar, row.at_6 || "")
  //         .input("at_7", sql.NVarChar, row.at_7 || "")
  //         .input("at_8", sql.NVarChar, row.at_8 || "")
  //         .input("at_9", sql.NVarChar, row.at_9 || "")
  //         .input("at_10", sql.NVarChar, row.at_10 || "")
  //         .input("at_11", sql.NVarChar, row.at_11 || "")
  //         .input("at_12", sql.NVarChar, row.at_12 || "")
  //         .input("at_13", sql.NVarChar, row.at_13 || "")
  //         .input("at_14", sql.NVarChar, row.at_14 || "")
  //         .input("at_15", sql.NVarChar, row.at_15 || "")
  //         .input("at_16", sql.NVarChar, row.at_16 || "")
  //         .input("at_17", sql.NVarChar, row.at_17 || "")
  //         .input("at_18", sql.NVarChar, row.at_18 || "")
  //         .input("at_19", sql.NVarChar, row.at_19 || "")
  //         .input("at_20", sql.NVarChar, row.at_20 || "")
  //         .input("at_21", sql.NVarChar, row.at_21 || "")
  //         .input("at_22", sql.NVarChar, row.at_22 || "")
  //         .input("at_23", sql.NVarChar, row.at_23 || "")
  //         .input("at_24", sql.NVarChar, row.at_24 || "")
  //         .input("at_25", sql.NVarChar, row.at_25 || "")
  //         .input("at_26", sql.NVarChar, row.at_26 || "")
  //         .input("at_27", sql.NVarChar, row.at_27 || "")
  //         .input("at_28", sql.NVarChar, row.at_28 || "")
  //         .input("at_29", sql.NVarChar, row.at_29 || "")
  //         .input("at_30", sql.NVarChar, row.at_30 || "")
  //         .input("at_31", sql.NVarChar, row.at_31 || "")

  //         .input("att_type", sql.NVarChar, row.att_type || "")
  //         .input("created_by", sql.BigInt, row.created_by)
  //         .input("branch_id", sql.BigInt, row.branch_id)
  //         .input("company_id", sql.BigInt, row.company_id).query(`
  //         INSERT INTO temp_attendance
  //         (
  //           client_code,
  //           emp_name,
  //           emp_code,
  //           site_name,
  //           rank,
  //           at_month,
  //           at_year,
  //           at_1,at_2,at_3,at_4,at_5,at_6,at_7,at_8,at_9,at_10,
  //           at_11,at_12,at_13,at_14,at_15,at_16,at_17,at_18,at_19,at_20,
  //           at_21,at_22,at_23,at_24,at_25,at_26,at_27,at_28,at_29,at_30,at_31,
  //           att_type,
  //           created_by,
  //           created_on,
  //           branch_id,
  //           company_id
  //         )
  //         VALUES
  //         (
  //           @client_code,
  //           @emp_name,
  //           @emp_code,
  //           @site_name,
  //           @rank,
  //           @at_month,
  //           @at_year,
  //           @at_1,@at_2,@at_3,@at_4,@at_5,@at_6,@at_7,@at_8,@at_9,@at_10,
  //           @at_11,@at_12,@at_13,@at_14,@at_15,@at_16,@at_17,@at_18,@at_19,@at_20,
  //           @at_21,@at_22,@at_23,@at_24,@at_25,@at_26,@at_27,@at_28,@at_29,@at_30,@at_31,
  //           @att_type,
  //           @created_by,
  //           FORMAT(GETDATE(), 'yyyy-MM-dd h:mm ss'),
  //           @branch_id,
  //           @company_id
  //         )
  //       `);

  //       console.log(`Row ${i + 1} inserted successfully`);
  //     } catch (err) {
  //       console.error(`Error on row ${i + 1}`);
  //       console.error("Employee Code:", row.emp_code);
  //       console.error("Data:", row);
  //       console.error("SQL Error:", err);

  //       throw new Error(
  //         `Failed at Excel Row ${i + 2} (Employee Code: ${row.emp_code}) : ${err.message}`,
  //       );
  //     }
  //   }

  //   return true;
  // },

getEmployeesByClientAndSite: async (
  clientId,
  siteId,
  month,
  year
) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("clientId", sql.NVarChar, String(clientId))
    .input("siteId", sql.NVarChar, String(siteId))
    .input("month", sql.Int, Number(month))
    .input("year", sql.Int, Number(year))
    .query(`
      SELECT DISTINCT
        ISNULL(e.id, 0) AS id,

        LTRIM(RTRIM(CAST(a.emp_code AS VARCHAR(100))))
          AS employee_code,

        COALESCE(
          NULLIF(LTRIM(RTRIM(e.first_name)), ''),
          NULLIF(LTRIM(RTRIM(a.emp_name)), ''),
          ''
        ) AS first_name,

        ISNULL(e.middle_name, '') AS middle_name,
        ISNULL(e.last_name, '') AS last_name,
        ISNULL(e.rank, '') AS rank,
        ISNULL(e.department, '') AS department,
        ISNULL(e.phone1, '') AS phone1,
        ISNULL(e.email_id, '') AS email_id,
        e.date_of_joining,

        ISNULL(e.client_id, @clientId) AS client_id,
        ISNULL(e.site_id, a.site_id) AS site_id,

        ISNULL(e.active, 0) AS active,
        ISNULL(e.pf_no, '') AS pf_no,
        ISNULL(e.esis_no, '') AS esis_no,
        ISNULL(e.emp_stages, '') AS emp_stages

      FROM emp_attendance a

      LEFT JOIN employee e
        ON LTRIM(RTRIM(CAST(e.employee_code AS VARCHAR(100))))
         = LTRIM(RTRIM(CAST(a.emp_code AS VARCHAR(100))))

      WHERE a.site_id = @siteId
        AND MONTH(a.check_in_date) = @month
        AND YEAR(a.check_in_date) = @year

        AND NULLIF(
          LTRIM(RTRIM(CAST(a.emp_code AS VARCHAR(100)))),
          ''
        ) IS NOT NULL

      ORDER BY first_name;
    `);

  return result.recordset;
},



  // Primary execution orchestration routing block
  saveAttendanceRecord: async ({
    date,
    employeeId,
    employeeCode,
    status,
    checkIn,
    checkOut,
    clientName,
    siteName,
    userId,
  }) => {
    try {
      const parsedDate = new Date(date);
      const at_day = String(parsedDate.getDate()).padStart(2, "0");
      const at_month = String(parsedDate.getMonth() + 1).padStart(2, "0");
      const at_year = String(parsedDate.getFullYear());

      let emp_worked_hours = "0.00";
      if (status !== "A" && status !== "W" && checkIn && checkOut) {
        const [startH, startM] = checkIn.split(":").map(Number);
        const [endH, endM] = checkOut.split(":").map(Number);
        const diffMins = endH * 60 + endM - (startH * 60 + startM);
        emp_worked_hours = diffMins > 0 ? (diffMins / 60).toFixed(2) : "0.00";
      }

      // 💡 SCENARIO A: Process for all active employees
      if (employeeId === "all") {
        const employees = await module.exports.getAllActiveEmployees();
        if (employees.length === 0) return { affectedRows: 0 };

        let processedCount = 0;
        for (let emp of employees) {
          await module.exports.upsertAndLogSingleDay({
            site_id: emp.site_id || 0,
            client_code: emp.client_code || "",
            emp_name: emp.emp_full_name || "Unknown",
            emp_code: emp.employee_code,
            rank: emp.rank || "",
            at_day,
            at_month,
            at_year,
            status,
            emp_worked_hours,
            site_name: siteName || 0,
            client_name: clientName || 0,
            userId,
          });
          processedCount++;
        }
        return { success: true, affectedRows: processedCount };
      }

      // 💡 SCENARIO B: Target a singular specific employee
      const request = await getPoolRequest();
      request.input("employeeId", sql.VarChar, employeeId);

      const empResult = await request.query(`
  SELECT TOP 1
    id,
    emp_full_name,
    rank,
    client_code,
    site_id,
    site_name,
    client_name
  FROM employee
  WHERE id = @employeeId
`);

      if (empResult.recordset.length === 0) {
        throw new Error("Targeted employee code profile not found.");
      }

      const targetEmp = empResult.recordset[0];
      // console.log(targetEmp);

      const result = await module.exports.upsertAndLogSingleDay({
        site_id: targetEmp.site_id || 0,
        client_code: targetEmp.client_code || "",
        emp_name: targetEmp.emp_full_name,
        emp_code: employeeCode,
        rank: targetEmp.rank || "",
        at_day,
        at_month,
        at_year,
        status,
        emp_worked_hours,
        site_name: targetEmp.site_name || "",
        client_name: targetEmp.client_name || "",
      });

      await module.exports.saveEmployeeAttendancePunch({
        employee_id: targetEmp.id,
        emp_code: employeeCode,
        check_in_date: parsedDate,
        check_in_time: checkIn,
        check_out_time: checkOut,
        site_id: targetEmp.site_id || 0,
        site_name: targetEmp.site_name || "",
        client_id: 0, // <-- always 0
        client_name: targetEmp.client_name || "",
        emp_worked_hours,
      });

      return result;
    } catch (err) {
      console.error("Error in saveAttendanceRecord:", err);
      throw err;
    }
  },

  // Atomic transactional writer helper syncing master and logging log tables
  upsertAndLogSingleDay: async (data) => {
    try {
      // console.log(" data.emp_code", data.emp_code);
      const request = await getPoolRequest();
      const currentTimeStamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");

      // 1. Check if record exists
      request.input("emp_code", sql.VarChar, data.emp_code);
      request.input("at_day", sql.VarChar, data.at_day);
      request.input("at_month", sql.VarChar, data.at_month);
      request.input("at_year", sql.VarChar, data.at_year);

      const checkSql = `
      SELECT id FROM attendance 
      WHERE emp_code = @emp_code AND at_day = @at_day AND at_month = @at_month AND at_year = @at_year
    `;
      const checkResult = await request.query(checkSql);

      if (checkResult.recordset.length > 0) {
        // 2. Perform UPDATE
        const updateReq = await getPoolRequest();
        updateReq.input("status", sql.VarChar, data.status);
        updateReq.input("hours", sql.Decimal, data.emp_worked_hours);
        updateReq.input("modified", sql.DateTime, currentTimeStamp);
        updateReq.input("emp_code", sql.VarChar, data.emp_code);
        updateReq.input("at_day", sql.VarChar, data.at_day);
        updateReq.input("at_month", sql.VarChar, data.at_month);
        updateReq.input("at_year", sql.VarChar, data.at_year);
        updateReq.input("modified_by", sql.VarChar, data.userId);

        await updateReq.query(`
        UPDATE attendance
        SET status = @status, emp_worked_hours = @hours, modified_on = @modified, 
            modified_by = @modified_by, source = 'Web Application'
        WHERE emp_code = @emp_code AND at_day = @at_day AND at_month = @at_month AND at_year = @at_year
      `);
      } else {
        // 3. Perform INSERT
        const insertReq = await getPoolRequest();
        insertReq.input("site_id", sql.Int, data.site_id);
        insertReq.input("client_code", sql.VarChar, data.client_code);
        insertReq.input("emp_name", sql.NVarChar, data.emp_name);
        insertReq.input("emp_code", sql.VarChar, data.emp_code);
        insertReq.input("rank", sql.NVarChar, data.rank);
        insertReq.input("at_day", sql.VarChar, data.at_day);
        insertReq.input("at_month", sql.VarChar, data.at_month);
        insertReq.input("at_year", sql.VarChar, data.at_year);
        insertReq.input("status", sql.VarChar, data.status);
        insertReq.input("created", sql.DateTime, currentTimeStamp);
        insertReq.input("hours", sql.Decimal, data.emp_worked_hours);
        insertReq.input("client_name", sql.VarChar, data.client_name);
        insertReq.input("site_name", sql.VarChar, data.site_name);

        await insertReq.query(`
        INSERT INTO attendance
        (site_id,site_name,client_name, client_code, emp_name, emp_code, rank, at_day, at_month, at_year, status, active, created_by, created_on, uniqueid, invoice_status, att_type, source, emp_worked_hours)
        VALUES (@site_id, @site_name, @client_name,@client_code, @emp_name, @emp_code, @rank, @at_day, @at_month, @at_year, @status, 0, 6, @created, 2, 'Pending', 'Both', 'Web Application', @hours)
      `);
      }

      // 4. Log to history table
      return await module.exports.writeToLogTable(data, currentTimeStamp);
    } catch (err) {
      console.error("❌ Error in upsertAndLogSingleDay:", err);
      throw err;
    }
  },

  // getAttendanceReport: async (fromDate, toDate, siteIds) => {
  //   const pool = await poolPromise;
  //   // console.log(fromDate, toDate, siteIds);
  //   const excludedStatuses = [
  //     "pending",
  //     "verified",
  //     "rejected",
  //     "on hold",
  //     "offer letter not issued",
  //     "offer letter on hold",
  //     "readytojoin",
  //     "",
  //     null,
  //   ];

  //   const finalReport = [];

  //   const startDate = new Date(fromDate);
  //   const endDate = new Date(toDate);

  //   // ==========================================
  //   // LOOP DATE BY DATE
  //   // ==========================================

  //   for (
  //     let current = new Date(startDate);
  //     current <= endDate;
  //     current.setDate(current.getDate() + 1)
  //   ) {
  //     const reportDate = current.toISOString().split("T")[0];

  //     const day = current.getDate();
  //     const month = current.getMonth() + 1;
  //     const year = current.getFullYear();

  //     // ==========================================
  //     // FETCH ATTENDANCE
  //     // ==========================================

  //     const attendanceResult = await pool
  //       .request()
  //       .input("month", sql.NVarChar, String(month))
  //       .input("day", sql.NVarChar, String(day))
  //       .input("year", sql.NVarChar, String(year)).query(`
  //   SELECT
  //       e.*,
  //       a.client_name,
  //       a.client_code,
  //       a.site_name,
  //       a.status AS master_status,
  //       a.emp_worked_hours AS master_hours,
  //       a.site_id AS master_site_id,
  //       a.client_code AS master_client_code,
  //       a.branch_name

  //   FROM employee e

  //   LEFT JOIN attendance a
  //       ON a.emp_code = e.employee_code
  //   WHERE
  //       e.active = '0'
  //       AND a.site_id IN (${siteIds})
  //       AND a.at_month = @month
  //       AND a.at_day = @day
  //       AND a.at_year = @year
  //       AND LOWER(ISNULL(e.emp_stages, '')) NOT IN (
  //           '${excludedStatuses.join("','")}'
  //       )

  //   ORDER BY e.employee_code
  // `);
  //     console.log(attendanceResult.recordset, day, month, year);

  //     const reportMap = {};
  //     const empCodesFound = new Set();
  //     console.log("Attendance Rows:", attendanceResult.recordset.length);
  //     console.log(attendanceResult.recordset.slice(0, 5));
  //     attendanceResult.recordset.forEach((row) => {
  //       if (!reportMap[row.employee_code]) {
  //         reportMap[row.employee_code] = row;
  //       }

  //       empCodesFound.add(row.employee_code);
  //     });

  //     // ==========================================
  //     // FETCH PUNCH DATA
  //     // ==========================================
  //     // console.log(reportMap);
  //     const punchMap = {};

  //     if (empCodesFound.size > 0) {
  //       const codes = [...empCodesFound].map((x) => `'${x}'`).join(",");

  //       const punchResult = await pool
  //         .request()
  //         .input("date", sql.NVarChar, reportDate).query(`
  //             SELECT *
  //             FROM emp_attendance

  //             WHERE emp_code IN (${codes})

  //             AND TRY_CONVERT(date,check_in_date)
  //                 =
  //                 TRY_CONVERT(date,@date)
  //         `);

  //       punchResult.recordset.forEach((row) => {
  //         punchMap[row.emp_code] = row;
  //       });
  //     }
  //     const clean = (val) =>
  //       Array.isArray(val) ? (val[0] === "" ? val[1] : val[0]) : val;
  //     // ==========================================
  //     // PRESENT EMPLOYEES
  //     // ==========================================
  //     console.log(reportMap); // <- empty object
  //     Object.values(reportMap).forEach((emp) => {
  //       const punch = punchMap[emp.employee_code];

  //       finalReport.push({
  //         DailyAttendanceInOutID: punch?.id || "",
  //         ClientName: clean(emp.client_name) || "",
  //         BranchName: emp.branch_name || "",
  //         SiteMasterID: emp.master_site_id,
  //         SiteCode: clean(emp.master_client_code) || "",
  //         SiteName: clean(emp.site_name) || "",
  //         DesignationName: emp.rank || "",
  //         ShiftTitle: emp.shift_type || "",
  //         EmpType: emp.em_status || "",
  //         EmpMasterId: emp.id,
  //         EmpCode: emp.employee_code,
  //         EmployeeName: emp.emp_full_name || "",
  //         JoiningDate: emp.date_of_joining || "",
  //         AttendanceDate: reportDate,
  //         AttendanceStatus: emp.master_status || "P",
  //         InTime: punch?.check_in_time || "",
  //         InPunchedThrough: punch?.source || "",
  //         OutTime: punch?.check_out_time || "",
  //         OutPunchedThrough: punch?.source || "",
  //         WorkingHour: Number(emp.master_hours || 0),
  //         Latitude: punch?.checkin_latitude || "",
  //         Longitude: punch?.checkin_longitude || "",
  //         LatitudeOut: punch?.checkout_latitude || "",
  //         LongitudeOut: punch?.checkout_longitude || "",
  //         GeoTagged:
  //           punch?.checkin_latitude && punch?.checkin_longitude ? "Yes" : "No",
  //         IsOtherDuty: "No",
  //         RequestDate: punch?.created_on || "",
  //         RequesterName: punch?.created_by_name || "",
  //         AttendanceApprovalStatus: "Approved",
  //       });
  //     });

  //     // ==========================================
  //     // ABSENT EMPLOYEES
  //     // ==========================================

  //     const absentCodes =
  //       empCodesFound.size > 0
  //         ? [...empCodesFound].map((x) => `'${x}'`).join(",")
  //         : "''";

  //     const absentResult = await pool.request().query(`
  //         SELECT
  //             e.*,
  //             c.company_name AS client_name,
  //             cr.client_code,
  //             cr.site_name,
  //             cr.cc_branch_name
  //         FROM employee e
  //         LEFT JOIN new_client c
  //             ON e.client_id = c.id

  //         LEFT JOIN client_rates cr
  //             ON e.site_id = cr.id

  //         WHERE
  //             e.active='0'
  //             AND e.site_id IN (${siteIds})
  //             AND e.employee_code NOT IN (${absentCodes})
  //             AND LOWER(e.emp_stages) NOT IN (
  //                 '${excludedStatuses.join("','")}'
  //             )
  //     `);

  //     // console.log(absentResult.recordset);

  //     absentResult.recordset.forEach((emp) => {
  //       finalReport.push({
  //         DailyAttendanceInOutID: "",
  //         ClientName: clean(emp.client_name) || "",
  //         BranchName: emp.cc_branch_name || "",
  //         SiteMasterID: emp.site_id,
  //         SiteCode: clean(emp.client_code) || "",
  //         SiteName: clean(emp.site_name) || "",
  //         DesignationName: emp.rank || "",
  //         ShiftTitle: emp.shift_type || "",
  //         EmpType: emp.em_status || "",
  //         EmpMasterId: emp.id,
  //         EmpCode: emp.employee_code,
  //         EmployeeName: emp.emp_full_name || "",
  //         JoiningDate: "",
  //         AttendanceDate: reportDate,
  //         AttendanceStatus: "A",
  //         InTime: "",
  //         InPunchedThrough: "",
  //         OutTime: "",
  //         OutPunchedThrough: "",
  //         WorkingHour: 0,
  //         Latitude: "",
  //         Longitude: "",
  //         LatitudeOut: "",
  //         LongitudeOut: "",
  //         GeoTagged: "No",
  //         IsOtherDuty: "No",
  //         RequestDate: "",
  //         RequesterName: "",
  //         AttendanceApprovalStatus: "Pending",
  //       });
  //     });
  //   }

  //   return finalReport;
  // },

  // getAttendanceReportData: async (from_date, to_date, site_ids) => {
  //   try {
  //     console.log("getAttendanceReportData");
  //     const pool = await poolPromise;

  //     const startDate = new Date(from_date);
  //     const endDate = new Date(to_date);
  //     endDate.setDate(endDate.getDate() + 1);

  //     const excludedStatuses = [
  //       "pending",
  //       "verified",
  //       "rejected",
  //       "on hold",
  //       "offer letter not issued",
  //       "offer letter on hold",
  //       "readytojoin",
  //     ];

  //     const excludedList = excludedStatuses.map((x) => `'${x}'`).join(",");

  //     let finalReport = [];

  //     for (
  //       let date = new Date(startDate);
  //       date < endDate;
  //       date.setDate(date.getDate() + 1)
  //     ) {
  //       const currentDate = new Date(date);

  //       const yyyy = currentDate.getFullYear();
  //       const mm = currentDate.getMonth() + 1;
  //       const dd = currentDate.getDate();

  //       const currentDateStr =
  //         yyyy +
  //         "-" +
  //         String(mm).padStart(2, "0") +
  //         "-" +
  //         String(dd).padStart(2, "0");

  //       let report = {};
  //       let empCodesFound = [];

  //       //----------------------------------------------------
  //       // Attendance Query (same as PHP)
  //       //----------------------------------------------------

  //       const attendanceSql = `
  //     SELECT
  //           e.*,
  //           a.client_name,
  //           a.client_code,
  //           a.site_name,
  //           a.status AS master_status,
  //           a.emp_worked_hours AS master_hours,
  //           a.site_id AS master_site_id,
  //           a.client_code AS master_client_code,
  //           ncr.cc_branch_name

  //     FROM employee e

  //     LEFT JOIN attendance a
  //            ON a.emp_code = e.employee_code
  //           AND a.at_month=@month
  //           AND a.at_day=@day
  //           AND a.at_year=@year
  //           AND a.site_id IN (${site_ids})

  //     LEFT JOIN client_rates ncr
  //            ON a.site_id=ncr.id

  //     WHERE
  //           e.active='0'
  //       AND a.site_id IN (${site_ids})
  //       AND LOWER(e.emp_stages) NOT IN (${excludedList})

  //     ORDER BY e.employee_code`;

  //       const attendanceResult = await pool
  //         .request()
  //         .input("month", sql.Int, mm)
  //         .input("day", sql.Int, dd)
  //         .input("year", sql.Int, yyyy)
  //         .query(attendanceSql);

  //       attendanceResult.recordset.forEach((row) => {
  //         empCodesFound.push(row.employee_code);
  //         report[row.employee_code] = row;
  //       });

  //       //----------------------------------------------------
  //       // Punch Query
  //       //----------------------------------------------------

  //       let punches = {};

  //       if (empCodesFound.length) {
  //         const punchSql = `
  //           SELECT *
  //           FROM emp_attendance
  //           WHERE emp_code IN (${empCodesFound.map((x) => `'${x}'`).join(",")})
  //           AND check_in_date=@date`;

  //         const punchResult = await pool
  //           .request()
  //           .input("date", sql.Date, currentDateStr)
  //           .query(punchSql);

  //         punchResult.recordset.forEach((row) => {
  //           punches[row.emp_code] = row;
  //         });
  //       }

  //       //----------------------------------------------------
  //       // Merge Attendance + Punch
  //       //----------------------------------------------------

  //       for (const code in report) {
  //         finalReport.push(
  //           mapToReportFormat(
  //             report[code],
  //             punches[code] || {},
  //             currentDateStr,
  //             report[code].master_status || "P",
  //             "Approved",
  //           ),
  //         );
  //       }

  //       //----------------------------------------------------
  //       // Absent Employees (exact PHP logic)
  //       //----------------------------------------------------

  //       const absentCodes = empCodesFound.length
  //         ? empCodesFound.map((x) => `'${x}'`).join(",")
  //         : "''";

  //       const absentSql = `
  //     SELECT
  //           e.*,
  //           c.company_name AS client_name,
  //           ncr.client_code,
  //           ncr.site_name,
  //           ncr.cc_branch_name

  //     FROM employee e

  //     LEFT JOIN new_client c
  //            ON e.client_id=c.id

  //     LEFT JOIN client_rates ncr
  //            ON e.site_id=ncr.id

  //     WHERE
  //           e.active='0'
  //       AND e.site_id IN (${site_ids})
  //       AND e.employee_code NOT IN (${absentCodes})
  //       AND LOWER(e.emp_stages) NOT IN (${excludedList})`;

  //       const absentResult = await pool.request().query(absentSql);

  //       absentResult.recordset.forEach((row) => {
  //         finalReport.push(
  //           mapToReportFormat(row, {}, currentDateStr, "A", "Pending"),
  //         );
  //       });
  //     }

  //     return finalReport;
  //   } catch (err) {
  //     console.log(err);
  //     throw err;
  //   }
  // },

getAttendanceReport: async (fromDate, toDate, user) => {
  try {
    const pool = await poolPromise;

    const role = String(user.role || "").trim().toUpperCase();

    // -----------------------------------------------
    // ROLE-BASED SITE FILTER
    // -----------------------------------------------

    let siteIds = [];

    if (role === "SUPER ADMIN") {
      // Super Admin: all active sites
      const result = await pool.request().query(`
        SELECT id
        FROM client_rates
        WHERE active = '0'
      `);

      siteIds = result.recordset.map((row) => Number(row.id));
    } else if (role === "ADMIN") {
      // Admin: only sites belonging to their client
      const clientIds = String(user.client_id || "")
        .split(",")
        .map((id) => Number(id.trim()))
        .filter((id) => Number.isSafeInteger(id) && id > 0);

      if (clientIds.length === 0) {
        throw new Error(
          "Admin client_id is missing. Cannot determine billing company access."
        );
      }

      const request = pool.request();

      const clientParams = clientIds.map((id, index) => {
        request.input(`clientId${index}`, sql.Int, id);
        return `@clientId${index}`;
      });

      const result = await request.query(`
        SELECT id
        FROM client_rates
        WHERE active = '0'
          AND client_id IN (${clientParams.join(",")})
      `);

      siteIds = result.recordset.map((row) => Number(row.id));
    } else {
      // Other users: assigned sites only
      siteIds = String(user.site_id || "")
        .split(",")
        .map((id) => Number(id.trim()))
        .filter((id) => Number.isSafeInteger(id) && id > 0);
    }

    siteIds = [...new Set(siteIds)].filter(
      (id) => Number.isSafeInteger(id) && id > 0
    );

    // Never execute IN ()
    if (siteIds.length === 0) {
      console.log("No sites available for attendance report:", {
        userId: user.id,
        role,
      });

      return [];
    }

    const excludedStatuses = [
      "PENDING",
      "VERIFIED",
      "REJECTED",
      "ON HOLD",
      "OFFER LETTER NOT ISSUED",
      "OFFER LETTER ON HOLD",
      "READYTOJOIN",
    ];

    const finalReport = [];

    const startDate = new Date(`${fromDate}T00:00:00`);
    const endDate = new Date(`${toDate || fromDate}T00:00:00`);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      startDate > endDate
    ) {
      throw new Error("Invalid attendance date range.");
    }

    // Date-only loop avoids timezone conversion changing the date
    const dateString = (date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    // -----------------------------------------------
    // COMMON SITE PARAMETERS
    // -----------------------------------------------

    const addSiteParams = (request) =>
      siteIds.map((id, index) => {
        request.input(`site${index}`, sql.Int, id);
        return `@site${index}`;
      });

    // -----------------------------------------------
    // DAILY ATTENDANCE REPORT
    // -----------------------------------------------

    for (
      let currentDate = new Date(startDate);
      currentDate <= endDate;
      currentDate.setDate(currentDate.getDate() + 1)
    ) {
      const currDate = dateString(currentDate);

      // ---------------------------------------------
      // FETCH PUNCHES + BILLING COMPANY
      // ---------------------------------------------

      const punchRequest = pool.request();

      punchRequest.input("checkDate", sql.NVarChar(10), currDate);

      const punchSiteParams = addSiteParams(punchRequest);

      const punchResult = await punchRequest.query(`
        SELECT
          ea.*,
          cr.site_name AS master_site_name,
          cr.cc_branch_name AS master_branch_name,
          cr.client_id AS billing_client_id,
          c.company_name AS billing_company_name
        FROM emp_attendance ea
        INNER JOIN client_rates cr
          ON ea.site_id = cr.id
        LEFT JOIN new_client c
          ON cr.client_id = c.id
        WHERE ea.check_in_date = @checkDate
          AND ea.site_id IN (${punchSiteParams.join(",")})
          AND ea.active = 0
          AND cr.active = '0'
      `);

      const punches = {};
      const employeeCodes = [];

      for (const punch of punchResult.recordset) {
        const code = String(punch.emp_code || "").trim();

        if (!code) continue;

        employeeCodes.push(code);

        if (!punches[code]) punches[code] = [];

        punches[code].push(punch);
      }

      const uniqueCodes = [...new Set(employeeCodes)];

      // ---------------------------------------------
      // FETCH EMPLOYEE MASTER
      // ---------------------------------------------

      const employees = [];

      if (uniqueCodes.length > 0) {
        const employeeRequest = pool.request();

        const employeeParams = uniqueCodes.map((code, index) => {
          employeeRequest.input(
            `empCode${index}`,
            sql.NVarChar(100),
            code
          );
          return `@empCode${index}`;
        });

        const employeeResult = await employeeRequest.query(`
          SELECT
            id,
            employee_code,
            emp_full_name,
            rank,
            em_status,
            date_of_joining,
            shift_type,
            site_id,
            emp_stages
          FROM employee
          WHERE employee_code IN (${employeeParams.join(",")})
            AND active = 0
        `);

        employees.push(...employeeResult.recordset);
      }

      const employeeMap = new Map(
        employees.map((employee) => [
          String(employee.employee_code || "").trim(),
          employee,
        ])
      );

      // ---------------------------------------------
      // ADD PRESENT / PUNCH RECORDS
      // ---------------------------------------------

      for (const [empCode, employeePunches] of Object.entries(punches)) {
        const employee = employeeMap.get(empCode);

        // Do not export punch records without an active employee
        if (!employee) continue;

        for (const punch of employeePunches) {
          finalReport.push({
            DailyAttendanceInOutID: punch.id || "",
            SiteMasterID: punch.site_id || employee.site_id || "",
            SiteCode: punch.client_code || "",
            SiteName: punch.master_site_name || punch.site_name || "",
            ClientName:
              punch.billing_company_name ||
              punch.client_name ||
              "",
            BranchName:
              punch.master_branch_name ||
              punch.branch_name ||
              "",
            DesignationName: employee.rank || "",
            DutyName: "",
            ShiftTitle: employee.shift_type || "",
            EmpType: employee.em_status || "",
            EmpMasterId: employee.id || "",
            EmpCode: empCode,
            EmployeeName:
              punch.emp_name || employee.emp_full_name || "",

            JoiningDate: employee.date_of_joining
              ? dateString(new Date(employee.date_of_joining))
              : "",

            AttendanceDate: currDate,
            AttendanceStatus: punch.emp_status || "P",
            InDate: currDate,
            InTime: punch.check_in_time || "",

            OutDate: punch.check_out_date
              ? dateString(new Date(punch.check_out_date))
              : "",

            OutTime: punch.check_out_time || "",
            WorkingHour: punch.emp_worked_hours || "00:00",
            OTHours: punch.ot_hours || "0",
            SiteHours: Number(punch.site_hours || 0),

            "CheckIn Longitude": punch.checkin_longitude || "",
            "CheckIn Latitude": punch.checkin_latitude || "",
            "CheckOut Longitude": punch.checkout_longitude || "",
            "CheckOut Latitude": punch.checkout_latitude || "",

            InPunchedThrough: punch.source || "",
            OutPunchedThrough: punch.check_out_time
              ? punch.checkout_source || ""
              : "",

            Altitude: "",
            AltitudeOut: "",
            RegularizationID_IN: "",
            RegularizationID_OUT: "",
            LeaveID: "",
            AttendanceDescription: "",

            GeoTagged: punch.checkin_latitude ? "Yes" : "No",
            IsOtherDuty: "No",
            RequestDate: punch.check_in_date || "",
            RequesterName: punch.created_by_name || "",

            AttendanceApproverId: "",
            AttendanceActionDate: "",
            AttendanceApproverName: "",
            AttendancePendingName: "",
            AttendanceRejectedName: "",
            AttendanceApprovalStatus: "Approved",

            RegularizationInApproverId: "",
            RegularizationInActionDate: "",
            RegularizationInApproverName: "",
            RegularizationOutApproverId: "",
            RegularizationOutActionDate: "",
            RegularizationOutActionName: "",

            AttendanceRemark: "",
            RegularizationInRemark: "",
            RegularizationOutRemark: "",
            RelievingHours: "",
          });
        }
      }

      // ---------------------------------------------
      // ABSENT EMPLOYEES
      // ---------------------------------------------

      const absentRequest = pool.request();

      const absentSiteParams = addSiteParams(absentRequest);

      const stageParams = excludedStatuses.map((status, index) => {
        absentRequest.input(
          `excludedStage${index}`,
          sql.NVarChar(100),
          status
        );
        return `@excludedStage${index}`;
      });

      const absentEmployeeParams = uniqueCodes.map((code, index) => {
        absentRequest.input(
          `presentCode${index}`,
          sql.NVarChar(100),
          code
        );
        return `@presentCode${index}`;
      });

      const notInCondition =
        absentEmployeeParams.length > 0
          ? `AND e.employee_code NOT IN (${absentEmployeeParams.join(",")})`
          : "";

      const absentResult = await absentRequest.query(`
        SELECT
          e.id,
          e.employee_code,
          e.emp_full_name,
          e.rank,
          e.em_status,
          e.date_of_joining,
          e.shift_type,
          e.site_id,
          e.emp_stages,
          cr.client_id,
          cr.site_name,
          cr.cc_site_hours,
          cr.cc_branch_name,
          c.company_name AS billing_company_name
        FROM employee e
        INNER JOIN client_rates cr
          ON e.site_id = cr.id
        LEFT JOIN new_client c
          ON cr.client_id = c.id
        WHERE e.active = '0'
          AND cr.active = '0'
          AND e.site_id IN (${absentSiteParams.join(",")})
          ${notInCondition}
          AND (
            (
              UPPER(ISNULL(e.em_status, '')) = 'WORKING'
              AND UPPER(ISNULL(e.emp_stages, '')) =
                  'OFFER LETTER ISSUED'
            )
            OR
            UPPER(ISNULL(e.emp_stages, '')) NOT IN (
              ${stageParams.join(",")}
            )
          )
      `);

      // ---------------------------------------------
      // ADD ABSENT ROWS
      // ---------------------------------------------

      for (const employee of absentResult.recordset) {
        finalReport.push({
          DailyAttendanceInOutID: "",
          BranchName: employee.cc_branch_name || "",
          SiteMasterID: employee.site_id || "",
          SiteCode: "",
          SiteName: employee.site_name || "",
          ClientName: employee.billing_company_name || "",
          DesignationName: employee.rank || "",
          DutyName: "",
          ShiftTitle: employee.shift_type || "",
          EmpType: employee.em_status || "",
          EmpMasterId: employee.id || "",
          EmpCode: employee.employee_code || "",
          EmployeeName: employee.emp_full_name || "",

          JoiningDate: employee.date_of_joining
            ? dateString(new Date(employee.date_of_joining))
            : "",

          AttendanceDate: currDate,
          AttendanceStatus: "A",
          InDate: "",
          InTime: "",
          OutDate: "",
          OutTime: "",
          WorkingHour: "00.00",
          OTHours: "00.00",
          SiteHours: employee.cc_site_hours || 0,

          "CheckIn Longitude": "",
          "CheckIn Latitude": "",
          "CheckOut Longitude": "",
          "CheckOut Latitude": "",

          InPunchedThrough: "",
          OutPunchedThrough: "",
          Altitude: "",
          AltitudeOut: "",
          RegularizationID_IN: "",
          RegularizationID_OUT: "",
          LeaveID: "",
          AttendanceDescription: "",

          GeoTagged: "No",
          IsOtherDuty: "No",
          RequestDate: "",
          RequesterName: "",

          AttendanceApproverId: "",
          AttendanceActionDate: "",
          AttendanceApproverName: "",
          AttendancePendingName: "",
          AttendanceRejectedName: "",
          AttendanceApprovalStatus: "Pending",

          RegularizationInApproverId: "",
          RegularizationInActionDate: "",
          RegularizationInApproverName: "",
          RegularizationOutApproverId: "",
          RegularizationOutActionDate: "",
          RegularizationOutActionName: "",

          AttendanceRemark: "",
          RegularizationInRemark: "",
          RegularizationOutRemark: "",
          RelievingHours: "",
        });
      }
    }

    console.log("Attendance report generated:", {
      role,
      accessibleSites: siteIds.length,
      rows: finalReport.length,
    });

    return finalReport;
  } catch (error) {
    console.error("getAttendanceReport Error:", error);
    throw error;
  }
},
  // getAttendanceOTReport: async (fromDate, toDate, user) => {
  //   try {

  //     const report = await module.exports.getAttendanceReport(
  //       fromDate,
  //       toDate,
  //       user
  //     );

  //     if (!report || report.length === 0) {
  //       return [];
  //     }

  //     const finalReport = [];
  //     let srNo = 1;

  //     report.forEach((row) => {

  //       const status = String(row.AttendanceStatus || "")
  //         .trim()
  //         .toUpperCase();

  //       if (status !== "P") {
  //         return;
  //       }

  //       //---------------------------------------------
  //       // Working Hours
  //       //---------------------------------------------
  //       let workedHours = parseFloat(row.WorkingHour || 0);

  //       if (!Number.isFinite(workedHours)) {
  //         workedHours = 0;
  //       }

  //       //---------------------------------------------
  //       // Site Hours
  //       //---------------------------------------------
  //       let siteHours = parseFloat(row.SiteHours || 0);

  //       if (!Number.isFinite(siteHours) || siteHours <= 0) {
  //         siteHours = 0;
  //       }

  //       //---------------------------------------------
  //       // OT Calculation
  //       //---------------------------------------------
  //       let ot = 0;
  //       let otHours = 0;

  //       if (workedHours > siteHours && siteHours > 0) {

  //         const value = (workedHours - siteHours) / siteHours;

  //         ot = Math.floor(value);

  //         otHours = Number((value - ot).toFixed(4));
  //       }

  //       //---------------------------------------------
  //       // Original Attendance Row
  //       //---------------------------------------------
  //       finalReport.push({

  //         Sr: srNo++,

  //         CheckInDate: row.InDate || row.AttendanceDate || "",

  //         ClientName: row.ClientName || "",

  //         SiteName: row.SiteName || "",

  //         SiteCode: row.SiteCode || "",

  //         EmpCode: row.EmpCode || "",

  //         EmployeeName: row.EmployeeName || "",

  //         AttendanceStatus: "P",

  //         SiteHours: siteHours.toFixed(2),

  //         TotalWorkingHours: workedHours.toFixed(2),

  //         WorkingHours: workedHours.toFixed(2),

  //         OT: ot,

  //         OTHours: otHours.toFixed(4)

  //       });

  //       //---------------------------------------------
  //       // Full OT Rows ONLY
  //       //---------------------------------------------
  //       for (let i = 0; i < ot; i++) {

  //         finalReport.push({

  //           Sr: srNo++,

  //           CheckInDate: row.InDate || row.AttendanceDate || "",

  //           ClientName: row.ClientName || "",

  //           SiteName: row.SiteName || "",

  //           SiteCode: row.SiteCode || "",

  //           EmpCode: row.EmpCode || "",

  //           EmployeeName: row.EmployeeName || "",

  //           AttendanceStatus: "P",

  //           SiteHours: siteHours.toFixed(2),

  //           TotalWorkingHours: workedHours.toFixed(2),

  //           WorkingHours: siteHours.toFixed(2),

  //           OT: 1,

  //           OTHours: siteHours.toFixed(2)

  //         });

  //       }

  //       // Decimal OT row intentionally NOT added

  //     });

  //     console.log("OT REPORT COUNT :", finalReport.length);

  //     return finalReport;

  //   } catch (error) {

  //     console.log("getAttendanceOTReport Error:", error);

  //     throw error;

  //   }
  // },

  // getAttendanceReportForDuplicates : async ({
  //   from_date,
  //   to_date,
  //   site_ids,
  //   user_id,
  // }) => {

  //   const pool = await poolPromise;

  //   // Helper Functions

  //   const parseToDecimalHours = (timeStr) => {
  //     if (!timeStr) return 0;

  //     timeStr = String(timeStr).trim();

  //     if (
  //       timeStr === "" ||
  //       timeStr === "00:00" ||
  //       timeStr === "00.00" ||
  //       timeStr === "0"
  //     )
  //       return 0;

  //     timeStr = timeStr.replace(".", ":");

  //     const parts = timeStr.split(":");

  //     const hour = parseInt(parts[0]) || 0;
  //     const minute = parseInt(parts[1]) || 0;

  //     return hour + minute / 60;
  //   };

  //   const formatToTime = (decimalHours) => {
  //     if (decimalHours <= 0) return "00.00";

  //     const totalMinutes = Math.round(decimalHours * 60);

  //     const hh = Math.floor(totalMinutes / 60);
  //     const mm = totalMinutes % 60;

  //     return `${String(hh).padStart(2, "0")}.${String(mm).padStart(2, "0")}`;
  //   };

  //   let attendance_count = 0;
  //   let p_count = 0;
  //   let p_with_count = 0;
  //   let p_attendance = 0;

  //   let finalReport = [];

  //   let finalSiteIds = site_ids;

  //   // Admin Check

  //   if (user_id) {

  //     const roleResult = await pool.request()
  //       .input("id", sql.Int, user_id)
  //       .query(`
  //           SELECT role
  //           FROM users
  //           WHERE id=@id
  //           AND active=0
  //       `);

  //     if (
  //       roleResult.recordset.length &&
  //       roleResult.recordset[0].role.toLowerCase() === "admin"
  //     ) {

  //       const sites = await pool.request().query(`
  //             SELECT id
  //             FROM client_rates
  //             WHERE active=0
  //         `);

  //       finalSiteIds = sites.recordset
  //         .map(x => x.id)
  //         .join(",");
  //     }
  //   }

  //   const excludedStatuses = [
  //     "pending",
  //     "verified",
  //     "rejected",
  //     "on hold",
  //     "offer letter not issued",
  //     "offer letter on hold",
  //     "readytojoin",
  //   ];

  //   const start = new Date(from_date);
  //   const end = new Date(to_date || from_date);

  //   for (
  //     let d = new Date(start);
  //     d <= end;
  //     d.setDate(d.getDate() + 1)
  //   ) {

  //     const currentDate =
  //       d.toISOString().split("T")[0];

  //     // ****************************************************
  //     // HERE COPY YOUR COMPLETE PHP LOGIC
  // const punchResult = await pool.request().query(`
  //     SELECT *
  //     FROM emp_attendance
  //     WHERE check_in_date='${currentDate}'
  //     AND site_id IN (${finalSiteIds})
  //     AND active=0
  // `);

  // const empCodesFound = [];
  // const punches = {};

  // for (const row of punchResult.recordset) {

  //     attendance_count++;

  //     if (row.emp_status === "P")
  //         p_attendance++;

  //     empCodesFound.push(row.emp_code);

  //     if (!punches[row.emp_code])
  //         punches[row.emp_code] = [];

  //     punches[row.emp_code].push(row);
  // }
  // if (empCodesFound.length) {

  //     const codes = empCodesFound
  //         .filter((v, i, a) => a.indexOf(v) === i)
  //         .map(v => `'${v}'`)
  //         .join(",");

  //     const employeeResult = await pool.request().query(`
  //         SELECT
  //             employee_code,
  //             id,
  //             emp_full_name,
  //             rank,
  //             em_status,
  //             date_of_joining,
  //             shift_type,
  //             site_id
  //         FROM employee
  //         WHERE employee_code IN (${codes})
  //         AND active=0
  //     `);

  //     for (const emp of employeeResult.recordset) {

  //         const empCode = emp.employee_code;

  //         const allPunchesForEmp = punches[empCode] || [];

  //         if (!allPunchesForEmp.length)
  //             continue;

  //         const firstPunch = allPunchesForEmp[0];

  //         const lastPunch =
  //             allPunchesForEmp[allPunchesForEmp.length - 1];

  //         for (const p of allPunchesForEmp) {

  //     const isPresent = (p.emp_status || "") === "P";

  //     if (isPresent) {
  //         p_count++;
  //     }

  //     const siteHoursStr = p.site_hours || "0";
  //     const workedHoursStr = p.emp_worked_hours || "00.00";

  //     const decimalSiteHours = parseToDecimalHours(siteHoursStr);
  //     const decimalWorkedHours = parseToDecimalHours(workedHoursStr);

  //     if (isPresent && decimalSiteHours > 0) {

  //         let totalEntriesNeeded = Math.floor(decimalWorkedHours / decimalSiteHours);
  //         let remainingHours = decimalWorkedHours - (totalEntriesNeeded * decimalSiteHours);

  //         if (totalEntriesNeeded <= 0) {
  //             totalEntriesNeeded = 1;
  //             remainingHours = 0;
  //         }

  //         for (let i = 1; i <= totalEntriesNeeded; i++) {

  //             p_with_count++;

  //             let currentWorkingHourString = formatToTime(decimalSiteHours);
  //             let currentOtHourString = "00.00";

  //             if (i === totalEntriesNeeded) {

  //                 if (decimalWorkedHours < decimalSiteHours) {
  //                     currentWorkingHourString = formatToTime(decimalWorkedHours);
  //                 }

  //                 currentOtHourString = formatToTime(remainingHours);
  //             }

  //             finalReport.push({
  //                 DailyAttendanceInOutID: p.id || "",
  //                 SiteMasterID: p.site_id || emp.site_id,
  //                 SiteCode: p.client_code || "",
  //                 SiteName: p.site_name || "",
  //                 ClientName: p.client_name || "",
  //                 BranchName: p.branch_name || "",
  //                 DesignationName: emp.rank || "",
  //                 ot_hours: currentOtHourString,
  //                 ShiftTitle: emp.shift_type || "",
  //                 EmpType: emp.em_status || "",
  //                 EmpMasterId: emp.id || "",
  //                 EmpCode: empCode,
  //                 EmployeeName: emp.emp_full_name || "",
  //              JoiningDate: emp.date_of_joining
  //     ? new Date(emp.date_of_joining).toISOString().split("T")[0]
  //     : "",
  //                 AttendanceDate: currentDate,
  //                 AttendanceStatus: p.emp_status || "P",
  //                 InTime: p.check_in_time || "",
  //                 InPunchedThrough: p.source || "",
  //                 OutTime: i === totalEntriesNeeded ? (lastPunch.check_out_time || "") : "",
  //                 CheckOutDate: i === totalEntriesNeeded ? (lastPunch.check_out_date || "") : "",
  //                 OutPunchedThrough: i === totalEntriesNeeded ? (p.checkout_source || "") : "",
  //                 SiteHours: siteHoursStr,
  //                 WorkingHour: currentWorkingHourString,
  //                 Latitude: p.checkin_latitude || "",
  //                 Longitude: p.checkin_longitude || "",
  //                 LatitudeOut: i === totalEntriesNeeded ? (p.checkout_latitude || "") : "",
  //                 LongitudeOut: i === totalEntriesNeeded ? (p.checkout_longitude || "") : "",
  //                 GeoTagged: p.checkin_latitude && i === 1 ? "Yes" : "No",
  //                 IsOtherDuty: "No",
  //                 RequestDate: p.check_in_date || "",
  //                 RequesterName: p.created_by_name || "",
  //                 AttendanceApprovalStatus: "Approved"
  //             });

  //         }

  //     } else {

  //         if (isPresent) {
  //             p_with_count++;
  //         }

  //         finalReport.push({
  //             DailyAttendanceInOutID: p.id || "",
  //             SiteMasterID: p.site_id || emp.site_id,
  //             SiteCode: p.client_code || "",
  //             SiteName: p.site_name || "",
  //             ClientName: p.client_name || "",
  //             BranchName: p.branch_name || "",
  //             ot_hours: p.ot_hours || "00.00",
  //             DesignationName: emp.rank || "",
  //             ShiftTitle: emp.shift_type || "",
  //             EmpType: emp.em_status || "",
  //             EmpMasterId: emp.id || "",
  //             EmpCode: empCode,
  //             EmployeeName: emp.emp_full_name || "",
  //     JoiningDate: emp.date_of_joining
  //     ? new Date(emp.date_of_joining).toISOString().split("T")[0]
  //     : "",
  //             AttendanceDate: currentDate,
  //             AttendanceStatus: p.emp_status || "P",
  //             InTime: firstPunch.check_in_time || "",
  //             InPunchedThrough: p.source || "",
  //             OutTime: lastPunch.check_out_time || "",
  //             CheckOutDate: lastPunch.check_out_date || "",
  //             OutPunchedThrough: p.checkout_source || "",
  //             SiteHours: siteHoursStr,
  //             WorkingHour: workedHoursStr,
  //             Latitude: p.checkin_latitude || "",
  //             Longitude: p.checkin_longitude || "",
  //             LatitudeOut: p.checkout_latitude || "",
  //             LongitudeOut: p.checkout_longitude || "",
  //             GeoTagged: p.checkin_latitude ? "Yes" : "No",
  //             IsOtherDuty: "No",
  //             RequestDate: p.check_in_date || "",
  //             RequesterName: p.created_by_name || "",
  //             AttendanceApprovalStatus: "Approved"
  //         });

  //     }
  // }

  //     }

  // }
  //     // working hour calculation
  //   const notInCondition = empCodesFound.length
  //     ? `AND employee_code NOT IN (${empCodesFound.map(e => `'${e}'`).join(",")})`
  //     : "";

  // const absentResult = await pool.request().query(`
  // SELECT
  // id,
  // employee_code,
  // emp_full_name,
  // rank,
  // em_status,
  // date_of_joining,
  // shift_type,
  // site_id,
  // client_name,
  // client_code
  // FROM employee
  // WHERE active=0
  // AND site_id IN (${finalSiteIds})
  // ${notInCondition}
  // AND LOWER(emp_stages) NOT IN (
  // 'pending',
  // 'verified',
  // 'rejected',
  // 'on hold',
  // 'offer letter not issued',
  // 'offer letter on hold',
  // 'readytojoin'
  // )
  // `);

  // for (const emp of absentResult.recordset) {

  //     const siteResult = await pool.request()
  // .input("client_code", sql.VarChar, emp.client_code)
  // .query(`
  // SELECT
  // cc_site_hours,
  // cc_branch_name,
  // site_name,
  // client_code
  // FROM client_rates
  // WHERE client_code=@client_code
  // `);

  // const site =
  // siteResult.recordset[0] || {};
  // const joiningDate = emp.date_of_joining
  //     ? new Date(emp.date_of_joining).toISOString().split("T")[0]
  //     : "";

  // finalReport.push({
  //     DailyAttendanceInOutID: "",
  //     SiteMasterID: emp.site_id,
  //     SiteCode: site.client_code || "",
  //     SiteName: emp.client_name || "",
  //     ClientName: emp.client_name || "",
  //     BranchName: site.cc_branch_name || "",
  //     DesignationName: emp.rank || "",
  //     ShiftTitle: emp.shift_type || "",
  //     EmpType: emp.em_status || "",
  //     EmpMasterId: emp.id || "",
  //     EmpCode: emp.employee_code || "",
  //     EmployeeName: emp.emp_full_name || "",
  //     JoiningDate: joiningDate,
  //     AttendanceDate: currentDate,
  //     AttendanceStatus: "A",
  //     InTime: "",
  //     InPunchedThrough: "",
  //     OutTime: "",
  //     CheckOutDate: "",
  //     OutPunchedThrough: "",
  //     SiteHours: site.cc_site_hours || "00.00",
  //     WorkingHour: "00.00",
  //     Latitude: "",
  //     Longitude: "",
  //     LatitudeOut: "",
  //     LongitudeOut: "",
  //     GeoTagged: "No",
  //     IsOtherDuty: "No",
  //     RequestDate: currentDate,
  //     RequesterName: "",
  //     AttendanceApprovalStatus: "Pending",
  //     ot_hours: "00.00"
  // });

  // }

  //     // ****************************************************

  //   }

  //   return {
  //     data: finalReport,
  //     metrics: {
  //       total_attendance_count: attendance_count,
  //       total_p_attendance: p_attendance,
  //       total_p_count: p_count,
  //       total_p_with_count: p_with_count,
  //     },
  //   };
  // },
  getAttendanceReportForDuplicates: async ({
    from_date,
    to_date,
    site_ids,
    user_id,
  }) => {
    const pool = await poolPromise;

    // =====================================================
    // Helper Functions
    // =====================================================

    const parseToDecimalHours = (timeStr) => {
      if (!timeStr) return 0;

      timeStr = String(timeStr).trim();

      if (
        timeStr === "" ||
        timeStr === "00:00" ||
        timeStr === "00.00" ||
        timeStr === "0"
      ) {
        return 0;
      }

      timeStr = timeStr.replace(".", ":");

      const parts = timeStr.split(":");

      const hour = parseInt(parts[0]) || 0;
      const minute = parseInt(parts[1]) || 0;

      return hour + minute / 60;
    };

    const formatToTime = (decimalHours) => {
      if (decimalHours <= 0) return "00.00";

      const totalMinutes = Math.round(decimalHours * 60);

      const hh = Math.floor(totalMinutes / 60);
      const mm = totalMinutes % 60;

      return `${String(hh).padStart(2, "0")}.${String(mm).padStart(2, "0")}`;
    };


const formatDate = (value) => {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  // SQL date/datetime may already be a Date object
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return value.toISOString().split("T")[0];
  }

  // Handle YYYY-MM-DD without timezone conversion
  const str = String(value).trim();
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/);

  if (match) {
    return match[1];
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    console.warn("Invalid date received in attendance report:", value);
    return "";
  }

  return date.toISOString().split("T")[0];
};

const formatClock = (value) => {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  // SQL TIME columns can be returned as strings
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d{1,2}:\d{2})/);
    if (match) return match[1];
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toTimeString().substring(0, 5);
  }

  return String(value);
};


   

    // =====================================================

    let attendance_count = 0;
    let p_count = 0;
    let p_with_count = 0;
    let p_attendance = 0;

    const finalReport = [];

let finalSiteIds = [];

if (Array.isArray(site_ids)) {
  finalSiteIds = site_ids;
} else if (typeof site_ids === "string" && site_ids.trim() !== "") {
  finalSiteIds = site_ids.split(",");
}

finalSiteIds = [
  ...new Set(
    finalSiteIds
      .map((id) => Number(String(id).trim()))
      .filter((id) => Number.isSafeInteger(id) && id > 0)
  ),
];

console.log("Final Site IDs:", finalSiteIds);
    // =====================================================
    // ADMIN
    // =====================================================
    if (finalSiteIds.length === 0 && user_id) {
  const result = await pool
    .request()
    .input("id", sql.Int, Number(user_id))
.query(`
  SELECT role
  FROM users
  WHERE id = @id
`);

  const user = result.recordset[0];

 if (
  user &&
  (
    String(user.role || "").toLowerCase() === "super admin" ||
    String(user.role || "").toLowerCase() === "admin"
  )
) {
    const sites = await pool.request().query(`
      SELECT id
      FROM client_rates
      WHERE active = 0
    `);

    finalSiteIds = sites.recordset.map((x) => Number(x.id));
  }
}

console.log("Updated Site IDs:", finalSiteIds);

if (finalSiteIds.length === 0) {
  throw new Error("No site IDs found in client_rates table");
}

    // if (user_id) {
    //   const roleResult = await pool.request().input("id", sql.Int, user_id)
    //     .query(`
    //             SELECT role
    //             FROM users
    //             WHERE id=@id
    //             AND active=0
    //         `);

    //   if (
    //     roleResult.recordset.length &&
    //     roleResult.recordset[0].role.toLowerCase() === "admin"
    //   ) {
    //     const sites = await pool.request().query(`
    //             SELECT id
    //             FROM client_rates
    //             WHERE active=0
    //         `);

    //     finalSiteIds = sites.recordset.map((x) => x.id).join(",");
    //   }
    // }

    // =====================================================

    const start = new Date(from_date);
    const end = new Date(to_date || from_date);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const currentDate = formatDate(d);

      // ===============================================
      // Attendance Punches
      // ===============================================

      const punchResult = await pool.request().query(`
            SELECT *
            FROM emp_attendance
            WHERE check_in_date='${currentDate}'
            AND site_id IN (${finalSiteIds})
            AND active=0
        `);

      const punches = {};
      const empCodesFound = [];

      for (const row of punchResult.recordset) {
        attendance_count++;

        if ((row.emp_status || "") === "P") {
          p_attendance++;
        }

        empCodesFound.push(row.emp_code);

        if (!punches[row.emp_code]) {
          punches[row.emp_code] = [];
        }

        punches[row.emp_code].push(row);
      }

      // ===============================================

      if (empCodesFound.length) {
        const codes = [...new Set(empCodesFound)]
          .map((x) => `'${x}'`)
          .join(",");

        const employeeResult = await pool.request().query(`
                SELECT
                    employee_code,
                    id,
                    emp_full_name,
                    rank,
                    em_status,
                    date_of_joining,
                    shift_type,
                    site_id
                FROM employee
                WHERE employee_code IN (${codes})
                AND active=0
            `);

        for (const emp of employeeResult.recordset) {
          const empCode = emp.employee_code;

          const allPunches = punches[empCode] || [];

          if (!allPunches.length) continue;

          const firstPunch = allPunches[0];

          const lastPunch = allPunches[allPunches.length - 1];

          for (const p of allPunches) {
            const isPresent = (p.emp_status || "") === "P";

            if (isPresent) p_count++;

            const siteHoursStr = p.site_hours || "00.00";

            const workedHoursStr = p.emp_worked_hours || "00.00";

            const decimalSiteHours = parseToDecimalHours(siteHoursStr);

            const decimalWorkedHours = parseToDecimalHours(workedHoursStr);

            if (isPresent && decimalSiteHours > 0) {
              // Create actual In DateTime
              let currentIn = new Date(`${p.check_in_date}T${p.check_in_time}`);

              // Create actual In DateTime

              const fullShifts = Math.floor(
                decimalWorkedHours / decimalSiteHours,
              );
              const balanceHours = decimalWorkedHours % decimalSiteHours;

              // If worked hours are less than site hours
              const totalShifts = fullShifts === 0 ? 1 : fullShifts;

              for (let i = 0; i < totalShifts; i++) {
                p_with_count++;

                let currentHours = 0;

                if (fullShifts === 0) {
                  currentHours = decimalWorkedHours;
                } else {
                  currentHours = decimalSiteHours;

                  // Merge extra hours into last shift
                  if (i === totalShifts - 1) {
                    currentHours += balanceHours;
                  }
                }

                // Calculate Out DateTime
                const currentOut = new Date(currentIn);

                currentOut.setMinutes(
                  currentOut.getMinutes() + currentHours * 60,
                );

                const isLast = i === totalShifts - 1;

                const otHours = isLast ? balanceHours : 0;
                const showSameDayCheckout =
                  !p.check_out_date &&
                  p.check_in_date === currentDate &&
                  p.check_in_time === p.check_out_time;
                finalReport.push({
                  DailyAttendanceInOutID: p.id || "",

                  SiteMasterID: p.site_id || emp.site_id,

                  SiteCode: p.client_code || "",

                  SiteName: p.site_name || "",

                  ClientName: p.client_name || "",

                  BranchName: p.branch_name || "",

                  DesignationName: emp.rank || "",

                  ShiftTitle: emp.shift_type || "",

                  EmpType: emp.em_status || "",

                  EmpMasterId: emp.id || "",

                  EmpCode: empCode,

                  EmployeeName: emp.emp_full_name || "",

                  JoiningDate: emp.date_of_joining
                    ? formatDate(new Date(emp.date_of_joining))
                    : "",

                  AttendanceStatus: "P",

                  AttendanceDate: formatDate(currentIn),

                  InTime: formatClock(currentIn),

                  CheckOutDate: p.check_out_date
                    ? formatDate(currentOut)
                    : showSameDayCheckout
                      ? p.check_in_date
                      : "",

                  OutTime:
                    p.check_out_date || showSameDayCheckout
                      ? p.check_out_time || formatClock(currentOut)
                      : "",

                  ot_hours: formatToTime(otHours),

                  SiteHours: siteHoursStr,

                  WorkingHour: formatToTime(currentHours),

                  InPunchedThrough: p.source || "",

                  OutPunchedThrough: isLast ? p.checkout_source || "" : "",

                  Latitude: p.checkin_latitude || "",

                  Longitude: p.checkin_longitude || "",

                  LatitudeOut: isLast ? p.checkout_latitude || "" : "",

                  LongitudeOut: isLast ? p.checkout_longitude || "" : "",

                  GeoTagged: p.checkin_latitude ? "Yes" : "No",

                  IsOtherDuty: "No",

                  RequestDate: formatDate(currentIn),

                  RequesterName: p.created_by_name || "",

                  AttendanceApprovalStatus: "Approved",
                });

                // Move to next shift
                currentIn = new Date(currentOut);
              }
            } else {
              if (isPresent) p_with_count++;

              finalReport.push({
                DailyAttendanceInOutID: p.id || "",

                SiteMasterID: p.site_id || emp.site_id,

                SiteCode: p.client_code || "",

                SiteName: p.site_name || "",

                ClientName: p.client_name || "",

                BranchName: p.branch_name || "",

                DesignationName: emp.rank || "",

                ShiftTitle: emp.shift_type || "",

                EmpType: emp.em_status || "",

                EmpMasterId: emp.id || "",

                EmpCode: empCode,

                EmployeeName: emp.emp_full_name || "",

                JoiningDate: emp.date_of_joining
                  ? formatDate(new Date(emp.date_of_joining))
                  : "",

                AttendanceStatus: p.emp_status || "P",
                AttendanceDate: currentDate,

                InTime: firstPunch.check_in_time || "",

                OutTime: lastPunch.check_out_time || "",

                CheckOutDate: lastPunch.check_out_date || "",

                ot_hours: p.ot_hours || "00.00",
                SiteHours: siteHoursStr,

                WorkingHour: workedHoursStr,
                InPunchedThrough: p.source || "",

                OutPunchedThrough: p.checkout_source || "",

                Latitude: p.checkin_latitude || "",

                Longitude: p.checkin_longitude || "",

                LatitudeOut: p.checkout_latitude || "",

                LongitudeOut: p.checkout_longitude || "",

                GeoTagged: p.checkin_latitude ? "Yes" : "No",

                IsOtherDuty: "No",

                RequestDate: p.check_in_date || "",

                RequesterName: p.created_by_name || "",

                AttendanceApprovalStatus: "Approved",
              });
            }
          } // end punch loop
        } // end employee loop

        // ============================================================
        // ABSENT EMPLOYEES
        // ============================================================

        const notInCondition =
          empCodesFound.length > 0
            ? `AND employee_code NOT IN (${[...new Set(empCodesFound)]
                .map((x) => `'${x}'`)
                .join(",")})`
            : "";

        const absentResult = await pool.request().query(`
            SELECT
                id,
                employee_code,
                emp_full_name,
                rank,
                em_status,
                date_of_joining,
                shift_type,
                site_id,
                client_name,
                client_code
            FROM employee
            WHERE active=0
            AND site_id IN (${finalSiteIds})
            ${notInCondition}
            AND LOWER(emp_stages) NOT IN (
                'pending',
                'verified',
                'rejected',
                'on hold',
                'offer letter not issued',
                'offer letter on hold',
                'readytojoin'
            )
        `);

        for (const emp of absentResult.recordset) {
          const siteResult = await pool
            .request()
            .input("client_code", sql.VarChar, emp.client_code).query(`
                    SELECT
                        cc_site_hours,
                        cc_branch_name,
                        site_name,
                        client_code
                    FROM client_rates
                    WHERE client_code=@client_code
                `);

          const site = siteResult.recordset[0] || {};

          finalReport.push({
            DailyAttendanceInOutID: "",

            SiteMasterID: emp.site_id,

            SiteCode: site.client_code || "",

            SiteName: site.site_name || "",

            ClientName: emp.client_name || "",

            BranchName: site.cc_branch_name || "",

            DesignationName: emp.rank || "",

            ShiftTitle: emp.shift_type || "",

            EmpType: emp.em_status || "",

            EmpMasterId: emp.id || "",

            EmpCode: emp.employee_code || "",

            EmployeeName: emp.emp_full_name || "",

            JoiningDate: emp.date_of_joining
              ? formatDate(new Date(emp.date_of_joining))
              : "",

            AttendanceStatus: "A",
            AttendanceDate: currentDate,

            InTime: "",

            CheckOutDate: "",
            OutTime: "",

            ot_hours: "00.00",

            WorkingHour: "00.00",
            SiteHours: site.cc_site_hours || "00.00",

            InPunchedThrough: "",

            OutPunchedThrough: "",

            Latitude: "",

            Longitude: "",

            LatitudeOut: "",

            LongitudeOut: "",

            GeoTagged: "No",

            IsOtherDuty: "No",

            RequestDate: currentDate,

            RequesterName: "",

            AttendanceApprovalStatus: "Pending",
          });
        }
      } // END DATE LOOP
      // ============================================================
      // SORT REPORT
      // ============================================================

      finalReport.sort((a, b) => {
        if (a.EmpCode < b.EmpCode) return -1;
        if (a.EmpCode > b.EmpCode) return 1;

        const d1 = new Date(`${a.AttendanceDate} ${a.InTime || "00:00"}`);

        const d2 = new Date(`${b.AttendanceDate} ${b.InTime || "00:00"}`);

        return d1 - d2;
      });

      // ============================================================
      // REMOVE DUPLICATES
      // ============================================================

      const uniqueRows = [];
      const uniqueKeys = new Set();

      for (const row of finalReport) {
        const key = [
          row.EmpCode,
          row.AttendanceDate,
          row.InTime,
          row.OutTime,
          row.AttendanceStatus,
        ].join("|");

        if (!uniqueKeys.has(key)) {
          uniqueKeys.add(key);

          uniqueRows.push(row);
        }
      }

      // ============================================================
      // RETURN
      // ============================================================

      return {
        data: uniqueRows,

        metrics: {
          total_attendance_count: attendance_count,

          total_p_attendance: p_attendance,

          total_p_count: p_count,

          total_p_with_count: p_with_count,
        },
      };
    }
  },

getSiteWiseAttendance: async (date, userId) => {
  const pool = await poolPromise;

  const excludedStatuses = [
    "pending",
    "verified",
    "rejected",
    "on hold",
    "offer letter not issued",
    "offer letter on hold",
    "readytojoin",
  ];

  // 1. Validate date
  if (!date || Number.isNaN(new Date(date).getTime())) {
    throw new Error("Invalid attendance date");
  }

  const dateObj = new Date(date);
  const dateOnly = [
    dateObj.getFullYear(),
    String(dateObj.getMonth() + 1).padStart(2, "0"),
    String(dateObj.getDate()).padStart(2, "0"),
  ].join("-");

  // 2. Get logged-in user
  const userResult = await pool
    .request()
    .input("userId", sql.Int, Number(userId))
    .query(`
      SELECT
        id,
        role,
        site_id,
        client_id,
        company_id,
        branch_id,
        superadmin_status
      FROM users
      WHERE id = @userId
        AND active = '0'
    `);

  if (!userResult.recordset.length) {
    throw new Error("User not found or inactive");
  }

  const user = userResult.recordset[0];
  const role = String(user.role || "").trim().toLowerCase();

  const isSuperAdmin =
    role === "super admin" ||
    role === "superadmin" ||
    Number(user.superadmin_status) === 1;

  const isAdmin = role === "admin";

  console.log("SITE ATTENDANCE ACCESS:", {
    userId: user.id,
    role,
    superadmin_status: user.superadmin_status,
    isSuperAdmin,
    date: dateOnly,
  });

  // 3. Fetch allowed sites
  // Super Admin/Admin: all active sites and clients.
  // Normal user: assigned sites/clients only.
  let siteQuery;
  let siteRequest = pool.request();

  if (isSuperAdmin || isAdmin) {
    siteQuery = `
      SELECT
        cr.id,
        cr.client_id,
        cr.site_name,
        cr.cc_state,
        cr.client_code,
        cr.cc_contact_person,
        cr.cc_loct_Startdate,
        cr.cc_loct_Enddate,
        cr.cc_total_manpower,
        nc.company_name,
        nc.billing_company_id
      FROM client_rates cr
      LEFT JOIN new_client nc
        ON cr.client_id = nc.id
      WHERE cr.active = 0
      ORDER BY nc.company_name, cr.site_name
    `;
  } else {
    const siteIds = String(user.site_id || "")
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isInteger(v) && v > 0);

    const clientIds = String(user.client_id || "")
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isInteger(v) && v > 0);

    if (!siteIds.length && !clientIds.length) {
      return [];
    }

    const conditions = [];

    if (siteIds.length) {
      const names = siteIds.map((_, i) => `@site${i}`);
      siteIds.forEach((id, i) => {
        siteRequest.input(`site${i}`, sql.Int, id);
      });
      conditions.push(`cr.id IN (${names.join(",")})`);
    }

    if (clientIds.length) {
      const names = clientIds.map((_, i) => `@client${i}`);
      clientIds.forEach((id, i) => {
        siteRequest.input(`client${i}`, sql.Int, id);
      });
      conditions.push(`cr.client_id IN (${names.join(",")})`);
    }

    siteQuery = `
      SELECT
        cr.id,
        cr.client_id,
        cr.site_name,
        cr.cc_state,
        cr.client_code,
        cr.cc_contact_person,
        cr.cc_loct_Startdate,
        cr.cc_loct_Enddate,
        cr.cc_total_manpower,
        nc.company_name,
        nc.billing_company_id
      FROM client_rates cr
      LEFT JOIN new_client nc
        ON cr.client_id = nc.id
      WHERE cr.active = 0
        AND (${conditions.join(" OR ")})
      ORDER BY nc.company_name, cr.site_name
    `;
  }

  const siteResult = await siteRequest.query(siteQuery);
  const sites = siteResult.recordset;

  console.log("TOTAL ALLOWED SITES:", sites.length);
  console.table(
    sites.map((s) => ({
      id: s.id,
      site_name: s.site_name,
      client_id: s.client_id,
      company_name: s.company_name,
    }))
  );

  if (!sites.length) {
    return [];
  }

  // 4. Get attendance for all allowed sites on the selected date
  const attendanceRequest = pool.request()
    .input("checkDate", sql.Date, dateOnly);

  const siteParams = sites.map((site, i) => {
    attendanceRequest.input(`attSite${i}`, sql.Int, site.id);
    return `@attSite${i}`;
  });

  const attendanceResult = await attendanceRequest.query(`
    SELECT
      site_id,
      SUM(CASE
        WHEN emp_status IN ('P','PP','PPP','PPPP','PPPPP')
        THEN 1 ELSE 0
      END) AS total_P,
      SUM(CASE
        WHEN emp_status = 'W'
        THEN 1 ELSE 0
      END) AS total_WO,
      SUM(CASE
        WHEN emp_status = 'A'
        THEN 1 ELSE 0
      END) AS total_A
    FROM emp_attendance
    WHERE CAST(check_in_date AS DATE) = @checkDate
      AND site_id IN (${siteParams.join(",")})
      AND active = 0
    GROUP BY site_id
  `);

  const attendanceData = {};
  attendanceResult.recordset.forEach((row) => {
    attendanceData[Number(row.site_id)] = row;
  });

  // 5. Build report for every allowed site
  const report = [];

  for (const site of sites) {
    const att = attendanceData[Number(site.id)] || {
      total_P: 0,
      total_WO: 0,
      total_A: 0,
    };

    const unmarkedRequest = pool.request()
      .input("siteId", sql.Int, site.id)
      .input("checkDate", sql.Date, dateOnly);

    const statusParams = excludedStatuses.map((status, i) => {
      unmarkedRequest.input(`status${i}`, sql.VarChar, status);
      return `@status${i}`;
    });

    const unmarkedResult = await unmarkedRequest.query(`
      SELECT COUNT(e.employee_code) AS unmarked_count
      FROM employee e
      WHERE e.site_id = @siteId
        AND e.active = '0'
        AND LOWER(LTRIM(RTRIM(ISNULL(e.emp_stages, ''))))
            NOT IN (${statusParams.join(",")})
        AND NOT EXISTS (
          SELECT 1
          FROM emp_attendance a
          WHERE a.emp_code = e.employee_code
            AND CAST(a.check_in_date AS DATE) = @checkDate
            AND a.active = '0'
        )
    `);

    const totalManpower = Number(site.cc_total_manpower || 0);
    const pCount = Number(att.total_P || 0);
    const woCount = Number(att.total_WO || 0);
    const aStatusCount = Number(att.total_A || 0);
    const unmarkedCount = Number(
      unmarkedResult.recordset[0]?.unmarked_count || 0
    );

    const finalAbsentCount = aStatusCount + unmarkedCount;
    const totalAttendance = pCount + finalAbsentCount;

    const presentPercent = totalAttendance > 0
      ? Number(((pCount * 100) / totalAttendance).toFixed(2))
      : 0;

    const absentPercent = totalAttendance > 0
      ? Number((100 - presentPercent).toFixed(2))
      : 0;

    report.push({
      Date: dateOnly,
      site_id: site.id,
      StateName: site.cc_state,
      BranchName: site.site_name,
      ClientName: site.company_name,
      BillingCompanyId: site.billing_company_id,
      SiteCode: site.client_code,
      SiteName: site.site_name,
      SiteSupervisor: site.cc_contact_person,
      TotalManpowerOfSite: totalManpower,
      P: pCount,
      A: finalAbsentCount,
      Unmarked: unmarkedCount,
      WO: woCount,
      PresentPercent: presentPercent,
      AbsentPercent: absentPercent,
    });
  }

  console.log("FINAL SITE ATTENDANCE REPORT:", report.length);
  console.table(report);

  return report;
},


  writeToLogTable: async (data, timeStamp) => {
    try {
      const request = await getPoolRequest();

      // Use .input() for every field to safely map data to SQL parameters
      request.input("site_id", sql.Int, data.site_id || 0);
      request.input("site_name", sql.NVarChar, data.site_name || null);
      request.input("client_code", sql.VarChar, data.client_code || "");
      request.input("emp_name", sql.NVarChar, data.emp_name || "");
      request.input("emp_code", sql.VarChar, data.emp_code || "");
      request.input("rank", sql.NVarChar, data.rank || "");
      request.input("at_day", sql.VarChar, data.at_day);
      request.input("at_month", sql.VarChar, data.at_month);
      request.input("at_year", sql.VarChar, data.at_year);
      request.input("status", sql.VarChar, data.status);
      request.input("created", sql.DateTime, timeStamp);
      request.input("hours", sql.Decimal, data.emp_worked_hours);

      const insertLogSql = `
      INSERT INTO attendance_log
      (site_id, site_name, client_code, emp_name, emp_code, rank, at_day, at_month, at_year, status, active, created_by, created_on, uniqueid, invoice_status, att_type, emp_worked_hours, source)
      VALUES (@site_id, @site_name, @client_code, @emp_name, @emp_code, @rank, @at_day, @at_month, @at_year, @status, 0, 72, @created, 10, 'Pending', 'Both', @hours, 'Web Application')
    `;

      return await request.query(insertLogSql);
    } catch (err) {
      console.error("❌ Error in writeToLogTable:", err);
      throw err; // Re-throw to be caught by the caller
    }
  },

 saveSearchFilter: async (data) => {
  try {
    const request = await getPoolRequest();

    request.input("field", sql.VarChar, data.search_field || "");
    request.input(
      "keyword",
      sql.VarChar,
      (data.search_keyword || "").trim()
    );
    request.input("dateField", sql.VarChar, data.search_date_field || "");
    request.input("fromDate", sql.VarChar, data.search_from_date || "");
    request.input("toDate", sql.VarChar, data.search_to_date || "");
    request.input("month", sql.Numeric, data.search_from_month || null);
    request.input("year", sql.VarChar, data.search_from_year || null);
    request.input("userId", sql.Int, data.userId);
    request.input("refNo", sql.VarChar, data.refNo);

    return await request.query(`
      INSERT INTO user_search (
        search_fields,
        search_keyword,
        search_date_field,
        search_from_date,
        search_to_date,
        search_from_month,
        search_from_year,
        search_by,
        ref_no
      )
      VALUES (
        @field, @keyword, @dateField, @fromDate, @toDate,
        @month, @year, @userId, @refNo
      )
    `);
  } catch (err) {
    console.error("DB Error in saveSearchFilter:", err.message);
    throw new Error(`Database saveSearchFilter failure: ${err.message}`);
  }
},

  saveDefaultSearch: async (userId, refNo) => {
    try {
      const currentDate = new Date();
      const request = await getPoolRequest();
      request.input("month", sql.Numeric, currentDate.getMonth() + 1);
      request.input("year", sql.VarChar, currentDate.getFullYear().toString());
      request.input("userId", sql.Int, userId);
      request.input("refNo", sql.VarChar, refNo);

      return await request.query(`
                INSERT INTO user_search (search_date_field, search_from_date, search_to_date, search_from_month, search_from_year, search_by, ref_no)
                VALUES ('','','', @month, @year, @userId, @refNo)
            `);
    } catch (err) {
      console.error("❌ DB Error in saveDefaultSearch:", err.message);
      throw new Error(`Database saveDefaultSearch failure: ${err.message}`);
    }
  },

  getUserSearchFilters: async (userId, refNo) => {
    try {
      const request = await getPoolRequest();
      request.input("userId", sql.Int, userId);
      request.input("refNo", sql.VarChar, refNo);
      const result = await request.query(
        `SELECT * FROM user_search WHERE search_by = @userId AND ref_no = @refNo`,
      );
      return result.recordset;
    } catch (err) {
      console.error(
        `❌ DB Error in getUserSearchFilters [User: ${userId}]:`,
        err.message,
      );
      throw new Error(`Database getUserSearchFilters failure: ${err.message}`);
    }
  },


// =====================================================
// 1. GET LOGGED-IN USER ATTENDANCE ACCESS
// =====================================================

getAttendanceUserAccess: async (userId) => {
  const request = await getPoolRequest();

  const query = `
    SELECT
      id,
      role,
      client_id,
      site_id,
      emp_id
    FROM users
    WHERE id = @userId
  `;

  request.input("userId", sql.Int, Number(userId));

  const result = await request.query(query);

  if (!result.recordset || result.recordset.length === 0) {
    throw new Error("Logged-in user not found");
  }

  const user = result.recordset[0];

  const role = String(user.role || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  return {
    userId: user.id,
    role,
    clientId: user.client_id,
    siteId: user.site_id,
    employeeId: user.emp_id,
  };
},


// =====================================================
// 2. BUILD ATTENDANCE ACCESS FILTER
// =====================================================

buildAttendanceAccessFilter: async (userId, request) => {
  const access =
    await module.exports.getAttendanceUserAccess(userId);

  const { role, employeeId } = access;

  const normalizedRole = String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  // -----------------------------------------------------
  // SUPER ADMIN: ALL ATTENDANCE
  // -----------------------------------------------------

  if (
    ["superadmin", "super admin"].includes(normalizedRole)
  ) {
    console.log(
      "ATTENDANCE ACCESS => SUPER ADMIN => ALL ATTENDANCE"
    );

    return "";
  }

  // -----------------------------------------------------
  // ADMIN: ASSIGNED CLIENTS AND SITES ONLY
  // -----------------------------------------------------

  if (normalizedRole === "admin") {
    const parseIds = (value, fieldName) => {
      if (
        value === null ||
        value === undefined ||
        String(value).trim() === ""
      ) {
        throw new Error(
          `Admin ${fieldName} is missing. Attendance access denied.`
        );
      }

      const ids = String(value)
        .split(",")
        .map((item) => item.trim());

      if (
        ids.some(
          (item) =>
            !/^\d+$/.test(item) ||
            Number(item) <= 0
        )
      ) {
        throw new Error(
          `Invalid Admin ${fieldName}: ${value}`
        );
      }

      return [...new Set(ids.map(Number))];
    };

    const clientIds = parseIds(
      access.clientId,
      "client_id"
    );

    const siteIds = parseIds(
      access.siteId,
      "site_id"
    );

    request.input(
      "attendanceAllowedClientIds",
      sql.NVarChar(sql.MAX),
      clientIds.join(",")
    );

    request.input(
      "attendanceAllowedSiteIds",
      sql.NVarChar(sql.MAX),
      siteIds.join(",")
    );

    console.log("ATTENDANCE ACCESS => ADMIN", {
      clientIds,
      siteIds,
    });

    return `
      AND EXISTS (
        SELECT 1
        FROM STRING_SPLIT(
          @attendanceAllowedClientIds, ','
        ) AS allowedClient
        WHERE TRY_CONVERT(
          INT,
          LTRIM(RTRIM(allowedClient.value))
        ) = (
          SELECT cr_access.client_id
          FROM client_rates AS cr_access
          WHERE cr_access.id = ea.site_id
            AND cr_access.active = 0
        )
      )

      AND EXISTS (
        SELECT 1
        FROM STRING_SPLIT(
          @attendanceAllowedSiteIds, ','
        ) AS allowedSite
        WHERE TRY_CONVERT(
          INT,
          LTRIM(RTRIM(allowedSite.value))
        ) = ea.site_id
      )
    `;
  }

  // -----------------------------------------------------
  // EMPLOYEE: OWN ATTENDANCE ONLY
  // -----------------------------------------------------

  if (normalizedRole === "employee") {
    if (
      employeeId === null ||
      employeeId === undefined ||
      String(employeeId).trim() === "" ||
      !Number.isInteger(Number(employeeId)) ||
      Number(employeeId) <= 0
    ) {
      throw new Error(
        "Employee ID not found. Attendance access denied."
      );
    }

    request.input(
      "attendanceEmployeeId",
      sql.Int,
      Number(employeeId)
    );

    console.log(
      "ATTENDANCE ACCESS => EMPLOYEE => OWN ATTENDANCE ONLY"
    );

    return `
      AND ea.employee_id = @attendanceEmployeeId
    `;
  }

  // -----------------------------------------------------
  // INVALID ROLE
  // -----------------------------------------------------

  throw new Error(
    `Unauthorized attendance access: ${normalizedRole}`
  );
},


// =====================================================
// 3. GET ATTENDANCE COUNT / SUMMARY
// =====================================================


getAttendanceCount: async (
  tablename,
  searchWord,
  userId
) => {
  try {
    // =====================================================
    // 1. VALIDATE USER ID
    // =====================================================

    const parsedUserId = Number(userId);

    if (
      userId === null ||
      userId === undefined ||
      String(userId).trim() === "" ||
      !Number.isSafeInteger(parsedUserId) ||
      parsedUserId <= 0
    ) {
      throw new Error("Invalid logged-in user ID");
    }

    const request = await getPoolRequest();

    // =====================================================
    // 2. USER ACCESS
    // =====================================================

    const access =
      await module.exports.getAttendanceUserAccess(
        parsedUserId
      );

    const role = String(access.role || "")
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");

    const isSuperAdmin = [
      "superadmin",
      "super admin"
    ].includes(role);

    let mainAccessWhere = "";
    let attendanceAccessWhere = "";

    // =====================================================
    // 3. PARSE ADMIN IDS
    // =====================================================

    const parseIds = (value, fieldName) => {
      if (
        value == null ||
        String(value).trim() === ""
      ) {
        throw new Error(
          `Admin ${fieldName} is missing. Access denied.`
        );
      }

      const ids = String(value)
        .split(",")
        .map((item) => item.trim());

      if (
        ids.some(
          (item) =>
            !/^\d+$/.test(item) ||
            Number(item) <= 0 ||
            !Number.isSafeInteger(Number(item))
        )
      ) {
        throw new Error(
          `Invalid Admin ${fieldName}: ${value}`
        );
      }

      return [
        ...new Set(ids.map(Number))
      ];
    };

    // =====================================================
    // 4. ADMIN ACCESS
    // =====================================================

    if (role === "admin") {
      const clientIds = parseIds(
        access.clientId,
        "client_id"
      );

      const siteIds = parseIds(
        access.siteId,
        "site_id"
      );

      request.input(
        "countAllowedClientIds",
        sql.NVarChar(sql.MAX),
        clientIds.join(",")
      );

      request.input(
        "countAllowedSiteIds",
        sql.NVarChar(sql.MAX),
        siteIds.join(",")
      );

      mainAccessWhere = `
        AND EXISTS (
          SELECT 1
          FROM STRING_SPLIT(
            @countAllowedClientIds, ','
          ) AS allowedClient
          WHERE TRY_CONVERT(
            INT,
            LTRIM(RTRIM(allowedClient.value))
          ) = nc.id
        )
        AND EXISTS (
          SELECT 1
          FROM STRING_SPLIT(
            @countAllowedSiteIds, ','
          ) AS allowedSite
          WHERE TRY_CONVERT(
            INT,
            LTRIM(RTRIM(allowedSite.value))
          ) = cr.id
        )
        AND cr.client_id = nc.id
      `;
    }

    // =====================================================
    // 5. SUPERADMIN ACCESS
    // =====================================================

    else if (isSuperAdmin) {
      mainAccessWhere = "";
    }

    // =====================================================
    // 6. EMPLOYEE ACCESS
    // =====================================================

    else if (role === "employee") {
      const employeeId = Number(
        access.employeeId
      );

      if (
        access.employeeId == null ||
        !Number.isSafeInteger(employeeId) ||
        employeeId <= 0
      ) {
        throw new Error(
          "Employee ID missing or invalid"
        );
      }

      request.input(
        "countAttendanceEmployeeId",
        sql.Int,
        employeeId
      );

      // Employees only see sites where they have
      // active=0 attendance records.
      mainAccessWhere = `
        AND EXISTS (
          SELECT 1
          FROM emp_attendance AS employeeAttendance
          WHERE employeeAttendance.site_id = cr.id
            AND employeeAttendance.employee_id =
                @countAttendanceEmployeeId
            AND employeeAttendance.active = 0
        )
      `;

      // Apply employee restriction only once
      // to attendance aggregation.
      attendanceAccessWhere = `
        AND ea.employee_id =
            @countAttendanceEmployeeId
      `;
    }

    else {
      throw new Error(
        `Unauthorized attendance access: ${role}`
      );
    }

    // =====================================================
    // 7. ADDITIONAL ATTENDANCE ACCESS FILTER
    // =====================================================
    // Do not append this helper blindly for employees:
    // employeeId is already applied above.
    // For admin/superadmin, retain the existing helper.
    // =====================================================

    if (role !== "employee") {
      const helperAttendanceAccessWhere =
        await module.exports.buildAttendanceAccessFilter(
          parsedUserId,
          request
        );

      if (
        typeof helperAttendanceAccessWhere === "string" &&
        helperAttendanceAccessWhere.trim()
      ) {
        attendanceAccessWhere +=
          "\n" + helperAttendanceAccessWhere;
      }
    }

    // =====================================================
    // 8. SEARCH FILTERS
    // =====================================================

    const userSearch =
      await module.exports.getUserSearchFilters(
        parsedUserId,
        tablename
      );

    const rawWhereClause = buildFilterQuery(
      userSearch,
      searchWord,
      request
    );

    let whereClause = "";

    if (
      typeof rawWhereClause === "string" &&
      rawWhereClause.trim()
    ) {
      const cleanedWhere = rawWhereClause
        .trim()
        .replace(/^WHERE\s+/i, "")
        .replace(/^AND\s+/i, "")
        .trim();

      if (cleanedWhere) {
        whereClause = `AND (${cleanedWhere})`;
      }
    }

    // =====================================================
    // 9. COUNT QUERY
    // =====================================================

    const countQuery = `
      ;WITH AttendanceSummary AS (
        SELECT
          ea.site_id,
          MONTH(ea.check_in_date) AS at_month,
          YEAR(ea.check_in_date) AS at_year,

          SUM(
            CASE
              WHEN ea.emp_status = 'P' THEN 1
              WHEN ea.emp_status = 'HF' THEN 0.5
              ELSE 0
            END
          ) AS total_nd,

          SUM(
            CASE
              WHEN
                TRY_CONVERT(
                  DECIMAL(18,4),
                  ea.emp_worked_hours
                ) >
                TRY_CONVERT(
                  DECIMAL(18,4),
                  ea.site_hours
                )
              THEN FLOOR(
                (
                  TRY_CONVERT(
                    DECIMAL(18,4),
                    ea.emp_worked_hours
                  ) -
                  TRY_CONVERT(
                    DECIMAL(18,4),
                    ea.site_hours
                  )
                ) /
                NULLIF(
                  TRY_CONVERT(
                    DECIMAL(18,4),
                    ea.site_hours
                  ),
                  0
                )
              )
              ELSE 0
            END
          ) AS total_ot,

          SUM(
            CASE
              WHEN
                TRY_CONVERT(
                  DECIMAL(18,4),
                  ea.emp_worked_hours
                ) >
                TRY_CONVERT(
                  DECIMAL(18,4),
                  ea.site_hours
                )
              THEN
                (
                  (
                    TRY_CONVERT(
                      DECIMAL(18,4),
                      ea.emp_worked_hours
                    ) -
                    TRY_CONVERT(
                      DECIMAL(18,4),
                      ea.site_hours
                    )
                  ) /
                  NULLIF(
                    TRY_CONVERT(
                      DECIMAL(18,4),
                      ea.site_hours
                    ),
                    0
                  )
                )
                -
                FLOOR(
                  (
                    TRY_CONVERT(
                      DECIMAL(18,4),
                      ea.emp_worked_hours
                    ) -
                    TRY_CONVERT(
                      DECIMAL(18,4),
                      ea.site_hours
                    )
                  ) /
                  NULLIF(
                    TRY_CONVERT(
                      DECIMAL(18,4),
                      ea.site_hours
                    ),
                    0
                  )
                )
              ELSE 0
            END
          ) AS total_ot_hours,

          SUM(
            CASE
              WHEN ea.emp_status = 'W' THEN 1
              ELSE 0
            END
          ) AS total_off,

          SUM(
            CASE
              WHEN ea.emp_status = 'H' THEN 1
              ELSE 0
            END
          ) AS total_holiday

        FROM emp_attendance AS ea
        WHERE
          ea.active = 0
          ${attendanceAccessWhere}
        GROUP BY
          ea.site_id,
          MONTH(ea.check_in_date),
          YEAR(ea.check_in_date)
      ),

      InvoiceSummary AS (
        SELECT
          site_id,
          at_month,
          at_year,

          CASE
            WHEN SUM(
              CASE
                WHEN invoice_status = 'Pending'
                THEN 1 ELSE 0
              END
            ) > 0 THEN 'Pending'

            WHEN SUM(
              CASE
                WHEN invoice_status = 'Approved'
                THEN 1 ELSE 0
              END
            ) > 0 THEN 'Approved'

            ELSE 'Pending'
          END AS invoice_status,

          MAX(att_type) AS att_type

        FROM attendance
        WHERE active = 0
        GROUP BY
          site_id,
          at_month,
          at_year
      ),

      AttendanceData AS (
        SELECT
          nc.id AS client_id,
          nc.company_name,
          nc.billing_company,
          nc.billing_company_id,
          nc.billing_branch_id,
          nc.billing_branch,

          cr.id AS site_id,
          cr.client_code,
          cr.site_name,

          ISNULL(att.at_month, '') AS at_month,
          ISNULL(att.at_year, '') AS at_year,

          ISNULL(
            inv.invoice_status,
            'Pending'
          ) AS invoice_status,

          ISNULL(
            inv.att_type,
            'Both'
          ) AS att_type,

          ISNULL(att.total_nd, 0) AS total_nd,
          ISNULL(att.total_ot, 0) AS total_ot,
          ISNULL(att.total_ot_hours, 0) AS total_ot_hours,
          ISNULL(att.total_off, 0) AS total_off,
          ISNULL(att.total_holiday, 0) AS total_holiday

        FROM new_client AS nc

        INNER JOIN client_rates AS cr
          ON cr.client_id = nc.id
          AND cr.active = 0

        LEFT JOIN AttendanceSummary AS att
          ON att.site_id = cr.id

        LEFT JOIN InvoiceSummary AS inv
          ON inv.site_id = cr.id
          AND inv.at_month = att.at_month
          AND inv.at_year = att.at_year

        WHERE
          nc.active = 0
          AND cr.active = 0
          ${mainAccessWhere}
          ${whereClause}
      )

      SELECT COUNT_BIG(*) AS totalCount
      FROM AttendanceData;
    `;

    // =====================================================
    // 10. DEBUG LOGS
    // =====================================================

    console.log(
      "\n========== GET ATTENDANCE COUNT =========="
    );
    console.log("USER ID:", parsedUserId);
    console.log("ROLE:", role);
    console.log("CLIENT IDS:", access.clientId);
    console.log("SITE IDS:", access.siteId);
    console.log("EMPLOYEE ID:", access.employeeId);
    console.log("RAW WHERE:", rawWhereClause);
    console.log("NORMALIZED WHERE:", whereClause);
    console.log("MAIN ACCESS FILTER:", mainAccessWhere);
    console.log(
      "ATTENDANCE ACCESS FILTER:",
      attendanceAccessWhere
    );
    console.log("FINAL SQL:\n", countQuery);

    // =====================================================
    // 11. EXECUTE QUERY
    // =====================================================

    const result = await request.query(countQuery);

    const totalCount = Number(
      result.recordset[0]?.totalCount ?? 0
    );

    console.log(
      "ATTENDANCE TOTAL COUNT:",
      totalCount
    );

    return totalCount;

  } catch (err) {
    console.error(
      "DB SQL Error in getAttendanceCount:",
      err
    );

    throw new Error(
      `Database getAttendanceCount failure: ${err.message}`
    );
  }
},


  saveEmployeeAttendancePunch: async ({
    employee_id,
    emp_code,
    check_in_date,
    check_in_time,
    check_out_time,
    site_id,
    site_name,
    client_id,
    client_name,
    emp_worked_hours,
  }) => {
    try {
      const currentTime = new Date();

      // console.log("Attendance Insert Data =>", {
      //   employee_id,
      //   emp_code,
      //   check_in_date,
      //   check_in_time,
      //   check_out_time,
      //   site_id,
      //   site_name,
      //   client_id,
      //   client_name,
      //   emp_worked_hours,
      // });

      // ------------------------
      // EMP_ATTENDANCE
      // ------------------------

      const request1 = await getPoolRequest();

      await request1
        .input("employee_id", sql.Int, Number(employee_id))
        .input("emp_code", sql.VarChar(50), String(emp_code))
        .input("check_in_date", sql.Date, check_in_date)
        .input("check_in_time", sql.VarChar(20), check_in_time || null)
        .input("check_out_time", sql.VarChar(20), check_out_time || null)
        .input("site_id", sql.Int, Number(site_id || 0))
        .input("client_id", sql.Int, Number(client_id || 0))
        .input("site_name", sql.NVarChar(255), site_name || "")
        .input("client_name", sql.NVarChar(255), client_name || "")
        .input(
          "emp_worked_hours",
          sql.Decimal(18, 2),
          Number(emp_worked_hours || 0),
        )
        .input("created_on", sql.DateTime, currentTime).query(`
        INSERT INTO emp_attendance
        (
          employee_id,
          emp_code,
          check_in_date,
          check_in_time,
          check_out_time,
          created_by,
          created_on,
          active,
          site_id,
          client_id,
          site_name,
          client_name,
          source,
          emp_worked_hours
        )
        VALUES
        (
          @employee_id,
          @emp_code,
          @check_in_date,
          @check_in_time,
          @check_out_time,
          @created_by,
          @created_on,
          0,
          @site_id,
          @client_id,
          @site_name,
          @client_name,
          'Android Application',
          @emp_worked_hours
        )
      `);

      console.log("✓ emp_attendance inserted");

      // ------------------------
      // EMP_ATTENDANCE_LOG
      // ------------------------

      const request2 = await getPoolRequest();

      await request2
        .input("employee_id", sql.Int, Number(employee_id))
        .input("emp_code", sql.VarChar(50), String(emp_code))
        .input("check_in_date", sql.Date, check_in_date)
        .input("check_out_date", sql.Date, check_in_date)
        .input("check_in_time", sql.VarChar(20), check_in_time || null)
        .input("check_out_time", sql.VarChar(20), check_out_time || null)
        .input("site_id", sql.Int, Number(site_id || 0))
        .input("client_id", sql.Int, Number(client_id || 0))
        .input("site_name", sql.NVarChar(255), site_name || "")
        .input("client_name", sql.NVarChar(255), client_name || "")
        .input(
          "emp_worked_hours",
          sql.Decimal(18, 2),
          Number(emp_worked_hours || 0),
        )
        .input("created_on", sql.DateTime, currentTime).query(`
        INSERT INTO emp_attendance_log
        (
          employee_id,
          emp_code,
          check_in_date,
          check_out_date,
          check_in_time,
          check_out_time,
          created_by,
          created_on,
          active,
          site_id,
          site_name,
          client_id,
          client_name,
          emp_status,
          emp_worked_hours,
          source
        )
        VALUES
        (
          @employee_id,
          @emp_code,
          @check_in_date,
          @check_out_date,
          @check_in_time,
          @check_out_time,
          6,
          @created_on,
          1,
          @site_id,
          @site_name,
          @client_id,
          @client_name,
          'P',
          @emp_worked_hours,
          'Android Application'
        )
      `);

      console.log("✓ emp_attendance_log inserted");

      return true;
    } catch (err) {
      console.log("=================================");
      console.log("EMP ATTENDANCE INSERT FAILED");
      console.log("MESSAGE:", err.message);
      console.log("CODE:", err.code);
      console.log("NUMBER:", err.number);
      console.log("STATE:", err.state);
      console.log("CLASS:", err.class);

      if (err.originalError) {
        console.log("ORIGINAL ERROR:", err.originalError);
      }

      if (err.precedingErrors) {
        console.log("PRECEDING ERRORS:", err.precedingErrors);
      }

      console.log("=================================");

      throw err;
    }
  },

  // getAttendanceList: async (
  //   tablename,
  //   orderby,
  //   page,
  //   perPage,
  //   searchWord,
  //   userId,
  // ) => {
  //   let compiledQuery = "";
  //   try {
  //     const request = await getPoolRequest();
  //     const userSearch = await module.exports.getUserSearchFilters(
  //       userId,
  //       tablename,
  //     );
  //     const whereClause = buildFilterQuery(userSearch, searchWord, request);

  //     request.input("offset", sql.Int, page);
  //     request.input("limit", sql.Int, perPage);

  //     const safeTableName = tablename.replace(/[^a-zA-Z0-9_]/g, "");
  //     const safeOrderBy = orderby.replace(/[^a-zA-Z0-9_]/g, "");

  //     compiledQuery = `
  //   SELECT att.site_id, att.at_month, att.at_year, att.att_type,
  //          MAX(cr.site_name) as site_name, MAX(nc.company_name) as company_name
  //   FROM ${safeTableName} att
  //   LEFT JOIN client_rates cr ON att.site_id = cr.id
  //   LEFT JOIN new_client nc ON nc.id = cr.client_id
  //   ${whereClause}
  //   GROUP BY att.site_id, att.at_month, att.at_year, att.att_type
  //   ORDER BY MAX(att.${safeOrderBy}) DESC -- ✨ FIXED: Wrapped column in MAX()
  //   OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;`;

  //     const result = await request.query(compiledQuery);
  //     return result.recordset;
  //   } catch (err) {
  //     console.error(
  //       "❌ DB SQL Error in getAttendanceList. Query:",
  //       compiledQuery,
  //     );
  //     throw new Error(`Database getAttendanceList failure: ${err.message}`);
  //   }
  // },

  splitAttendance: (data) => {
    const rows = [];

    // ===================================
    // NO TIME STATUS HANDLING
    // ===================================

    const noTimeStatuses = ["A", "W", "H", "CL", "SL", "PL", "ML"];

    if (noTimeStatuses.includes(data.emp_status)) {
      rows.push({
        ...data,

        check_in_time: null,
        check_out_date: null,
        check_out_time: null,

        emp_worked_hours: 0,
        ot_hours: 0,

        emp_status: data.emp_status,
      });

      return rows;
    }

    // ===================================
    // SITE HOURS
    // ===================================

    const siteHours = Number(data.cc_site_hours ?? data.site_hours ?? 0);

    if (!Number.isFinite(siteHours) || siteHours <= 0) {
      throw new Error(
        `Invalid site hours for employee ${data.employee_id}. siteHours=${siteHours}`,
      );
    }

    const shiftMinutes = siteHours * 60;

    // ===================================
    // DATE / TIME
    // ===================================

    const start = new Date(`${data.check_in_date}T${data.check_in_time}:00`);

    const end = new Date(`${data.check_out_date}T${data.check_out_time}:00`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error(
        `Invalid check-in/check-out date or time for employee ${data.employee_id}`,
      );
    }

    if (end <= start) {
      throw new Error(
        `Check-out must be after check-in for employee ${data.employee_id}`,
      );
    }

    // ===================================
    // SPLIT
    // ===================================

    let currentStart = new Date(start);

    while (currentStart < end) {
      const normalEnd = new Date(currentStart.getTime() + shiftMinutes * 60000);

      // ===================================
      // FULL REGULAR SHIFT
      // ===================================

      if (normalEnd <= end) {
        rows.push({
          ...data,

          check_in_date: formatLocalDate(currentStart),
          check_in_time: formatLocalTime(currentStart),

          check_out_date: formatLocalDate(normalEnd),
          check_out_time: formatLocalTime(normalEnd),

          emp_worked_hours: Number(siteHours.toFixed(2)),

          // initially no OT
          ot_hours: 0,

          emp_status: data.emp_status,
        });

        currentStart = new Date(normalEnd);

        continue;
      }

      // ===================================
      // REMAINING HOURS
      // ===================================

      const remainingHours = (end - currentStart) / 3600000;

      // ===================================
      // REMAINING < SITE HOURS = OT
      // ===================================

      if (remainingHours > 0) {
        const lastRow = rows[rows.length - 1];

        // If a regular attendance row already exists,
        // add remaining time as OT to that row.
        if (lastRow) {
          lastRow.ot_hours = Number(
            (Number(lastRow.ot_hours || 0) + remainingHours).toFixed(2),
          );

          // IMPORTANT:
          // Actual check-out time should remain actual end time
          lastRow.check_out_date = formatLocalDate(end);
          lastRow.check_out_time = formatLocalTime(end);

          break;
        }

        // ===================================
        // TOTAL WORKED < SITE HOURS
        // ===================================

        rows.push({
          ...data,

          check_in_date: formatLocalDate(currentStart),
          check_in_time: formatLocalTime(currentStart),

          check_out_date: formatLocalDate(end),
          check_out_time: formatLocalTime(end),

          emp_worked_hours: Number(remainingHours.toFixed(2)),

          ot_hours: 0,

          emp_status: data.emp_status,
        });

        break;
      }

      break;
    }

    return rows;
  },

  addAttendance: async (data, user) => {
    const splitRows = module.exports.splitAttendance(data);
const pool = await poolPromise;

const clientResult = await pool.request()
  .input("client_id", sql.BigInt, Number(data.client_id))
  .query(`
    SELECT company_id, branch_id
    FROM new_client
    WHERE id = @client_id
  `);

if (clientResult.recordset.length === 0) {
  throw new Error("Client not found");
}

const company_id = clientResult.recordset[0].company_id;
const branch_id = clientResult.recordset[0].branch_id;
    let savedRows = [];

    // save all emp_attendance
for (const row of splitRows) {
  const attendanceData = {
    ...row,
    company_id,
    branch_id,
  };

  await module.exports.addAttendanceSingle(
    attendanceData,
    user
  );

  savedRows.push(attendanceData);
}

    // =====================================================
    // RECALCULATE EMPLOYEE LEAVES
    // =====================================================

    const employeeIds = [
      ...new Set(
        splitRows.map((row) => Number(row.employee_id)).filter(Boolean),
      ),
    ];

    // for (const employeeId of employeeIds) {
    //   await module.exports.recalculateEmployeeLeaves(employeeId, user);
    // }

    // ===============================
    // INSERT SUMMARY DATE WISE
    // ===============================

    const summaryDates = [...new Set(splitRows.map((x) => x.check_in_date))];

    for (const date of summaryDates) {
      const summaryData = {
        ...data,
        check_in_date: date,
          company_id,
  branch_id,
      };

      await module.exports.insertAttendanceSummary(summaryData, user);
    }

    return {
      success: true,
      message: "Attendance Added Successfully",
    };
  },

  addAttendanceSingle: async (data, user, transaction = null) => {
    console.log("BACKEND RECEIVED ROW =>", data);
    const pool = await poolPromise;

    let ownTransaction = false;

    if (!transaction) {
      transaction = new sql.Transaction(pool);
      await transaction.begin();
      ownTransaction = true;
    }

    try {
      // =====================================
      // SAME DATE PRESENT / ABSENT CHECK
      // =====================================

      const empName = data.emp_name || "Unknown Employee";
      const empCode = data.emp_code || "";

      const sameDateAttendance = await new sql.Request(transaction)

        .input("employee_id", sql.BigInt, data.employee_id)

        .input("check_in_date", sql.Date, data.check_in_date).query(`

SELECT 
    id,
    emp_status

FROM emp_attendance

WHERE employee_id=@employee_id

AND check_in_date=@check_in_date

AND active=0

`);

      if (sameDateAttendance.recordset.length > 0) {
        const existingStatus = sameDateAttendance.recordset[0].emp_status;

        const newStatus = data.emp_status || "A";

        // P already exists and trying A
        if (existingStatus === "P" && newStatus === "A") {
          throw new Error(
            `${empName} (${empCode}) is already Present for ${data.check_in_date}. Absent attendance not allowed.`,
          );
        }

        // A already exists and trying P
        if (existingStatus === "A" && newStatus === "P") {
          throw new Error(
            `${empName} (${empCode}) is already Absent for ${data.check_in_date}. Present attendance not allowed.`,
          );
        }
      }
      // =====================================
      // OVERLAP CHECK
      // =====================================

      const overlap = await new sql.Request(transaction)

        .input("employee_id", sql.BigInt, data.employee_id)

        .input("check_in_date", sql.Date, data.check_in_date)

        .input("check_out_date", sql.Date, data.check_out_date)

        .input("check_in_time", sql.VarChar, data.check_in_time)

        .input("check_out_time", sql.VarChar, data.check_out_time).query(`
SELECT id
FROM emp_attendance
WHERE employee_id=@employee_id
AND active=0
AND
(
    CAST(
        CONCAT(
            CONVERT(varchar(10),check_in_date,120),
            ' ',
            check_in_time
        ) AS datetime
    )
    <
    CAST(
        CONCAT(
            CONVERT(varchar(10),@check_out_date,120),
            ' ',
            @check_out_time
        ) AS datetime
    )

    AND

    CAST(
        CONCAT(
            CONVERT(varchar(10),check_out_date,120),
            ' ',
            check_out_time
        ) AS datetime
    )
    >
    CAST(
        CONCAT(
            CONVERT(varchar(10),@check_in_date,120),
            ' ',
            @check_in_time
        ) AS datetime
    )
)
`);

      if (overlap.recordset.length > 0) {
        throw new Error(
          `${empName} (${empCode}) already has duty provided for this time.`,
        );
      }

      // =====================================
      // HOURS STATUS
      // =====================================

      let dutyHours = Number(data.emp_worked_hours || 0);

      let siteHours = Number(data.site_hours || 0);

      let otHours = Number(data.ot_hours || 0);

      let status = data.emp_status || "A";

      const manualStatus = ["P", "A", "W", "H", "CL", "SL", "PL", "ML"];

      if (!manualStatus.includes(status)) {
        if (dutyHours >= siteHours - 0.25) {
          status = "P";
        } else {
          status = "A";
        }
      }

      // =====================================
      // INSERT ATTENDANCE
      // =====================================

      const attendanceResult = await new sql.Request(transaction)

        .input("employee_id", sql.BigInt, data.employee_id)

        .input("emp_code", sql.VarChar, data.emp_code)

        .input("emp_name", sql.VarChar, data.emp_name)

        .input("site_id", sql.BigInt, data.site_id)

        .input("client_id", sql.BigInt, data.client_id)
.input("company_id", sql.BigInt, data.company_id)
.input("branch_id", sql.BigInt, data.branch_id)
        .input("site_name", sql.VarChar, data.site_name)

        .input("client_name", sql.VarChar, data.client_name)

        .input("client_code", sql.VarChar, data.client_code || "")

        .input("branch_name", sql.VarChar, data.branch_name || "")

        .input("check_in_date", sql.Date, data.check_in_date)

        .input("check_in_time", sql.VarChar, data.check_in_time)

        .input("check_out_date", sql.Date, data.check_out_date)

        .input("check_out_time", sql.VarChar, data.check_out_time)

        .input("emp_worked_hours", sql.Decimal(10, 2), dutyHours)

        .input("site_hours", sql.Decimal(10, 2), siteHours)

        .input("ot_hours", sql.Decimal(10, 2), otHours)

        .input("emp_status", sql.VarChar, status)

        .input("source", sql.VarChar, "web")

        .input("checkout_source", sql.VarChar, "web")

        .input("created_by", sql.BigInt, user.id)

        .input("created_by_name", sql.VarChar, user.name).query(`


INSERT INTO emp_attendance
(

employee_id,
emp_code,
emp_name,

site_id,
client_id,
company_id,
branch_id,
site_name,
client_name,

client_code,
branch_name,

check_in_date,
check_in_time,

check_out_date,
check_out_time,

emp_worked_hours,

site_hours,

ot_hours,

emp_status,

source,

checkout_source,

created_by,

created_by_name,

created_on,

active

)


OUTPUT INSERTED.id


VALUES
(

@employee_id,
@emp_code,
@emp_name,

@site_id,
@client_id,
@company_id,
@branch_id,
@site_name,
@client_name,

@client_code,
@branch_name,

@check_in_date,
@check_in_time,

@check_out_date,
@check_out_time,

@emp_worked_hours,

@site_hours,

@ot_hours,

@emp_status,

@source,

@checkout_source,

@created_by,

@created_by_name,

CONVERT(VARCHAR(19),GETDATE(),120),

0

)

`);

      let attendanceId = attendanceResult.recordset[0].id;

      // =====================================
      // LOG INSERT
      // =====================================

      await new sql.Request(transaction)

        .input("employee_id", sql.BigInt, data.employee_id)

        .input("emp_code", sql.VarChar, data.emp_code)

        .input("emp_name", sql.VarChar, data.emp_name)

        .input("site_id", sql.BigInt, data.site_id)

        .input("client_id", sql.BigInt, data.client_id)
.input("company_id", sql.BigInt, data.company_id)
.input("branch_id", sql.BigInt, data.branch_id)
        .input("site_name", sql.VarChar, data.site_name)

        .input("client_name", sql.VarChar, data.client_name)

        .input("client_code", sql.VarChar, data.client_code || "")

        .input("branch_name", sql.VarChar, data.branch_name || "")

        .input("check_in_date", sql.Date, data.check_in_date)

        .input("check_in_time", sql.VarChar, data.check_in_time)

        .input("check_out_date", sql.Date, data.check_out_date)

        .input("check_out_time", sql.VarChar, data.check_out_time)

        .input("emp_worked_hours", sql.Decimal(10, 2), dutyHours)

        .input("site_hours", sql.Decimal(10, 2), siteHours)

        .input("ot_hours", sql.Decimal(10, 2), otHours)

        .input("emp_status", sql.VarChar, status)

        .input("activity_id", sql.BigInt, attendanceId)

        .input("activity_remark", sql.VarChar, "Attendance Created")

        .input("created_by", sql.BigInt, user.id)

        .input("created_by_name", sql.VarChar, user.name).query(`

INSERT INTO emp_attendance_log
(

employee_id,
emp_code,
emp_name,

site_id,
client_id,
company_id,
branch_id,
site_name,
client_name,

client_code,
branch_name,

check_in_date,
check_in_time,

check_out_date,
check_out_time,

emp_worked_hours,

site_hours,

ot_hours,

emp_status,

activity_id,

activity_remark,

source,

checkout_source,

created_by,

created_by_name,

created_on,

active

)


VALUES
(

@employee_id,
@emp_code,
@emp_name,

@site_id,
@client_id,
@company_id,
@branch_id,
@site_name,
@client_name,

@client_code,
@branch_name,

@check_in_date,
@check_in_time,

@check_out_date,
@check_out_time,

@emp_worked_hours,

@site_hours,

@ot_hours,

@emp_status,

@activity_id,

@activity_remark,

'web',

'web',

@created_by,

@created_by_name,

CONVERT(VARCHAR(19),GETDATE(),120),

0

)

`);

      // =====================================
      // INSERT ATTENDANCE SUMMARY TABLE
      // (emp_attendance remains unchanged)
      // =====================================

      if (ownTransaction) {
        await transaction.commit();
      }

      return {
        success: true,
        message: "Attendance Added Successfully",
        id: attendanceId,
      };
    } catch (error) {
      if (ownTransaction) {
        await transaction.rollback();
      }

      throw error;
    }
  },
  insertAttendanceSummary: async (data, user, transaction = null) => {
    const pool = await poolPromise;

    let ownTransaction = false;

    if (!transaction) {
      transaction = new sql.Transaction(pool);
      await transaction.begin();
      ownTransaction = true;
    }

    try {
      // =====================================
      // GET ALL DUTY FROM EMP_ATTENDANCE
      // =====================================

      const summary = await new sql.Request(transaction)

        .input("employee_id", sql.BigInt, data.employee_id)

        .input("site_id", sql.BigInt, data.site_id)

        .input("date", sql.Date, data.check_in_date).query(`

SELECT

COUNT(*) AS totalDuty,

SUM(
TRY_CONVERT(decimal(10,2),emp_worked_hours)
) AS totalWorked,


SUM(
TRY_CONVERT(decimal(10,2),ot_hours)
) AS totalOT


FROM emp_attendance


WHERE employee_id=@employee_id

AND site_id=@site_id

AND CAST(check_in_date AS DATE)=@date

AND active=0

`);

      const row = summary.recordset[0];

      let totalDuty = Number(row.totalDuty || 0);

      if (totalDuty === 0) {
        totalDuty = 1;
      }

      let totalOT = Number(row.totalOT || 0);

      // =====================================
      // STATUS
      // =====================================

      let status = "P".repeat(totalDuty);

      // =====================================
      // WORK HOURS
      // =====================================

      let finalWorked = Number(data.site_hours || 0);

      // =====================================
      // FINAL OT
      // =====================================

      let finalOT = Number(
        (totalOT + (totalDuty - 1) * finalWorked).toFixed(2),
      );

      const [year, month, day] = data.check_in_date.split("-");

      const atDay = Number(day);
      const atMonth = Number(month);
      const atYear = Number(year);

      // =====================================
      // CHECK EXISTING ATTENDANCE
      // =====================================

      const existing = await new sql.Request(transaction)

        .input("site_id", sql.BigInt, data.site_id)

        .input("client_id", sql.BigInt, data.client_id)

        .input("emp_code", sql.VarChar, data.emp_code)

        .input("at_day", sql.Int, atDay)

        .input("at_month", sql.Int, atMonth)

        .input("at_year", sql.Int, atYear).query(`


SELECT id

FROM attendance

WHERE

site_id=@site_id

AND client_id=@client_id

AND emp_code=@emp_code

AND at_day=@at_day

AND at_month=@at_month

AND at_year=@at_year

AND active=0


`);

      // =====================================
      // UPDATE EXISTING
      // =====================================

      if (existing.recordset.length > 0) {
        const attendanceId = existing.recordset[0].id;

        await new sql.Request(transaction)

          .input("id", sql.BigInt, attendanceId)

          .input("status", sql.VarChar, status)

          .input("rank", sql.VarChar, data.rank || "")
          .input("emp_worked_hours", sql.Decimal(10, 2), finalWorked)

          .input("site_hours", sql.Decimal(10, 2), finalWorked)

          .input("ot_hours", sql.Decimal(10, 2), finalOT)

          .input("created_by", sql.BigInt, user.id)

          .input("created_by_name", sql.VarChar, user.name).query(`


UPDATE attendance

SET

status=@status,

emp_worked_hours=@emp_worked_hours,

site_hours=@site_hours,
rank=@rank,

ot_hours=@ot_hours,

created_by=@created_by,

created_by_name=@created_by_name,

created_on=CONVERT(VARCHAR(19),GETDATE(),120)


WHERE id=@id


`);
      }

      // =====================================
      // INSERT NEW
      // =====================================
      else {
        const uniqueId = `ATT-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

        await new sql.Request(transaction)

          .input("site_id", sql.BigInt, data.site_id)

          .input("client_id", sql.BigInt, data.client_id)

          .input("client_code", sql.VarChar, data.client_code || "")

          .input("emp_name", sql.VarChar, data.emp_name)
          .input("rank", sql.VarChar, data.rank || "")
          .input("emp_code", sql.VarChar, data.emp_code)

          .input("site_name", sql.VarChar, data.site_name)

          .input("client_name", sql.VarChar, data.client_name)

          .input("branch_name", sql.VarChar, data.branch_name || "")
          .input("uniqueid", sql.VarChar, uniqueId)
          .input("att_type", sql.VarChar, "both")
          .input("source", sql.VarChar, "web")
          .input("at_day", sql.Int, atDay)

          .input("at_month", sql.Int, atMonth)

          .input("at_year", sql.Int, atYear)

          .input("status", sql.VarChar, status)

          .input("emp_worked_hours", sql.Decimal(10, 2), finalWorked)

          .input("site_hours", sql.Decimal(10, 2), finalWorked)

          .input("ot_hours", sql.Decimal(10, 2), finalOT)

          .input("created_by", sql.BigInt, user.id)

          .input("created_by_name", sql.VarChar, user.name).query(`


INSERT INTO attendance
(

site_id,
client_id,
client_code,

emp_name,
emp_code,
rank,
site_name,
client_name,
branch_name,
uniqueid,
att_type,
source,

at_day,
at_month,
at_year,

status,

emp_worked_hours,

site_hours,

ot_hours,

active,

created_by,

created_by_name,

created_on

)

VALUES

(

@site_id,
@client_id,
@client_code,

@emp_name,
@emp_code,
@rank,
@site_name,
@client_name,
@branch_name,
@uniqueid,
@att_type,
@source,
@at_day,
@at_month,
@at_year,

@status,

@emp_worked_hours,

@site_hours,

@ot_hours,

0,

@created_by,

@created_by_name,

CONVERT(VARCHAR(19),GETDATE(),120)

)

`);
      }

      // =====================================
      // ALWAYS INSERT LOG
      // =====================================

      await new sql.Request(transaction)

        .input("site_id", sql.BigInt, data.site_id)

        .input("site_name", sql.VarChar, data.site_name)

        .input("client_id", sql.BigInt, data.client_id)

        .input("client_name", sql.VarChar, data.client_name)

        .input("client_code", sql.VarChar, data.client_code || "")

        .input("emp_name", sql.VarChar, data.emp_name)

        .input("emp_code", sql.VarChar, data.emp_code)

        .input("branch_name", sql.VarChar, data.branch_name || "")

        .input("at_day", sql.Int, atDay)

        .input("at_month", sql.Int, atMonth)

        .input("at_year", sql.Int, atYear)

        .input("status", sql.VarChar, status)

        .input("emp_worked_hours", sql.Decimal(10, 2), finalWorked)

        .input("site_hours", sql.Decimal(10, 2), finalWorked)

        .input("ot_hours", sql.Decimal(10, 2), finalOT)

        .input(
          "activity_remark",
          sql.VarChar,
          existing.recordset.length > 0
            ? "Attendance Summary Updated"
            : "Attendance Summary Created",
        )

        .input("created_by", sql.BigInt, user.id)

        .input("created_by_name", sql.VarChar, user.name).query(`


INSERT INTO attendance_log
(

site_id,
site_name,

client_id,
client_name,

client_code,

emp_name,
emp_code,

branch_name,

at_day,
at_month,
at_year,

status,

emp_worked_hours,

site_hours,

ot_hours,

activity_remark,

source,

active,

created_by,

created_by_name,

created_on

)


VALUES

(

@site_id,
@site_name,

@client_id,
@client_name,

@client_code,

@emp_name,
@emp_code,

@branch_name,

@at_day,
@at_month,
@at_year,

@status,

@emp_worked_hours,

@site_hours,

@ot_hours,

@activity_remark,

'web',

0,

@created_by,

@created_by_name,

CONVERT(VARCHAR(19),GETDATE(),120)

)

`);

      if (ownTransaction) {
        await transaction.commit();
      }

      return {
        success: true,

        status,

        worked: finalWorked,

        ot: finalOT,
      };
    } catch (error) {
      if (ownTransaction) {
        await transaction.rollback();
      }

      throw error;
    }
  },

  updateAttendance: async (attendanceId, data, user) => {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      // =====================================
      // SPLIT ATTENDANCE
      // =====================================

      const splitRows = module.exports.splitAttendance(data);

      if (splitRows.length === 0) {
        throw new Error("Invalid attendance data");
      }

      // =====================================
      // OVERLAP CHECK
      // =====================================

      for (const row of splitRows) {
        const overlap = await new sql.Request(transaction)
          .input("id", sql.BigInt, attendanceId)

          .input("employee_id", sql.BigInt, row.employee_id)
          .input("check_in_date", sql.Date, row.check_in_date)
          .input("check_out_date", sql.Date, row.check_out_date)
          .input("check_in_time", sql.VarChar, row.check_in_time)
          .input("check_out_time", sql.VarChar, row.check_out_time).query(`
          SELECT id
          FROM emp_attendance
          WHERE employee_id=@employee_id
          AND active=0
          AND id<>@id
          AND (
              CAST(
                  CONCAT(
                      CONVERT(varchar(10),check_in_date,120),
                      ' ',
                      check_in_time
                  ) AS datetime
              )
              <
              CAST(
                  CONCAT(
                      CONVERT(varchar(10),@check_out_date,120),
                      ' ',
                      @check_out_time
                  ) AS datetime
              )

              AND

              CAST(
                  CONCAT(
                      CONVERT(varchar(10),check_out_date,120),
                      ' ',
                      check_out_time
                  ) AS datetime
              )
              >
              CAST(
                  CONCAT(
                      CONVERT(varchar(10),@check_in_date,120),
                      ' ',
                      @check_in_time
                  ) AS datetime
              )
          )
        `);

        if (overlap.recordset.length > 0) {
          throw new Error(
            `${empName} (${empCode}) already has duty for this time.`,
          );
        }
      }

      // =====================================
      // UPDATE FIRST RECORD
      // =====================================

      const firstRow = splitRows[0];

      await new sql.Request(transaction)

        .input("id", sql.BigInt, attendanceId)
        .input("client_code", sql.VarChar, firstRow.client_code || "")
        .input("client_name", sql.VarChar, firstRow.client_name || "")
        .input("site_name", sql.VarChar, firstRow.site_name || "")
        .input("branch_name", sql.VarChar, firstRow.branch_name || "")
        .input("check_in_date", sql.Date, firstRow.check_in_date)
        .input("check_in_time", sql.VarChar, firstRow.check_in_time)
        .input("check_out_date", sql.Date, firstRow.check_out_date)
        .input("check_out_time", sql.VarChar, firstRow.check_out_time)

        .input(
          "emp_worked_hours",
          sql.Decimal(10, 2),
          firstRow.emp_worked_hours,
        )
        .input("site_hours", sql.Decimal(10, 2), firstRow.site_hours)
        .input("ot_hours", sql.Decimal(10, 2), firstRow.ot_hours)

        .input("emp_status", sql.VarChar, firstRow.emp_status)

        .input("modified_by", sql.BigInt, user.id)
        .input("modified_by_name", sql.VarChar, user.name).query(`
        UPDATE emp_attendance
        SET
            client_code=@client_code,
    client_name=@client_name,
    site_name=@site_name,
    branch_name=@branch_name,
            check_in_date=@check_in_date,
            check_in_time=@check_in_time,
            check_out_date=@check_out_date,
            check_out_time=@check_out_time,
            emp_worked_hours=@emp_worked_hours,
            site_hours=@site_hours,
            ot_hours=@ot_hours,
            emp_status=@emp_status,
            modified_by=@modified_by,
            modified_by_name=@modified_by_name,
            modified_on=CONVERT(VARCHAR(19),GETDATE(),120)
        WHERE id=@id
      `);
      // =====================================
      // EMP ATTENDANCE LOG
      // =====================================

      await new sql.Request(transaction).input(
        "attendance_id",
        sql.BigInt,
        attendanceId,
      ).query(`
SELECT *
FROM emp_attendance
WHERE id=@attendance_id
`);

      const attendanceData = await new sql.Request(transaction).input(
        "attendance_id",
        sql.BigInt,
        attendanceId,
      ).query(`
      SELECT *
      FROM emp_attendance
      WHERE id=@attendance_id
  `);

      const row = attendanceData.recordset[0];

      await new sql.Request(transaction)

        .input("employee_id", sql.BigInt, row.employee_id)
        .input("emp_code", sql.VarChar, row.emp_code)
        .input("emp_name", sql.VarChar, row.emp_name)

        .input("site_id", sql.BigInt, row.site_id)
        .input("client_id", sql.BigInt, row.client_id)

        .input("site_name", sql.VarChar, row.site_name)
        .input("client_name", sql.VarChar, row.client_name)

        .input("client_code", sql.VarChar, row.client_code || "")
        .input("branch_name", sql.VarChar, row.branch_name || "")

        .input("check_in_date", sql.Date, row.check_in_date)
        .input("check_in_time", sql.VarChar, row.check_in_time)

        .input("check_out_date", sql.Date, row.check_out_date)
        .input("check_out_time", sql.VarChar, row.check_out_time)

        .input("emp_worked_hours", sql.Decimal(10, 2), row.emp_worked_hours)

        .input("site_hours", sql.Decimal(10, 2), row.site_hours)

        .input("ot_hours", sql.Decimal(10, 2), row.ot_hours)

        .input("emp_status", sql.VarChar, row.emp_status)

        .input("activity_id", sql.BigInt, attendanceId)

        .input("activity_remark", sql.VarChar, "Attendance Updated")

        .input("created_by", sql.BigInt, user.id)

        .input("created_by_name", sql.VarChar, user.name).query(`
INSERT INTO emp_attendance_log
(
employee_id,
emp_code,
emp_name,

site_id,
client_id,

site_name,
client_name,

client_code,
branch_name,

check_in_date,
check_in_time,

check_out_date,
check_out_time,

emp_worked_hours,

site_hours,

ot_hours,

emp_status,

activity_id,

activity_remark,

source,

checkout_source,

created_by,

created_by_name,

created_on,

active
)

VALUES
(
@employee_id,
@emp_code,
@emp_name,

@site_id,
@client_id,

@site_name,
@client_name,

@client_code,
@branch_name,

@check_in_date,
@check_in_time,

@check_out_date,
@check_out_time,

@emp_worked_hours,

@site_hours,

@ot_hours,

@emp_status,

@activity_id,

@activity_remark,

'web',

'web',

@created_by,

@created_by_name,

CONVERT(VARCHAR(19),GETDATE(),120),

0
)
`);
      // =====================================
      // INSERT REMAINING SPLIT RECORDS
      // =====================================

      for (let i = 1; i < splitRows.length; i++) {
        await module.exports.addAttendanceSingle(
          splitRows[i],
          user,
          transaction,
        );
      }

      // =====================================
      // UPDATE SUMMARY
      // =====================================

      const summaryDates = [...new Set(splitRows.map((x) => x.check_in_date))];

      for (const date of summaryDates) {
        await module.exports.insertAttendanceSummary(
          {
            ...firstRow,
            check_in_date: date,
          },
          user,
          transaction,
        );
      }

      await transaction.commit();

      // =====================================================
      // RECALCULATE EMPLOYEE LEAVES AFTER ATTENDANCE UPDATE
      // =====================================================

      // await module.exports.recalculateEmployeeLeaves(
      //   firstRow.employee_id,
      //   user,
      // );

      return {
        success: true,
        message: "Attendance Updated Successfully",
      };
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },





getAttendanceList: async (
  tablename,
  orderby,
  page,
  perPage,
  searchWord,
  userId
) => {
  try {
    // =====================================================
    // 1. VALIDATE USER ID
    // =====================================================

    const parsedUserId = Number(userId);

    if (
      userId == null ||
      String(userId).trim() === "" ||
      !Number.isSafeInteger(parsedUserId) ||
      parsedUserId <= 0
    ) {
      throw new Error("Invalid logged-in user ID");
    }

    const request = await getPoolRequest();

    // =====================================================
    // 2. USER ACCESS
    // =====================================================

    const access =
      await module.exports.getAttendanceUserAccess(
        parsedUserId
      );

    const role = String(access.role || "")
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");

    const isSuperAdmin = [
      "superadmin",
      "super admin"
    ].includes(role);

    let mainAccessWhere = "";
    let attendanceAccessWhere = "";

    // =====================================================
    // 3. PARSE ADMIN IDS
    // =====================================================

    const parseIds = (value, fieldName) => {
      if (
        value == null ||
        String(value).trim() === ""
      ) {
        throw new Error(
          `Admin ${fieldName} is missing. Access denied.`
        );
      }

      const values = String(value)
        .split(",")
        .map((item) => item.trim());

      if (
        values.some(
          (item) =>
            !/^\d+$/.test(item) ||
            Number(item) <= 0 ||
            !Number.isSafeInteger(Number(item))
        )
      ) {
        throw new Error(
          `Invalid Admin ${fieldName}: ${value}`
        );
      }

      return [...new Set(values.map(Number))];
    };

    // =====================================================
    // 4. ADMIN ACCESS
    // =====================================================

    if (role === "admin") {
      const clientIds = parseIds(
        access.clientId,
        "client_id"
      );

      const siteIds = parseIds(
        access.siteId,
        "site_id"
      );

      request.input(
        "attendanceAllowedClientIds",
        sql.NVarChar(sql.MAX),
        clientIds.join(",")
      );

      request.input(
        "attendanceAllowedSiteIds",
        sql.NVarChar(sql.MAX),
        siteIds.join(",")
      );

      mainAccessWhere = `
        AND EXISTS (
          SELECT 1
          FROM STRING_SPLIT(
            @attendanceAllowedClientIds, ','
          ) AS allowedClient
          WHERE TRY_CONVERT(
            INT,
            LTRIM(RTRIM(allowedClient.value))
          ) = nc.id
        )
        AND EXISTS (
          SELECT 1
          FROM STRING_SPLIT(
            @attendanceAllowedSiteIds, ','
          ) AS allowedSite
          WHERE TRY_CONVERT(
            INT,
            LTRIM(RTRIM(allowedSite.value))
          ) = cr.id
        )
        AND cr.client_id = nc.id
      `;
    }

    // =====================================================
    // 5. SUPERADMIN ACCESS
    // =====================================================

    else if (isSuperAdmin) {
      mainAccessWhere = "";
    }

    // =====================================================
    // 6. EMPLOYEE ACCESS
    // =====================================================

    else if (role === "employee") {
      const employeeId = Number(access.employeeId);

      if (
        access.employeeId == null ||
        !Number.isSafeInteger(employeeId) ||
        employeeId <= 0
      ) {
        throw new Error(
          "Employee ID missing or invalid"
        );
      }

      request.input(
        "attendanceEmployeeId",
        sql.Int,
        employeeId
      );

      attendanceAccessWhere = `
        AND ea.employee_id = @attendanceEmployeeId
      `;

      // Employee only sees sites assigned through attendance.
      // Remove this EXISTS condition if employees must also
      // see sites with no attendance records.
      mainAccessWhere = `
        AND EXISTS (
          SELECT 1
          FROM emp_attendance AS employeeAttendance
          WHERE employeeAttendance.site_id = cr.id
            AND employeeAttendance.employee_id =
                @attendanceEmployeeId
            AND employeeAttendance.active = 0
        )
      `;
    }

    else {
      throw new Error(
        `Unauthorized attendance access: ${role}`
      );
    }

    // =====================================================
    // 7. SEARCH FILTERS + SELECTED MONTH/YEAR
    // =====================================================

    const userSearch =
      await module.exports.getUserSearchFilters(
        parsedUserId,
        tablename
      );

    // Find the month/year filter.
    const dateFilter = Array.isArray(userSearch)
      ? userSearch.find(
          (item) =>
            item &&
            item.search_from_month !== undefined &&
            item.search_from_month !== ""
        )
      : null;

    let selectedMonth = null;
    let selectedYear = null;

    if (dateFilter) {
      const month = Number.parseInt(
        dateFilter.search_from_month,
        10
      );

      const year = Number.parseInt(
        dateFilter.search_from_year,
        10
      );

      if (
        Number.isInteger(month) &&
        month >= 1 &&
        month <= 12 &&
        Number.isInteger(year) &&
        year >= 1900 &&
        year <= 9999
      ) {
        selectedMonth = month;
        selectedYear = year;
      }
    }

    request.input(
      "filterMonth",
      sql.Int,
      selectedMonth
    );

    request.input(
      "filterYear",
      sql.Int,
      selectedYear
    );

    // IMPORTANT:
    // buildFilterQuery must not add attendance month/year
    // predicates to the outer WHERE clause.
    const rawWhereClause = buildFilterQuery(
      userSearch,
      searchWord,
      request
    );

    let cleanWhereClause = "";

    if (
      typeof rawWhereClause === "string" &&
      rawWhereClause.trim()
    ) {
      const cleaned = rawWhereClause
        .trim()
        .replace(/^WHERE\s+/i, "")
        .replace(/^AND\s+/i, "")
        .trim();

      if (cleaned) {
        cleanWhereClause = `AND (${cleaned})`;
      }
    }

    // =====================================================
    // 8. ADDITIONAL ATTENDANCE ACCESS FILTER
    // =====================================================

    if (role !== "employee") {
      const helperAttendanceAccessWhere =
        await module.exports.buildAttendanceAccessFilter(
          parsedUserId,
          request
        );

      if (
        typeof helperAttendanceAccessWhere === "string" &&
        helperAttendanceAccessWhere.trim()
      ) {
        attendanceAccessWhere +=
          "\n" + helperAttendanceAccessWhere;
      }
    }

    // =====================================================
    // 9. PAGINATION
    // =====================================================

    const parsedPage = Number.parseInt(page, 10);
    const parsedPerPage = Number.parseInt(perPage, 10);

    const currentPage =
      Number.isSafeInteger(parsedPage) &&
      parsedPage >= 0
        ? parsedPage
        : 0;

    const pageSize =
      Number.isSafeInteger(parsedPerPage) &&
      parsedPerPage > 0
        ? Math.min(parsedPerPage, 200)
        : 50;

    const offset = currentPage * pageSize;

    if (!Number.isSafeInteger(offset)) {
      throw new Error("Invalid pagination offset");
    }

    request.input(
      "rowStart",
      sql.Int,
      offset + 1
    );

    request.input(
      "rowEnd",
      sql.Int,
      offset + pageSize
    );

    // =====================================================
    // 10. ATTENDANCE LIST QUERY
    // =====================================================

    const compiledQuery = `
      ;WITH AttendanceSummary AS (
        SELECT
          ea.site_id,
          MONTH(ea.check_in_date) AS at_month,
          YEAR(ea.check_in_date) AS at_year,

          SUM(
            CASE
              WHEN ea.emp_status = 'P' THEN 1
              WHEN ea.emp_status = 'HF' THEN 0.5
              ELSE 0
            END
          ) AS total_nd,

          SUM(
            CASE
              WHEN TRY_CONVERT(
                DECIMAL(18,4),
                ea.emp_worked_hours
              ) > TRY_CONVERT(
                DECIMAL(18,4),
                ea.site_hours
              )
              THEN FLOOR(
                (
                  TRY_CONVERT(
                    DECIMAL(18,4),
                    ea.emp_worked_hours
                  ) -
                  TRY_CONVERT(
                    DECIMAL(18,4),
                    ea.site_hours
                  )
                ) /
                NULLIF(
                  TRY_CONVERT(
                    DECIMAL(18,4),
                    ea.site_hours
                  ),
                  0
                )
              )
              ELSE 0
            END
          ) AS total_ot,

          SUM(
            CASE
              WHEN TRY_CONVERT(
                DECIMAL(18,4),
                ea.emp_worked_hours
              ) > TRY_CONVERT(
                DECIMAL(18,4),
                ea.site_hours
              )
              THEN
                (
                  (
                    TRY_CONVERT(
                      DECIMAL(18,4),
                      ea.emp_worked_hours
                    ) -
                    TRY_CONVERT(
                      DECIMAL(18,4),
                      ea.site_hours
                    )
                  ) /
                  NULLIF(
                    TRY_CONVERT(
                      DECIMAL(18,4),
                      ea.site_hours
                    ),
                    0
                  )
                )
                -
                FLOOR(
                  (
                    TRY_CONVERT(
                      DECIMAL(18,4),
                      ea.emp_worked_hours
                    ) -
                    TRY_CONVERT(
                      DECIMAL(18,4),
                      ea.site_hours
                    )
                  ) /
                  NULLIF(
                    TRY_CONVERT(
                      DECIMAL(18,4),
                      ea.site_hours
                    ),
                    0
                  )
                )
              ELSE 0
            END
          ) AS total_ot_hours,

          SUM(
            CASE
              WHEN ea.emp_status = 'W' THEN 1
              ELSE 0
            END
          ) AS total_off,

          SUM(
            CASE
              WHEN ea.emp_status = 'H' THEN 1
              ELSE 0
            END
          ) AS total_holiday

        FROM emp_attendance AS ea

        WHERE ea.active = 0
          ${attendanceAccessWhere}

          AND (
            @filterMonth IS NULL
            OR (
              MONTH(ea.check_in_date) = @filterMonth
              AND YEAR(ea.check_in_date) = @filterYear
            )
          )

        GROUP BY
          ea.site_id,
          MONTH(ea.check_in_date),
          YEAR(ea.check_in_date)
      ),

      InvoiceSummary AS (
        SELECT
          site_id,
          TRY_CONVERT(INT, at_month) AS at_month,
          TRY_CONVERT(INT, at_year) AS at_year,

          CASE
            WHEN SUM(
              CASE
                WHEN invoice_status = 'Pending'
                THEN 1 ELSE 0
              END
            ) > 0 THEN 'Pending'

            WHEN SUM(
              CASE
                WHEN invoice_status = 'Approved'
                THEN 1 ELSE 0
              END
            ) > 0 THEN 'Approved'

            ELSE 'Pending'
          END AS invoice_status,

          MAX(att_type) AS att_type

        FROM attendance

        WHERE active = 0
          AND (
            @filterMonth IS NULL
            OR (
              TRY_CONVERT(INT, at_month) = @filterMonth
              AND TRY_CONVERT(INT, at_year) = @filterYear
            )
          )

        GROUP BY
          site_id,
          TRY_CONVERT(INT, at_month),
          TRY_CONVERT(INT, at_year)
      ),

      AttendanceData AS (
        SELECT
          nc.id AS client_id,
          nc.company_name,
          nc.billing_company,
          nc.billing_company_id,
          nc.billing_branch_id,
          nc.billing_branch,

          cr.id AS site_id,
          cr.client_code,
          cr.site_name,

          COALESCE(
            CONVERT(VARCHAR(2), att.at_month),
            CONVERT(VARCHAR(2), @filterMonth),
            ''
          ) AS at_month,

          COALESCE(
            CONVERT(VARCHAR(4), att.at_year),
            CONVERT(VARCHAR(4), @filterYear),
            ''
          ) AS at_year,

          ISNULL(
            inv.invoice_status,
            'Pending'
          ) AS invoice_status,

          ISNULL(
            inv.att_type,
            'Both'
          ) AS att_type,

          ISNULL(att.total_nd, 0) AS total_nd,
          ISNULL(att.total_ot, 0) AS total_ot,
          ISNULL(att.total_ot_hours, 0) AS total_ot_hours,
          ISNULL(att.total_off, 0) AS total_off,
          ISNULL(att.total_holiday, 0) AS total_holiday

        FROM new_client AS nc

        INNER JOIN client_rates AS cr
          ON cr.client_id = nc.id
          AND cr.active = 0

        LEFT JOIN AttendanceSummary AS att
          ON att.site_id = cr.id

        LEFT JOIN InvoiceSummary AS inv
          ON inv.site_id = cr.id
          AND inv.at_month = att.at_month
          AND inv.at_year = att.at_year

        WHERE
          nc.active = 0
          ${mainAccessWhere}
          ${cleanWhereClause}
      ),

      NumberedAttendance AS (
        SELECT
          *,
          ROW_NUMBER() OVER (
            ORDER BY
              company_name ASC,
              site_name ASC,
              site_id ASC,
              TRY_CONVERT(INT, at_year) DESC,
              TRY_CONVERT(INT, at_month) DESC
          ) AS RowNum
        FROM AttendanceData
      )

      SELECT
        client_id,
        company_name,
        billing_company,
        billing_company_id,
        billing_branch_id,
        billing_branch,
        site_id,
        client_code,
        site_name,
        at_month,
        at_year,
        invoice_status,
        att_type,
        total_nd,
        total_ot,
        total_ot_hours,
        total_off,
        total_holiday
      FROM NumberedAttendance
      WHERE RowNum BETWEEN @rowStart AND @rowEnd
      ORDER BY RowNum;
    `;

    // =====================================================
    // 11. DEBUG LOGS
    // =====================================================

    console.log("========== ATTENDANCE LIST ==========");
    console.log("USER ID:", parsedUserId);
    console.log("ROLE:", role);
    console.log("CLIENT IDS:", access.clientId);
    console.log("SITE IDS:", access.siteId);
    console.log("EMPLOYEE ID:", access.employeeId);
    console.log("SELECTED MONTH:", selectedMonth);
    console.log("SELECTED YEAR:", selectedYear);
    console.log("PAGE:", currentPage);
    console.log("PER PAGE:", pageSize);
    console.log("RAW WHERE:", rawWhereClause);
    console.log("CLEAN WHERE:", cleanWhereClause);
    console.log("MAIN ACCESS FILTER:", mainAccessWhere);
    console.log(
      "ATTENDANCE ACCESS FILTER:",
      attendanceAccessWhere
    );
    console.log("FINAL SQL:\n", compiledQuery);

    // =====================================================
    // 12. EXECUTE QUERY
    // =====================================================

    const result = await request.query(compiledQuery);

    console.log(
      "ATTENDANCE ROWS RETURNED:",
      result.recordset.length
    );

    return result.recordset;

  } catch (err) {
    console.error(
      "DB SQL Error in getAttendanceList:",
      err
    );

    throw new Error(
      `Database getAttendanceList failure: ${err.message}`
    );
  }
},








//   getAttendanceList: async (
//     tablename,
//     orderby,
//     page,
//     perPage,
//     searchWord,
//     userId,
//   ) => {
//     try {
//       const request = await getPoolRequest();

//       const userSearch = await module.exports.getUserSearchFilters(
//         userId,
//         tablename,
//       );

//       const whereClause = buildFilterQuery(userSearch, searchWord, request);

//       page = parseInt(page) || 1;
//       perPage = parseInt(perPage) || 10;

//       if (page < 1) page = 1;

//       const offset = (page - 1) * perPage;

//       request.input("offset", sql.Int, offset);
//       request.input("limit", sql.Int, perPage);

//       const compiledQuery = `


// SELECT

//     nc.id AS client_id,
//     nc.company_name,

//     cr.id AS site_id,
//     cr.client_code,
//     cr.site_name,


//     ISNULL(att.at_month,'') AS at_month,
//     ISNULL(att.at_year,'') AS at_year,


//     ISNULL(att.total_nd,0) AS total_nd,

//     ISNULL(att.total_ot,0) AS total_ot,

//     ISNULL(att.total_ot_hours,0) AS total_ot_hours,

//     ISNULL(att.total_off,0) AS total_off,

//     ISNULL(att.total_holiday,0) AS total_holiday



// FROM new_client nc



// LEFT JOIN client_rates cr

// ON cr.client_id = nc.id



// LEFT JOIN

// (

// SELECT


//     site_id,

//     MONTH(check_in_date) AS at_month,

//     YEAR(check_in_date) AS at_year,




//     -- ND

//     SUM(

//         CASE

//         WHEN emp_status='P'
//         THEN 1


//         WHEN emp_status='HF'
//         THEN 0.5


//         ELSE 0

//         END

//     ) total_nd,




//     -- OT COUNT

//  SUM(
//     CASE
//         WHEN TRY_CONVERT(decimal(18,4), emp_worked_hours) >
//              TRY_CONVERT(decimal(18,4), site_hours)
//         THEN FLOOR(
//             (
//                 TRY_CONVERT(decimal(18,4), emp_worked_hours)
//                 -
//                 TRY_CONVERT(decimal(18,4), site_hours)
//             )
//             /
//             NULLIF(TRY_CONVERT(decimal(18,4), site_hours),0)
//         )
//         ELSE 0
//     END
// ) AS total_ot,





//     -- OT HOURS

//    SUM(
//     CASE
//         WHEN TRY_CONVERT(decimal(18,4), emp_worked_hours) >
//              TRY_CONVERT(decimal(18,4), site_hours)
//         THEN ROUND(
//             (
//                 (
//                     TRY_CONVERT(decimal(18,4), emp_worked_hours)
//                     -
//                     TRY_CONVERT(decimal(18,4), site_hours)
//                 )
//                 /
//                 NULLIF(TRY_CONVERT(decimal(18,4), site_hours),0)
//             )
//             -
//             FLOOR(
//                 (
//                     TRY_CONVERT(decimal(18,4), emp_worked_hours)
//                     -
//                     TRY_CONVERT(decimal(18,4), site_hours)
//                 )
//                 /
//                 NULLIF(TRY_CONVERT(decimal(18,4), site_hours),0)
//             ),
//             4
//         )
//         ELSE 0
//     END
// ) AS total_ot_hours,





//     -- OFF

//     SUM(

//     CASE

//     WHEN emp_status='W'
//     THEN 1

//     ELSE 0

//     END

//     ) total_off,





//     -- HOLIDAY

//     SUM(

//     CASE

//     WHEN emp_status='H'
//     THEN 1

//     ELSE 0

//     END

//     ) total_holiday



// FROM emp_attendance


// WHERE active=0



// GROUP BY

// site_id,

// MONTH(check_in_date),

// YEAR(check_in_date)



// ) att


// ON att.site_id=cr.id



// ${whereClause}



// ORDER BY

// nc.company_name ASC,

// cr.site_name ASC



// OFFSET @offset ROWS

// FETCH NEXT @limit ROWS ONLY;



// `;

//       console.log("Page :", page);
//       console.log("Per Page :", perPage);
//       console.log("Offset :", offset);

//       const result = await request.query(compiledQuery);

//       return result.recordset;
//     } catch (err) {
//       console.error("❌ DB SQL Error in getAttendanceList:", err);

//       throw new Error(`Database getAttendanceList failure: ${err.message}`);
//     }
//   },

getSalaryCountByStatus: async (status, searchWord, userId) => {
  let compiledQuery = "";

  try {
    const request = await getPoolRequest();

    // 1. Get saved attendance search filters
    const userSearch = await module.exports.getUserSearchFilters(
      userId,
      "attendance"
    );

    // 2. Explicit mapping of searchable fields
    const fieldMap = {
      client_name: "nc.company_name",
      site_name: "cr.site_name",
      client_code: "cr.client_code",
      billing_company: "nc.billing_company",
      billing_branch: "nc.billing_branch",
    };

    // 3. Base WHERE condition
    let whereClause = " WHERE att.active = '0' ";

    // Invoice status
    whereClause += " AND att.invoice_status = @invoiceStatus ";
    request.input("invoiceStatus", sql.VarChar, status);

    // 4. Search word filter
    if (searchWord && searchWord.trim() !== "") {
      whereClause += `
        AND LTRIM(RTRIM(nc.company_name))
        LIKE @searchWord
      `;

      request.input(
        "searchWord",
        sql.NVarChar,
        `${searchWord.trim()}%`
      );
    }

    // 5. Apply saved search filters
    if (Array.isArray(userSearch) && userSearch.length > 0) {
      userSearch.forEach((filter, index) => {
        if (!filter || !filter.search_fields) {
          return;
        }

        const column = fieldMap[filter.search_fields];

        // Ignore unsupported search fields
        if (!column) {
          console.warn(
            "Unsupported attendance search field:",
            filter.search_fields
          );
          return;
        }

        const fieldParam = `salary_kw_${index}`;
        const keyword = (filter.search_keyword || "")
          .trim()
          .toLowerCase();

        request.input(
          fieldParam,
          sql.NVarChar,
          `%${keyword}%`
        );

        whereClause += `
          AND LOWER(${column}) LIKE @${fieldParam}
        `;
      });

      // 6. Date range filter
      const dateField = userSearch[0]?.search_date_field;

      if (
        dateField &&
        userSearch[0]?.search_from_date &&
        userSearch[0]?.search_to_date
      ) {
        request.input(
          "sal_fromDate",
          sql.Date,
          userSearch[0].search_from_date
        );

        request.input(
          "sal_toDate",
          sql.Date,
          userSearch[0].search_to_date
        );

        if (dateField === "attendance_date") {
          whereClause += `
            AND TRY_CONVERT(
              DATE,
              CONCAT(
                att.at_year, '-',
                RIGHT('0' + CAST(att.at_month AS VARCHAR(2)), 2), '-',
                RIGHT('0' + CAST(att.at_day AS VARCHAR(2)), 2)
              )
            ) >= @sal_fromDate

            AND TRY_CONVERT(
              DATE,
              CONCAT(
                att.at_year, '-',
                RIGHT('0' + CAST(att.at_month AS VARCHAR(2)), 2), '-',
                RIGHT('0' + CAST(att.at_day AS VARCHAR(2)), 2)
              )
            ) <= @sal_toDate
          `;
        }
      }

      // 7. Month and year filter
      if (
        userSearch[0]?.search_from_month &&
        userSearch[0]?.search_from_year
      ) {
        request.input(
          "sal_fromMonth",
          sql.Int,
          Number(userSearch[0].search_from_month)
        );

        request.input(
          "sal_fromYear",
          sql.Int,
          Number(userSearch[0].search_from_year)
        );

        whereClause += `
          AND TRY_CONVERT(INT, att.at_month) = @sal_fromMonth
          AND TRY_CONVERT(INT, att.at_year) = @sal_fromYear
        `;
      }
    }

    // 8. Count grouped attendance records
    compiledQuery = `
      SELECT COUNT(*) AS count
      FROM (
        SELECT
          att.site_id,
          att.at_month,
          att.at_year
        FROM attendance att
        LEFT JOIN client_rates cr
          ON att.site_id = cr.id
        LEFT JOIN new_client nc
          ON nc.id = cr.client_id
        ${whereClause}
        GROUP BY
          att.site_id,
          att.at_month,
          att.at_year
      ) AS groupedRows;
    `;

    const result = await request.query(compiledQuery);

    return result.recordset[0]?.count || 0;

  } catch (err) {
    console.error(
      `DB Error in getSalaryCountByStatus [Status: ${status}]:`,
      err.message
    );

    console.error("Target Query String:", compiledQuery);

    throw new Error(
      `Database getSalaryCountByStatus failure: ${err.message}`
    );
  }
},

  getLastTableId: async (tablename) => {
    try {
      const safeTableName = tablename.replace(/[^a-zA-Z0-9_]/g, "");
      const request = await getPoolRequest();
      const result = await request.query(
        `SELECT TOP 1 id FROM ${safeTableName} ORDER BY id DESC`,
      );
      return result.recordset[0]?.id || 0;
    } catch (err) {
      console.error(
        `❌ DB Error in getLastTableId [Table: ${tablename}]:`,
        err.message,
      );
      throw new Error(`Database getLastTableId failure: ${err.message}`);
    }
  },



getAttendanceDataUnhold: async (siteId, month, year, attType = "Both") => {
  try {
    const pool = await poolPromise;

    const siteIdNum = Number(siteId);
    const monthNum = Number(month);
    const yearNum = Number(year);

    if (
      !Number.isInteger(siteIdNum) ||
      siteIdNum <= 0 ||
      !Number.isInteger(monthNum) ||
      monthNum < 1 ||
      monthNum > 12 ||
      !Number.isInteger(yearNum) ||
      yearNum <= 0
    ) {
      throw new Error("Invalid siteId, month or year");
    }

    const safeNumber = (value) => {
      if (value === null || value === undefined || value === "") {
        return 0;
      }

      const number = Number(value);
      return Number.isFinite(number) ? number : 0;
    };

    const round2 = (value) =>
      Number(safeNumber(value).toFixed(2));

    const normalizeStatus = (value, fallback = "A") => {
      const status = String(value ?? "").trim().toUpperCase();
      return status || fallback;
    };

    const specialStatuses = new Set([
      "W", "WO", "OFF", "H", "HOL", "HOLIDAY", "A", "L",
    ]);

    const presentStatuses = ["P", "P1", "PP"];
    const halfDayStatuses = ["HF", "FH"];
    const weeklyOffStatuses = ["W", "WO", "OFF"];
    const holidayStatuses = ["H", "HOL", "HOLIDAY"];

    // 1. BULK ATTENDANCE
    const bulkResult = await pool
      .request()
      .input("siteId", sql.Int, siteIdNum)
      .input("month", sql.Int, monthNum)
      .input("year", sql.Int, yearNum)
      .input("attType", sql.NVarChar(50), String(attType || "Both"))
      .query(`
        SELECT
          id, emp_code, emp_name, rank,
          at_day, at_month, at_year,
          status, ot_hours, source, att_type
        FROM attendance
        WHERE site_id = @siteId
          AND TRY_CONVERT(INT, at_month) = @month
          AND TRY_CONVERT(INT, at_year) = @year
          AND active = 0
          AND (
            LOWER(LTRIM(RTRIM(ISNULL(att_type, ''))))
              = LOWER(LTRIM(RTRIM(@attType)))
            OR LOWER(LTRIM(RTRIM(@attType))) = 'both'
          )
        ORDER BY
          TRY_CONVERT(INT, emp_code),
          TRY_CONVERT(INT, at_day),
          id DESC
      `);

    // 2. MANUAL / WEB / APP ATTENDANCE
    const manualResult = await pool
      .request()
      .input("siteId", sql.Int, siteIdNum)
      .input("month", sql.Int, monthNum)
      .input("year", sql.Int, yearNum)
      .query(`
        SELECT
          id, emp_code, emp_name,
          DAY(check_in_date) AS at_day,
          MONTH(check_in_date) AS at_month,
          YEAR(check_in_date) AS at_year,
          emp_status, emp_worked_hours,
          site_hours, ot_hours, source, check_in_date
        FROM emp_attendance
        WHERE site_id = @siteId
          AND MONTH(check_in_date) = @month
          AND YEAR(check_in_date) = @year
          AND active = 0
        ORDER BY
          TRY_CONVERT(INT, emp_code),
          check_in_date,
          id
      `);

    // 3. DAILY MAP: employee + day
    const dailyMap = new Map();

    // 3A. BULK RECORDS
    for (const row of bulkResult.recordset) {
      const empCode = String(row.emp_code ?? "").trim();
      const day = Number(row.at_day);

      if (
        !empCode ||
        !Number.isInteger(day) ||
        day < 1 ||
        day > 31
      ) {
        continue;
      }

      const key = `${empCode}_${day}`;

      // Latest bulk record wins.
      if (dailyMap.has(key)) {
        continue;
      }

      const status = normalizeStatus(row.status);

      dailyMap.set(key, {
        empCode,
        empName: row.emp_name || "",
        rank: row.rank || "",
        day,
        status,
      nd: ["P", "P1", "PP"].includes(status)
  ? 1
  : ["HF", "FH"].includes(status)
    ? 0.5
    : 0,

ot: ["OT", "P1"].includes(status) ? 1 : 0,
        otHours: round2(row.ot_hours),
        off: weeklyOffStatuses.includes(status) ? 1 : 0,
        holiday: holidayStatuses.includes(status) ? 1 : 0,
        source: row.source || "BULK_UPLOAD",
        priority: 1,
      });
    }

    // 3B. GROUP MANUAL RECORDS BY EMPLOYEE + DAY
    const manualDayMap = new Map();

    for (const row of manualResult.recordset) {
      const empCode = String(row.emp_code ?? "").trim();
      const day = Number(row.at_day);

      if (
        !empCode ||
        !Number.isInteger(day) ||
        day < 1 ||
        day > 31
      ) {
        continue;
      }

      const key = `${empCode}_${day}`;
      const workedHours = round2(row.emp_worked_hours);
      const siteHours = round2(row.site_hours);

      let entry = manualDayMap.get(key);

      if (!entry) {
        entry = {
          empCode,
          empName: row.emp_name || "",
          rank: "",
          day,
          status: normalizeStatus(row.emp_status, "P"),
          fullShiftCount: 0,
          partialHours: 0,
          totalWorkedHours: 0,
          maxSiteHours: 0,
          recordCount: 0,
          source: row.source || "web",
          priority: 2,
        };

        manualDayMap.set(key, entry);
      }

      entry.recordCount += 1;
      entry.totalWorkedHours += workedHours;
      entry.maxSiteHours = Math.max(entry.maxSiteHours, siteHours);

      if (
        siteHours > 0 &&
        workedHours > 0 &&
        workedHours === siteHours
      ) {
        entry.fullShiftCount += 1;
      } else if (
        siteHours > 0 &&
        workedHours > 0 &&
        workedHours < siteHours
      ) {
        entry.partialHours += workedHours;
      }

      if (!entry.empName && row.emp_name) {
        entry.empName = row.emp_name;
      }

      const rowStatus = normalizeStatus(row.emp_status, "P");

      if (specialStatuses.has(rowStatus)) {
        entry.status = rowStatus;
      } else if (!specialStatuses.has(entry.status)) {
        entry.status = rowStatus;
      }
    }

    // 3C. CALCULATE MANUAL DAILY ATTENDANCE
// 3C. CALCULATE MANUAL DAILY ATTENDANCE
for (const [key, row] of manualDayMap.entries()) {
  const fullShiftCount = row.fullShiftCount;
  const partialHours = round2(row.partialHours);
  const totalWorkedHours = round2(row.totalWorkedHours);

  let status = normalizeStatus(row.status, "");

  let nd = 0;
  let ot = fullShiftCount >= 2 ? 1 : 0;
  let otHours = partialHours;

  // Explicit attendance status takes priority.
  if (["HF", "FH"].includes(status)) {
    nd = 0.5;
  } else if (["P", "P1", "PP"].includes(status)) {
    nd = 1;
  } else if (["A", "L", "W", "WO", "OFF", "H", "HOL", "HOLIDAY"].includes(status)) {
    nd = 0;
  } else if (fullShiftCount > 0) {
    nd = 1;
    status = "P";
  } else if (totalWorkedHours > 0) {
    // Worked hours exist, but the attendance status is missing/unknown.
    // Do not incorrectly label this employee absent.
    status = "P";
    nd = 1;
  } else {
    status = "A";
    nd = 0;
  }

  // Keep the status-based totals consistent.
  if (["P", "P1", "PP"].includes(status)) {
    nd = 1;
  } else if (["HF", "FH"].includes(status)) {
    nd = 0.5;
  }

  dailyMap.set(key, {
    empCode: row.empCode,
    empName: row.empName,
    rank: row.rank || "",
    day: Number(row.day),
    status,
    nd,
    ot,
    otHours,
    off: weeklyOffStatuses.includes(status) ? 1 : 0,
    holiday: holidayStatuses.includes(status) ? 1 : 0,
    source: row.source,
    priority: 2,
    workedHours: totalWorkedHours,
    siteHours: round2(row.maxSiteHours),
    fullShiftCount,
    recordCount: row.recordCount,
  });
}
    // 4. MONTHLY EMPLOYEE TOTALS
    const employeeMap = new Map();

    for (const row of dailyMap.values()) {
      const empCode = String(row.empCode ?? "").trim();

      if (!empCode) {
        continue;
      }

      if (!employeeMap.has(empCode)) {
        employeeMap.set(empCode, {
          empCode,
          empName: row.empName || "",
          rank: row.rank || "",
          nd: 0,
          ot: 0,
          off: 0,
          holiday: 0,
          otHrs: 0,
          days: {},
        });
      }

      const employee = employeeMap.get(empCode);
      const status = normalizeStatus(row.status);

      if (!employee.empName && row.empName) {
        employee.empName = row.empName;
      }

      if (!employee.rank && row.rank) {
        employee.rank = row.rank;
      }

      // Store per-day status AND OT data for the UI.
      employee.days[row.day] = {
        status,
        ot: safeNumber(row.ot),
        otHours: safeNumber(row.otHours),
      };

      if (row.priority === 2) {
        employee.nd += safeNumber(row.nd);
        employee.ot += safeNumber(row.ot);
        employee.off += safeNumber(row.off);
        employee.holiday += safeNumber(row.holiday);
      } else {
        if (presentStatuses.includes(status)) {
          employee.nd += 1;
        } else if (halfDayStatuses.includes(status)) {
          employee.nd += 0.5;
        }

        if (["OT", "P1"].includes(status)) {
          employee.ot += 1;
        }

        if (weeklyOffStatuses.includes(status)) {
          employee.off += 1;
        }

        if (holidayStatuses.includes(status)) {
          employee.holiday += 1;
        }
      }

      employee.otHrs += safeNumber(row.otHours);
    }

    // 5. FINAL MONTHLY DATA
    const finalData = Array.from(employeeMap.values())
      .map((employee) => ({
        ...employee,
        nd: round2(employee.nd),
        ot: round2(employee.ot),
        off: round2(employee.off),
        holiday: round2(employee.holiday),
        otHrs: round2(employee.otHrs),
      }))
      .sort((a, b) =>
        String(a.empName || "")
          .toUpperCase()
          .localeCompare(String(b.empName || "").toUpperCase())
      );

    console.log("PRINT ATTENDANCE SUMMARY", {
      siteId: siteIdNum,
      month: monthNum,
      year: yearNum,
      attType,
      bulkRecords: bulkResult.recordset.length,
      manualRecords: manualResult.recordset.length,
      groupedDays: dailyMap.size,
      employeeCount: finalData.length,
      finalData,
    });

    return finalData;
  } catch (error) {
    console.error("getAttendanceDataUnhold ERROR:", error);

    throw new Error(
      `Database error on getAttendanceDataUnhold: ${error.message}`
    );
  }
},



  // Generic function replacing modelmaster->getmasterdatabyid
  getMasterDataById: async (tablename, fieldName, fieldValue) => {
    try {
      const pool = await poolPromise;

      // To safely use dynamic table and column identifiers in SQL Server, we whitelist alphabetic strings
      const cleanTableName = tablename.replace(/[^a-zA-Z0-9_]/g, "");
      const cleanFieldName = fieldName.replace(/[^a-zA-Z0-9_]/g, "");

      const queryStr = `
                SELECT * FROM ${cleanTableName} 
                WHERE ${cleanFieldName} = @fieldValue 
                  AND active = '0'
                ORDER BY id DESC
            `;

      const result = await pool
        .request()
        .input("fieldValue", sql.VarChar, fieldValue.toString())
        .query(queryStr);

      return result.recordset;
    } catch (error) {
      throw new Error(
        `Database error on getMasterDataById [${tablename}]: ${error.message}`,
      );
    }
  },


getEmpAttendanceTime: async (siteId, month, year) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("siteId", sql.Int, Number(siteId))
    .input("month", sql.Int, Number(month))
    .input("year", sql.Int, Number(year))
    .query(`
      SELECT
          emp_code,
          check_in_date,
          DAY(check_in_date) AS day_no,
          check_in_time,
          check_out_time,
          emp_status,
          ot_hours
      FROM emp_attendance
      WHERE site_id = @siteId
        AND check_in_date >= DATEFROMPARTS(@year, @month, 1)
        AND check_in_date < DATEADD(
            MONTH,
            1,
            DATEFROMPARTS(@year, @month, 1)
        )
        AND ISNULL(active, 0) = 0
      ORDER BY
          emp_code,
          check_in_date,
          check_in_time
    `);

  console.log(
    "EMP ATTENDANCE SAMPLE:",
    result.recordset.slice(0, 5)
  );

  return result.recordset;
},

  getAttendanceDataByEmpSite: async (
    siteId,
    month,
    year,
    attType,
    transaction = null,
  ) => {
    try {
      siteId = Number(siteId);
      month = Number(month);
      year = Number(year);
      attType = String(attType || "").trim();

      console.log("🔥 GET ATTENDANCE DATA CALLED", {
        siteId,
        month,
        year,
        attType,
        hasTransaction: !!transaction,
      });

      // ============================================
      // USE TRANSACTION OR NORMAL POOL
      // ============================================

      let request;

      if (transaction) {
        console.log("🔗 GET ATTENDANCE DATA USING TRANSACTION");

        request = transaction.request();
      } else {
        console.log("🔗 GET ATTENDANCE DATA USING NORMAL POOL");

        const pool = await poolPromise;

        request = pool.request();
      }

      // ============================================
      // INPUTS
      // ============================================

      request.input("siteId", sql.Int, siteId);

      request.input("month", sql.Int, month);

      request.input("year", sql.Int, year);

      request.input("attType", sql.VarChar(50), attType);

      // ============================================
      // QUERY
      // ============================================

      const query = `
;WITH AttendanceData AS
(
    SELECT
        ea.emp_code,
        ea.emp_name,
        ea.site_id,
        ea.client_code,
        ea.emp_status,

        ROW_NUMBER() OVER (
            PARTITION BY ea.emp_code
            ORDER BY ea.id DESC
        ) AS rn

    FROM emp_attendance ea

    WHERE ea.site_id = @siteId
      AND MONTH(ea.check_in_date) = @month
      AND YEAR(ea.check_in_date) = @year
      AND ea.active = 0
),

AttendanceRank AS
(
    SELECT
        emp_code,
        site_id,
        rank,
        att_type,

        ROW_NUMBER() OVER (
            PARTITION BY emp_code
            ORDER BY id DESC
        ) AS rn

    FROM attendance

    WHERE site_id = @siteId
      AND at_month = @month
      AND at_year = @year
      AND active = 0
      AND att_type = @attType
)

SELECT
    ad.emp_code,
    ad.emp_name,
    ad.site_id,
    ad.client_code,
    ad.emp_status,
    ar.rank,
    ar.att_type

FROM AttendanceData ad

LEFT JOIN AttendanceRank ar
    ON ar.emp_code = ad.emp_code
    AND ar.site_id = ad.site_id
    AND ar.rn = 1

WHERE ad.rn = 1

ORDER BY ad.emp_name;
`;

      console.log("🔥🔥 ABOUT TO EXECUTE ATTENDANCE QUERY");

      // ============================================
      // EXECUTE
      // ============================================

      const result = await request.query(query);

      console.log("🔥 ATTENDANCE RECORD COUNT =", result.recordset.length);

      console.table(result.recordset);

      return result.recordset;
    } catch (err) {
      console.error("❌ getAttendanceDataByEmpSite ERROR =", err);

      throw err;
    }
  },

getTotalHalfDaysByEmp: async (
  siteId,
  month,
  year,
  empCode,
  rank,
  attType,
  transaction = null,
) => {
  try {
    logger.log("getTotalHalfDaysByEmp =>", {
      siteId,
      month,
      year,
      empCode,
      rank,
      attType,
      hasTransaction: !!transaction,
    });

    let request;

    if (transaction) {
      request = transaction.request();
    } else {
      const pool = await poolPromise;
      request = pool.request();
    }

    request
      .input("siteId", sql.Int, Number(siteId))
      .input("month", sql.Int, Number(month))
      .input("year", sql.Int, Number(year))
      .input("empCode", sql.VarChar, String(empCode))
      .input("rank", sql.VarChar, String(rank))
      .input("attType", sql.VarChar, String(attType));

    const result = await request.query(`
      SELECT
        COUNT(DISTINCT CAST(ea.check_in_date AS DATE)) AS total_days
      FROM emp_attendance ea
      WHERE ea.site_id = @siteId
        AND ea.check_in_date >= DATEFROMPARTS(@year, @month, 1)
        AND ea.check_in_date < DATEADD(
          MONTH, 1, DATEFROMPARTS(@year, @month, 1)
        )
        AND ea.emp_code = @empCode
        AND ea.active = 0
        AND ea.emp_status LIKE '%HF%'
        AND EXISTS (
          SELECT 1
          FROM attendance a
          WHERE a.emp_code = ea.emp_code
            AND a.site_id = ea.site_id
            AND a.at_month = @month
            AND a.at_year = @year
            AND a.active = 0
            AND a.rank = @rank
            AND a.att_type = @attType
        );
    `);

    const totalHalfDays = Number(
      result.recordset[0]?.total_days
    ) || 0;

    console.log("TOTAL HALF DAYS =>", totalHalfDays);

    return {
      total_days: totalHalfDays,
    };
  } catch (err) {
    logger.error("getTotalHalfDaysByEmp Error:", err);
    throw err;
  }
},
  getTotalDaysByStatusEmp: async (
    status,
    siteId,
    month,
    year,
    empCode,
    rank,
    attType,
    transaction = null,
  ) => {
    try {
      console.log("getTotalDaysByStatusEmp =>", {
        status,
        siteId,
        month,
        year,
        empCode,
        rank,
        attType,
        hasTransaction: !!transaction,
      });

      let request;

      if (transaction) {
        console.log("🔗 GET TOTAL DAYS USING TRANSACTION");
        request = transaction.request();
      } else {
        console.log("🔗 GET TOTAL DAYS USING NORMAL POOL");

        const pool = await poolPromise;
        request = pool.request();
      }

      request
        .input("siteId", sql.Int, Number(siteId))
        .input("month", sql.Int, Number(month))
        .input("year", sql.Int, Number(year))
        .input("empCode", sql.VarChar, String(empCode))
        .input("rank", sql.VarChar, String(rank))
        .input("attType", sql.VarChar, String(attType))
        .input("status", sql.VarChar, String(status));

      const result = await request.query(`
      SELECT COUNT(ea.id) AS total_days
      FROM emp_attendance ea
      INNER JOIN attendance a
          ON a.emp_code = ea.emp_code
         AND a.site_id = ea.site_id
         AND a.at_day = DAY(ea.check_in_date)
         AND a.at_month = MONTH(ea.check_in_date)
         AND a.at_year = YEAR(ea.check_in_date)
         AND a.active = 0
      WHERE ea.site_id = @siteId
        AND ea.emp_code = @empCode
        AND MONTH(ea.check_in_date) = @month
        AND YEAR(ea.check_in_date) = @year
        AND ea.active = 0
        AND a.rank = @rank
        AND a.att_type = @attType
        AND ea.emp_status = @status
    `);

      console.log(`TOTAL DAYS [${status}] =>`, result.recordset[0]?.total_days);

      return result.recordset[0];
    } catch (err) {
      console.error(`❌ getTotalDaysByStatusEmp Error [${status}]:`, err);

      throw err;
    }
  },
  getTotalPresentDaysEmp: async (
    siteId,
    month,
    year,
    empCode,
    rank,
    attType,
    transaction = null,
  ) => {
    try {
      console.log("getTotalPresentDaysEmp =>", {
        siteId,
        month,
        year,
        empCode,
        rank,
        attType,
        hasTransaction: !!transaction,
      });

      let request;

      if (transaction) {
        console.log("🔗 GET TOTAL PRESENT DAYS USING TRANSACTION");
        request = transaction.request();
      } else {
        console.log("🔗 GET TOTAL PRESENT DAYS USING NORMAL POOL");

        const pool = await poolPromise;
        request = pool.request();
      }

      request
        .input("siteId", sql.Int, Number(siteId))
        .input("month", sql.Int, Number(month))
        .input("year", sql.Int, Number(year))
        .input("empCode", sql.VarChar, String(empCode))
        .input("rank", sql.VarChar, String(rank))
        .input("attType", sql.VarChar, String(attType));

      const result = await request.query(`
      SELECT COUNT(ea.id) AS total_days
      FROM emp_attendance ea
      WHERE ea.site_id = @siteId
        AND ea.emp_code = @empCode
        AND ea.active = '0'
        AND MONTH(ea.check_in_date) = @month
        AND YEAR(ea.check_in_date) = @year
        AND ea.emp_status NOT IN ('A','CL','SL','PL','W','H','HF')
        AND EXISTS (
            SELECT 1
            FROM attendance a
            WHERE a.emp_code = ea.emp_code
              AND a.site_id = ea.site_id
              AND a.rank = @rank
              AND a.att_type = @attType
        )
    `);

      console.log("TOTAL PRESENT DAYS =>", result.recordset[0]?.total_days);

      return result.recordset[0];
    } catch (err) {
      console.error("❌ getTotalPresentDaysEmp Error:", err);

      throw err;
    }
  },
  getTotalOvertimeByEmp: async (
    siteId,
    month,
    year,
    empCode,
    rank,
    attType,
    transaction = null,
  ) => {
    try {
      console.log("getTotalOvertimeByEmp =>", {
        siteId,
        month,
        year,
        empCode,
        rank,
        attType,
        hasTransaction: !!transaction,
      });

      let request;

      if (transaction) {
        console.log("🔗 GET TOTAL OVERTIME USING TRANSACTION");

        request = transaction.request();
      } else {
        console.log("🔗 GET TOTAL OVERTIME USING NORMAL POOL");

        const pool = await poolPromise;
        request = pool.request();
      }

      request
        .input("siteId", sql.Int, Number(siteId))
        .input("month", sql.Int, Number(month))
        .input("year", sql.Int, Number(year))
        .input("empCode", sql.VarChar, String(empCode))
        .input("rank", sql.VarChar, String(rank))
        .input("attType", sql.VarChar, String(attType));

      console.log("🔥 ABOUT TO EXECUTE OVERTIME QUERY");

      const result = await request.query(`
      SELECT
          CAST(ea.check_in_date AS DATE) AS attendance_date,

          ea.emp_code,
          ea.emp_name,
          ea.site_id,
          ea.emp_status,

          a.rank,
          a.att_type,

          MAX(
            TRY_CAST(
              ea.site_hours AS DECIMAL(10,2)
            )
          ) AS site_hours_decimal,

          MAX(
            TRY_CAST(
              ea.emp_worked_hours AS DECIMAL(10,2)
            )
          ) AS worked_hours_decimal,

          (
              MAX(
                TRY_CAST(
                  ea.emp_worked_hours AS DECIMAL(10,2)
                )
              )
              -
              MAX(
                TRY_CAST(
                  ea.site_hours AS DECIMAL(10,2)
                )
              )
          ) AS extra_hours,

          CASE
              WHEN
                MAX(
                  TRY_CAST(
                    ea.emp_worked_hours AS DECIMAL(18,4)
                  )
                )
                >
                MAX(
                  TRY_CAST(
                    ea.site_hours AS DECIMAL(18,4)
                  )
                )
              THEN FLOOR(
                (
                  MAX(
                    TRY_CAST(
                      ea.emp_worked_hours AS DECIMAL(18,4)
                    )
                  )
                  -
                  MAX(
                    TRY_CAST(
                      ea.site_hours AS DECIMAL(18,4)
                    )
                  )
                )
                /
                NULLIF(
                  MAX(
                    TRY_CAST(
                      ea.site_hours AS DECIMAL(18,4)
                    )
                  ),
                  0
                )
              )
              ELSE 0
          END AS day_ot

      FROM emp_attendance ea

      LEFT JOIN attendance a
        ON a.emp_code = ea.emp_code
       AND a.site_id = ea.site_id
       AND a.at_day = DAY(ea.check_in_date)
       AND a.at_month = MONTH(ea.check_in_date)
       AND a.at_year = YEAR(ea.check_in_date)
       AND a.active = 0

      WHERE ea.site_id = @siteId
        AND ea.emp_code = @empCode
        AND ea.active = 0
        AND ea.emp_status = 'P'
        AND MONTH(ea.check_in_date) = @month
        AND YEAR(ea.check_in_date) = @year

      GROUP BY
          CAST(ea.check_in_date AS DATE),
          ea.emp_code,
          ea.emp_name,
          ea.site_id,
          ea.emp_status,
          a.rank,
          a.att_type

      ORDER BY attendance_date;
    `);

      console.log("🔥 OVERTIME RECORD COUNT =", result.recordset.length);

      console.table(result.recordset);

      const totalOT = result.recordset.reduce((total, row) => {
        return total + Number(row.day_ot || 0);
      }, 0);

      console.log("TOTAL OT =>", totalOT.toFixed(2));

      return Number(totalOT.toFixed(2));
    } catch (err) {
      console.error("❌ getTotalOvertimeByEmp Error:", err);

      throw err;
    }
  },

  getTotalDoubleDutyDays: async (
    siteId,
    month,
    year,
    empCode,
    rank,
    attType,
    transaction = null,
  ) => {
    try {
      console.log("======================================");
      console.log("DOUBLE DUTY CALCULATION START");

      let request;

      if (transaction) {
        console.log("🔗 GET DOUBLE DUTY USING TRANSACTION");
        request = transaction.request();
      } else {
        console.log("🔗 GET DOUBLE DUTY USING NORMAL POOL");

        const pool = await poolPromise;
        request = pool.request();
      }

      request
        .input("siteId", sql.Int, Number(siteId))
        .input("month", sql.Int, Number(month))
        .input("year", sql.Int, Number(year))
        .input("empCode", sql.VarChar, String(empCode))
        .input("rank", sql.VarChar, String(rank))
        .input("attType", sql.VarChar, String(attType));

      const result = await request.query(`

      ;WITH LatestAttendance AS
      (
          SELECT *,
                 ROW_NUMBER() OVER
                 (
                     PARTITION BY emp_code, site_id, CAST(check_in_date AS DATE)
                     ORDER BY created_on DESC, id DESC
                 ) AS rn
          FROM emp_attendance
          WHERE active = 0
      )

      SELECT
          COUNT(*) AS double_duty_days
      FROM
      (
          SELECT
              CAST(ea.check_in_date AS DATE) AS duty_date,

              TRY_CAST(ea.site_hours AS DECIMAL(10,2)) AS site_hours,

              TRY_CAST(ea.emp_worked_hours AS DECIMAL(10,2)) AS emp_worked_hours,

              CASE
                  WHEN TRY_CAST(ea.emp_worked_hours AS DECIMAL(10,2))
                       = TRY_CAST(ea.site_hours AS DECIMAL(10,2)) * 2
                  THEN 1
                  ELSE 0
              END AS is_double_duty

          FROM LatestAttendance ea

          INNER JOIN attendance a
              ON a.emp_code = ea.emp_code
             AND a.site_id = ea.site_id
             AND a.at_day = DAY(ea.check_in_date)
             AND a.at_month = MONTH(ea.check_in_date)
             AND a.at_year = YEAR(ea.check_in_date)
             AND a.active = 0

          WHERE ea.rn = 1
            AND ea.site_id = @siteId
            AND ea.emp_code = @empCode
            AND ea.emp_status = 'P'
            AND MONTH(ea.check_in_date) = @month
            AND YEAR(ea.check_in_date) = @year
            AND a.rank = @rank
            AND a.att_type = @attType
      ) x
      WHERE is_double_duty = 1;

    `);

      console.log("RAW DOUBLE DUTY RESULT =>", result.recordset);

      const totalDoubleDuty = Number(
        result.recordset[0]?.double_duty_days || 0,
      );

      console.log("TOTAL DOUBLE DUTY DAYS =>", totalDoubleDuty);

      return totalDoubleDuty;
    } catch (err) {
      console.error("❌ getTotalDoubleDutyDays Error:", err);

      // Error silently 0 करू नका.
      // Transaction असेल तर createInvoice ला rollback करता येईल.
      throw err;
    }
  },

  // // ✨ FIXED: Swapped out useless async layer since execution works perfectly as a synchronous functional block
  // pivotAttendanceDays: (records) => {
  //   const employeeMap = {};

  //   records.forEach((row) => {
  //     const empCode = row.emp_code;
  //     if (!employeeMap[empCode]) {
  //       employeeMap[empCode] = {
  //         empName: row.emp_name,
  //         empCode: empCode,
  //         rank: row.rank,
  //         pf: row.pf_no || "",
  //         esic: row.esic_no || "",
  //         nd: row.total_nd || 0,
  //         ot: row.total_ot || 0,
  //         off: row.total_off || 0,
  //         days: {},
  //       };
  //     }
  //     if (row.at_day) {
  //       employeeMap[empCode].days[parseInt(row.at_day, 10)] = row.status;
  //     }
  //   });

  //   return Object.values(employeeMap);
  // },

  getClientHavingCode: async () => {
    try {
      const pool = await poolPromise;

      const result = await pool.request().query(`
      SELECT TOP 1
          cr.*,
          coi.emp_type
      FROM client_rates cr
      INNER JOIN client_other_info coi
          ON cr.id = coi.rate_id
      WHERE ISNULL(cr.client_code, '') <> ''
    `);

      return result.recordset;
    } catch (error) {
      throw error;
    }
  },
getEmployeesForTemplate: async (clientId, siteId) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("client_id", sql.Int, Number(clientId))
    .input("site_id", sql.Int, Number(siteId))
    .query(`
      SELECT
        nc.x_client_code AS client_code,
        e.emp_full_name AS emp_name,
        e.employee_code AS emp_code,
        e.site_name,
        e.[rank] AS emp_type
      FROM dbo.employee e
      LEFT JOIN dbo.new_client nc
        ON nc.id = e.client_id
      WHERE
        e.client_id = @client_id
        AND e.site_id = @site_id
        AND UPPER(TRIM(e.em_status)) = 'WORKING'
        AND UPPER(TRIM(e.emp_stages)) = 'OFFER LETTER ISSUED'
      ORDER BY e.emp_full_name
    `);

  console.log("Attendance Template Employees:", result.recordset);

  return result.recordset;
},

 removeAttendance: async (siteId, month, year, userId, disabledOn) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // =====================================================
    // 1. LOG ATTENDANCE RECORDS BEFORE SOFT DELETE
    // =====================================================
    await new sql.Request(transaction)
      .input("userId", sql.BigInt, userId)
      .input("disabledOn", sql.DateTime, disabledOn)
      .input("siteId", sql.Int, siteId)
      .input("month", sql.Int, month)
      .input("year", sql.Int, year)
      .query(`
        INSERT INTO attendance_log (
          site_id,
          site_name,
          client_code,
          emp_name,
          emp_code,
          rank,
          at_day,
          at_month,
          at_year,
          status,
          active,
          created_by,
          created_on,
          uniqueid,
          invoice_status,
          att_type,
          remark,
          disabled_by,
          disabled_on,
          emp_worked_hours,
          source
        )
        SELECT
          site_id,
          site_name,
          client_code,
          emp_name,
          emp_code,
          rank,
          at_day,
          at_month,
          at_year,
          status,
          1,
          created_by,
          created_on,
          uniqueid,
          invoice_status,
          att_type,
          'Attendance Removed',
          @userId,
          @disabledOn,
          emp_worked_hours,
          'DELETE'
        FROM attendance
        WHERE site_id = @siteId
          AND at_month = @month
          AND at_year = @year
          AND active = 0;
      `);

    // =====================================================
    // 2. SOFT DELETE ATTENDANCE
    // =====================================================
    await new sql.Request(transaction)
      .input("userId", sql.BigInt, userId)
      .input("disabledOn", sql.DateTime, disabledOn)
      .input("siteId", sql.Int, siteId)
      .input("month", sql.Int, month)
      .input("year", sql.Int, year)
      .query(`
        UPDATE attendance
        SET
          active = 1,
          disabled_by = @userId,
          disabled_on = @disabledOn
        WHERE site_id = @siteId
          AND at_month = @month
          AND at_year = @year
          AND active = 0;
      `);

    // =====================================================
    // 3. LOG EMPLOYEE ATTENDANCE BEFORE SOFT DELETE
    // Assumes emp_attendance_log has matching columns
    // =====================================================
    await new sql.Request(transaction)
      .input("userId", sql.BigInt, userId)
      .input("disabledOn", sql.DateTime, disabledOn)
      .input("siteId", sql.Int, siteId)
      .input("month", sql.Int, month)
      .input("year", sql.Int, year)
      .query(`
        INSERT INTO emp_attendance_log (
          employee_id,
          emp_code,
          check_in_date,
          check_in_time,
          check_out_time,
          checkin_address,
          checkin_state,
          checkin_city,
          checkin_pincode,
          checkin_latitude,
          checkin_longitude,
          checkout_address,
          checkout_state,
          checkout_city,
          checkout_pincode,
          checkout_latitude,
          checkout_longitude,
          created_by,
          created_on,
          active,
          site_id,
          client_id,
          modified_by,
          modified_on,
          site_name,
          client_name,
          source,
          emp_worked_hours,
          created_by_name,
          modified_by_name,
          emp_status,
          emp_name,
          site_hours,
          ot_hours,
          check_out_date,
          client_code,
          branch_name,
          checkout_source,
          app_version,
          version_code,
          check_in_face_embedding,
          check_in_photo,
          check_out_face_embedding,
          check_out_photo,
          company_id,
          branch_id,
          disabled_by,
          disabled_on,
          remark
        )
        SELECT
          employee_id,
          emp_code,
          check_in_date,
          check_in_time,
          check_out_time,
          checkin_address,
          checkin_state,
          checkin_city,
          checkin_pincode,
          checkin_latitude,
          checkin_longitude,
          checkout_address,
          checkout_state,
          checkout_city,
          checkout_pincode,
          checkout_latitude,
          checkout_longitude,
          created_by,
          created_on,
          1,
          site_id,
          client_id,
          @userId,
          @disabledOn,
          site_name,
          client_name,
          'DELETE',
          emp_worked_hours,
          created_by_name,
          modified_by_name,
          emp_status,
          emp_name,
          site_hours,
          ot_hours,
          check_out_date,
          client_code,
          branch_name,
          checkout_source,
          app_version,
          version_code,
          check_in_face_embedding,
          check_in_photo,
          check_out_face_embedding,
          check_out_photo,
          company_id,
          branch_id,
          @userId,
          @disabledOn,
          'Attendance Removed'
        FROM emp_attendance
        WHERE site_id = @siteId
          AND MONTH(check_in_date) = @month
          AND YEAR(check_in_date) = @year
          AND active = 0;
      `);

    // =====================================================
    // 4. SOFT DELETE EMPLOYEE ATTENDANCE
    // =====================================================
    await new sql.Request(transaction)
      .input("userId", sql.BigInt, userId)
  .input("disabledOn", sql.DateTime, disabledOn)
      .input("siteId", sql.Int, siteId)
      .input("month", sql.Int, month)
      .input("year", sql.Int, year)
      .query(`
        UPDATE emp_attendance
        SET active = 1,
          disabled_by = @userId,
      disabled_on = @disabledOn,
      remark = 'Attendance Removed'
        WHERE site_id = @siteId
          AND MONTH(check_in_date) = @month
          AND YEAR(check_in_date) = @year
          AND active = 0;
      `);

    // =====================================================
    // 5. COMMIT
    // =====================================================
    await transaction.commit();

    console.log("======================================");
    console.log("ATTENDANCE REMOVED SUCCESSFULLY");
    console.log("SITE ID:", siteId);
    console.log("MONTH:", month);
    console.log("YEAR:", year);
    console.log("USER ID:", userId);
    console.log("ATTENDANCE + EMP_ATTENDANCE LOGGED");
    console.log("======================================");

    return {
      success: true,
      message:
        "Attendance and employee attendance removed successfully",
    };
  } catch (error) {
    await transaction.rollback();

    console.error("REMOVE ATTENDANCE ERROR:", error);

    throw error;
  }
},

  // uploadAttendanceModel: async (file, body, user) => {
  //   const pool = await poolPromise;

  //   const { id: userId, branch, company } = user;

  //   const { att_type } = body;

  //   if (!file) {
  //     throw new Error("Attach file to upload");
  //   }

  //   const originalName = file.originalname;

  //   if (originalName.includes(" ")) {
  //     throw new Error("File name should not contain space");
  //   }

  //   await pool
  //     .request()
  //     .input("branch_id", sql.Int, branch)
  //     .input("company_id", sql.Int, company)
  //     .input("created_by", sql.Int, userId).query(`
  //     DELETE FROM temp_attendance
  //     WHERE branch_id=@branch_id
  //     AND company_id=@company_id
  //     AND created_by=@created_by
  //   `);

  //   const workbook = XLSX.readFile(file.path);

  //   const sheetName = workbook.SheetNames[0];

  //   const worksheet = workbook.Sheets[sheetName];

  //   const data = XLSX.utils.sheet_to_json(worksheet, {
  //     header: 1,
  //     defval: "",
  //   });

  //   const uploadRows = [];

  //   for (let i = 1; i < data.length; i++) {
  //     const row = data[i];

  //     const employeeCode = String(row[3] || "").trim();

  //     let employeeName = row[2] || "";

  //     if (!employeeName && employeeCode) {
  //       const empResult = await pool
  //         .request()
  //         .input("employee_code", sql.NVarChar, employeeCode).query(`
  //         SELECT first_name,last_name
  //         FROM employee
  //         WHERE employee_code=@employee_code
  //       `);

  //       if (empResult.recordset.length) {
  //         employeeName = `${empResult.recordset[0].first_name || ""} ${
  //           empResult.recordset[0].last_name || ""
  //         }`.trim();
  //       }
  //     }

  //     const attendanceData = {
  //       client_code: row[1] || "",
  //       emp_name: employeeName,
  //       emp_code: employeeCode,
  //       site_name: row[4] || "",
  //       rank: String(row[5] || "").trim(),
  //       at_month: row[6] || "",
  //       at_year: row[7] || "",
  //       att_type,
  //       created_by: userId,
  //       created_on: new Date(),
  //       branch_id: branch,
  //       company_id: company,
  //     };

  //     for (let d = 1; d <= 31; d++) {
  //       attendanceData[`at_${d}`] = row[7 + d] || "";
  //     }

  //     uploadRows.push(attendanceData);
  //   }

  //   if (uploadRows.length) {
  //     const transaction = new sql.Transaction(pool);

  //     await transaction.begin();

  //     try {
  //       for (const row of uploadRows) {
  //         const request = new sql.Request(transaction);

  //         request.input("client_code", sql.NVarChar, row.client_code);
  //         request.input("emp_name", sql.NVarChar, row.emp_name);
  //         request.input("emp_code", sql.NVarChar, row.emp_code);
  //         request.input("site_name", sql.NVarChar, row.site_name);
  //         request.input("rank", sql.NVarChar, row.rank);
  //         request.input("at_month", sql.NVarChar, row.at_month);
  //         request.input("at_year", sql.NVarChar, row.at_year);

  //         for (let d = 1; d <= 31; d++) {
  //           request.input(`at_${d}`, sql.NVarChar, row[`at_${d}`]);
  //         }

  //         request.input("att_type", sql.NVarChar, row.att_type);
  //         request.input("created_by", sql.Int, row.created_by);
  //         request.input("branch_id", sql.Int, row.branch_id);
  //         request.input("company_id", sql.Int, row.company_id);

  //         await request.query(`
  //         INSERT INTO temp_attendance (
  //           client_code,
  //           emp_name,
  //           emp_code,
  //           site_name,
  //           rank,
  //           at_month,
  //           at_year,
  //           ${Array.from({ length: 31 }, (_, i) => `at_${i + 1}`).join(",")},
  //           att_type,
  //           created_by,
  //           created_on,
  //           branch_id,
  //           company_id
  //         )
  //         VALUES (
  //           @client_code,
  //           @emp_name,
  //           @emp_code,
  //           @site_name,
  //           @rank,
  //           @at_month,
  //           @at_year,
  //           ${Array.from({ length: 31 }, (_, i) => `@at_${i + 1}`).join(",")},
  //           @att_type,
  //           @created_by,
  //       CONVERT(VARCHAR(19),GETDATE(),120)
  //           @branch_id,
  //           @company_id
  //         )
  //       `);
  //       }

  //       await transaction.commit();
  //     } catch (err) {
  //       await transaction.rollback();
  //       throw err;
  //     }
  //   }

  //   return {
  //     rows: uploadRows.length,
  //     message: `${uploadRows.length} rows uploaded successfully. Click on verify data. Do not refresh the page`,
  //   };
  // },

  uploadAttendanceModel: async (filePath, attType, user) => {
    const pool = await poolPromise;

    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      // ===================================
      // DELETE OLD TEMP DATA
      // ===================================

      await new sql.Request(transaction)
        .input("branchId", sql.Int, user.branch)
        .input("companyId", sql.Int, user.company_id)
        .input("userId", sql.Int, user.id).query(`
        DELETE FROM temp_attendance
        WHERE branch_id=@branchId
        AND company_id=@companyId
        AND created_by=@userId
      `);

      // ===================================
      // READ EXCEL
      // ===================================

      const workbook = XLSX.readFile(filePath);

      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
      });

      const uploadData = [];

      for (let i = 1; i <= rows.length; i++) {
        const row = rows[i];

        let employeeName = row[2] || "";

        const employeeCode = String(row[3] || "").trim();

        if (!employeeCode) continue;

        // ===============================
        // GET EMPLOYEE NAME IF EMPTY
        // ===============================

        if (!employeeName) {
          const empResult = await new sql.Request(transaction).input(
            "employeeCode",
            sql.NVarChar,
            employeeCode,
          ).query(`
            SELECT TOP 1
              first_name,
              last_name
            FROM employee
            WHERE employee_code=@employeeCode
          `);

          if (empResult.recordset.length) {
            const emp = empResult.recordset[0];

            employeeName =
              `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
          }
        }

        const record = {
          client_code: row[1] || "",
          emp_name: employeeName,
          emp_code: employeeCode,
          site_name: row[4] || "",
          rank: row[5] || "",
          at_month: row[6] || "",
          at_year: row[7] || "",
          att_type: attType || "",
          created_by: user.id,
          created_on: new Date(),
          branch_id: user.branch,
          company_id: user.company_id,
        };

        // ===================================
        // AT_1 TO AT_31
        // ===================================

        for (let d = 1; d <= 31; d++) {
          record[`at_${d}`] = row[d + 7] || "";
        }

        uploadData.push(record);
      }

      // ===================================
      // BULK INSERT CHUNKS OF 50
      // ===================================

      const chunkSize = 50;

      for (let i = 0; i < uploadData.length; i += chunkSize) {
        const chunk = uploadData.slice(i, i + chunkSize);

        await insertTempAttendanceChunk(transaction, chunk);
      }

      await transaction.commit();

      return {
        count: uploadData.length,
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
getUserAccess: async (userId) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("userId", sql.Int, Number(userId))
    .query(`
      SELECT
        id,
        role,
        site_id,
        client_id
      FROM users
      WHERE id = @userId
        AND active = '0'
    `);

  return result.recordset[0] || null;
},


verifyAttendanceDataModel: async (user) => {
  try {
    const pool = await poolPromise;

    const { id: userId, branch, name: userName } = user;

    const numericUserId = Number(userId);

    if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
      throw new Error(`Invalid user ID: ${userId}`);
    }

    const createdByName = userName || "SYSTEM";

    // 1. Get user details
    const userResult = await pool
      .request()
      .input("userId", sql.Int, numericUserId)
      .query(`
        SELECT TOP 1 id, branch, company_id, first_name
        FROM users
        WHERE id = @userId
      `);

    if (!userResult.recordset.length) {
      throw new Error(`User not found: ${numericUserId}`);
    }

    const userDetail = userResult.recordset[0];

    // 2. Resolve branch ID
    const branchValue = userDetail.branch || branch;
    let branchId = Number(branchValue);

    if (!Number.isInteger(branchId) || branchId <= 0) {
      const branchResult = await pool
        .request()
        .input("branchName", sql.VarChar(200), String(branchValue || "").trim())
        .query(`
          SELECT TOP 1 id
          FROM branch
          WHERE LTRIM(RTRIM(branch_name)) =
                LTRIM(RTRIM(@branchName))
        `);

      if (!branchResult.recordset.length) {
        throw new Error(`Branch not found: ${branchValue}`);
      }

      branchId = Number(branchResult.recordset[0].id);
    }

    // 3. Resolve company IDs
    const companyIds = String(userDetail.company_id ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => /^\d+$/.test(value));

    if (!companyIds.length) {
      throw new Error(`Invalid company ID: ${userDetail.company_id}`);
    }

    const companyIdString = companyIds.join(",");

    // 4. Fetch temporary attendance rows
    const tempResult = await pool
      .request()
      .input("createdBy", sql.Int, numericUserId)
      .input("branchId", sql.Int, branchId)
      .input("companyId", sql.NVarChar(500), companyIdString)
      .query(`
        SELECT *
        FROM temp_attendance
        WHERE created_by = @createdBy
          AND branch_id = @branchId
          AND company_id = @companyId
        ORDER BY id ASC
      `);

    const tempRows = tempResult.recordset;

    let verifiedRows = 0;
    let skippedRows = 0;
    let employeeFound = 0;
    let employeeNotFound = 0;
    let clientFound = 0;
    let clientNotFound = 0;
    let siteFound = 0;
    let siteNotFound = 0;

    const skippedDetails = [];

    console.log("TOTAL TEMP ROWS:", tempRows.length);

    // 5. Process rows
    for (const row of tempRows) {
      try {
        let employeeId = row.employee_id || null;
        let employeeData = null;

        const employeeCode = row.emp_code
          ? String(row.emp_code).trim()
          : null;

        const employeeName = row.emp_name
          ? String(row.emp_name).replace(/\s+/g, " ").trim()
          : null;

        const clientCode = row.client_code != null
          ? String(row.client_code).trim()
          : null;

        let clientId = null;
        let clientName = null;
        let siteId = null;

        // Preserve the site name supplied in the attendance row.
        let siteName = row.site_name
          ? String(row.site_name).trim()
          : null;

        console.log("PROCESSING ROW:", {
          temp_id: row.id,
          employeeCode,
          clientCode,
          siteName,
          original_site_id: row.site_id
        });

        // 6. Find employee by ID
        if (employeeId) {
          const numericEmployeeId = Number(employeeId);

          if (Number.isInteger(numericEmployeeId) && numericEmployeeId > 0) {
            const result = await pool
              .request()
              .input("employeeId", sql.BigInt, numericEmployeeId)
              .query(`
                SELECT TOP 1
                  id, employee_code, emp_full_name,
                  first_name, middle_name, last_name,
                  client_id, client_name, site_id, site_name,
                  company_id, em_status, emp_stages
                FROM employee
                WHERE id = @employeeId
                  AND active = 0
              `);

            if (result.recordset.length) {
              employeeData = result.recordset[0];
              employeeId = employeeData.id;
              employeeFound++;
            } else {
              employeeId = null;
            }
          } else {
            employeeId = null;
          }
        }

        // 7. Find employee by employee code
        if (!employeeId && employeeCode) {
          const request = pool.request().input(
            "employeeCode",
            sql.VarChar(100),
            employeeCode
          );

          const companyParams = companyIds.map((companyId, index) => {
            request.input(`companyId${index}`, sql.BigInt, Number(companyId));
            return `@companyId${index}`;
          }).join(", ");

          const result = await request.query(`
            SELECT TOP 1
              id, employee_code, emp_full_name,
              first_name, middle_name, last_name,
              client_id, client_name, site_id, site_name,
              company_id, em_status, emp_stages
            FROM employee
            WHERE active = 0
              AND company_id IN (${companyParams})
              AND LTRIM(RTRIM(CAST(employee_code AS VARCHAR(100))))
                  = @employeeCode
              AND LOWER(LTRIM(RTRIM(em_status))) = 'working'
              AND LOWER(LTRIM(RTRIM(emp_stages))) = 'offer letter issued'
            ORDER BY id DESC
          `);

          if (result.recordset.length) {
            employeeData = result.recordset[0];
            employeeId = employeeData.id;
            employeeFound++;
          }
        }

        // 8. Skip if employee not found
        if (!employeeId) {
          employeeNotFound++;
          skippedRows++;

          skippedDetails.push({
            temp_id: row.id,
            employee_code: employeeCode,
            employee_name: employeeName,
            reason: "Employee not found"
          });

          continue;
        }

        // 9. Match client rate using BOTH client_code and site_name.
        // Never select an arbitrary site by client_code alone.
        let rateData = null;

        if (clientCode && siteName) {
          const rateResult = await pool
            .request()
            .input("clientCode", sql.VarChar(100), clientCode)
            .input("siteName", sql.NVarChar(200), siteName)
            .query(`
              SELECT TOP 1
                cr.id AS client_rate_id,
                cr.client_id,
                cr.client_code,
                cr.site_name,
                cr.new_site_id,
                cr.created_by,
                cr.created_by_name
              FROM client_rates cr
              WHERE LTRIM(RTRIM(CAST(cr.client_code AS VARCHAR(100))))
                    = @clientCode
                AND UPPER(LTRIM(RTRIM(ISNULL(cr.site_name, ''))))
                    = UPPER(LTRIM(RTRIM(@siteName)))
              ORDER BY cr.id DESC
            `);

          if (rateResult.recordset.length) {
            rateData = rateResult.recordset[0];

            clientId = rateData.client_id;
            siteName = rateData.site_name;

            // IMPORTANT:
            // new_site_id must represent the actual site ID.
            // Do not automatically use client_rates.id as site_id.
            if (rateData.new_site_id != null) {
              siteId = rateData.new_site_id;
            }

            siteFound++;

            console.log("EXACT CLIENT/SITE MATCH:", {
              client_rate_id: rateData.client_rate_id,
              client_id: rateData.client_id,
              client_code: rateData.client_code,
              site_name: rateData.site_name,
              new_site_id: rateData.new_site_id,
              resolved_site_id: siteId
            });
          } else {
            siteNotFound++;

            console.warn("CLIENT CODE + SITE NAME NOT MATCHED:", {
              clientCode,
              siteName
            });
          }
        } else {
          console.warn("CLIENT CODE OR SITE NAME MISSING:", {
            clientCode,
            siteName
          });
        }

        // 10. Client fallback from employee
        if (!clientId && employeeData?.client_id != null) {
          clientId = employeeData.client_id;
        }

        // 11. Site ID fallback from employee ONLY.
        // Do not use client_rates.id as the site ID.
        if (siteId == null && employeeData?.site_id != null) {
          siteId = employeeData.site_id;
        }

        // Keep the requested site name; only use employee name if missing.
        if (!siteName && employeeData?.site_name) {
          siteName = String(employeeData.site_name).trim();
        }

        // 12. Get client details
        if (clientId != null) {
          const numericClientId = Number(clientId);

          if (Number.isInteger(numericClientId) && numericClientId > 0) {
            const clientResult = await pool
              .request()
              .input("clientId", sql.BigInt, numericClientId)
              .query(`
                SELECT TOP 1 id, company_name, company_id, branch_id
                FROM new_client
                WHERE id = @clientId
              `);

            if (clientResult.recordset.length) {
              const clientData = clientResult.recordset[0];

              clientName = clientData.company_name;
              row.company_id = clientData.company_id;
              row.branch_id = clientData.branch_id;

              clientFound++;
            } else {
              clientNotFound++;
              console.warn("CLIENT NOT FOUND:", clientId);
            }
          }
        } else {
          clientNotFound++;
        }

        if (!clientName && employeeData?.client_name) {
          clientName = employeeData.client_name;
        }

        // 13. Resolve employee name
        let finalEmployeeName = employeeData?.emp_full_name || null;

        if (!finalEmployeeName && employeeData) {
          finalEmployeeName = [
            employeeData.first_name,
            employeeData.middle_name,
            employeeData.last_name
          ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
        }

        if (!finalEmployeeName) {
          finalEmployeeName = employeeName;
        }

        // 14. Final validation
        console.log("FINAL RESOLVED ATTENDANCE:", {
          temp_id: row.id,
          employee_id: employeeId,
          emp_code: employeeData?.employee_code || employeeCode,
          emp_name: finalEmployeeName,
          client_id: clientId,
          client_code: clientCode,
          client_name: clientName,
          site_id: siteId,
          site_name: siteName,
          company_id: row.company_id,
          branch_id: row.branch_id
        });

        // If requested site was supplied but no exact client-rate match
        // was found, do not silently save to another site.
        if (clientCode && row.site_name && !rateData) {
          throw new Error(
            `Client code ${clientCode} and site ${row.site_name} do not match in client_rates`
          );
        }

        // 15. Update row for verifySingleAttendance
        row.employee_id = employeeId;
        row.emp_code = employeeData?.employee_code || employeeCode;
        row.emp_name = finalEmployeeName;
        row.client_id = clientId;
        row.client_code = clientCode;
        row.client_name = clientName;
        row.site_id = siteId;
        row.site_name = siteName;
        row.created_by = numericUserId;
        row.created_by_name = createdByName;

        console.log("ROW SENT TO verifySingleAttendance:", {
          id: row.id,
          employee_id: row.employee_id,
          client_id: row.client_id,
          client_code: row.client_code,
          client_name: row.client_name,
          site_id: row.site_id,
          site_name: row.site_name,
          company_id: row.company_id,
          branch_id: row.branch_id
        });

        // 16. Verify/save attendance
        await verifySingleAttendance(row);

        verifiedRows++;

        console.log("VERIFIED SUCCESSFULLY:", row.id);
      } catch (rowError) {
        console.error(`ERROR PROCESSING TEMP ROW ${row.id}:`, rowError);

        skippedRows++;

        skippedDetails.push({
          temp_id: row.id,
          employee_code: row.emp_code
            ? String(row.emp_code)
            : null,
          employee_name: row.emp_name
            ? String(row.emp_name)
            : null,
          reason: rowError.message || "Error processing attendance row"
        });
      }
    }

    // 17. Summary
    const summary = {
      totalRows: tempRows.length,
      verifiedRows,
      skippedRows,
      employeeFound,
      employeeNotFound,
      clientFound,
      clientNotFound,
      siteFound,
      siteNotFound,
      companyIds,
      companyIdString,
      skippedDetails
    };

    console.log("VERIFY ATTENDANCE SUMMARY:", summary);

    return {
      processed: tempRows.length,
      verifiedRows,
      skippedRows,
      skippedDetails,
      employeeFound,
      employeeNotFound,
      clientFound,
      clientNotFound,
      siteFound,
      siteNotFound,
      message:
        `Attendance verification completed. Verified: ${verifiedRows}, Skipped: ${skippedRows}`
    };
  } catch (error) {
    console.error("VERIFY ATTENDANCE DATA MODEL ERROR:", error);
    throw error;
  }
},

};
// ✨ FIXED: Declared outside module.exports as a standard hoisted file-scoped utility function
function pivotAttendanceDays(records) {
  const employeeMap = {};

  records.forEach((row) => {
    const empCode = row.emp_code;

    if (!employeeMap[empCode]) {
      employeeMap[empCode] = {
        empName: row.emp_name,
        empCode,
        rank: row.rank || "",
        pf: row.pf_no || "",
        esic: row.esic_no || "",
        nd: 0,
        ot: 0,
        off: 0,
        holiday: 0,
        otHrs: 0,
        days: {},
      };
    }

    const employee = employeeMap[empCode];

    const day = Number(row.at_day);
    const status = row.status || "";

    // Store Day Status
    employee.days[day] = status;

    // ND
    if (status.startsWith("P")) {
      employee.nd += 1;
    } else if (status === "HF") {
      employee.nd += 0.5;
    }

    // Weekly Off
    if (status === "W") {
      employee.off += 1;
    }

    // Holiday
    if (status === "H") {
      employee.holiday += 1;
    }

    // Total OT
    employee.ot += Number(row.ot || 0);

    // Total OT Hours
    employee.otHrs += Number(row.otHrs || 0);
  });

  // Optional: round OT hours
  Object.values(employeeMap).forEach((emp) => {
    emp.otHrs = Number(emp.otHrs.toFixed(4));
  });

  return Object.values(employeeMap);
}
// update verifySingleAttendance for hours included
const verifySingleAttendance = async (row) => {
  const pool = await poolPromise;

  let err = "";
  const updatedEmployees = [];

  try {
    // =====================================================
    // CLIENT CODE VALIDATION
    // =====================================================

    const clientResult = await pool
      .request()
      .input("client_code", sql.NVarChar, String(row.client_code || "")).query(`
        SELECT TOP 1 *
        FROM client_rates
        WHERE LTRIM(RTRIM(CAST(client_code AS VARCHAR(100))))
              =
              LTRIM(RTRIM(@client_code))
      `);

    const client = clientResult.recordset[0];

    if (!client) {
      err += "Client code did not match. ";
    }

    if (!row.at_month) {
      err += "Month is mandatory. ";
    }

    if (!row.at_year) {
      err += "Year is mandatory. ";
    }

    if (!row.emp_code) {
      err += "Employee code is mandatory. ";
    }

    // =====================================================
    // IMPORTANT VALIDATION
    // =====================================================

    if (!row.employee_id) {
      err += "Employee ID not found. ";
    }

    if (!row.client_id) {
      err += "Client ID not found. ";
    }

    if (!row.site_id) {
      err += "Site ID not found. ";
    }

    // =====================================================
    // VALIDATION ERROR
    // =====================================================

    // if (err) {
    //   await pool
    //     .request()
    //     .input("id", sql.Int, row.id)
    //     .input("error", sql.NVarChar(sql.MAX), err).query(`
    //       UPDATE temp_attendance
    //       SET error = @error
    //       WHERE id = @id
    //     `);

    //   throw new Error(
    //     `Validation Failed (Temp ID: ${row.id}, Emp Code: ${row.emp_code}) : ${err}`,
    //   );
    // }

    if (err) {
  console.error("========== ATTENDANCE VERIFICATION SKIPPED ==========");
  console.error("Temp ID      :", row.id);
  console.error("Employee Code:", row.emp_code);
  console.error("Employee Name:", row.emp_name);
  console.error("Client Code  :", row.client_code);
  console.error("Client ID    :", row.client_id);
  console.error("Site ID      :", row.site_id);
  console.error("Month       :", row.at_month);
  console.error("Year        :", row.at_year);
  console.error("SKIP REASON :", err);
  console.error("====================================================");

  await pool
    .request()
    .input("id", sql.Int, row.id)
    .input("error", sql.NVarChar(sql.MAX), err)
    .query(`
      UPDATE temp_attendance
      SET error = @error
      WHERE id = @id
    `);

  throw new Error(
    `Validation Failed (Temp ID: ${row.id}, Emp Code: ${row.emp_code}) : ${err}`,
  );
}

    // =====================================================
    // ATTENDANCE UPLOAD TYPE
    // =====================================================

    const attendanceUploadType = String(client?.attendance_upload_type || "P_A")
      .trim()
      .toUpperCase();

    // =====================================================
// ATTENDANCE SHEET TYPE VALIDATION
// =====================================================

const attendanceStatuses = [
  "P",
  "P1",
  "P2",
  "PP",
  "PPP",
  "PPPP",
  "PPPPP",

  "A",
  "W",
  "WO",
  "OFF",

  "H",
  "HOL",
  "HOLIDAY",

  "HF",

  "CL",
  "SL",
  "PL",
  "ML",

  "D",
  "N",

  "OT",
];

let detectedAttendanceType = null;

for (let day = 1; day <= 31; day++) {
  const rawValue = row[`at_${day}`];

  // Empty cell ignore
  if (
    rawValue === null ||
    rawValue === undefined ||
    String(rawValue).trim() === ""
  ) {
    continue;
  }

  const value = String(rawValue).trim().toUpperCase();

  // ==========================================
  // NUMERIC VALUE = HOURS
  // ==========================================

  if (value !== "" && Number.isFinite(Number(value))) {
    if (detectedAttendanceType === null) {
      detectedAttendanceType = "HOURS";
    }

    console.log(
      `DAY ${day}: Numeric value "${value}" detected as HOURS`,
    );
  }

  // ==========================================
  // ATTENDANCE STATUS = P_A
  // ==========================================

  else if (attendanceStatuses.includes(value)) {
    if (detectedAttendanceType === null) {
      detectedAttendanceType = "P_A";
    }

    console.log(
      `DAY ${day}: Status "${value}" detected as P_A`,
    );
  }

  // ==========================================
  // INVALID VALUE
  // ==========================================

  else {
    throw new Error(
      `Invalid attendance value "${value}" found for Employee Code ${row.emp_code} on Day ${day}.`,
    );
  }
}

// =====================================================
// NO ATTENDANCE DATA
// =====================================================

if (detectedAttendanceType === null) {
  throw new Error(
    `No attendance data found for Employee Code ${row.emp_code}.`,
  );
}

// =====================================================
// SELECTED TYPE VS UPLOADED SHEET TYPE
// =====================================================

console.log("===============================================");
console.log("ATTENDANCE SHEET TYPE VALIDATION");
console.log("Employee Code:", row.emp_code);
console.log("Configured Type:", attendanceUploadType);
console.log("Detected Sheet Type:", detectedAttendanceType);
console.log("===============================================");

// P_A selected but HOURS sheet uploaded
if (
  attendanceUploadType === "P_A" &&
  detectedAttendanceType === "HOURS"
) {
  throw new Error(
    `Invalid attendance upload for Employee Code ${row.emp_code}. ` +
      `P_A attendance is configured for this client/site, but the uploaded sheet contains HOURS data. ` +
      `Please upload P_A attendance values such as P, P1, P2, PP, PPP, A, W, H, CL, SL, PL, ML, etc.`,
  );
}

// HOURS selected but P_A sheet uploaded
if (
  attendanceUploadType === "HOURS" &&
  detectedAttendanceType === "P_A"
) {
  throw new Error(
    `Invalid attendance upload for Employee Code ${row.emp_code}. ` +
      `HOURS attendance is configured for this client/site, but the uploaded sheet contains P_A status values. ` +
      `Please upload numeric HOURS values.`,
  );
}

    const siteHours = Number(client?.cc_site_hours || 0);

    console.log("=================================================");
    console.log("ATTENDANCE UPLOAD TYPE");
    console.log("Employee Code:", row.emp_code);
    console.log("Employee Name:", row.emp_name);
    console.log("Site ID:", row.site_id);
    console.log("Site Name:", row.site_name);
    console.log("Client ID:", row.client_id);
    console.log("Client Code:", row.client_code);
    console.log("Client Name:", row.client_name);
    console.log("Attendance Upload Type:", attendanceUploadType);
    console.log("Site Hours:", siteHours);
    console.log("Month:", row.at_month);
    console.log("Year:", row.at_year);
    console.log("=================================================");

    // =====================================================
    // HOURS CALCULATION
    // ONLY USED WHEN attendance_upload_type = HOURS
    // =====================================================

    const calculateHoursAttendance = (rawValue) => {
      const value = String(rawValue ?? "").trim();

      console.log("");
      console.log("=================================================");
      console.log("HOURS ATTENDANCE CALCULATION");
      console.log("Raw Excel Value:", value);
      console.log("Configured Site Hours:", siteHours);
      console.log("=================================================");

      if (value === "") {
        console.log("Empty attendance value.");

        return {
          status: "",
          workedHours: 0,
          otHours: 0,
        };
      }

      const hours = Number(value);

      // =================================================
      // NON NUMERIC VALUE
      // =================================================

      if (isNaN(hours)) {
        console.log("Non-numeric value found:", value);
        console.log("Keeping value as status:", value);

        return {
          status: value,
          workedHours: 0,
          otHours: 0,
        };
      }

      // =================================================
      // ZERO HOURS
      // =================================================

      if (hours <= 0) {
        console.log("Calculation:");
        console.log(`${hours} / ${siteHours}`);
        console.log("Full Present Days: 0");
        console.log("Remaining OT Hours: 0");
        console.log("Final Status: A");

        return {
          status: "A",
          workedHours: 0,
          otHours: 0,
        };
      }

      // =================================================
      // SITE HOURS VALIDATION
      // =================================================

      if (siteHours <= 0) {
        throw new Error(
          `Site Hours is not configured for Site ID ${row.site_id}`,
        );
      }

      // =================================================
      // LESS THAN ONE FULL DAY
      //
      // Example:
      // 7.99 / 8 = 0.99875
      // Full Present Days = 0
      // OT = 7.99
      // Status = A
      // =================================================

      if (hours < siteHours) {
        const divisionResult = hours / siteHours;

        console.log("Calculation:");
        console.log(`${hours} / ${siteHours} = ${divisionResult}`);
        console.log("Full Present Days: 0");
        console.log("Remaining OT Hours:", hours);
        console.log("Final Status: A");
        console.log("Worked Hours:", hours);
        console.log("=================================================");
        console.log("");

        return {
          status: "A",
          workedHours: hours,
          otHours: Number(hours.toFixed(2)),
        };
      }

      // =================================================
      // FULL DAYS
      //
      // 8  / 8 = 1      -> P
      // 16 / 8 = 2      -> PP
      // 24 / 8 = 3      -> PPP
      //
      // 9  / 8 = 1.125  -> P + 1 OT
      // 17 / 8 = 2.125  -> PP + 1 OT
      // =================================================

      const divisionResult = hours / siteHours;

      const fullDays = Math.floor(divisionResult);

      const remainingHours = Number((hours - fullDays * siteHours).toFixed(2));

      const finalStatus = "P".repeat(fullDays);

      console.log("Calculation:");
      console.log(`${hours} / ${siteHours} = ${divisionResult}`);
      console.log("Full Present Days:", fullDays);
      console.log("Remaining OT Hours:", remainingHours);
      console.log("Final Status:", finalStatus);
      console.log("Worked Hours:", hours);
      console.log("=================================================");
      console.log("");

      return {
        status: finalStatus,
        workedHours: hours,
        otHours: remainingHours,
      };
    };

    // =====================================================
    // UNIQUE ID
    // =====================================================

    const uniqueid = `${row.site_id}_${row.emp_code}_${row.at_month}_${row.at_year}_${Date.now()}`;

    // =====================================================
    // TRANSACTION
    // =====================================================

    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      // ===================================================
      // PROCESS DAYS
      // ===================================================

      for (let day = 1; day <= 31; day++) {
        // =================================================
        // EXISTING RAW STATUS
        // P_A LOGIC REMAINS SAME
        // =================================================

        const rawValue = row[`at_${day}`];

        if (
          rawValue === null ||
          rawValue === undefined ||
          String(rawValue).trim() === ""
        ) {
          continue;
        }

        const status = String(rawValue).trim();

        // =================================================
        // HOURS VARIABLES
        // ONLY USED FOR HOURS MODE
        // =================================================

        let hoursStatus = status;
        let workedHours = null;
        let otHours = null;

        // =================================================
        // HOURS MODE
        // =================================================

        if (attendanceUploadType === "HOURS") {
          const hoursResult = calculateHoursAttendance(status);

          hoursStatus = hoursResult.status;
          workedHours = hoursResult.workedHours;
          otHours = hoursResult.otHours;

          console.log("-------------------------------------------------");
          console.log("HOURS ATTENDANCE FINAL RESULT");
          console.log("Employee Code:", row.emp_code);
          console.log("Employee Name:", row.emp_name);
          console.log("Day:", day);
          console.log("Excel Hours:", status);
          console.log("Site Hours:", siteHours);
          console.log("Division:", `${status} / ${siteHours}`);
          console.log("Final Status:", hoursStatus);
          console.log("Worked Hours:", workedHours);
          console.log("OT Hours:", otHours);
          console.log("-------------------------------------------------");
        }

        // =================================================
        // CHECK EXISTING ATTENDANCE
        // EXISTING LOGIC SAME
        // =================================================

        const existingAttendance = await new sql.Request(transaction)
          .input("emp_code", sql.NVarChar, String(row.emp_code))
          .input("at_day", sql.Int, day)
          .input("at_month", sql.NVarChar, String(row.at_month))
          .input("at_year", sql.NVarChar, String(row.at_year))
          .input("att_type", sql.NVarChar, String(row.att_type || "")).query(`
              SELECT TOP 1 id
              FROM attendance
              WHERE emp_code = @emp_code
                AND at_day = @at_day
                AND at_month = @at_month
                AND at_year = @at_year
                AND att_type = @att_type
            `);

        let attendanceId = null;

        // =================================================
        // UPDATE ATTENDANCE
        // =================================================

        if (existingAttendance.recordset.length > 0) {
          attendanceId = existingAttendance.recordset[0].id;

          // =================================================
          // EXISTING UPDATE
          // P_A SAME
          // =================================================

          await new sql.Request(transaction)
            .input("id", sql.BigInt, attendanceId)
            .input("site_id", sql.Int, Number(row.site_id))
            .input("client_code", sql.NVarChar, String(row.client_code))
            .input("emp_name", sql.NVarChar, String(row.emp_name || ""))
            .input("rank", sql.NVarChar, String(row.rank || ""))
            .input(
              "status",
              sql.NVarChar,
              attendanceUploadType === "HOURS" ? hoursStatus : status,
            ).query(`
              UPDATE attendance
              SET
                site_id = @site_id,
                client_code = @client_code,
                emp_name = @emp_name,
                rank = @rank,
                status = @status
              WHERE id = @id
            `);

          // =================================================
          // HOURS ONLY - UPDATE EXTRA FIELDS
          // =================================================

          if (attendanceUploadType === "HOURS") {
            await new sql.Request(transaction)
              .input("id", sql.BigInt, attendanceId)
              .input("client_id", sql.BigInt, Number(row.client_id))
              .input(
                "site_name",
                sql.NVarChar,
                String(row.site_name || client.site_name || ""),
              )
              .input(
                "client_name",
                sql.NVarChar,
                String(row.client_name || client.client_name || ""),
              )
              .input("emp_worked_hours", sql.Decimal(10, 2), workedHours)
              .input("site_hours", sql.Decimal(10, 2), siteHours)
              .input("ot_hours", sql.Decimal(10, 2), otHours).query(`
                UPDATE attendance
                SET
                  client_id = @client_id,
                  site_name = @site_name,
                  client_name = @client_name,
                  emp_worked_hours = @emp_worked_hours,
                  site_hours = @site_hours,
                  ot_hours = @ot_hours
                WHERE id = @id
              `);

            console.log("******** ATTENDANCE TABLE UPDATED ********");
            console.log("Attendance ID:", attendanceId);
            console.log("Employee ID:", row.employee_id);
            console.log("Employee Code:", row.emp_code);
            console.log("Employee Name:", row.emp_name);
            console.log("Day:", day);
            console.log("Client ID:", row.client_id);
            console.log("Client Code:", row.client_code);
            console.log("Client Name:", row.client_name);
            console.log("Site ID:", row.site_id);
            console.log("Site Name:", row.site_name);
            console.log("Excel Hours:", status);
            console.log("Worked Hours:", workedHours);
            console.log("Site Hours:", siteHours);
            console.log("Status:", hoursStatus);
            console.log("OT Hours:", otHours);
            console.log("********************************************");
          }

          await logAction("attendance", attendanceId, "UPDATE", transaction);

          updatedEmployees.push({
            emp_code: row.emp_code,
            attendance_id: attendanceId,
            day,
          });

          console.log(
            `Attendance Updated => Emp:${row.emp_code} Day:${day} ID:${attendanceId}`,
          );
        }

        // =================================================
        // INSERT ATTENDANCE
        // =================================================
        else {
          const insertedAttendance = await new sql.Request(transaction)
            .input("site_id", sql.Int, Number(row.site_id))
            .input("client_code", sql.NVarChar, String(row.client_code))
            .input("emp_name", sql.NVarChar, String(row.emp_name || ""))
            .input("emp_code", sql.NVarChar, String(row.emp_code || ""))
            .input("rank", sql.NVarChar, String(row.rank || ""))
            .input("at_day", sql.Int, day)
            .input(
              "status",
              sql.NVarChar,
              attendanceUploadType === "HOURS" ? hoursStatus : status,
            )
            .input("at_month", sql.NVarChar, String(row.at_month))
            .input("at_year", sql.NVarChar, String(row.at_year))
            .input("created_by", sql.BigInt, Number(row.created_by))
            .input("att_type", sql.NVarChar, String(row.att_type || ""))
            .input("uniqueid", sql.NVarChar, uniqueid).query(`
                INSERT INTO attendance
                (
                  site_id,
                  client_code,
                  emp_name,
                  emp_code,
                  rank,
                  at_day,
                  status,
                  at_month,
                  at_year,
                  created_by,
                  created_on,
                  att_type,
                  uniqueid
                )
                OUTPUT INSERTED.id
                VALUES
                (
                  @site_id,
                  @client_code,
                  @emp_name,
                  @emp_code,
                  @rank,
                  @at_day,
                  @status,
                  @at_month,
                  @at_year,
                  @created_by,
                  CONVERT(VARCHAR(19), GETDATE(), 120),
                  @att_type,
                  @uniqueid
                )
              `);

          attendanceId = insertedAttendance.recordset[0].id;

          // =================================================
          // HOURS ONLY - INSERT EXTRA FIELDS
          // =================================================

          if (attendanceUploadType === "HOURS") {
            await new sql.Request(transaction)
              .input("id", sql.BigInt, attendanceId)
              .input("client_id", sql.BigInt, Number(row.client_id))
              .input(
                "site_name",
                sql.NVarChar,
                String(row.site_name || client.site_name || ""),
              )
              .input(
                "client_name",
                sql.NVarChar,
                String(row.client_name || client.client_name || ""),
              )
              .input("emp_worked_hours", sql.Decimal(10, 2), workedHours)
              .input("site_hours", sql.Decimal(10, 2), siteHours)
              .input("ot_hours", sql.Decimal(10, 2), otHours).query(`
                UPDATE attendance
                SET
                  client_id = @client_id,
                  site_name = @site_name,
                  client_name = @client_name,
                  emp_worked_hours = @emp_worked_hours,
                  site_hours = @site_hours,
                  ot_hours = @ot_hours
                WHERE id = @id
              `);

            console.log("******** ATTENDANCE TABLE INSERTED ********");
            console.log("Attendance ID:", attendanceId);
            console.log("Employee ID:", row.employee_id);
            console.log("Employee Code:", row.emp_code);
            console.log("Employee Name:", row.emp_name);
            console.log("Day:", day);
            console.log("Client ID:", row.client_id);
            console.log("Client Code:", row.client_code);
            console.log("Client Name:", row.client_name);
            console.log("Site ID:", row.site_id);
            console.log("Site Name:", row.site_name);
            console.log("Excel Hours:", status);
            console.log("Worked Hours:", workedHours);
            console.log("Site Hours:", siteHours);
            console.log("Status:", hoursStatus);
            console.log("OT Hours:", otHours);
            console.log("********************************************");
          }

          await logAction("attendance", attendanceId, "CREATE", transaction);

          console.log(
            `Attendance Inserted => Emp:${row.emp_code} Day:${day} ID:${attendanceId}`,
          );
        }

        // =================================================
        // ATTENDANCE DATE
        // =================================================

        const attendanceDate = `${Number(row.at_year)}-${String(
          Number(row.at_month),
        ).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

        // =================================================
        // CHECK EMP ATTENDANCE
        // EXISTING LOGIC SAME
        // =================================================

        console.log("attendanceDate check:", attendanceDate);

        const existingEmpAttendance = await new sql.Request(transaction)
          .input("emp_code", sql.NVarChar, String(row.emp_code))
          .input("check_in_date", sql.Date, attendanceDate).query(`
              SELECT TOP 1 id
              FROM emp_attendance
              WHERE emp_code = @emp_code
                AND CAST(check_in_date AS DATE)
                    =
                    CAST(@check_in_date AS DATE)
                AND active = 0
            `);

        // =================================================
        // UPDATE EMP ATTENDANCE
        // =================================================

        if (existingEmpAttendance.recordset.length > 0) {
          const empAttendanceId = existingEmpAttendance.recordset[0].id;

          // =================================================
          // EXISTING UPDATE
          // =================================================

          await new sql.Request(transaction)
            .input("id", sql.BigInt, empAttendanceId)
            .input("site_id", sql.Int, Number(row.site_id))
            .input("client_id", sql.BigInt, Number(row.client_id))
            .input("site_name", sql.NVarChar, String(row.site_name || ""))
            .input("client_name", sql.NVarChar, String(row.client_name || ""))
            .input("emp_name", sql.NVarChar, String(row.emp_name || ""))
            .input(
              "emp_status",
              sql.NVarChar,
              attendanceUploadType === "HOURS" ? hoursStatus : status,
            )
            .input(
              "created_by_name",
              sql.NVarChar,
              String(row.created_by_name || "SYSTEM"),
            ).query(`
              UPDATE emp_attendance
              SET
                site_id = @site_id,
                client_id = @client_id,
                site_name = @site_name,
                client_name = @client_name,
                emp_name = @emp_name,
                emp_status = @emp_status,
                created_by_name = @created_by_name,
                modified_on =
                  CONVERT(VARCHAR(19), GETDATE(), 120)
              WHERE id = @id
            `);

          // =================================================
          // HOURS ONLY - UPDATE EXTRA FIELDS
          // =================================================

          if (attendanceUploadType === "HOURS") {
            await new sql.Request(transaction)
              .input("id", sql.BigInt, empAttendanceId)
              .input("emp_worked_hours", sql.Decimal(10, 2), workedHours)
              .input("site_hours", sql.Decimal(10, 2), siteHours)
              .input("ot_hours", sql.Decimal(10, 2), otHours).query(`
                UPDATE emp_attendance
                SET
                  emp_worked_hours = @emp_worked_hours,
                  site_hours = @site_hours,
                  ot_hours = @ot_hours
                WHERE id = @id
              `);

            console.log("******** EMP_ATTENDANCE UPDATED ********");
            console.log("Emp Attendance ID:", empAttendanceId);
            console.log("Employee ID:", row.employee_id);
            console.log("Employee Code:", row.emp_code);
            console.log("Employee Name:", row.emp_name);
            console.log("Date:", attendanceDate);
            console.log("Client ID:", row.client_id);
            console.log("Client Name:", row.client_name);
            console.log("Site ID:", row.site_id);
            console.log("Site Name:", row.site_name);
            console.log("Excel Hours:", status);
            console.log("Worked Hours:", workedHours);
            console.log("Site Hours:", siteHours);
            console.log("Status:", hoursStatus);
            console.log("OT Hours:", otHours);
            console.log("******************************************");
          }

          await logAction(
            "emp_attendance",
            empAttendanceId,
            "UPDATE",
            transaction,
          );

          console.log(`EMP Attendance Updated => ID:${empAttendanceId}`);
        }

        // =================================================
        // INSERT EMP ATTENDANCE
        // =================================================
        else {
          const insertedEmpAttendance = await new sql.Request(transaction)
            .input("employee_id", sql.BigInt, Number(row.employee_id))
            .input("emp_code", sql.NVarChar, String(row.emp_code))
            .input("check_in_date", sql.Date, attendanceDate)
            .input("site_id", sql.Int, Number(row.site_id))
            .input("client_id", sql.BigInt, Number(row.client_id))
            .input("site_name", sql.NVarChar, String(row.site_name || ""))
            .input("client_name", sql.NVarChar, String(row.client_name || ""))
            .input("emp_name", sql.NVarChar, String(row.emp_name || ""))
            .input(
              "emp_status",
              sql.NVarChar,
              attendanceUploadType === "HOURS" ? hoursStatus : status,
            )
            .input("created_by", sql.BigInt, Number(row.created_by))
            .input(
              "created_by_name",
              sql.NVarChar,
              String(row.created_by_name || "SYSTEM"),
            )
            .input("source", sql.NVarChar, "BULK_UPLOAD").query(`
                INSERT INTO emp_attendance
                (
                  employee_id,
                  emp_code,
                  check_in_date,
                  site_id,
                  client_id,
                  site_name,
                  client_name,
                  emp_name,
                  emp_status,
                  created_by,
                  created_by_name,
                  created_on,
                  source,
                  active
                )
                OUTPUT INSERTED.id
                VALUES
                (
                  @employee_id,
                  @emp_code,
                  @check_in_date,
                  @site_id,
                  @client_id,
                  @site_name,
                  @client_name,
                  @emp_name,
                  @emp_status,
                  @created_by,
                  @created_by_name,
                  CONVERT(VARCHAR(19), GETDATE(), 120),
                  @source,
                  0
                )
              `);

          const empAttendanceId = insertedEmpAttendance.recordset[0].id;

          // =================================================
          // HOURS ONLY - INSERT EXTRA FIELDS
          // =================================================

          if (attendanceUploadType === "HOURS") {
            await new sql.Request(transaction)
              .input("id", sql.BigInt, empAttendanceId)
              .input("emp_worked_hours", sql.Decimal(10, 2), workedHours)
              .input("site_hours", sql.Decimal(10, 2), siteHours)
              .input("ot_hours", sql.Decimal(10, 2), otHours).query(`
                UPDATE emp_attendance
                SET
                  emp_worked_hours = @emp_worked_hours,
                  site_hours = @site_hours,
                  ot_hours = @ot_hours
                WHERE id = @id
              `);

            console.log("******** EMP_ATTENDANCE INSERTED ********");
            console.log("Emp Attendance ID:", empAttendanceId);
            console.log("Employee ID:", row.employee_id);
            console.log("Employee Code:", row.emp_code);
            console.log("Employee Name:", row.emp_name);
            console.log("Date:", attendanceDate);
            console.log("Client ID:", row.client_id);
            console.log("Client Name:", row.client_name);
            console.log("Site ID:", row.site_id);
            console.log("Site Name:", row.site_name);
            console.log("Excel Hours:", status);
            console.log("Worked Hours:", workedHours);
            console.log("Site Hours:", siteHours);
            console.log("Status:", hoursStatus);
            console.log("OT Hours:", otHours);
            console.log("******************************************");
          }

          await logAction(
            "emp_attendance",
            empAttendanceId,
            "CREATE",
            transaction,
          );

          console.log(`EMP Attendance Inserted => ID:${empAttendanceId}`);
        }
      }

      // ===================================================
      // DEACTIVATE TEMP ATTENDANCE
      // ===================================================

      await new sql.Request(transaction).input("id", sql.Int, row.id).query(`
          UPDATE temp_attendance
          SET active = '0'
          WHERE id = @id
        `);

      await transaction.commit();

      // =====================================================
      // RECALCULATE EMPLOYEE LEAVES
      // =====================================================

      console.log(
        "Recalculate Employee Leave For bulk Upload called----------------------------------",
      );

      // await recalculateEmployeeLeaves(row.employee_id, {
      //   id: row.created_by,
      //   name: row.created_by_name,
      // });

      console.log(`VERIFY SUCCESS: Temp ID ${row.id}`);
    } catch (sqlError) {
      await transaction.rollback();

      console.error("========== VERIFY ATTENDANCE SQL ERROR ==========");

      console.error("Temp Attendance ID:", row.id);

      console.error("Employee Code:", row.emp_code);

      console.error("Client ID:", row.client_id);

      console.error("Client Code:", row.client_code);

      console.error("Client Name:", row.client_name);

      console.error("Site ID:", row.site_id);

      console.error("Created By Name:", row.created_by_name);

      console.error("SQL Error:", sqlError);

      throw new Error(
        `Failed at Temp Attendance ID ${row.id}: ${sqlError.message}`,
      );
    }
  } catch (error) {
    console.error("========== VERIFY ATTENDANCE ERROR ==========");

    console.error("Temp Attendance Row:", row);

    console.error("Error:", error.message);

    throw error;
  }
};

// const verifySingleAttendance = async (row) => {
//   const pool = await poolPromise;

//   let err = "";
//   const updatedEmployees = [];

//   try {
//     // =====================================================
//     // CLIENT CODE VALIDATION
//     // =====================================================

//     const clientResult = await pool
//       .request()
//       .input("client_code", sql.NVarChar, String(row.client_code || "")).query(`
//         SELECT TOP 1 *
//         FROM client_rates
//         WHERE LTRIM(RTRIM(CAST(client_code AS VARCHAR(100))))
//               =
//               LTRIM(RTRIM(@client_code))
//       `);

//     const client = clientResult.recordset[0];

//     if (!client) {
//       err += "Client code did not match. ";
//     }

//     if (!row.at_month) {
//       err += "Month is mandatory. ";
//     }

//     if (!row.at_year) {
//       err += "Year is mandatory. ";
//     }

//     if (!row.emp_code) {
//       err += "Employee code is mandatory. ";
//     }

//     // =====================================================
//     // IMPORTANT VALIDATION
//     // =====================================================

//     if (!row.employee_id) {
//       err += "Employee ID not found. ";
//     }

//     if (!row.client_id) {
//       err += "Client ID not found. ";
//     }

//     if (!row.site_id) {
//       err += "Site ID not found. ";
//     }

//     // =====================================================
//     // VALIDATION ERROR
//     // =====================================================

//     if (err) {
//       await pool
//         .request()
//         .input("id", sql.Int, row.id)
//         .input("error", sql.NVarChar(sql.MAX), err).query(`
//           UPDATE temp_attendance
//           SET error = @error
//           WHERE id = @id
//         `);

//       throw new Error(
//         `Validation Failed (Temp ID: ${row.id}, Emp Code: ${row.emp_code}) : ${err}`,
//       );
//     }

//     // =====================================================
//     // UNIQUE ID
//     // =====================================================

//     const uniqueid = `${row.site_id}_${row.emp_code}_${row.at_month}_${row.at_year}_${Date.now()}`;

//     // =====================================================
//     // TRANSACTION
//     // =====================================================

//     const transaction = new sql.Transaction(pool);

//     await transaction.begin();

//     try {
//       // ===================================================
//       // PROCESS DAYS
//       // ===================================================

//       for (let day = 1; day <= 31; day++) {
//         const status = String(row[`at_${day}`] || "").trim();

//         if (!status) {
//           continue;
//         }

//         // =================================================
//         // CHECK EXISTING ATTENDANCE
//         // =================================================

//         const existingAttendance = await new sql.Request(transaction)

//           .input("emp_code", sql.NVarChar, String(row.emp_code))

//           .input("at_day", sql.Int, day)

//           .input("at_month", sql.NVarChar, String(row.at_month))

//           .input("at_year", sql.NVarChar, String(row.at_year))

//           .input("att_type", sql.NVarChar, String(row.att_type || "")).query(`
//               SELECT TOP 1 id
//               FROM attendance

//               WHERE emp_code = @emp_code
//                 AND at_day = @at_day
//                 AND at_month = @at_month
//                 AND at_year = @at_year
//                 AND att_type = @att_type
//             `);

//         let attendanceId = null;

//         // =================================================
//         // UPDATE ATTENDANCE
//         // =================================================

//         if (existingAttendance.recordset.length > 0) {
//           attendanceId = existingAttendance.recordset[0].id;

//           await new sql.Request(transaction)

//             .input("id", sql.BigInt, attendanceId)

//             // CORRECT SITE ID
//             .input("site_id", sql.Int, Number(row.site_id))

//             .input("client_code", sql.NVarChar, String(row.client_code))

//             .input("emp_name", sql.NVarChar, String(row.emp_name || ""))

//             .input("rank", sql.NVarChar, String(row.rank || ""))

//             .input("status", sql.NVarChar, status).query(`
//               UPDATE attendance

//               SET

//                 site_id = @site_id,

//                 client_code = @client_code,

//                 emp_name = @emp_name,

//                 rank = @rank,

//                 status = @status

//               WHERE id = @id
//             `);

//           await logAction("attendance", attendanceId, "UPDATE", transaction);

//           updatedEmployees.push({
//             emp_code: row.emp_code,

//             attendance_id: attendanceId,

//             day,
//           });

//           console.log(
//             `Attendance Updated => Emp:${row.emp_code} Day:${day} ID:${attendanceId}`,
//           );
//         }

//         // =================================================
//         // INSERT ATTENDANCE
//         // =================================================
//         else {
//           const insertedAttendance = await new sql.Request(transaction)

//             // CORRECT SITE ID
//             .input("site_id", sql.Int, Number(row.site_id))

//             .input("client_code", sql.NVarChar, String(row.client_code))

//             .input("emp_name", sql.NVarChar, String(row.emp_name || ""))

//             .input("emp_code", sql.NVarChar, String(row.emp_code || ""))

//             .input("rank", sql.NVarChar, String(row.rank || ""))

//             .input("at_day", sql.Int, day)

//             .input("status", sql.NVarChar, status)

//             .input("at_month", sql.NVarChar, String(row.at_month))

//             .input("at_year", sql.NVarChar, String(row.at_year))

//             .input("created_by", sql.BigInt, Number(row.created_by))

//             .input("att_type", sql.NVarChar, String(row.att_type || ""))

//             .input("uniqueid", sql.NVarChar, uniqueid).query(`
//                 INSERT INTO attendance
//                 (
//                   site_id,
//                   client_code,
//                   emp_name,
//                   emp_code,
//                   rank,
//                   at_day,
//                   status,
//                   at_month,
//                   at_year,
//                   created_by,
//                   created_on,
//                   att_type,
//                   uniqueid
//                 )

//                 OUTPUT INSERTED.id

//                 VALUES
//                 (
//                   @site_id,
//                   @client_code,
//                   @emp_name,
//                   @emp_code,
//                   @rank,
//                   @at_day,
//                   @status,
//                   @at_month,
//                   @at_year,
//                   @created_by,
//                   CONVERT(VARCHAR(19), GETDATE(), 120),
//                   @att_type,
//                   @uniqueid
//                 )
//               `);

//           attendanceId = insertedAttendance.recordset[0].id;

//           await logAction("attendance", attendanceId, "CREATE", transaction);

//           console.log(
//             `Attendance Inserted => Emp:${row.emp_code} Day:${day} ID:${attendanceId}`,
//           );
//         }

//         // =================================================
//         // ATTENDANCE DATE
//         // =================================================

//         // const attendanceDate = new Date(
//         //   Number(row.at_year),
//         //   Number(row.at_month) - 1,
//         //   day,
//         // );
//         const attendanceDate = `${Number(row.at_year)}-${String(Number(row.at_month)).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

//         // =================================================
//         // CHECK EMP ATTENDANCE
//         // =================================================
//         console.log("attendanceDate check:", attendanceDate);
//         const existingEmpAttendance = await new sql.Request(transaction)

//           .input("emp_code", sql.NVarChar, String(row.emp_code))

//           .input("check_in_date", sql.Date, attendanceDate).query(`
//               SELECT TOP 1 id

//               FROM emp_attendance

//               WHERE emp_code = @emp_code

//                 AND CAST(check_in_date AS DATE)
//                     =
//                     CAST(@check_in_date AS DATE)

//                 AND active = 0
//             `);

//         // =================================================
//         // UPDATE EMP ATTENDANCE
//         // =================================================

//         if (existingEmpAttendance.recordset.length > 0) {
//           const empAttendanceId = existingEmpAttendance.recordset[0].id;

//           await new sql.Request(transaction)

//             .input("id", sql.BigInt, empAttendanceId)

//             // ✅ CORRECT SITE ID
//             .input("site_id", sql.Int, Number(row.site_id))

//             // ✅ CORRECT CLIENT ID = 7
//             .input("client_id", sql.BigInt, Number(row.client_id))

//             .input("site_name", sql.NVarChar, String(row.site_name || ""))

//             // ✅ CORRECT CLIENT NAME
//             .input("client_name", sql.NVarChar, String(row.client_name || ""))

//             .input("emp_name", sql.NVarChar, String(row.emp_name || ""))

//             .input("emp_status", sql.NVarChar, status)

//             // ✅ LOGIN USER NAME
//             .input(
//               "created_by_name",
//               sql.NVarChar,
//               String(row.created_by_name || "SYSTEM"),
//             ).query(`

//               UPDATE emp_attendance

//               SET

//                 site_id = @site_id,

//                 client_id = @client_id,

//                 site_name = @site_name,

//                 client_name = @client_name,

//                 emp_name = @emp_name,

//                 emp_status = @emp_status,

//                 created_by_name = @created_by_name,

//                 modified_on =
//                   CONVERT(VARCHAR(19), GETDATE(), 120)

//               WHERE id = @id

//             `);

//           await logAction(
//             "emp_attendance",
//             empAttendanceId,
//             "UPDATE",
//             transaction,
//           );

//           console.log(`EMP Attendance Updated => ID:${empAttendanceId}`);
//         }

//         // =================================================
//         // INSERT EMP ATTENDANCE
//         // =================================================
//         else {
//           const insertedEmpAttendance = await new sql.Request(transaction)

//             // EMPLOYEE ID
//             .input("employee_id", sql.BigInt, Number(row.employee_id))

//             // EMP CODE
//             .input("emp_code", sql.NVarChar, String(row.emp_code))

//             // DATE
//             .input("check_in_date", sql.Date, attendanceDate)

//             // ✅ SITE ID
//             .input("site_id", sql.Int, Number(row.site_id))

//             // ✅ CLIENT ID = 7
//             .input("client_id", sql.BigInt, Number(row.client_id))

//             // SITE NAME
//             .input("site_name", sql.NVarChar, String(row.site_name || ""))

//             // ✅ CLIENT NAME FROM new_client
//             .input("client_name", sql.NVarChar, String(row.client_name || ""))

//             // EMPLOYEE NAME
//             .input("emp_name", sql.NVarChar, String(row.emp_name || ""))

//             // STATUS
//             .input("emp_status", sql.NVarChar, status)

//             // CREATED BY ID
//             .input("created_by", sql.BigInt, Number(row.created_by))

//             // ✅ LOGIN USER NAME = ADMIN
//             .input(
//               "created_by_name",
//               sql.NVarChar,
//               String(row.created_by_name || "SYSTEM"),
//             )

//             .input("source", sql.NVarChar, "BULK_UPLOAD").query(`

//                 INSERT INTO emp_attendance
//                 (
//                   employee_id,
//                   emp_code,
//                   check_in_date,
//                   site_id,
//                   client_id,
//                   site_name,
//                   client_name,
//                   emp_name,
//                   emp_status,
//                   created_by,
//                   created_by_name,
//                   created_on,
//                   source,
//                   active
//                 )

//                 OUTPUT INSERTED.id

//                 VALUES
//                 (
//                   @employee_id,
//                   @emp_code,
//                   @check_in_date,
//                   @site_id,
//                   @client_id,
//                   @site_name,
//                   @client_name,
//                   @emp_name,
//                   @emp_status,
//                   @created_by,
//                   @created_by_name,
//                   CONVERT(VARCHAR(19), GETDATE(), 120),
//                   @source,
//                   0
//                 )

//               `);

//           const empAttendanceId = insertedEmpAttendance.recordset[0].id;

//           await logAction(
//             "emp_attendance",
//             empAttendanceId,
//             "CREATE",
//             transaction,
//           );

//           console.log(`EMP Attendance Inserted => ID:${empAttendanceId}`);
//         }
//       }

//       // ===================================================
//       // DEACTIVATE TEMP ATTENDANCE
//       // ===================================================

//       await new sql.Request(transaction).input("id", sql.Int, row.id).query(`

//           UPDATE temp_attendance

//           SET active = '0'

//           WHERE id = @id

//         `);

//       await transaction.commit();

//       // =====================================================
// // RECALCULATE EMPLOYEE LEAVES
// // =====================================================
// console.log("Recalculate Employee Leave For bulk Upload called----------------------------------")
// await recalculateEmployeeLeaves(row.employee_id, {
//   id: row.created_by,
//   name: row.created_by_name,
// });

//       console.log(`VERIFY SUCCESS: Temp ID ${row.id}`);
//     } catch (sqlError) {
//       await transaction.rollback();

//       console.error("========== VERIFY ATTENDANCE SQL ERROR ==========");

//       console.error("Temp Attendance ID:", row.id);

//       console.error("Employee Code:", row.emp_code);

//       console.error("Client ID:", row.client_id);

//       console.error("Client Code:", row.client_code);

//       console.error("Client Name:", row.client_name);

//       console.error("Site ID:", row.site_id);

//       console.error("Created By Name:", row.created_by_name);

//       console.error("SQL Error:", sqlError);

//       throw new Error(
//         `Failed at Temp Attendance ID ${row.id}: ${sqlError.message}`,
//       );
//     }
//   } catch (error) {
//     console.error("========== VERIFY ATTENDANCE ERROR ==========");

//     console.error("Temp Attendance Row:", row);

//     console.error("Error:", error.message);

//     throw error;
//   }
// };

async function insertTempAttendanceChunk(transaction, rows) {
  if (!rows.length) return;

  const table = new sql.Table("temp_attendance");

  table.create = false;

  table.columns.add("client_code", sql.NVarChar(100));
  table.columns.add("emp_name", sql.NVarChar(255));
  table.columns.add("emp_code", sql.NVarChar(100));
  table.columns.add("site_name", sql.NVarChar(255));
  table.columns.add("rank", sql.NVarChar(100));

  table.columns.add("at_month", sql.NVarChar(50));
  table.columns.add("at_year", sql.NVarChar(50));

  for (let i = 1; i <= 31; i++) {
    table.columns.add(`at_${i}`, sql.NVarChar(50));
  }

  table.columns.add("created_by", sql.BigInt);
  table.columns.add("created_on", sql.DateTime);
  table.columns.add("branch_id", sql.BigInt);
  table.columns.add("company_id", sql.BigInt);
  table.columns.add("att_type", sql.NVarChar(50));

  rows.forEach((r) => {
    table.rows.add(
      r.client_code,
      r.emp_name,
      r.emp_code,
      r.site_name,
      r.rank,
      r.at_month,
      r.at_year,

      ...Array.from({ length: 31 }, (_, idx) => r[`at_${idx + 1}`]),

      r.created_by,
      r.created_on,
      r.branch_id,
      r.company_id,
      r.att_type,
    );
  });

  await new sql.Request(transaction).bulk(table);
}

const calculateWorkedHours = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return "0:00";

  const [inHour, inMin] = checkIn.split(":").map(Number);
  const [outHour, outMin] = checkOut.split(":").map(Number);

  let checkInMinutes = inHour * 60 + inMin;
  let checkOutMinutes = outHour * 60 + outMin;

  // Handle overnight shifts (e.g. 22:00 -> 06:00)
  if (checkOutMinutes < checkInMinutes) {
    checkOutMinutes += 24 * 60;
  }

  const totalMinutes = checkOutMinutes - checkInMinutes;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}:${minutes.toString().padStart(2, "0")}`;
};

// Helper to maintain your exact mapping logic
function mapToReportFormat(e, p, date, status, approval) {
  const clean = (val) => (Array.isArray(val) ? val[0] : val);
  return {
    ClientName: clean(e.client_name) || "",
    SiteCode: e.master_client_code || e.client_code || "",
    SiteName: clean(e.site_name) || "",
    EmpCode: e.employee_code,
    EmployeeName: e.emp_full_name || "",
    JoiningDate: e.date_of_joining
      ? new Date(e.date_of_joining).toISOString().split("T")[0]
      : "",
    AttendanceDate: date,
    AttendanceStatus: status,
    InTime: p.check_in_time || "",
    InPunchedThrough: p.source || "",
    WorkingHour: parseFloat(e.master_hours || 0),
    GeoTagged: p.checkin_latitude ? "Yes" : "No",
    IsOtherDuty: "No",
    RequestDate: p.created_on
      ? new Date(p.created_on).toISOString().split("T")[0]
      : "",
    RequesterName: p.created_by_name || "",
    AttendanceApprovalStatus: approval,
  };
}
function formatLocalDate(date) {
  let year = date.getFullYear();

  let month = String(date.getMonth() + 1).padStart(2, "0");

  let day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatLocalTime(date) {
  let hour = String(date.getHours()).padStart(2, "0");

  let minute = String(date.getMinutes()).padStart(2, "0");

  return `${hour}:${minute}`;
}
