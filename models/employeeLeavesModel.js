const sql = require("mssql");
const { poolPromise } = require("../config/db");


// =====================================================
// GET ACTUAL SITE
//
// Frontend site_id
//        ↓
// client_rates.new_site_id
//        ↓
// client_rates.id
//
// employee.site_id = client_rates.id
// leave_configuration.site_id = client_rates.id
// =====================================================

const getActualSiteId = async (siteId) => {

    const pool = await poolPromise;


    const result = await pool.request()

        .input(
            "new_site_id",
            sql.VarChar(100),
            String(siteId)
        )

        .query(`
            SELECT TOP 1

                id,
                new_site_id,
                site_name

            FROM client_rates

            WHERE CAST(new_site_id AS VARCHAR(100))
                  = @new_site_id
        `);


    if (!result.recordset.length) {

        throw new Error(
            `Site not found for new_site_id: ${siteId}`
        );
    }


    return result.recordset[0];
};



// =====================================================
// GET EMPLOYEES BY SITE
// =====================================================

const getEmployeesBySite = async (siteId) => {

    const pool = await poolPromise;


    console.log("==========================================");
    console.log("GET EMPLOYEES BY SITE");
    console.log("FRONTEND SITE ID:", siteId);
    console.log("==========================================");


    // =================================================
    // GET ACTUAL SITE
    // =================================================

    const siteInfo =
        await getActualSiteId(siteId);


    const actualSiteId =
        siteInfo.id;


    console.log(
        "FRONTEND new_site_id:",
        siteId
    );

    console.log(
        "ACTUAL client_rates.id:",
        actualSiteId
    );


    // =================================================
    // GET EMPLOYEES
    // =================================================

    const employeeResult =
        await pool.request()

            .input(
                "site_id",
                sql.BigInt,
                Number(actualSiteId)
            )

            .query(`
                SELECT

                    e.id,

                    e.employee_code,

                    e.site_id,

                    e.site_name

                FROM employee e

                WHERE e.site_id = @site_id

                  AND ISNULL(e.active, 0) = 0

                  AND e.employee_code IS NOT NULL

                ORDER BY e.employee_code
            `);


    console.log(
        "EMPLOYEES FOUND:",
        employeeResult.recordset.length
    );


    return employeeResult.recordset;
};



// =====================================================
// GET SITE LEAVE CONFIGURATION
//
// leave_configuration table
//
// frontend site_id
//       ↓
// client_rates.new_site_id
//       ↓
// client_rates.id
// =====================================================

const getSiteLeaveConfiguration = async (siteId) => {

    const pool = await poolPromise;


    console.log("==========================================");
    console.log("GET LEAVE CONFIGURATION");
    console.log("FRONTEND SITE ID:", siteId);
    console.log("==========================================");


    // =================================================
    // GET ACTUAL SITE
    // =================================================

    const siteInfo =
        await getActualSiteId(siteId);


    const actualSiteId =
        siteInfo.id;


    // =================================================
    // GET CONFIGURATION
    // =================================================

    const result =
        await pool.request()

            .input(
                "site_id",
                sql.BigInt,
                Number(actualSiteId)
            )

            .query(`
                SELECT

                    id,
                    site_id,
                    financial_year,
                    from_year,
                    to_year,
                    leave_type,
                    total_leaves,
                    active,

                    created_by,
                    created_by_name,
                    created_on,

                    modified_by,
                    modified_by_name,
                    modified_on,

                    source

                FROM leave_configuration

                WHERE site_id = @site_id

                  AND active = 0

                ORDER BY

                    from_year ASC,
                    leave_type ASC
            `);


    console.log(
        "CONFIGURATION FOUND:",
        result.recordset.length
    );


    return {

        site: {

            id: siteInfo.id,

            new_site_id: siteInfo.new_site_id,

            site_name: siteInfo.site_name

        },

        configurations:
            result.recordset

    };
};



// =====================================================
// SAVE / UPDATE LEAVE CONFIGURATION
//
// leave_configuration table
// =====================================================

