const sql = require("mssql");

const {
    poolPromise
} = require("../config/db");


// =====================================================
// HELPERS
// =====================================================

const toSafeInt = (value) => {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const n = Number(value);

    return Number.isFinite(n)
        ? Math.trunc(n)
        : null;
};


const toSafeDate = (value) => {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const date =
        value instanceof Date
            ? value
            : new Date(value);

    if (
        Number.isNaN(date.getTime())
    ) {
        return null;
    }

    return date;
};


const toSafeString = (
    value,
    fallback = null
) => {

    if (
        value === null ||
        value === undefined
    ) {
        return fallback;
    }

    const str =
        String(value).trim();

    return str === ""
        ? fallback
        : str;
};


const now = () => new Date();


// =====================================================
// MODEL
// =====================================================

const employeeLeaveModel = {


    // =================================================
    // GET CLIENT NAME
    // =================================================

    getClientName: async (
        clientId
    ) => {

        const pool =
            await poolPromise;

        const result =
            await pool.request()

                .input(
                    "client_id",
                    sql.Int,
                    toSafeInt(clientId)
                )

                .query(`

                    SELECT company_name

                    FROM new_client

                    WHERE id = @client_id

                    AND active = '0'

                `);


        if (
            !result.recordset.length
        ) {
            return "";
        }


        return result.recordset[0]
            .company_name
            ? String(
                result.recordset[0]
                    .company_name
            ).trim()
            : "";
    },


    // =================================================
    // GET SITE NAME
    // =================================================

    getSiteName: async (
        siteId
    ) => {

        const pool =
            await poolPromise;

        const result =
            await pool.request()

                .input(
                    "site_id",
                    sql.Int,
                    toSafeInt(siteId)
                )

                .query(`

                    SELECT site_name

                    FROM client_rates

                    WHERE id = @site_id

                    AND active = '0'

                `);


        if (
            !result.recordset.length
        ) {
            return "";
        }


        return result.recordset[0]
            .site_name
            ? String(
                result.recordset[0]
                    .site_name
            ).trim()
            : "";
    },


    // =================================================
    // GET USER NAME
    // =================================================

    getUserName: async (
        userId
    ) => {

        if (!userId) {
            return "NA";
        }


        const pool =
            await poolPromise;


        const result =
            await pool.request()

                .input(
                    "user_id",
                    sql.Int,
                    toSafeInt(userId)
                )

                .query(`

                    SELECT fullname

                    FROM users

                    WHERE id = @user_id

                `);


        if (
            !result.recordset.length
        ) {
            return "NA";
        }


        return result.recordset[0]
            .fullname
            ? String(
                result.recordset[0]
                    .fullname
            ).trim()
            : "NA";
    },


    // =================================================
    // GET EMPLOYEE DETAILS
    // =================================================

    getEmployeeDetails: async (
        empId
    ) => {

        const pool =
            await poolPromise;


        const result =
            await pool.request()

                .input(
                    "emp_id",
                    sql.Int,
                    toSafeInt(empId)
                )

                .query(`

                    SELECT

                        id,

                        employee_code,

                        CONCAT(

                            ISNULL(
                                first_name,
                                ''
                            ),

                            CASE

                                WHEN
                                    ISNULL(
                                        first_name,
                                        ''
                                    ) <> ''

                                    AND
                                    (
                                        ISNULL(
                                            middle_name,
                                            ''
                                        ) <> ''

                                        OR

                                        ISNULL(
                                            last_name,
                                            ''
                                        ) <> ''
                                    )

                                THEN ' '

                                ELSE ''

                            END,

                            ISNULL(
                                middle_name,
                                ''
                            ),

                            CASE

                                WHEN

                                    ISNULL(
                                        middle_name,
                                        ''
                                    ) <> ''

                                    AND

                                    ISNULL(
                                        last_name,
                                        ''
                                    ) <> ''

                                THEN ' '

                                ELSE ''

                            END,

                            ISNULL(
                                last_name,
                                ''
                            )

                        ) AS emp_full_name,

                        client_id,

                        site_id,

                        client_name,

                        site_name

                    FROM employee

                    WHERE id = @emp_id

                `);


        if (
            !result.recordset.length
        ) {
            return null;
        }


        const row =
            result.recordset[0];


        return {

            id: row.id,

            emp_id: row.id,

            emp_name:
                row.emp_full_name
                    ? String(
                        row.emp_full_name
                    ).trim()
                    : "",

            emp_code:
                row.employee_code
                    ? String(
                        row.employee_code
                    ).trim()
                    : "",

            client_id:
                row.client_id ||
                null,

            site_id:
                row.site_id ||
                null,

            client_name:
                row.client_name
                    ? String(
                        row.client_name
                    ).trim()
                    : "",

            site_name:
                row.site_name
                    ? String(
                        row.site_name
                    ).trim()
                    : ""
        };
    },


    // =================================================
    // ADD EMPLOYEE LEAVE
    // =================================================

addEmployeeLeave: async (data) => {
        const pool = await poolPromise;
        const empId = toSafeInt(data.emp_id);
        if (!empId) throw new Error("Employee ID is required");

        const employee = await employeeLeaveModel.getEmployeeDetails(empId);
        if (!employee) throw new Error(`Employee not found for ID: ${empId}`);

        const empCode = employee.emp_code || data.emp_code || data.employee_code || data.employeeCode || "";
        const empName = employee.emp_name || data.emp_name || data.employee_name || data.employeeName || data.name || "";
        const clientId = employee.client_id || toSafeInt(data.client_id);
        const siteId = employee.site_id || toSafeInt(data.site_id);
        let clientName = employee.client_name || data.client_name || "";
        let siteName = employee.site_name || data.site_name || "";

        if (!clientName && clientId) clientName = await employeeLeaveModel.getClientName(clientId);
        if (!siteName && siteId) siteName = await employeeLeaveModel.getSiteName(siteId);

        const fromDate = toSafeDate(data.from_date);
        const toDate = toSafeDate(data.to_date);
        if (!fromDate) throw new Error("Valid from_date is required");
        if (!toDate) throw new Error("Valid to_date is required");
        if (toDate < fromDate) throw new Error("To date cannot be before From date");

        const result = await pool.request()
            .input("emp_id", sql.Int, empId)
            .input("emp_code", sql.VarChar(100), toSafeString(empCode))
            .input("emp_name", sql.VarChar(255), toSafeString(empName))
            .input("from_date", sql.Date, fromDate)
            .input("to_date", sql.Date, toDate)
            .input("from_time", sql.VarChar(50), toSafeString(data.from_time))
            .input("to_time", sql.VarChar(50), toSafeString(data.to_time))
            .input("type", sql.VarChar(100), toSafeString(data.type))
            .input("reason", sql.VarChar(1000), toSafeString(data.reason))
            .input("status", sql.VarChar(50), toSafeString(data.status, "Pending"))
            .input("site_id", sql.Int, siteId)
            .input("client_id", sql.Int, clientId)
            .input("site_name", sql.VarChar(255), toSafeString(siteName))
            .input("client_name", sql.VarChar(255), toSafeString(clientName))
            .input("created_by", sql.Int, toSafeInt(data.created_by))
            .input("created_by_name", sql.VarChar(255), toSafeString(data.created_by_name, "NA"))
            .input("created_on", sql.DateTime, toSafeDate(data.created_on) || now())
            .input("active", sql.VarChar(10), toSafeString(data.active, "0"))
            .query(`
                INSERT INTO emp_leaves
                (emp_id, emp_code, emp_name, from_date, to_date, from_time, to_time,
                 type, reason, status, site_id, client_id, site_name, client_name,
                 created_by, created_by_name, created_on, active)
                OUTPUT INSERTED.id
                VALUES
                (@emp_id, @emp_code, @emp_name, @from_date, @to_date, @from_time, @to_time,
                 @type, @reason, @status, @site_id, @client_id, @site_name, @client_name,
                 @created_by, @created_by_name, @created_on, @active)
            `);

        return result.recordset.length ? Number(result.recordset[0].id) : 0;
    },

getLeaveById: async (leaveId) => {

    const pool = await poolPromise;

    const safeId = Number(leaveId);

    console.log("====================================");
    console.log("GET LEAVE BY ID");
    console.log("Original leaveId:", leaveId);
    console.log("Original type:", typeof leaveId);
    console.log("safeId:", safeId);
    console.log("safeId type:", typeof safeId);
    console.log("====================================");

    if (!Number.isInteger(safeId) || safeId <= 0) {

        console.log("❌ INVALID LEAVE ID");

        return null;
    }

    // ============================================
    // FIRST: CHECK WITHOUT ACTIVE CONDITION
    // ============================================

    const checkResult =
        await pool.request()

            .input(
                "leave_id",
                sql.Int,
                safeId
            )

            .query(`

                SELECT
                    id,
                    emp_code,
                    emp_name,
                    type,
                    status,
                    active

                FROM emp_leaves

                WHERE id = @leave_id

            `);

    console.log(
        "CHECK WITHOUT ACTIVE:",
        checkResult.recordset
    );


    // ============================================
    // SECOND: GET ONLY ACTIVE = 0
    // ============================================

    const result =
        await pool.request()

            .input(
                "leave_id",
                sql.Int,
                safeId
            )

            .query(`

                SELECT TOP 1

                    id,
                    emp_id,
                    emp_code,
                    emp_name,

                    site_id,
                    site_name,

                    client_id,
                    client_name,

                    from_date,
                    to_date,

                    from_time,
                    to_time,

                    type,
                    reason,
                    status,

                    created_by,
                    created_by_name,
                    created_on,

                    approved_by,
                    approved_by_name,
                    approved_on,

                    modified_by,
                    modified_by_name,
                    modified_on,

                    rejected_by,
                    rejected_by_name,
                    rejected_on,

                    active

                FROM emp_leaves

                WHERE id = @leave_id

                AND active = 0

            `);


    console.log(
        "FINAL GET LEAVE RESULT:",
        result.recordset
    );


    if (!result.recordset.length) {

        console.log(
            "❌ LEAVE NOT FOUND WITH active = 0"
        );

        return null;
    }


    console.log(
        "✅ LEAVE FOUND:",
        result.recordset[0]
    );


    return result.recordset[0];

},

    // =================================================
    // UPDATE LEAVE
    // =================================================

    updateEmployeeLeave: async (
        data
    ) => {

        const pool =
            await poolPromise;


        const modifiedOn =
            toSafeDate(
                data.modified_on
            ) || now();


        const result =
            await pool.request()

                .input(
                    "leave_id",
                    sql.Int,
                    toSafeInt(
                        data.leave_id
                    )
                )

                .input(
                    "emp_id",
                    sql.Int,
                    toSafeInt(
                        data.emp_id
                    )
                )

                .input(
                    "emp_code",
                    sql.VarChar(100),
                    toSafeString(
                        data.emp_code
                    )
                )

                .input(
                    "emp_name",
                    sql.VarChar(255),
                    toSafeString(
                        data.emp_name
                    )
                )

                .input(
                    "from_date",
                    sql.Date,
                    toSafeDate(
                        data.from_date
                    )
                )

                .input(
                    "to_date",
                    sql.Date,
                    toSafeDate(
                        data.to_date
                    )
                )

                .input(
                    "from_time",
                    sql.VarChar(50),
                    toSafeString(
                        data.from_time
                    )
                )

                .input(
                    "to_time",
                    sql.VarChar(50),
                    toSafeString(
                        data.to_time
                    )
                )

                .input(
                    "type",
                    sql.VarChar(100),
                    toSafeString(
                        data.type
                    )
                )

                .input(
                    "reason",
                    sql.VarChar(1000),
                    toSafeString(
                        data.reason
                    )
                )

                .input(
                    "modified_by",
                    sql.Int,
                    toSafeInt(
                        data.modified_by
                    )
                )

                .input(
                    "modified_by_name",
                    sql.VarChar(255),
                    toSafeString(
                        data.modified_by_name,
                        "NA"
                    )
                )

                .input(
                    "modified_on",
                    sql.DateTime,
                    modifiedOn
                )

                .query(`

                    UPDATE emp_leaves

                    SET

                        emp_id = @emp_id,

                        emp_code = @emp_code,

                        emp_name = @emp_name,

                        from_date = @from_date,

                        to_date = @to_date,

                        from_time = @from_time,

                        to_time = @to_time,

                        type = @type,

                        reason = @reason,

                        modified_by =
                            @modified_by,

                        modified_by_name =
                            @modified_by_name,

                        modified_on =
                            @modified_on

                    WHERE id = @leave_id

                `);


        return (
            result.rowsAffected[0] ||
            0
        );
    },


    // =================================================
    // APPROVE LEAVE
    // =================================================
approveLeaveAndDeductBalance: async ({
        leaveId, empCode, leaveDays, leaveDates, userId, userName, approvedOn
    }) => {
        const pool = await poolPromise;
        const transaction = new sql.Transaction(pool);
        try {
            await transaction.begin();
            const safeLeaveId = toSafeInt(leaveId);
            const days = Number(leaveDays);
            if (!safeLeaveId) throw new Error("Leave ID is required");
            if (!Number.isFinite(days) || days <= 0) throw new Error("Invalid leave days");

            const dates = Array.isArray(leaveDates) ? leaveDates.filter(Boolean) : [];
            const requiredRows = Math.max(1, Math.ceil(days));
            if (dates.length !== requiredRows) throw new Error(`Invalid leave dates. Required: ${requiredRows}, Received: ${dates.length}`);

            const leaveResult = await transaction.request()
                .input("leave_id", sql.Int, safeLeaveId)
                .query(`SELECT TOP 1 id, emp_id, emp_code, emp_name, site_id, site_name, status, active FROM emp_leaves WITH (UPDLOCK, ROWLOCK) WHERE id=@leave_id`);
            if (!leaveResult.recordset.length) throw new Error("Leave not found");
            const leave = leaveResult.recordset[0];
            const status = String(leave.status || "").trim().toLowerCase();
            if (Number(leave.active) !== 0) throw new Error("Inactive leave cannot be approved");
            if (status === "approved") throw new Error("Leave is already approved");
            if (status === "rejected") throw new Error("Rejected leave cannot be approved");

            const finalEmpCode = leave.emp_code || empCode || null;
            const availableResult = await transaction.request()
                .input("emp_id", sql.Int, toSafeInt(leave.emp_id))
                .input("emp_code", sql.VarChar(100), finalEmpCode)
                .query(`
                    SELECT id, emp_id, emp_code, emp_name, site_id, site_name, last_date,
                           leave_count, leave_from_to, status, active, created_by, created_at,
                           modified_by, modified_at, remaining_present_day
                    FROM emp_leave_tbl WITH (UPDLOCK, ROWLOCK)
                    WHERE active=0 AND status='Available'
                      AND ((@emp_id IS NOT NULL AND emp_id=@emp_id) OR (@emp_id IS NULL AND emp_code=@emp_code))
                    ORDER BY id ASC
                `);
            if (availableResult.recordset.length < requiredRows) {
                throw new Error(`Insufficient earned leave. Available: ${availableResult.recordset.length}, Required: ${requiredRows}`);
            }

            const approvalTime = approvedOn || new Date();
            const earnedRows = availableResult.recordset.slice(0, requiredRows);

            for (let i=0; i<earnedRows.length; i++) {
                const earned = earnedRows[i];
                const leaveDate = toSafeDate(dates[i]);
                if (!leaveDate) throw new Error(`Invalid leave date at position ${i+1}`);

                const updated = await transaction.request()
                    .input("id", sql.Int, Number(earned.id))
                    .input("leave_from_to", sql.Date, leaveDate)
                    .input("modified_by", sql.VarChar(100), userId != null ? String(userId) : null)
                    .input("modified_at", sql.DateTime, approvalTime)
                    .query(`UPDATE emp_leave_tbl SET status='Used', active=1, leave_from_to=@leave_from_to, modified_by=@modified_by, modified_at=@modified_at WHERE id=@id AND active=0 AND status='Available'`);
                if (updated.rowsAffected[0] !== 1) throw new Error(`Failed to consume earned leave row ${earned.id}`);

                await transaction.request()
                    .input("emp_leave_tbl_id", sql.Int, Number(earned.id))
                    .input("emp_id", sql.VarChar(100), earned.emp_id != null ? String(earned.emp_id) : null)
                    .input("emp_code", sql.VarChar(100), earned.emp_code || finalEmpCode)
                    .input("emp_name", sql.VarChar(255), earned.emp_name || leave.emp_name || null)
                    .input("site_id", sql.VarChar(100), earned.site_id != null ? String(earned.site_id) : (leave.site_id != null ? String(leave.site_id) : null))
                    .input("site_name", sql.VarChar(255), earned.site_name || leave.site_name || null)
                    .input("last_date", sql.Date, earned.last_date || null)
                    .input("leave_count", sql.Int, Number(earned.leave_count || 1))
                    .input("leave_from_to", sql.Date, leaveDate)
                    .input("status", sql.VarChar(20), "Used")
                    .input("active", sql.Bit, 1)
                    .input("remaining_present_day", sql.Int, earned.remaining_present_day != null ? Number(earned.remaining_present_day) : null)
                    .input("created_by", sql.VarChar(100), earned.created_by != null ? String(earned.created_by) : null)
                    .input("created_at", sql.DateTime, earned.created_at || null)
                    .input("modified_by", sql.VarChar(100), userId != null ? String(userId) : null)
                    .input("modified_at", sql.DateTime, approvalTime)
                    .input("log_action", sql.VarChar(50), "Used")
                    .query(`
                        INSERT INTO emp_leave_log_tbl
                        (emp_leave_tbl_id, emp_id, emp_code, emp_name, site_id, site_name, last_date,
                         leave_count, leave_from_to, status, active, remaining_present_day, created_by,
                         created_at, modified_by, modified_at, log_action)
                        VALUES
                        (@emp_leave_tbl_id, @emp_id, @emp_code, @emp_name, @site_id, @site_name, @last_date,
                         @leave_count, @leave_from_to, @status, @active, @remaining_present_day, @created_by,
                         @created_at, @modified_by, @modified_at, @log_action)
                    `);
            }

            const leaveUpdate = await transaction.request()
                .input("leave_id", sql.Int, safeLeaveId)
                .input("approved_by", sql.Int, toSafeInt(userId))
                .input("approved_by_name", sql.VarChar(255), userName || "NA")
                .input("approved_on", sql.DateTime, approvalTime)
                .query(`UPDATE emp_leaves SET status='Approved', approved_by=@approved_by, approved_by_name=@approved_by_name, approved_on=@approved_on WHERE id=@leave_id AND active=0 AND ISNULL(status,'Pending') NOT IN ('Approved','Rejected')`);
            if (leaveUpdate.rowsAffected[0] !== 1) throw new Error("Leave status update failed");

            await transaction.commit();
            return true;
        } catch (error) {
            try { await transaction.rollback(); } catch (e) { console.error("ROLLBACK ERROR:", e); }
            throw error;
        }
    },

rejectLeave: async (
        leaveId,
        userId,
        rejecterName,
        rejectedOn
    ) => {

        const pool =
            await poolPromise;


        const safeRejectedOn =
            toSafeDate(
                rejectedOn
            ) || now();


        const result =
            await pool.request()

                .input(
                    "leave_id",
                    sql.Int,
                    toSafeInt(
                        leaveId
                    )
                )

                .input(
                    "user_id",
                    sql.Int,
                    toSafeInt(
                        userId
                    )
                )

                .input(
                    "rejecter_name",
                    sql.VarChar(255),
                    toSafeString(
                        rejecterName,
                        "NA"
                    )
                )

                .input(
                    "rejected_on",
                    sql.DateTime,
                    safeRejectedOn
                )

                .query(`

                    UPDATE emp_leaves

                    SET

                        status = 'Rejected',

                        rejected_by =
                            @user_id,

                        rejected_by_name =
                            @rejecter_name,

                        rejected_on =
                            @rejected_on

                    WHERE id = @leave_id

                `);


        return (
            result.rowsAffected[0] ||
            0
        );
    },


    // =================================================
    // GET EMPLOYEE CODE
    // =================================================

    getEmployeeCode: async (
        empId
    ) => {

        const pool =
            await poolPromise;


        const result =
            await pool.request()

                .input(
                    "emp_id",
                    sql.Int,
                    toSafeInt(empId)
                )

                .query(`

                    SELECT employee_code

                    FROM employee

                    WHERE id = @emp_id

                `);


        if (
            !result.recordset.length
        ) {
            return null;
        }


        return result.recordset[0]
            .employee_code;
    },


    // =================================================
    // LOG EMPLOYEE LEAVE
    // COMPLETE SNAPSHOT
    // =================================================

    logEmpLeave: async (
        leaveId,
        userId,
        userName,
        action
    ) => {

        const pool =
            await poolPromise;


        // ---------------------------------------------
        // GET CURRENT DATA
        // ---------------------------------------------

        const leaveResult =
            await pool.request()

                .input(
                    "leave_id",
                    sql.Int,
                    toSafeInt(
                        leaveId
                    )
                )

                .query(`

                    SELECT

                        id,

                        emp_id,
                        emp_code,
                        emp_name,

                        site_id,
                        site_name,

                        client_id,
                        client_name,

                        from_date,
                        to_date,

                        from_time,
                        to_time,

                        type,
                        reason,
                        status,

                        created_by,
                        created_by_name,
                        created_on,

                        approved_by,
                        approved_by_name,
                        approved_on,

                        modified_by,
                        modified_by_name,
                        modified_on,

                        rejected_by,
                        rejected_by_name,
                        rejected_on,

                        active

                    FROM emp_leaves

                    WHERE id = @leave_id

                `);


        if (
            !leaveResult.recordset.length
        ) {

            throw new Error(
                `Leave not found for log: ${leaveId}`
            );
        }


        const leave =
            leaveResult.recordset[0];


        // ---------------------------------------------
        // SAFE DATES
        // ---------------------------------------------

        const createdOn =
            toSafeDate(
                leave.created_on
            );


        const approvedOn =
            toSafeDate(
                leave.approved_on
            );


        const modifiedOn =
            toSafeDate(
                leave.modified_on
            );


        const rejectedOn =
            toSafeDate(
                leave.rejected_on
            );


        const actionOn =
            now();


        // ---------------------------------------------
        // INSERT LOG
        // ---------------------------------------------

        await pool.request()

            .input(
                "leave_id",
                sql.Int,
                toSafeInt(
                    leave.id
                )
            )

            .input(
                "emp_id",
                sql.Int,
                toSafeInt(
                    leave.emp_id
                )
            )

            .input(
                "emp_code",
                sql.VarChar(100),
                leave.emp_code
            )

            .input(
                "emp_name",
                sql.VarChar(255),
                leave.emp_name
            )

            .input(
                "site_id",
                sql.Int,
                toSafeInt(
                    leave.site_id
                )
            )

            .input(
                "site_name",
                sql.VarChar(255),
                leave.site_name
            )

            .input(
                "client_id",
                sql.Int,
                toSafeInt(
                    leave.client_id
                )
            )

            .input(
                "client_name",
                sql.VarChar(255),
                leave.client_name
            )

            .input(
                "from_date",
                sql.Date,
                toSafeDate(
                    leave.from_date
                )
            )

            .input(
                "to_date",
                sql.Date,
                toSafeDate(
                    leave.to_date
                )
            )

            .input(
                "from_time",
                sql.VarChar(50),
                leave.from_time
            )

            .input(
                "to_time",
                sql.VarChar(50),
                leave.to_time
            )

            .input(
                "type",
                sql.VarChar(100),
                leave.type
            )

            .input(
                "reason",
                sql.VarChar(1000),
                leave.reason
            )

            .input(
                "status",
                sql.VarChar(50),
                leave.status
            )

            .input(
                "created_by",
                sql.Int,
                toSafeInt(
                    leave.created_by
                )
            )

            .input(
                "created_by_name",
                sql.VarChar(255),
                leave.created_by_name ||
                "NA"
            )

            .input(
                "created_on",
                sql.DateTime,
                createdOn
            )

            .input(
                "approved_by",
                sql.Int,
                toSafeInt(
                    leave.approved_by
                )
            )

            .input(
                "approved_by_name",
                sql.VarChar(255),
                leave.approved_by_name
            )

            .input(
                "approved_on",
                sql.DateTime,
                approvedOn
            )

            .input(
                "modified_by",
                sql.Int,
                toSafeInt(
                    leave.modified_by
                )
            )

            .input(
                "modified_by_name",
                sql.VarChar(255),
                leave.modified_by_name
            )

            .input(
                "modified_on",
                sql.DateTime,
                modifiedOn
            )

            .input(
                "rejected_by",
                sql.Int,
                toSafeInt(
                    leave.rejected_by
                )
            )

            .input(
                "rejected_by_name",
                sql.VarChar(255),
                leave.rejected_by_name
            )

            .input(
                "rejected_on",
                sql.DateTime,
                rejectedOn
            )

            .input(
                "active",
                sql.VarChar(10),
                leave.active
            )

            .input(
                "action_by",
                sql.Int,
                toSafeInt(
                    userId
                )
            )

            .input(
                "action_by_name",
                sql.VarChar(255),
                userName || "NA"
            )

            .input(
                "action",
                sql.VarChar(100),
                action || "Unknown"
            )

            .input(
                "action_on",
                sql.DateTime,
                actionOn
            )

            .query(`

                INSERT INTO emp_leaves_log
                (

                    leave_id,

                    emp_id,
                    emp_code,
                    emp_name,

                    site_id,
                    site_name,

                    client_id,
                    client_name,

                    from_date,
                    to_date,

                    from_time,
                    to_time,

                    type,
                    reason,
                    status,

                    created_by,
                    created_by_name,
                    created_on,

                    approved_by,
                    approved_by_name,
                    approved_on,

                    modified_by,
                    modified_by_name,
                    modified_on,

                    rejected_by,
                    rejected_by_name,
                    rejected_on,

                    active,

                   
                    action

                )

                VALUES
                (

                    @leave_id,

                    @emp_id,
                    @emp_code,
                    @emp_name,

                    @site_id,
                    @site_name,

                    @client_id,
                    @client_name,

                    @from_date,
                    @to_date,

                    @from_time,
                    @to_time,

                    @type,
                    @reason,
                    @status,

                    @created_by,
                    @created_by_name,
                    @created_on,

                    @approved_by,
                    @approved_by_name,
                    @approved_on,

                    @modified_by,
                    @modified_by_name,
                    @modified_on,

                    @rejected_by,
                    @rejected_by_name,
                    @rejected_on,

                    @active,

                
                    @action

                )

            `);


        return true;
    },


    // =================================================
    // GET EMPLOYEE LEAVES
    // =================================================

    getEmployeeLeaves: async ({
        empId,
        status = "All",
        search = "",
        limit = 50,
        offset = 0
    }) => {

        const pool =
            await poolPromise;


        let query = `

            SELECT

                id,

                emp_id,
                emp_code,
                emp_name,

                site_id,
                site_name,

                client_id,
                client_name,

                from_date,
                to_date,

                from_time,
                to_time,

                type,
                reason,
                status,

                created_by,
                created_by_name,
                created_on,

                approved_by,
                approved_by_name,
                approved_on,

                modified_by,
                modified_by_name,
                modified_on,

                rejected_by,
                rejected_by_name,
                rejected_on

            FROM emp_leaves

            WHERE

                emp_id = @emp_id

                AND active = '0'

        `;


        const request =
            pool.request()

                .input(
                    "emp_id",
                    sql.Int,
                    toSafeInt(empId)
                );


        if (
            status &&
            String(status)
                .toLowerCase() !==
            "all"
        ) {

            query += `
                AND status = @status
            `;

            request.input(
                "status",
                sql.VarChar(50),
                status
            );
        }


        if (search) {

            query += `

                AND
                (

                    type LIKE @search

                    OR status LIKE @search

                    OR reason LIKE @search

                    OR emp_name LIKE @search

                    OR emp_code LIKE @search

                )

            `;

            request.input(
                "search",
                sql.VarChar(500),
                `%${search}%`
            );
        }


        query += `

            ORDER BY created_on DESC

            OFFSET @offset ROWS

            FETCH NEXT @limit ROWS ONLY

        `;


        request.input(
            "offset",
            sql.Int,
            Math.max(
                0,
                Number(offset) || 0
            )
        );


        request.input(
            "limit",
            sql.Int,
            Math.max(
                1,
                Number(limit) || 50
            )
        );


        const result =
            await request.query(
                query
            );


        return result.recordset;
    },


    // =================================================
    // ADMIN ALL LEAVES
    // NO CLIENT / SITE REQUIRED
    // =================================================

getAdminAllEmployeeLeaves: async ({
    status = "All",
    search = "",
    limit = 100,
    offset = 0,
    userId = null,
    isAdmin = false
}) => {

    try {

        const pool =
            await poolPromise;


        // =============================================
        // LOGGED-IN USER EMPLOYEE ID
        // =============================================

        let userEmpId = null;


        // =============================================
        // NON ADMIN USER
        // =============================================

        if (!isAdmin) {

            // -----------------------------------------
            // USER ID REQUIRED
            // -----------------------------------------

            if (

                !userId ||

                Number(userId) <= 0

            ) {

                throw new Error(
                    "User ID is required"
                );

            }


            console.log(
                "========================================"
            );

            console.log(
                "GETTING EMP ID FROM USERS TABLE"
            );

            console.log(
                "USER ID:",
                userId
            );

            console.log(
                "========================================"
            );


            // =============================================
            // GET emp_id FROM users TABLE
            // =============================================

            const userResult =
                await pool
                    .request()

                    .input(
                        "userId",
                        sql.Int,
                        Number(userId)
                    )

                    .query(`

                        SELECT TOP 1

                            id,
                            emp_id

                        FROM users

                        WHERE id = @userId

                    `);


            console.log(
                "USER TABLE RESULT:",
                userResult.recordset
            );


            // =============================================
            // USER NOT FOUND
            // =============================================

            if (

                !userResult.recordset ||

                userResult.recordset.length === 0

            ) {

                throw new Error(
                    "Logged-in user not found in users table"
                );

            }


            // =============================================
            // GET emp_id
            // =============================================

            const user =
                userResult.recordset[0];


            userEmpId =
                user.emp_id;


            console.log(
                "EMP ID FROM USERS TABLE:",
                userEmpId
            );


            // =============================================
            // EMP ID VALIDATION
            // =============================================

            if (

                userEmpId === null ||

                userEmpId === undefined ||

                userEmpId === "" ||

                Number(userEmpId) <= 0

            ) {

                throw new Error(
                    "Employee ID not found in users table"
                );

            }


            // =============================================
            // CONVERT TO NUMBER
            // =============================================

            userEmpId =
                Number(userEmpId);


            console.log(
                "FINAL EMPLOYEE ID:",
                userEmpId
            );

        }


        // =============================================
        // BASE QUERY
        // =============================================

        let query = `

            SELECT

                id,

                emp_id,
                emp_code,
                emp_name,

                site_id,
                site_name,

                client_id,
                client_name,

                from_date,
                to_date,

                from_time,
                to_time,

                type,
                reason,
                status,

                created_by,
                created_by_name,
                created_on,

                approved_by,
                approved_by_name,
                approved_on,

                modified_by,
                modified_by_name,
                modified_on,

                rejected_by,
                rejected_by_name,
                rejected_on,

                active

            FROM emp_leaves

            WHERE active = '0'

        `;


        // =============================================
        // CREATE REQUEST
        // =============================================

        const request =
            pool.request();


        // =============================================
        // NON ADMIN FILTER
        //
        // emp_leaves.emp_id
        // =
        // users.emp_id
        // =============================================

        if (!isAdmin) {

            query += `

                AND emp_id = @userEmpId

            `;


            request.input(

                "userEmpId",

                sql.Int,

                userEmpId

            );


            console.log(
                "FILTER EMPLOYEE ID:",
                userEmpId
            );

        }


        // =============================================
        // STATUS FILTER
        // =============================================

        if (

            status &&

            String(status)
                .trim()
                .toLowerCase() !== "all"

        ) {

            query += `

                AND
                UPPER(
                    LTRIM(
                        RTRIM(status)
                    )
                )
                =
                UPPER(@status)

            `;


            request.input(

                "status",

                sql.VarChar(50),

                String(status).trim()

            );

        }


        // =============================================
        // SEARCH FILTER
        // =============================================

        if (

            search &&

            String(search).trim()

        ) {

            query += `

                AND
                (

                    type LIKE @search

                    OR status LIKE @search

                    OR reason LIKE @search

                    OR emp_name LIKE @search

                    OR emp_code LIKE @search

                    OR client_name LIKE @search

                    OR site_name LIKE @search

                    OR created_by_name LIKE @search

                    OR approved_by_name LIKE @search

                    OR rejected_by_name LIKE @search

                )

            `;


            request.input(

                "search",

                sql.VarChar(500),

                `%${String(search).trim()}%`

            );

        }


        // =============================================
        // SAFE PAGINATION
        // =============================================

        const safeOffset =
            Math.max(
                0,
                Number(offset) || 0
            );


        const safeLimit =
            Math.max(
                1,
                Number(limit) || 100
            );


        // =============================================
        // PAGINATION
        // =============================================

        query += `

            ORDER BY

                created_on DESC,

                id DESC

            OFFSET @offset ROWS

            FETCH NEXT @limit ROWS ONLY

        `;


        request.input(

            "offset",

            sql.Int,

            safeOffset

        );


        request.input(

            "limit",

            sql.Int,

            safeLimit

        );


        // =============================================
        // DEBUG
        // =============================================

        console.log(
            "========================================"
        );

        console.log(
            "GET LEAVES MODEL"
        );

        console.log(
            "USER ID:",
            userId
        );

        console.log(
            "USER EMP ID:",
            userEmpId
        );

        console.log(
            "IS ADMIN:",
            isAdmin
        );

        console.log(
            "STATUS:",
            status
        );

        console.log(
            "SEARCH:",
            search
        );

        console.log(
            "FINAL QUERY:"
        );

        console.log(
            query
        );

        console.log(
            "========================================"
        );


        // =============================================
        // EXECUTE QUERY
        // =============================================

        const result =
            await request.query(
                query
            );


        console.log(
            "TOTAL LEAVES FOUND:",
            result.recordset?.length || 0
        );


        return (
            result.recordset || []
        );


    } catch (error) {

        console.error(
            "========================================"
        );

        console.error(
            "GET LEAVES MODEL ERROR:"
        );

        console.error(
            error
        );

        console.error(
            "========================================"
        );


        throw error;

    }

},
getUserEmpCode: async (userId) => {

    const pool = await poolPromise;

    const result = await pool.request()

        .input(
            "user_id",
            sql.Int,
            userId
        )

        .query(`
            SELECT
                id,
                emp_code
            FROM users
            WHERE id = @user_id
        `);

    return result.recordset[0] || null;
},
    // =================================================
    // DELETE / SOFT DELETE
    // =================================================
getEmployeeLeaveBalance: async (empCode, empId = null) => {
        const pool = await poolPromise;
        const request = pool.request();
        const safeEmpId = toSafeInt(empId);
        let condition;
        if (safeEmpId) {
            request.input("emp_id", sql.Int, safeEmpId);
            condition = "emp_id=@emp_id";
        } else if (empCode) {
            request.input("emp_code", sql.VarChar(100), String(empCode));
            condition = "emp_code=@emp_code";
        } else {
            throw new Error("Employee ID or Employee Code is required");
        }
        const result = await request.query(`SELECT COUNT(*) AS available_leave FROM emp_leave_tbl WHERE ${condition} AND active=0 AND status='Available'`);
        return { emp_id: safeEmpId, emp_code: empCode || null, available_leave: Number(result.recordset?.[0]?.available_leave || 0) };
    },

deleteLeave: async (
        leaveId,
        userId,
        userName
    ) => {

        const pool =
            await poolPromise;


        const result =
            await pool.request()

                .input(
                    "leave_id",
                    sql.Int,
                    toSafeInt(
                        leaveId
                    )
                )

                .query(`

                    UPDATE emp_leaves

                    SET active = '1'

                    WHERE id = @leave_id

                `);


        if (
            result.rowsAffected[0] > 0
        ) {

            try {

                await employeeLeaveModel
                    .logEmpLeave(
                        leaveId,
                        userId,
                        userName,
                        "Deleted"
                    );

            } catch (logError) {

                console.error(
                    "DELETE LOG ERROR:",
                    logError
                );

            }
        }


        return (
            result.rowsAffected[0] ||
            0
        );
    }

};


module.exports =
    employeeLeaveModel;