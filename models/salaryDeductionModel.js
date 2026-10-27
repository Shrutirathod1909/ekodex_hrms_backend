const sql = require("mssql");
const { poolPromise } = require("../config/db");

const salaryDeductionModel = {

    // =====================================================
    // FORMAT DATE
    // =====================================================
    formatDate: (date) => {

        if (!date) return null;

        const d = new Date(date);

        if (isNaN(d.getTime())) {
            return null;
        }

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
    formatDeduction: (row) => {

        if (!row) {
            return null;
        }

        return {
            ...row,

            source: row.source || "Website",

            from_date: row.from_date
                ? row.from_date
                : null,

            to_date: row.to_date
                ? row.to_date
                : null
        };
    },


    // =====================================================
    // GET ALL
    // =====================================================
    getAll: async (tmplId = null) => {

        const pool = await poolPromise;

        const request = pool.request()

            .input(
                "tmpl_id",
                sql.BigInt,
                tmplId || null
            );

        const result = await request.query(`

            SELECT

                id,

                tmpl_id,

                deduction_name,

                deduction_rate,

                deduction_amount,

                from_date,

                to_date,

                dd_calculateon,

                dd_operator,

                dd_comp_operator,

                active,

                source

            FROM salary_deduction

            WHERE

                active = 0

                AND (
                    @tmpl_id IS NULL
                    OR tmpl_id = @tmpl_id
                )

            ORDER BY id DESC

        `);

        return result.recordset.map(
            salaryDeductionModel.formatDeduction
        );
    },


    // =====================================================
    // GET BY ID
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

                    tmpl_id,

                    deduction_name,

                    deduction_rate,

                    deduction_amount,

                    from_date,

                    to_date,

                    dd_calculateon,

                    dd_operator,

                    dd_comp_operator,

                    active,

                    source

                FROM salary_deduction

                WHERE id = @id

            `);

        return salaryDeductionModel.formatDeduction(
            result.recordset[0] || null
        );
    },


    // =====================================================
    // GET BY TEMPLATE ID
    // =====================================================
    getByTemplateId: async (tmplId) => {

        const pool = await poolPromise;

        const result = await pool.request()

            .input(
                "tmpl_id",
                sql.BigInt,
                tmplId
            )

            .query(`

                SELECT

                    id,

                    tmpl_id,

                    deduction_name,

                    deduction_rate,

                    deduction_amount,

                    from_date,

                    to_date,

                    dd_calculateon,

                    dd_operator,

                    dd_comp_operator,

                    active,

                    source

                FROM salary_deduction

                WHERE

                    tmpl_id = @tmpl_id

                    AND active = 0

                ORDER BY id DESC

            `);

        return result.recordset.map(
            salaryDeductionModel.formatDeduction
        );
    },


    // =====================================================
    // CREATE
    // =====================================================
    create: async (data) => {

        const pool = await poolPromise;

        const result = await pool.request()

            .input(
                "tmpl_id",
                sql.BigInt,
                data.tmpl_id
            )

            .input(
                "deduction_name",
                sql.NVarChar(255),
                data.deduction_name || null
            )

            .input(
                "deduction_rate",
                sql.Decimal(18, 2),
                data.deduction_rate === "" ||
                data.deduction_rate === undefined ||
                data.deduction_rate === null
                    ? null
                    : data.deduction_rate
            )

            .input(
                "deduction_amount",
                sql.Decimal(18, 2),
                data.deduction_amount === "" ||
                data.deduction_amount === undefined ||
                data.deduction_amount === null
                    ? 0
                    : data.deduction_amount
            )

            .input(
                "from_date",
                sql.Date,
                data.from_date || null
            )

            .input(
                "to_date",
                sql.Date,
                data.to_date || null
            )

            .input(
                "dd_calculateon",
                sql.NVarChar(100),
                data.dd_calculateon || null
            )

            .input(
                "dd_operator",
                sql.NVarChar(50),
                data.dd_operator || null
            )

         
.input(
    "dd_comp_operator",
    sql.NVarChar(50),
    data.dd_comp_operator === "" ||
    data.dd_comp_operator === undefined ||
    data.dd_comp_operator === null
        ? null
        : data.dd_comp_operator
)


            // =================================================
            // SOURCE
            // =================================================
            .input(
                "source",
                sql.NVarChar(100),
                data.source || "Website"
            )

            .query(`

                INSERT INTO salary_deduction
                (
                    tmpl_id,

                    deduction_name,

                    deduction_rate,

                    deduction_amount,

                    from_date,

                    to_date,

                    dd_calculateon,

                    dd_operator,

                    dd_comp_operator,

                    active,

                    source
                )

                OUTPUT INSERTED.*

                VALUES
                (
                    @tmpl_id,

                    @deduction_name,

                    @deduction_rate,

                    @deduction_amount,

                    @from_date,

                    @to_date,

                    @dd_calculateon,

                    @dd_operator,

                    @dd_comp_operator,

                    0,

                    @source
                )

            `);

        return salaryDeductionModel.formatDeduction(
            result.recordset[0]
        );
    },


    // =====================================================
    // UPDATE
    // =====================================================
    update: async (id, data) => {

        const pool = await poolPromise;

        const result = await pool.request()

            .input(
                "id",
                sql.BigInt,
                id
            )

            .input(
                "tmpl_id",
                sql.BigInt,
                data.tmpl_id
            )

            .input(
                "deduction_name",
                sql.NVarChar(255),
                data.deduction_name || null
            )

            .input(
                "deduction_rate",
                sql.Decimal(18, 2),
                data.deduction_rate === "" ||
                data.deduction_rate === undefined ||
                data.deduction_rate === null
                    ? null
                    : data.deduction_rate
            )

            .input(
                "deduction_amount",
                sql.Decimal(18, 2),
                data.deduction_amount === "" ||
                data.deduction_amount === undefined ||
                data.deduction_amount === null
                    ? 0
                    : data.deduction_amount
            )

            .input(
                "from_date",
                sql.Date,
                data.from_date || null
            )

            .input(
                "to_date",
                sql.Date,
                data.to_date || null
            )

            .input(
                "dd_calculateon",
                sql.NVarChar(100),
                data.dd_calculateon || null
            )

            .input(
                "dd_operator",
                sql.NVarChar(50),
                data.dd_operator || null
            )

.input(
    "dd_comp_operator",
    sql.NVarChar(50),
    data.dd_comp_operator === "" ||
    data.dd_comp_operator === undefined ||
    data.dd_comp_operator === null
        ? null
        : data.dd_comp_operator
)


            // =================================================
            // SOURCE
            // =================================================
            .input(
                "source",
                sql.NVarChar(100),
                data.source || "Website"
            )

            .query(`

                UPDATE salary_deduction

                SET

                    tmpl_id = @tmpl_id,

                    deduction_name = @deduction_name,

                    deduction_rate = @deduction_rate,

                    deduction_amount = @deduction_amount,

                    from_date = @from_date,

                    to_date = @to_date,

                    dd_calculateon = @dd_calculateon,

                    dd_operator = @dd_operator,

                    dd_comp_operator = @dd_comp_operator,

                    source = @source

                OUTPUT INSERTED.*

                WHERE id = @id

            `);

        return salaryDeductionModel.formatDeduction(
            result.recordset[0] || null
        );
    },


    // =====================================================
    // DELETE - SOFT DELETE
    // =====================================================
    delete: async (id) => {

        const pool = await poolPromise;

        const result = await pool.request()

            .input(
                "id",
                sql.BigInt,
                id
            )

            .query(`

                UPDATE salary_deduction

                SET

                    active = 1

                OUTPUT INSERTED.*

                WHERE id = @id

            `);

        return salaryDeductionModel.formatDeduction(
            result.recordset[0] || null
        );
    },


    // =====================================================
    // RESTORE
    // =====================================================
    restore: async (id) => {

        const pool = await poolPromise;

        const result = await pool.request()

            .input(
                "id",
                sql.BigInt,
                id
            )

            .query(`

                UPDATE salary_deduction

                SET

                    active = 0

                OUTPUT INSERTED.*

                WHERE id = @id

            `);

        return salaryDeductionModel.formatDeduction(
            result.recordset[0] || null
        );
    }

};

module.exports = salaryDeductionModel;