const saveLeaveConfiguration = async ({
    siteId,
    financialYear,
    fromYear,
    toYear,
    leaveType,
    totalLeaves,
    createdBy
}) => {

    const pool = await poolPromise;


    const total =
        Number(totalLeaves);


    // =================================================
    // VALIDATION
    // =================================================

    if (
        !financialYear ||
        !leaveType
    ) {

        throw new Error(
            "financialYear and leaveType are required"
        );
    }


    if (
        !Number.isInteger(Number(fromYear)) ||
        !Number.isInteger(Number(toYear))
    ) {

        throw new Error(
            "Invalid fromYear or toYear"
        );
    }


    if (
        !Number.isFinite(total) ||
        total < 0
    ) {

        throw new Error(
            "Invalid total leaves"
        );
    }


    // =================================================
    // CHECK EXISTING
    //
    // Same:
    // site
    // financial year
    // leave type
    // active = 0
    // =================================================

    const existing =
        await pool.request()

            .input(
                "site_id",
                sql.BigInt,
                Number(siteId)
            )

            .input(
                "financial_year",
                sql.NVarChar(20),
                String(financialYear)
            )

            .input(
                "leave_type",
                sql.NVarChar(20),
                String(leaveType)
            )

            .query(`
                SELECT TOP 1

                    id

                FROM leave_configuration

                WHERE site_id = @site_id

                  AND financial_year = @financial_year

                  AND leave_type = @leave_type

                  AND active = 0
            `);


    // =================================================
    // UPDATE EXISTING
    // =================================================

    if (existing.recordset.length) {

        const id =
            existing.recordset[0].id;


        await pool.request()

            .input(
                "id",
                sql.BigInt,
                Number(id)
            )

            .input(
                "from_year",
                sql.Int,
                Number(fromYear)
            )

            .input(
                "to_year",
                sql.Int,
                Number(toYear)
            )

            .input(
                "total_leaves",
                sql.Decimal(10, 2),
                total
            )

            .input(
                "modified_by",
                sql.NVarChar(100),
                String(createdBy || "")
            )

            .query(`
                UPDATE leave_configuration

                SET

                    from_year = @from_year,

                    to_year = @to_year,

                    total_leaves = @total_leaves,

                    modified_by = @modified_by,

                    modified_on = GETDATE()

                WHERE id = @id
            `);


        console.log(
            "LEAVE CONFIGURATION UPDATED:",
            id
        );


        return {

            action: "updated",

            id: id

        };
    }


    // =================================================
    // INSERT NEW
    // =================================================

    const inserted =
        await pool.request()

            .input(
                "site_id",
                sql.BigInt,
                Number(siteId)
            )

            .input(
                "financial_year",
                sql.NVarChar(20),
                String(financialYear)
            )

            .input(
                "from_year",
                sql.Int,
                Number(fromYear)
            )

            .input(
                "to_year",
                sql.Int,
                Number(toYear)
            )

            .input(
                "leave_type",
                sql.NVarChar(20),
                String(leaveType)
            )

            .input(
                "total_leaves",
                sql.Decimal(10, 2),
                total
            )

            .input(
                "active",
                sql.Int,
                0
            )

            .input(
                "created_by",
                sql.NVarChar(100),
                String(createdBy || "")
            )

            .input(
                "source",
                sql.NVarChar(50),
                "SITE"
            )

            .query(`
                INSERT INTO leave_configuration
                (
                    site_id,

                    financial_year,

                    from_year,

                    to_year,

                    leave_type,

                    total_leaves,

                    active,

                    created_by,

                    created_on,

                    source
                )

                OUTPUT
                    INSERTED.id

                VALUES
                (
                    @site_id,

                    @financial_year,

                    @from_year,

                    @to_year,

                    @leave_type,

                    @total_leaves,

                    @active,

                    @created_by,

                    GETDATE(),

                    @source
                )
            `);


    const newId =
        inserted.recordset[0]?.id;


    console.log(
        "LEAVE CONFIGURATION INSERTED:",
        newId
    );


    return {

        action: "inserted",

        id: newId

    };
};



// =====================================================
// RECALCULATE EMPLOYEE BALANCE
// =====================================================

