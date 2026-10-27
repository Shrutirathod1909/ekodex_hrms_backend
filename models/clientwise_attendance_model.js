const sql = require("mssql");
const { poolPromise } = require("../config/db");

const clientwiseAttendanceModel = {


    // =====================================================
    // GET CLIENT LIST
    //
    // company_id optional
    //
    // company_id = ""  -> all clients
    // company_id = 1   -> company 1 clients
    // =====================================================

    getClients: async (company_id = "") => {

        const pool = await poolPromise;

        const request = pool.request();


        let companyFilter = "";


        // =================================================
        // COMPANY FILTER
        // =================================================

        if (company_id) {

            request.input(
                "company_id",
                sql.BigInt,
                company_id
            );

            companyFilter = `
                AND ea.company_id = @company_id
            `;
        }


        // =================================================
        // QUERY
        // =================================================

        const query = `

            SELECT

                ea.client_id,

                MAX(ea.client_name)
                    AS client_name,

                MAX(ea.client_code)
                    AS client_code

            FROM emp_attendance ea

            WHERE

                ea.client_id IS NOT NULL

                AND ea.client_name IS NOT NULL

                AND LTRIM(
                    RTRIM(ea.client_name)
                ) <> ''

                ${companyFilter}

            GROUP BY

                ea.client_id

            ORDER BY

                MAX(ea.client_name)

        `;


        console.log(
            "CLIENT LIST QUERY:",
            query
        );


        const result =
            await request.query(query);


        return result.recordset;

    },


    // =====================================================
    // GET CLIENTWISE MONTHLY ATTENDANCE
    //
    // client_id empty = ALL CLIENTS
    //
    // client_id selected = SELECTED CLIENT
    // =====================================================

    getClientwiseAttendance: async ({
        client_id = "",
        company_id = "",
        month,
        year
    }) => {


        const pool =
            await poolPromise;


        const monthNumber =
            Number(month);


        const yearNumber =
            Number(year);


        // =================================================
        // VALIDATION
        // =================================================

        if (
            !monthNumber ||
            monthNumber < 1 ||
            monthNumber > 12
        ) {

            throw new Error(
                "Invalid month"
            );

        }


        if (
            !yearNumber ||
            yearNumber < 2000
        ) {

            throw new Error(
                "Invalid year"
            );

        }


        // =================================================
        // DAYS IN MONTH
        // =================================================

        const daysInMonth =
            new Date(
                yearNumber,
                monthNumber,
                0
            ).getDate();


        // =================================================
        // REQUEST
        // =================================================

        const request =
            pool.request();


        request.input(
            "year",
            sql.Int,
            yearNumber
        );


        request.input(
            "month",
            sql.Int,
            monthNumber
        );


        // =================================================
        // CLIENT FILTER
        // =================================================

        let clientFilter = "";


        if (client_id) {

            request.input(
                "client_id",
                sql.BigInt,
                client_id
            );


            clientFilter = `

                AND ea.client_id =
                    @client_id

            `;

        }


        // =================================================
        // COMPANY FILTER
        // =================================================

        let companyFilter = "";


        if (company_id) {

            request.input(
                "company_id",
                sql.BigInt,
                company_id
            );


            companyFilter = `

                AND ea.company_id =
                    @company_id

            `;

        }


        // =================================================
        // DAILY COLUMNS
        // =================================================

        const dailyColumns = [];


        for (
            let day = 1;
            day <= daysInMonth;
            day++
        ) {


            dailyColumns.push(`

                (

                    SELECT

                        COUNT(
                            DISTINCT ea2.employee_id
                        )

                    FROM emp_attendance ea2

                    WHERE

                        ea2.check_in_date >=
                            DATEFROMPARTS(
                                @year,
                                @month,
                                ${day}
                            )

                        AND ea2.check_in_date <
                            DATEADD(
                                DAY,
                                1,
                                DATEFROMPARTS(
                                    @year,
                                    @month,
                                    ${day}
                                )
                            )

                        AND ea2.site_id =
                            ea.site_id

                        AND (
                            ea2.active = 0
                            OR ea2.active IS NULL
                        )

                        AND ea2.employee_id IS NOT NULL

                        ${client_id
                            ? "AND ea2.client_id = @client_id"
                            : ""
                        }

                        ${company_id
                            ? "AND ea2.company_id = @company_id"
                            : ""
                        }

                ) AS day_${day}

            `);

        }


        // =================================================
        // MAIN QUERY
        //
        // CLIENT + SITE
        // =================================================

        const query = `

            SELECT

                MAX(ea.client_id)
                    AS client_id,

                MAX(ea.client_name)
                    AS client_name,

                MAX(ea.client_code)
                    AS client_code,

                ea.site_id,

                MAX(ea.site_name)
                    AS site_name,

                ${dailyColumns.join(",")}

            FROM emp_attendance ea

            WHERE

                ea.check_in_date >=
                    DATEFROMPARTS(
                        @year,
                        @month,
                        1
                    )

                AND ea.check_in_date <
                    DATEADD(
                        MONTH,
                        1,
                        DATEFROMPARTS(
                            @year,
                            @month,
                            1
                        )
                    )

                AND (
                    ea.active = 0
                    OR ea.active IS NULL
                )

                AND ea.client_id IS NOT NULL

                AND ea.site_id IS NOT NULL

                ${clientFilter}

                ${companyFilter}


            GROUP BY

                ea.client_id,

                ea.site_id


            ORDER BY

                MAX(ea.client_name),

                MAX(ea.site_name)

        `;


        console.log(
            "======================================"
        );

        console.log(
            "CLIENTWISE ATTENDANCE QUERY"
        );

        console.log(
            query
        );

        console.log(
            "Client:",
            client_id || "ALL"
        );

        console.log(
            "Company:",
            company_id || "ALL"
        );

        console.log(
            "Month:",
            monthNumber
        );

        console.log(
            "Year:",
            yearNumber
        );

        console.log(
            "Days:",
            daysInMonth
        );

        console.log(
            "======================================"
        );


        // =================================================
        // EXECUTE
        // =================================================

        const result =
            await request.query(query);


        console.log(
            "Attendance Rows:",
            result.recordset.length
        );


        // =================================================
        // FORMAT RESPONSE
        // =================================================

        const attendance =
            result.recordset.map((row) => {


                const days = [];


                for (
                    let day = 1;
                    day <= daysInMonth;
                    day++
                ) {


                    const present =
                        Number(
                            row[`day_${day}`] || 0
                        );


                    // =====================================
                    // CURRENTLY TOTAL = PRESENT
                    // =====================================

                    const total =
                        present;


                    days.push({

                        day,

                        present,

                        total,

                        value:
                            `${present}/${total}`

                    });

                }


                return {

                    client_id:
                        row.client_id,

                    client_name:
                        row.client_name,

                    client_code:
                        row.client_code || "",

                    site_id:
                        row.site_id,

                    site_name:
                        row.site_name || "",

                    days

                };

            });


        // =================================================
        // FINAL RESPONSE
        // =================================================

        return {

            month:
                monthNumber,

            year:
                yearNumber,

            daysInMonth,

            attendance

        };

    }

};


module.exports =
    clientwiseAttendanceModel;