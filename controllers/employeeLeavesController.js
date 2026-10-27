
const {
    applySiteLeaveConfiguration,
    getSiteLeaveConfiguration,
       deleteLeaveConfiguration
} = require("../models/employeeLeavesModel");

// =====================================================
// DELETE SITE LEAVE CONFIGURATION
// DELETE
//
// DELETE /api/employee-leaves/configuration/:site_id/:id
//
// Example:
// DELETE /api/employee-leaves/configuration/400/25
//
// 400 = frontend new_site_id
// 25  = leave_configuration.id
// =====================================================

const deleteSiteLeaveConfigurationController = async (
    req,
    res
) => {

    try {

        const {
            site_id,
            id
        } = req.params;

        const modifiedBy =
            req.user?.id ||
            req.user?.user_id ||
            "SYSTEM";

        console.log("==========================================");
        console.log("DELETE SITE LEAVE CONFIGURATION");
        console.log("FRONTEND SITE ID:", site_id);
        console.log("CONFIGURATION ID:", id);
        console.log("MODIFIED BY:", modifiedBy);
        console.log("==========================================");


        // =================================================
        // VALIDATE SITE
        // =================================================

        if (
            site_id === undefined ||
            site_id === null ||
            site_id === ""
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "site_id is required"

            });
        }


        // =================================================
        // VALIDATE ID
        // =================================================

        if (
            id === undefined ||
            id === null ||
            id === ""
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Leave configuration id is required"

            });
        }


        // =================================================
        // DELETE / SOFT DELETE
        // =================================================

        const result =
            await deleteLeaveConfiguration({

                siteId: Number(site_id),

                id: Number(id),

                modifiedBy

            });


        // =================================================
        // SUCCESS
        // =================================================

        return res.status(200).json({

            success: true,

            message:
                "Leave configuration deleted successfully",

            data: result

        });

    } catch (error) {

        console.error(
            "Delete Site Leave Configuration Error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Failed to delete leave configuration",

            error:
                error.message

        });
    }
};
// =====================================================
// APPLY SITE LEAVE CONFIGURATION
// POST
// =====================================================
const applySiteLeaveConfigurationController = async (req, res) => {

    try {

        const {
            site_id,
            leaves
        } = req.body;


        const createdBy =
            req.user?.id ||
            req.user?.user_id ||
            "SYSTEM";


        console.log("==========================================");
        console.log("APPLY SITE LEAVE CONFIGURATION");
        console.log("FRONTEND SITE ID:", site_id);
        console.log("LEAVES:", leaves);
        console.log("CREATED BY:", createdBy);
        console.log("==========================================");


        // =================================================
        // VALIDATE SITE
        // =================================================

        if (
            site_id === undefined ||
            site_id === null ||
            site_id === ""
        ) {

            return res.status(400).json({
                success: false,
                message: "site_id is required"
            });
        }


        // =================================================
        // VALIDATE LEAVES
        // =================================================

        if (
            !Array.isArray(leaves) ||
            leaves.length === 0
        ) {

            return res.status(400).json({
                success: false,
                message: "Leave configuration is required"
            });
        }


        // =================================================
        // FILTER VALID LEAVES
        // =================================================

        const validLeaves = leaves.filter((leave) => {

            return (
                leave &&
                leave.financialYear &&
                leave.leaveType &&
                leave.totalLeaves !== "" &&
                leave.totalLeaves !== null &&
                leave.totalLeaves !== undefined
            );

        });


        if (validLeaves.length === 0) {

            return res.status(400).json({
                success: false,
                message: "No valid leave configuration found"
            });
        }


        // =================================================
        // APPLY
        // =================================================

        const result =
            await applySiteLeaveConfiguration({

                siteId: Number(site_id),

                leaveRows: validLeaves,

                createdBy
            });


        // =================================================
        // SUCCESS
        // =================================================

        return res.status(200).json({

            success: true,

            message:
                "Leave configuration applied successfully",

            data: result

        });


    } catch (error) {

        console.error(
            "Apply Site Leave Error:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Failed to apply leave configuration",

            error:
                error.message

        });
    }
};



// =====================================================
// GET SITE LEAVE CONFIGURATION
// GET
//
// Example:
// GET /api/employee-leaves/configuration/400
//
// 400 = frontend new_site_id
// =====================================================
const getSiteLeaveConfigurationController = async (req, res) => {

    try {

        const {
            site_id
        } = req.params;


        console.log("==========================================");
        console.log("GET SITE LEAVE CONFIGURATION");
        console.log("FRONTEND SITE ID:", site_id);
        console.log("==========================================");


        // =================================================
        // VALIDATE
        // =================================================

        if (
            site_id === undefined ||
            site_id === null ||
            site_id === ""
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "site_id is required"

            });
        }


        // =================================================
        // GET CONFIGURATION
        // =================================================

        const result =
            await getSiteLeaveConfiguration(
                Number(site_id)
            );


        // =================================================
        // SUCCESS
        // =================================================

        return res.status(200).json({

            success: true,

            message:
                "Leave configuration fetched successfully",

            data: result

        });


    } catch (error) {

        console.error(
            "Get Site Leave Configuration Error:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Failed to get leave configuration",

            error:
                error.message

        });
    }
};



// =====================================================
// EXPORT
// =====================================================

module.exports = {

    applySiteLeaveConfigurationController,

    getSiteLeaveConfigurationController,
    deleteSiteLeaveConfigurationController

};