const recalculateEmployeeLeaveBalance = async ({
    empCode,
    year
}) => {

    const pool = await poolPromise;


    await pool.request()

        .input(
            "emp_code",
            sql.VarChar(100),
            String(empCode)
        )

        .input(
            "year",
            sql.VarChar(50),
            String(year)
        )

        .query(`
            UPDATE employee_leaves_balance

            SET

                total_leaves =

                    CAST(
                        ISNULL(NULLIF(cl_total, ''), '0')
                        AS DECIMAL(10,2)
                    )

                    +

                    CAST(
                        ISNULL(NULLIF(sl_total, ''), '0')
                        AS DECIMAL(10,2)
                    )

                    +

                    CAST(
                        ISNULL(NULLIF(pl_total, ''), '0')
                        AS DECIMAL(10,2)
                    )

                    +

                    CAST(
                        ISNULL(NULLIF(ml_total, ''), '0')
                        AS DECIMAL(10,2)
                    ),


                used_leaves =

                    CAST(
                        ISNULL(NULLIF(cl_used, ''), '0')
                        AS DECIMAL(10,2)
                    )

                    +

                    CAST(
                        ISNULL(NULLIF(sl_used, ''), '0')
                        AS DECIMAL(10,2)
                    )

                    +

                    CAST(
                        ISNULL(NULLIF(pl_used, ''), '0')
                        AS DECIMAL(10,2)
                    )

                    +

                    CAST(
                        ISNULL(NULLIF(ml_used, ''), '0')
                        AS DECIMAL(10,2)
                    ),


                remaining_leaves =

                    (

                        CAST(
                            ISNULL(NULLIF(cl_total, ''), '0')
                            AS DECIMAL(10,2)
                        )

                        +

                        CAST(
                            ISNULL(NULLIF(sl_total, ''), '0')
                            AS DECIMAL(10,2)
                        )

                        +

                        CAST(
                            ISNULL(NULLIF(pl_total, ''), '0')
                            AS DECIMAL(10,2)
                        )

                        +

                        CAST(
                            ISNULL(NULLIF(ml_total, ''), '0')
                            AS DECIMAL(10,2)
                        )

                    )

                    -

                    (

                        CAST(
                            ISNULL(NULLIF(cl_used, ''), '0')
                            AS DECIMAL(10,2)
                        )

                        +

                        CAST(
                            ISNULL(NULLIF(sl_used, ''), '0')
                            AS DECIMAL(10,2)
                        )

                        +

                        CAST(
                            ISNULL(NULLIF(pl_used, ''), '0')
                            AS DECIMAL(10,2)
                        )

                        +

                        CAST(
                            ISNULL(NULLIF(ml_used, ''), '0')
                            AS DECIMAL(10,2)
                        )

                    )

            WHERE emp_code = @emp_code

              AND year = @year

              AND active = '0'
        `);
};



// =====================================================
// CREATE EMPLOYEE LEAVE BALANCE MASTER
// =====================================================

const createEmployeeLeaveBalanceIfNotExists = async ({
    empCode,
    year,
    fromYear,
    toYear,
    createdBy
}) => {

    const pool = await poolPromise;


    await pool.request()

        .input(
            "emp_code",
            sql.VarChar(100),
            String(empCode)
        )

        .input(
            "year",
            sql.VarChar(50),
            String(year)
        )

        .input(
            "created_by",
            sql.VarChar(100),
            String(createdBy || "")
        )

        .input(
            "from_year",
            sql.VarChar(10),
            String(fromYear)
        )

        .input(
            "to_year",
            sql.VarChar(10),
            String(toYear)
        )

        .query(`
            IF NOT EXISTS
            (
                SELECT 1

                FROM employee_leaves_balance

                WHERE emp_code = @emp_code

                  AND year = @year

                  AND active = '0'
            )

            BEGIN

                INSERT INTO employee_leaves_balance
                (
                    emp_code,
                    year,

                    total_leaves,
                    used_leaves,
                    remaining_leaves,

                    created_by,
                    created_on,

                    active,

                    cl_total,
                    cl_used,

                    sl_total,
                    sl_used,

                    pl_total,
                    pl_used,

                    ml_total,
                    ml_used,

                    from_year,
                    to_year,

                    wfh_total,
                    wfh_used,

                    source
                )

                VALUES
                (
                    @emp_code,
                    @year,

                    '0',
                    '0',
                    '0',

                    @created_by,
                    GETDATE(),

                    '0',

                    '0',
                    '0',

                    '0',
                    '0',

                    '0',
                    '0',

                    '0',
                    '0',

                    @from_year,
                    @to_year,

                    '0',
                    '0',

                    'SITE'
                );

            END
        `);
};



// =====================================================
// UPDATE EMPLOYEE LEAVE TYPE
// =====================================================

const updateEmployeeLeaveType = async ({
    empCode,
    year,
    leaveType,
    totalLeaves
}) => {

    const pool = await poolPromise;


    let column;


    switch (String(leaveType).toUpperCase()) {

        case "CL":
            column = "cl_total";
            break;

        case "SL":
            column = "sl_total";
            break;

        case "PL":
            column = "pl_total";
            break;

        case "ML":
            column = "ml_total";
            break;

        case "HALF_DAY":
            return false;

        default:
            throw new Error(
                `Invalid leave type: ${leaveType}`
            );
    }


    const total =
        Number(totalLeaves);


    if (
        !Number.isFinite(total) ||
        total < 0
    ) {

        throw new Error(
            "Invalid total leaves"
        );
    }


    await pool.request()

        .input(
            "emp_code",
            sql.VarChar(100),
            String(empCode)
        )

        .input(
            "year",
            sql.VarChar(50),
            String(year)
        )

        .input(
            "total",
            sql.Decimal(10, 2),
            total
        )

        .query(`
            UPDATE employee_leaves_balance

            SET ${column} = @total

            WHERE emp_code = @emp_code

              AND year = @year

              AND active = '0'
        `);


    return true;
};



