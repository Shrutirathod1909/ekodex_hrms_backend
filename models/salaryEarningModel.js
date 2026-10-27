const sql = require("mssql");
const { poolPromise } = require("../config/db");

const salaryEarningModel = {

    // =====================================================
    // FORMAT RESPONSE
    // =====================================================
    formatEarning: (row) => {

        if (!row) return null;

        return {
            ...row,
            source: row.source || null
        };
    },


    // =====================================================
    // GET ALL
    // =====================================================
    getAll: async (tmplId = null) => {

        const pool = await poolPromise;

        const result = await pool.request()

            .input(
                "tmpl_id",
                sql.BigInt,
                tmplId || null
            )

            .query(`
                SELECT
                    id,
                    tmpl_id,
                    earning_name,
                    earning_rate,
                    earning_amount,
                    ea_from_date,
                    ea_to_date,
                    ea_calculateon,
                    ea_operator,
                    ea_comp_operator,
                    active,
                    source
                FROM salary_earning
                WHERE
                    active = 0
                    AND (
                        @tmpl_id IS NULL
                        OR tmpl_id = @tmpl_id
                    )
                ORDER BY id DESC
            `);

        return result.recordset.map(
            salaryEarningModel.formatEarning
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
                    earning_name,
                    earning_rate,
                    earning_amount,
                    ea_from_date,
                    ea_to_date,
                    ea_calculateon,
                    ea_operator,
                    ea_comp_operator,
                    active,
                    source
                FROM salary_earning
                WHERE id = @id
            `);

        return salaryEarningModel.formatEarning(
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
                    earning_name,
                    earning_rate,
                    earning_amount,
                    ea_from_date,
                    ea_to_date,
                    ea_calculateon,
                    ea_operator,
                    ea_comp_operator,
                    active,
                    source
                FROM salary_earning
                WHERE
                    tmpl_id = @tmpl_id
                    AND active = 0
                ORDER BY id DESC
            `);

        return result.recordset.map(
            salaryEarningModel.formatEarning
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
                "earning_name",
                sql.NVarChar(255),
                data.earning_name || null
            )

            .input(
                "earning_rate",
                sql.Decimal(18, 2),
                data.earning_rate === "" ||
                data.earning_rate === undefined ||
                data.earning_rate === null
                    ? null
                    : data.earning_rate
            )

            .input(
                "earning_amount",
                sql.Decimal(18, 2),
                data.earning_amount === "" ||
                data.earning_amount === undefined ||
                data.earning_amount === null
                    ? 0
                    : data.earning_amount
            )

            .input(
                "ea_from_date",
                sql.Date,
                data.ea_from_date || null
            )

            .input(
                "ea_to_date",
                sql.Date,
                data.ea_to_date || null
            )

            .input(
                "ea_calculateon",
                sql.NVarChar(100),
                data.ea_calculateon || null
            )

            .input(
                "ea_operator",
                sql.NVarChar(50),
                data.ea_operator || null
            )

       
.input(
    "ea_comp_operator",
    sql.NVarChar(50),
    data.ea_comp_operator === "" ||
    data.ea_comp_operator === undefined ||
    data.ea_comp_operator === null
        ? null
        : data.ea_comp_operator
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
                INSERT INTO salary_earning
                (
                    tmpl_id,
                    earning_name,
                    earning_rate,
                    earning_amount,
                    ea_from_date,
                    ea_to_date,
                    ea_calculateon,
                    ea_operator,
                    ea_comp_operator,
                    active,
                    source
                )
                OUTPUT INSERTED.*
                VALUES
                (
                    @tmpl_id,
                    @earning_name,
                    @earning_rate,
                    @earning_amount,
                    @ea_from_date,
                    @ea_to_date,
                    @ea_calculateon,
                    @ea_operator,
                    @ea_comp_operator,
                    0,
                    @source
                )
            `);

        return salaryEarningModel.formatEarning(
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
                "earning_name",
                sql.NVarChar(255),
                data.earning_name || null
            )

            .input(
                "earning_rate",
                sql.Decimal(18, 2),
                data.earning_rate === "" ||
                data.earning_rate === undefined ||
                data.earning_rate === null
                    ? null
                    : data.earning_rate
            )

            .input(
                "earning_amount",
                sql.Decimal(18, 2),
                data.earning_amount === "" ||
                data.earning_amount === undefined ||
                data.earning_amount === null
                    ? 0
                    : data.earning_amount
            )

            .input(
                "ea_from_date",
                sql.Date,
                data.ea_from_date || null
            )

            .input(
                "ea_to_date",
                sql.Date,
                data.ea_to_date || null
            )

            .input(
                "ea_calculateon",
                sql.NVarChar(100),
                data.ea_calculateon || null
            )

            .input(
                "ea_operator",
                sql.NVarChar(50),
                data.ea_operator || null
            )

      
.input(
    "ea_comp_operator",
    sql.NVarChar(50),
    data.ea_comp_operator === "" ||
    data.ea_comp_operator === undefined ||
    data.ea_comp_operator === null
        ? null
        : data.ea_comp_operator
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
                UPDATE salary_earning

                SET
                    tmpl_id = @tmpl_id,
                    earning_name = @earning_name,
                    earning_rate = @earning_rate,
                    earning_amount = @earning_amount,
                    ea_from_date = @ea_from_date,
                    ea_to_date = @ea_to_date,
                    ea_calculateon = @ea_calculateon,
                    ea_operator = @ea_operator,
                    ea_comp_operator = @ea_comp_operator,
                    source = @source

                OUTPUT INSERTED.*

                WHERE id = @id
            `);

        return salaryEarningModel.formatEarning(
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
                UPDATE salary_earning

                SET
                    active = 1

                OUTPUT INSERTED.*

                WHERE id = @id
            `);

        return salaryEarningModel.formatEarning(
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
                UPDATE salary_earning

                SET
                    active = 0

                OUTPUT INSERTED.*

                WHERE id = @id
            `);

        return salaryEarningModel.formatEarning(
            result.recordset[0] || null
        );
    }

};

module.exports = salaryEarningModel;