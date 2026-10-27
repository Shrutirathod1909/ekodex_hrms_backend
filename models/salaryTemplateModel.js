const sql = require("mssql");
const { poolPromise } = require("../config/db");

const salaryTemplateModel = {

    // =====================================================
    // DATE FORMAT
    // SQL DATETIME -> YY-DD-MM HH:mm:ss
    // Example: 26-12-08 15:30:20
    // =====================================================
    formatDate: (date) => {

        if (!date) return null;

        const d = new Date(date);

        if (isNaN(d.getTime())) return null;

        const yy = String(d.getFullYear()).slice(-2);

        const dd = String(d.getDate()).padStart(2, "0");

        const mm = String(d.getMonth() + 1).padStart(2, "0");

        const hh = String(d.getHours()).padStart(2, "0");

        const min = String(d.getMinutes()).padStart(2, "0");

        const sec = String(d.getSeconds()).padStart(2, "0");

        return `${yy}-${dd}-${mm} ${hh}:${min}:${sec}`;
    },


    // =====================================================
    // FORMAT RESPONSE
    // =====================================================
    formatTemplate: (row) => {

        if (!row) return null;

        return {
            ...row,

            created_on: salaryTemplateModel.formatDate(
                row.created_on
            ),

            modified_on: salaryTemplateModel.formatDate(
                row.modified_on
            ),

            disabled_on: salaryTemplateModel.formatDate(
                row.disabled_on
            ),

            source: row.source || null
        };
    },


    // =====================================================
    // GET ALL SALARY TEMPLATES
    // =====================================================
      // =====================================================
    // GET ALL SALARY TEMPLATES
    // WITH SEARCH + DATE FILTER
    // =====================================================
getAll: async (user, filters = {}) => {
    const pool = await poolPromise;

    // =================================================
    // FILTER DATA
    // =================================================

    const searchFields = Array.isArray(filters.searchFields)
        ? filters.searchFields
        : [];

    const fromDate = filters.fromDate || null;
    const toDate = filters.toDate || null;

    // =================================================
    // SAFE FIELD MAPPING
    // FRONTEND FIELD -> DATABASE COLUMN
    // =================================================

    const fieldMap = {
        templateName: "template_name",
        rank: "rank",
        grossSalary: "gross_salary",
        basicSalary: "basic_salary"
    };

    // =================================================
    // REQUEST
    // =================================================

    const request = pool.request();

    // =================================================
    // COMPANY & BRANCH ACCESS SCOPING
    // =================================================

    const isSuperAdmin =
        user?.is_superadmin === true ||
        Number(user?.id) === 1 ||
        String(user?.role || "").trim().toUpperCase() === "SUPER ADMIN" ||
        String(user?.role || "").trim().toUpperCase() === "SUPERADMIN";

    const conditions = [
        `active = 0`
    ];

    if (!isSuperAdmin && user?.id) {
        const userRes = await pool
            .request()
            .input("uId", sql.Int, user.id)
            .query(`
                SELECT company_id, branch_id
                FROM users
                WHERE id = @uId
            `);

        const rawCompanyId =
            userRes.recordset[0]?.company_id ||
            user.company_id ||
            "";

        const rawBranchId =
            userRes.recordset[0]?.branch_id ||
            user.branch_id ||
            "";

        const userCompIds = String(rawCompanyId)
            .split(",")
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => !isNaN(n) && n > 0);

        const userBranchIds = String(rawBranchId)
            .split(",")
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => !isNaN(n) && n > 0);

        if (userCompIds.length === 0) {
            conditions.push(
                `TRY_CAST(created_by AS INT) = @userId`
            );

            request.input("userId", sql.Int, user.id);
        } else {
            const compInClause = userCompIds.join(",");

            let branchCondition = "1 = 1";

            if (userBranchIds.length > 0) {
                const branchInClause = userBranchIds.join(",");

                branchCondition = `(
                    branch_id IS NULL
                    OR LTRIM(RTRIM(branch_id)) = ''
                    OR LTRIM(RTRIM(branch_id)) = '0'
                    OR TRY_CAST(branch_id AS INT) IN (${branchInClause})
                    OR EXISTS (
                        SELECT 1
                        FROM STRING_SPLIT(
                            ISNULL(branch_id, ''),
                            ','
                        ) AS userBranch
                        WHERE TRY_CAST(
                            LTRIM(RTRIM(userBranch.value)) AS INT
                        ) IN (${branchInClause})
                    )
                )`;
            }

            conditions.push(`(
                TRY_CAST(created_by AS INT) = @userId
                OR (
                    (
                        TRY_CAST(company_id AS INT) IN (${compInClause})
                        OR EXISTS (
                            SELECT 1
                            FROM STRING_SPLIT(
                                ISNULL(company_id, ''),
                                ','
                            ) AS userCompany
                            WHERE TRY_CAST(
                                LTRIM(RTRIM(userCompany.value)) AS INT
                            ) IN (${compInClause})
                        )
                    )
                    AND ${branchCondition}
                )
            )`);

            request.input("userId", sql.Int, user.id);
        }
    }

    // =================================================
    // SEARCH CONDITIONS
    // =================================================

    let searchIndex = 0;

    for (const item of searchFields) {
        if (
            !item ||
            !item.field ||
            item.keyword === undefined ||
            item.keyword === null ||
            String(item.keyword).trim() === ""
        ) {
            continue;
        }

        const keyword = String(item.keyword).trim();
        const paramName = `search${searchIndex}`;

        // ---------------------------------------------
        // COMPANY SEARCH
        // company_id stores comma-separated company IDs
        // ---------------------------------------------

        if (item.field === "company") {
            conditions.push(`
                EXISTS (
                    SELECT 1
                    FROM STRING_SPLIT(
                        ISNULL(salary_template.company_id, ''),
                        ','
                    ) AS sc
                    INNER JOIN companies AS co
                        ON co.id = TRY_CAST(
                            LTRIM(RTRIM(sc.value)) AS INT
                        )
                    WHERE co.company_name LIKE @${paramName}
                )
            `);

            request.input(
                paramName,
                sql.NVarChar(255),
                `%${keyword}%`
            );
        }

        // ---------------------------------------------
        // BRANCH SEARCH
        // branch_id stores comma-separated branch IDs
        // ---------------------------------------------

        else if (item.field === "branch") {
            conditions.push(`
                EXISTS (
                    SELECT 1
                    FROM STRING_SPLIT(
                        ISNULL(salary_template.branch_id, ''),
                        ','
                    ) AS sb
                    INNER JOIN branches AS br
                        ON br.id = TRY_CAST(
                            LTRIM(RTRIM(sb.value)) AS INT
                        )
                    WHERE br.branch_name LIKE @${paramName}
                )
            `);

            request.input(
                paramName,
                sql.NVarChar(255),
                `%${keyword}%`
            );
        }

        // ---------------------------------------------
        // OTHER SEARCH FIELDS
        // ---------------------------------------------

        else {
            const dbField = fieldMap[item.field];

            if (!dbField) {
                continue;
            }

            // Salary numeric fields
            if (
                item.field === "grossSalary" ||
                item.field === "basicSalary"
            ) {
                conditions.push(
                    `CAST(${dbField} AS NVARCHAR(100)) LIKE @${paramName}`
                );

                request.input(
                    paramName,
                    sql.NVarChar(100),
                    `%${keyword}%`
                );
            } else {
                // Template name and rank
                conditions.push(
                    `${dbField} LIKE @${paramName}`
                );

                request.input(
                    paramName,
                    sql.NVarChar(255),
                    `%${keyword}%`
                );
            }
        }

        searchIndex++;
    }

    // =================================================
    // DATE FILTER
    // =================================================

    if (fromDate) {
        request.input(
            "fromDate",
            sql.Date,
            fromDate
        );

        conditions.push(
            `CAST(created_on AS DATE) >= @fromDate`
        );
    }

    if (toDate) {
        request.input(
            "toDate",
            sql.Date,
            toDate
        );

        conditions.push(
            `CAST(created_on AS DATE) <= @toDate`
        );
    }

    // =================================================
    // FINAL QUERY
    // =================================================

    const query = `
        SELECT
            id,
            template_name,
            rank,
            gross_salary,
            gross_salary_type,
            basic_salary,
            basic_salary_type,
            active,
            created_by,
            created_on,
            modified_by,
            modified_on,
            disabled_by,
            disabled_on,
            company_id,
            branch_id,
            perday_salary,
            hra,
            source
        FROM salary_template
        WHERE
            ${conditions.join("\nAND\n")}
        ORDER BY id DESC
    `;

    // =================================================
    // DEBUG
    // =================================================

    console.log(
        "SALARY TEMPLATE SEARCH QUERY:",
        query
    );

    console.log(
        "SALARY TEMPLATE SEARCH FIELDS:",
        searchFields
    );

    console.log(
        "SALARY TEMPLATE FROM DATE:",
        fromDate
    );

    console.log(
        "SALARY TEMPLATE TO DATE:",
        toDate
    );

    // =================================================
    // EXECUTE
    // =================================================

    const result = await request.query(query);

    // =================================================
    // RESPONSE
    // =================================================

    return result.recordset.map(
        salaryTemplateModel.formatTemplate
    );
},


    // =====================================================
    // GET SINGLE TEMPLATE
    // =====================================================
    getById: async (id) => {

        const pool = await poolPromise;

        const result = await pool.request()

            .input(
                "id",
                sql.BigInt,
                id
            )

            .query(`

                SELECT

                    id,

                    template_name,

                    rank,

                    gross_salary,

                    gross_salary_type,

                    basic_salary,

                    basic_salary_type,

                    active,

                    created_by,

                    created_on,

                    modified_by,

                    modified_on,

                    disabled_by,

                    disabled_on,

                    company_id,

                    branch_id,

                    perday_salary,

                    hra,

                    source

                FROM salary_template

                WHERE id = @id

            `);

        return salaryTemplateModel.formatTemplate(
            result.recordset[0] || null
        );
    },


    // =====================================================
    // CREATE
    // =====================================================
    create: async (data, user) => {

        const pool = await poolPromise;

        const result = await pool.request()

            .input(
                "template_name",
                sql.NVarChar(255),
                data.template_name || null
            )

            .input(
                "rank",
                sql.NVarChar(100),
                data.rank || null
            )

            .input(
                "gross_salary",
                sql.Decimal(18, 2),
                data.gross_salary || 0
            )

            .input(
                "gross_salary_type",
                sql.NVarChar(50),
                data.gross_salary_type || "Monthly"
            )

            .input(
                "basic_salary",
                sql.Decimal(18, 2),
                data.basic_salary || 0
            )

            .input(
                "basic_salary_type",
                sql.NVarChar(50),
                data.basic_salary_type || "Monthly"
            )

            .input(
                "company_id",
                sql.NVarChar(sql.MAX),
                data.company_id ? String(data.company_id) : (user?.company_id ? String(user.company_id) : null)
            )

            .input(
                "branch_id",
                sql.NVarChar(sql.MAX),
                data.branch_id ? String(data.branch_id) : (user?.branch_id ? String(user.branch_id) : null)
            )

            .input(
                "perday_salary",
                sql.Decimal(18, 2),
                data.perday_salary || 0
            )

            .input(
                "hra",
                sql.Decimal(18, 2),
                data.hra || 0
            )

            .input(
                "source",
                sql.NVarChar(100),
                data.source || "Website"
            )

            .input(
                "created_by",
                sql.BigInt,
                user.id
            )

            .query(`

                INSERT INTO salary_template
                (
                    template_name,

                    rank,

                    gross_salary,

                    gross_salary_type,

                    basic_salary,

                    basic_salary_type,

                    active,

                    created_by,

                    created_on,

                    company_id,

                    branch_id,

                    perday_salary,

                    hra,

                    source
                )

                OUTPUT INSERTED.*

                VALUES
                (
                    @template_name,

                    @rank,

                    @gross_salary,

                    @gross_salary_type,

                    @basic_salary,

                    @basic_salary_type,

                    0,

                    @created_by,

                    GETDATE(),

                    @company_id,

                    @branch_id,

                    @perday_salary,

                    @hra,

                    @source
                )

            `);

        return salaryTemplateModel.formatTemplate(
            result.recordset[0]
        );
    },


    // =====================================================
    // UPDATE
    // =====================================================
    update: async (id, data, user) => {

        const pool = await poolPromise;

        const result = await pool.request()

            .input(
                "id",
                sql.BigInt,
                id
            )

            .input(
                "template_name",
                sql.NVarChar(255),
                data.template_name || null
            )

            .input(
                "rank",
                sql.NVarChar(100),
                data.rank || null
            )

            .input(
                "gross_salary",
                sql.Decimal(18, 2),
                data.gross_salary || 0
            )

            .input(
                "gross_salary_type",
                sql.NVarChar(50),
                data.gross_salary_type || "Monthly"
            )

            .input(
                "basic_salary",
                sql.Decimal(18, 2),
                data.basic_salary || 0
            )

            .input(
                "basic_salary_type",
                sql.NVarChar(50),
                data.basic_salary_type || "Monthly"
            )

            .input(
                "company_id",
                sql.NVarChar(sql.MAX),
                data.company_id ? String(data.company_id) : null
            )

            .input(
                "branch_id",
                sql.NVarChar(sql.MAX),
                data.branch_id ? String(data.branch_id) : null
            )

            .input(
                "perday_salary",
                sql.Decimal(18, 2),
                data.perday_salary || 0
            )

            .input(
                "hra",
                sql.Decimal(18, 2),
                data.hra || 0
            )

            .input(
                "source",
                sql.NVarChar(100),
                data.source || "Website"
            )

            .input(
                "modified_by",
                sql.BigInt,
                user.id
            )

            .query(`

                UPDATE salary_template

                SET

                    template_name = @template_name,

                    rank = @rank,

                    gross_salary = @gross_salary,

                    gross_salary_type = @gross_salary_type,

                    basic_salary = @basic_salary,

                    basic_salary_type = @basic_salary_type,

                    company_id = @company_id,

                    branch_id = @branch_id,

                    perday_salary = @perday_salary,

                    hra = @hra,

                    source = @source,

                    modified_by = @modified_by,

                    modified_on = GETDATE()

                OUTPUT INSERTED.*

                WHERE id = @id

            `);

        return salaryTemplateModel.formatTemplate(
            result.recordset[0] || null
        );
    },


    // =====================================================
    // DELETE / DISABLE
    // =====================================================
    delete: async (id, user) => {

        const pool = await poolPromise;

        const result = await pool.request()

            .input(
                "id",
                sql.BigInt,
                id
            )

            .input(
                "disabled_by",
                sql.BigInt,
                user.id
            )

            .query(`

                UPDATE salary_template

                SET

                    active = 1,

                    disabled_by = @disabled_by,

                    disabled_on = GETDATE()

                OUTPUT INSERTED.*

                WHERE id = @id

            `);

        return salaryTemplateModel.formatTemplate(
            result.recordset[0] || null
        );
    },


    // =====================================================
    // RESTORE
    // =====================================================
    restore: async (id, user) => {

        const pool = await poolPromise;

        const result = await pool.request()

            .input(
                "id",
                sql.BigInt,
                id
            )

            .input(
                "modified_by",
                sql.BigInt,
                user.id
            )

            .query(`

                UPDATE salary_template

                SET

                    active = 0,

                    disabled_by = NULL,

                    disabled_on = NULL,

                    modified_by = @modified_by,

                    modified_on = GETDATE()

                OUTPUT INSERTED.*

                WHERE id = @id

            `);

        return salaryTemplateModel.formatTemplate(
            result.recordset[0] || null
        );
    },