// =====================================================
// APPLY SITE LEAVE CONFIGURATION
// =====================================================

const applySiteLeaveConfiguration = async ({
    siteId,
    leaveRows,
    createdBy
}) => {

    console.log("==========================================");
    console.log("APPLY SITE LEAVE CONFIGURATION");
    console.log("FRONTEND SITE ID:", siteId);
    console.log("LEAVE ROWS:", leaveRows);
    console.log("CREATED BY:", createdBy);
    console.log("==========================================");


    // =================================================
    // VALIDATION
    // =================================================

    if (!siteId) {

        throw new Error(
            "Site ID is required"
        );
    }


    if (
        !Array.isArray(leaveRows) ||
        leaveRows.length === 0
    ) {

        throw new Error(
            "Leave configuration is required"
        );
    }


    // =================================================
    // GET ACTUAL SITE
    // =================================================

    const siteInfo =
        await getActualSiteId(siteId);


    const actualSiteId =
        Number(siteInfo.id);


    console.log(
        "ACTUAL SITE ID:",
        actualSiteId
    );


    // =================================================
    // GET EMPLOYEES
    // =================================================

    const employees =
        await getEmployeesBySite(siteId);


    console.log(
        "EMPLOYEES FOUND:",
        employees.length
    );


    let configurationRecords = 0;

    let employeeRecords = 0;


    // =================================================
    // FIRST:
    // SAVE leave_configuration
    // =================================================

    for (const leave of leaveRows) {

        // =============================================
        // VALIDATION
        // =============================================

        if (
            !leave.financialYear ||
            !leave.leaveType
        ) {

            console.log(
                "SKIPPING INVALID LEAVE:",
                leave
            );

            continue;
        }


        const fromYear =
            Number(
                leave.from_year ??
                leave.fromYear
            );


        const toYear =
            Number(
                leave.to_year ??
                leave.toYear
            );


        const totalLeaves =
            Number(
                leave.totalLeaves
            );


        const leaveType =
            String(
                leave.leaveType
            ).trim().toUpperCase();


        const financialYear =
            String(
                leave.financialYear
            ).trim();


        // =============================================
        // VALIDATE YEARS
        // =============================================

        if (
            !Number.isInteger(fromYear) ||
            !Number.isInteger(toYear)
        ) {

            console.log(
                "INVALID YEARS:",
                leave
            );

            continue;
        }


        // =============================================
        // VALIDATE TOTAL
        // =============================================

        if (
            !Number.isFinite(totalLeaves) ||
            totalLeaves < 0
        ) {

            console.log(
                "INVALID TOTAL:",
                leave
            );

            continue;
        }


        // =============================================
        // VALID LEAVE TYPES
        // =============================================

        if (
            ![
                "CL",
                "SL",
                "PL",
                "ML",
                "HALF_DAY"
            ].includes(leaveType)
        ) {

            console.log(
                "INVALID LEAVE TYPE:",
                leaveType
            );

            continue;
        }


        // =============================================
        // HALF DAY
        //
        // employee balance मध्ये column नाही.
        // पण leave_configuration मध्ये save होईल.
        // =============================================

        const saveResult =
            await saveLeaveConfiguration({

                siteId: actualSiteId,

                financialYear,

                fromYear,

                toYear,

                leaveType,

                totalLeaves,

                createdBy

            });


        configurationRecords++;


        console.log(
            "CONFIGURATION SAVE RESULT:",
            saveResult
        );
    }


    // =================================================
    // SECOND:
    // APPLY TO EMPLOYEES
    // =================================================

    for (const employee of employees) {

        const empCode =
            employee.employee_code;


        if (!empCode) {

            console.log(
                "SKIP EMPLOYEE WITHOUT CODE"
            );

            continue;
        }


        for (const leave of leaveRows) {

            if (
                !leave.financialYear ||
                !leave.leaveType
            ) {
                continue;
            }


            const fromYear =
                Number(
                    leave.from_year ??
                    leave.fromYear
                );


            const toYear =
                Number(
                    leave.to_year ??
                    leave.toYear
                );


            const totalLeaves =
                Number(
                    leave.totalLeaves
                );


            const leaveType =
                String(
                    leave.leaveType
                ).trim().toUpperCase();


            const financialYear =
                String(
                    leave.financialYear
                ).trim();


            if (
                !Number.isInteger(fromYear) ||
                !Number.isInteger(toYear)
            ) {
                continue;
            }


            if (
                !Number.isFinite(totalLeaves) ||
                totalLeaves < 0
            ) {
                continue;
            }


            if (
                leaveType === "HALF_DAY"
            ) {

                continue;
            }


            // =========================================
            // CREATE MASTER
            // =========================================

            await createEmployeeLeaveBalanceIfNotExists({

                empCode,

                year: financialYear,

                fromYear,

                toYear,

                createdBy

            });


            // =========================================
            // UPDATE LEAVE TYPE
            // =========================================

            const updated =
                await updateEmployeeLeaveType({

                    empCode,

                    year: financialYear,

                    leaveType,

                    totalLeaves

                });


            if (updated) {

                employeeRecords++;
            }


            // =========================================
            // RECALCULATE
            // =========================================

            await recalculateEmployeeLeaveBalance({

                empCode,

                year: financialYear

            });
        }
    }


    // =================================================
    // FINAL
    // =================================================

    console.log("==========================================");
    console.log("LEAVE CONFIGURATION COMPLETED");
    console.log("ACTUAL SITE ID:", actualSiteId);
    console.log("EMPLOYEES:", employees.length);
    console.log(
        "CONFIGURATION RECORDS:",
        configurationRecords
    );
    console.log(
        "EMPLOYEE RECORDS:",
        employeeRecords
    );
    console.log("==========================================");


    return {

        site_id: actualSiteId,

        frontend_site_id: Number(siteId),

        site_name: siteInfo.site_name,

        employees: employees.length,

        configuration_records:
            configurationRecords,

        employee_records:
            employeeRecords,

        message:
            "Leave configuration applied successfully"

    };
};

