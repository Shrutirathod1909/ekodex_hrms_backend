const clientwiseAttendanceModel =
    require("../models/clientwise_attendance_model");

const clientwiseAttendanceController = {

    // =========================================================
    // GET CLIENT LIST
    // =========================================================
    getClients: async (req, res) => {

        try {

            const {
                company_id = ""
            } = req.query;


            console.log(
                "======================================"
            );

            console.log(
                "CLIENT LIST"
            );

            console.log(
                "Company ID:",
                company_id
            );

            console.log(
                "======================================"
            );


            const clients =
                await clientwiseAttendanceModel.getClients(
                    company_id
                );


            return res.status(200).json({

                success: true,

                message:
                    "Clients fetched successfully",

                clients

            });


        } catch (error) {

            console.error(
                "Get Clients Error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Failed to fetch clients",

                error:
                    error.message

            });

        }

    },


    // =========================================================
    // GET CLIENTWISE ATTENDANCE
    // =========================================================
    getClientwiseAttendance: async (req, res) => {

        try {

            const {
                client_id = "",
                company_id = "",
                month,
                year
            } = req.query;


            // =================================================
            // VALIDATION
            // =================================================

            if (!month) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Month is required"

                });

            }


            if (!year) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Year is required"

                });

            }


            console.log(
                "======================================"
            );

            console.log(
                "CLIENTWISE ATTENDANCE"
            );

            console.log(
                "Client ID:",
                client_id || "ALL CLIENTS"
            );

            console.log(
                "Company ID:",
                company_id || "ALL COMPANIES"
            );

            console.log(
                "Month:",
                month
            );

            console.log(
                "Year:",
                year
            );

            console.log(
                "======================================"
            );


            // =================================================
            // MODEL
            // =================================================

            const result =
                await clientwiseAttendanceModel
                    .getClientwiseAttendance({

                        client_id,

                        company_id,

                        month,

                        year

                    });


            return res.status(200).json({

                success: true,

                message:
                    "Clientwise attendance fetched successfully",

                data: result

            });


        } catch (error) {

            console.error(
                "Clientwise Attendance Error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Failed to fetch clientwise attendance",

                error:
                    error.message

            });

        }

    }

};


module.exports =
    clientwiseAttendanceController;