// =====================================================
// EXPORT SALARY TEMPLATES
// SEARCH + DATE FILTER
// =====================================================
// =====================================================
// EXPORT EXCEL DATA
// =====================================================
exportExcel: async (user, filters = {}) => {

    const pool = await poolPromise;

    // =================================================
    // FILTER DATA
    // =================================================

    const searchFields =
        Array.isArray(filters.searchFields)
            ? filters.searchFields
            : [];

    const fromDate =
        filters.fromDate || null;

    const toDate =
        filters.toDate || null;


    // =================================================
    // SAFE FIELD MAPPING
    // =================================================

    const fieldMap = {

        templateName: "template_name",

        rank: "rank",

        grossSalary: "gross_salary",

        basicSalary: "basic_salary"

    };


    // =================================================
    // REQUEST
    // =================================================

    const request = pool.request();


    // =================================================
    // =================================================
    // COMPANY & BRANCH ACCESS SCOPING
    // =================================================

    const isSuperAdmin =
        user?.is_superadmin === true ||
        Number(user?.id) === 1 ||
        String(user?.role).trim().toUpperCase() === "SUPER ADMIN" ||
        String(user?.role).trim().toUpperCase() === "SUPERADMIN";

    const conditions = [
        `active = 0`
    ];

    if (!isSuperAdmin && user?.id) {
        const userRes = await pool
            .request()
            .input("uId", sql.Int, user.id)
            .query(`SELECT company_id, branch_id FROM users WHERE id = @uId`);

        const rawCompanyId = userRes.recordset[0]?.company_id || user.company_id || "";
        const rawBranchId = userRes.recordset[0]?.branch_id || user.branch_id || "";

        const userCompIds = String(rawCompanyId)
            .split(",")
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => !isNaN(n) && n > 0);

        const userBranchIds = String(rawBranchId)
            .split(",")
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => !isNaN(n) && n > 0);

        if (userCompIds.length === 0) {
            conditions.push(`TRY_CAST(created_by AS INT) = @userId`);
            request.input("userId", sql.Int, user.id);
        } else {
            const compInClause = userCompIds.join(",");
            let branchCondition = "1 = 1";

            if (userBranchIds.length > 0) {
                const branchInClause = userBranchIds.join(",");
                branchCondition = `(
                    branch_id IS NULL OR LTRIM(RTRIM(branch_id)) = '' OR LTRIM(RTRIM(branch_id)) = '0'
                    OR TRY_CAST(branch_id AS INT) IN (${branchInClause})
                    OR EXISTS (
                        SELECT 1
                        FROM STRING_SPLIT(ISNULL(branch_id, ''), ',')
                        WHERE TRY_CAST(LTRIM(RTRIM(value)) AS INT) IN (${branchInClause})
                    )
                )`;
            }

            conditions.push(`(
                TRY_CAST(created_by AS INT) = @userId
                OR (
                    (
                        TRY_CAST(company_id AS INT) IN (${compInClause})
                        OR EXISTS (
                            SELECT 1
                            FROM STRING_SPLIT(ISNULL(company_id, ''), ',')
                            WHERE TRY_CAST(LTRIM(RTRIM(value)) AS INT) IN (${compInClause})
                        )
                    )
                    AND ${branchCondition}
                )
            )`);
            request.input("userId", sql.Int, user.id);
        }
    }


    // =================================================
    // SEARCH CONDITIONS
    // =================================================

    let searchIndex = 0;

    for (const item of searchFields) {

        if (
            !item ||
            !item.field ||
            item.keyword === undefined ||
            item.keyword === null ||
            String(item.keyword).trim() === ""
        ) {
            continue;
        }


        const dbField =
            fieldMap[item.field];

        if (!dbField) {
            continue;
        }


        const keyword =
            String(item.keyword).trim();


        const paramName =
            `exportSearch${searchIndex}`;


        // =================================================
        // SALARY SEARCH
        // =================================================

        if (
            item.field === "grossSalary" ||
            item.field === "basicSalary"
        ) {

            conditions.push(
                `CAST(${dbField} AS NVARCHAR(100)) LIKE @${paramName}`
            );

            request.input(
                paramName,
                sql.NVarChar(100),
                `%${keyword}%`
            );

        }

        // =================================================
        // TEXT SEARCH
        // =================================================

        else {

            conditions.push(
                `${dbField} LIKE @${paramName}`
            );

            request.input(
                paramName,
                sql.NVarChar(255),
                `%${keyword}%`
            );

        }

        searchIndex++;
    }


    // =================================================
    // FROM DATE
    // =================================================

    if (fromDate) {

        request.input(
            "exportFromDate",
            sql.Date,
            fromDate
        );

        conditions.push(
            `created_on >= @exportFromDate`
        );
    }


    // =================================================
    // TO DATE
    // =================================================

    if (toDate) {

        request.input(
            "exportToDate",
            sql.Date,
            toDate
        );

        // Important:
        // Include complete toDate
        conditions.push(
            `created_on < DATEADD(DAY, 1, @exportToDate)`
        );
    }


    // =================================================
    // QUERY
    // =================================================

    const query = `

        SELECT

            id,

            template_name,

            rank,

            gross_salary,

            gross_salary_type,

            basic_salary,

            basic_salary_type,

            perday_salary,

            hra,

            company_id,

            branch_id,

            created_by,

            created_on,

            modified_by,

            modified_on

        FROM salary_template

        WHERE

            ${conditions.join("\nAND\n")}

        ORDER BY id DESC

    `;


    // =================================================
    // DEBUG
    // =================================================

    console.log(
        "========================================"
    );

    console.log(
        "SALARY TEMPLATE EXPORT QUERY:"
    );

    console.log(query);

    console.log(
        "EXPORT SEARCH:",
        searchFields
    );

    console.log(
        "EXPORT FROM:",
        fromDate
    );

    console.log(
        "EXPORT TO:",
        toDate
    );

    console.log(
        "========================================"
    );


    // =================================================
    // EXECUTE
    // =================================================

    const result =
        await request.query(query);


    // =================================================
    // DEBUG RECORDS
    // =================================================

    console.log(
        "EXPORT RECORD COUNT:",
        result.recordset.length
    );

    if (result.recordset.length > 0) {

        console.log(
            "FIRST EXPORT RECORD:",
            result.recordset[0]
        );

        console.log(
            "FIRST CREATED ON:",
            result.recordset[0].created_on
        );

        console.log(
            "CREATED ON TYPE:",
            typeof result.recordset[0].created_on
        );

    }


    // =================================================
    // RETURN RAW SQL DATA
    // =================================================

    return result.recordset;
},
};

module.exports = salaryTemplateModel;