// =====================================================
// DELETE / DEACTIVATE SITE LEAVE CONFIGURATION
//
// Soft Delete:
// active = 1
//
// Frontend site_id
//       ↓
// client_rates.new_site_id
//       ↓
// client_rates.id
// =====================================================

const deleteLeaveConfiguration = async ({
    siteId,
    id,
    modifiedBy
}) => {

    const pool = await poolPromise;

    // =================================================
    // VALIDATION
    // =================================================

    if (
        siteId === undefined ||
        siteId === null ||
        siteId === ""
    ) {
        throw new Error("site_id is required");
    }

    if (
        id === undefined ||
        id === null ||
        id === ""
    ) {
        throw new Error("Leave configuration id is required");
    }

    // =================================================
    // GET ACTUAL SITE
    // =================================================

    const siteInfo =
        await getActualSiteId(siteId);

    const actualSiteId =
        Number(siteInfo.id);

    // =================================================
    // CHECK RECORD
    // =================================================

    const existing =
        await pool.request()

            .input(
                "id",
                sql.BigInt,
                Number(id)
            )

            .input(
                "site_id",
                sql.BigInt,
                actualSiteId
            )

            .query(`
                SELECT TOP 1
                    id,
                    site_id,
                    financial_year,
                    from_year,
                    to_year,
                    leave_type,
                    total_leaves,
                    active
                FROM leave_configuration
                WHERE id = @id
                  AND site_id = @site_id
                  AND active = 0
            `);

    if (!existing.recordset.length) {

        throw new Error(
            "Leave configuration not found or already deleted"
        );
    }

    // =================================================
    // SOFT DELETE
    // =================================================

    await pool.request()

        .input(
            "id",
            sql.BigInt,
            Number(id)
        )

        .input(
            "modified_by",
            sql.NVarChar(100),
            String(modifiedBy || "")
        )

        .query(`
            UPDATE leave_configuration

            SET
                active = 1,
                modified_by = @modified_by,
                modified_on = GETDATE()

            WHERE id = @id
        `);

    console.log(
        "LEAVE CONFIGURATION DELETED:",
        id
    );

    return {
        action: "deleted",
        id: Number(id),
        site_id: actualSiteId
    };
};

// =====================================================
// EXPORT
// =====================================================

module.exports = {

    getActualSiteId,

    getEmployeesBySite,

    getSiteLeaveConfiguration,

    saveLeaveConfiguration,
deleteLeaveConfiguration,
    applySiteLeaveConfiguration

};

