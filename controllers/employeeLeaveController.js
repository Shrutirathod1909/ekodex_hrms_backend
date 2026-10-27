const employeeLeaveModel =
    require("../models/employeeLeaveModel");


// =====================================================
// HELPERS
// =====================================================

const normalizeRole = (role) => {

    return String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
};


const isAdminUser = (req) => {

    const role =
        normalizeRole(
            req.user?.role
        );

    return (
        role === "admin" ||
        role === "superadmin"
    );
};


const getUserId = (req) => {

    return (
        req.user?.id ||
        null
    );
};


const getUserName = (req) => {

    return (
        req.user?.name ||
        "NA"
    );
};


// =====================================================
// CONTROLLER
// =====================================================

const employeeLeaveController = {


    // =================================================
    // ADD LEAVE
    // =================================================

addEmployeeLeave: async (req, res) => {

    try {

        console.log(
            "===================================="
        );

        console.log(
            "ADD LEAVE USER:",
            req.user
        );

        console.log(
            "ADD LEAVE BODY:",
            req.body
        );

        console.log(
            "===================================="
        );


        // =============================================
        // LOGIN USER
        // =============================================

        const userId =
            getUserId(req);


        const userName =
            getUserName(req);


        // =============================================
        // EMPLOYEE ID
        // =============================================

        const empId =
            req.body.emp_id ||
            req.body.employee_id ||
            req.body.employeeId;


        if (!empId) {

            return res.status(400).json({

                success: false,

                message:
                    "Employee is required"

            });

        }


        // =============================================
        // VALIDATE EMPLOYEE
        // =============================================

        const employee =
            await employeeLeaveModel
                .getEmployeeDetails(
                    Number(empId)
                );


        if (!employee) {

            return res.status(404).json({

                success: false,

                message:
                    "Employee not found"

            });

        }


        console.log(
            "===================================="
        );

        console.log(
            "EMPLOYEE FROM DATABASE:",
            employee
        );

        console.log(
            "===================================="
        );


        // =============================================
        // FINAL DATA
        // Employee details are always taken from DB
        // =============================================

        const data = {

            ...req.body,


            // -----------------------------------------
            // EMPLOYEE
            // -----------------------------------------

            emp_id:

                Number(
                    employee.emp_id ||
                    employee.id
                ),


            emp_code:

                employee.emp_code ||
                "",


            emp_name:

                employee.emp_name ||
                "",


            // -----------------------------------------
            // CLIENT
            // -----------------------------------------

            client_id:

                employee.client_id ||
                req.body.client_id ||
                null,


            client_name:

                employee.client_name ||
                req.body.client_name ||
                "",


            // -----------------------------------------
            // SITE
            // -----------------------------------------

            site_id:

                employee.site_id ||
                req.body.site_id ||
                null,


            site_name:

                employee.site_name ||
                req.body.site_name ||
                "",


            // -----------------------------------------
            // CREATED BY
            // -----------------------------------------

            created_by:

                req.body.created_by ||
                userId,


            created_by_name:

                req.body.created_by_name ||
                userName,


            created_on:

                req.body.created_on ||
                new Date(),


            // -----------------------------------------
            // DEFAULT STATUS
            // -----------------------------------------

            status:

                req.body.status ||
                "Pending",


            active:

                req.body.active ??
                "0"

        };


        console.log(
            "===================================="
        );

        console.log(
            "FINAL LEAVE DATA:"
        );

        console.log(
            data
        );

        console.log(
            "===================================="
        );


        // =============================================
        // INSERT LEAVE
        // =============================================

        const leaveId =
            await employeeLeaveModel
                .addEmployeeLeave(
                    data
                );


        if (!leaveId) {

            return res.status(400).json({

                success: false,

                message:
                    "Failed to create leave"

            });

        }


        // =============================================
        // LOG
        // =============================================

        await employeeLeaveModel
            .logEmpLeave(

                leaveId,

                userId,

                userName,

                "Created"

            );


        // =============================================
        // SUCCESS RESPONSE
        // =============================================

        return res.status(201).json({

            success: true,

            message:
                "Leave created successfully",

            leave_id:

                leaveId,


            employee: {

                id:

                    employee.emp_id ||
                    employee.id,


                code:

                    employee.emp_code,


                name:

                    employee.emp_name

            },


            client: {

                id:

                    data.client_id,


                name:

                    data.client_name

            },


            site: {

                id:

                    data.site_id,


                name:

                    data.site_name

            }

        });


    } catch (error) {

        console.error(
            "===================================="
        );

        console.error(
            "ADD LEAVE ERROR:",
            error
        );

        console.error(
            "===================================="
        );


        return res.status(500).json({

            success: false,

            message:

                error.message ||
                "Internal server error",


            details:

                error.message

        });

    }

},
updateEmployeeLeave: async (req, res) => {

    try {

        console.log(
            "========================================"
        );

        console.log(
            "UPDATE LEAVE REQUEST PARAMS:",
            req.params
        );

        console.log(
            "UPDATE LEAVE REQUEST BODY:",
            req.body
        );

        console.log(
            "UPDATE LEAVE USER:",
            req.user
        );

        console.log(
            "========================================"
        );


        // =============================================
        // LEAVE ID
        // =============================================

        const leaveId =
            req.params?.id ||
            req.params?.leave_id ||
            req.body?.leave_id;


        if (!leaveId) {

            return res.status(400).json({

                success: false,

                message:
                    "Leave ID is required"

            });

        }


        // =============================================
        // USER ID
        // =============================================

        const userId =
            req.user?.id ||
            req.user?.user_id ||
            req.user?.userId ||
            null;


        // =============================================
        // USER NAME
        // =============================================

        const userName =
            req.user?.name ||
            req.user?.username ||
            req.user?.full_name ||
            req.user?.email ||
            "NA";


        // =============================================
        // GET DATA
        // =============================================

        const {

            emp_id,

            emp_code,

            emp_name,

            from_date,

            to_date,

            from_time,

            to_time,

            type,

            reason

        } = req.body;


        // =============================================
        // VALIDATION
        // =============================================

        if (!emp_id) {

            return res.status(400).json({

                success: false,

                message:
                    "Employee is required"

            });

        }


        if (!type) {

            return res.status(400).json({

                success: false,

                message:
                    "Leave type is required"

            });

        }


        if (!from_date) {

            return res.status(400).json({

                success: false,

                message:
                    "From date is required"

            });

        }


        // =============================================
        // HALF DAY VALIDATION
        // =============================================

        const leaveType =
            String(type)
                .trim()
                .toUpperCase();


        if (

            leaveType === "HALF_DAY" &&

            !from_time

        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Half day time is required"

            });

        }


        // =============================================
        // NORMAL LEAVE VALIDATION
        // =============================================

        if (

            leaveType !== "HALF_DAY" &&

            !to_date

        ) {

            return res.status(400).json({

                success: false,

                message:
                    "To date is required"

            });

        }


        if (

            leaveType !== "HALF_DAY" &&

            new Date(to_date) <
            new Date(from_date)

        ) {

            return res.status(400).json({

                success: false,

                message:
                    "To date cannot be before From date"

            });

        }


        // =============================================
        // REASON VALIDATION
        // =============================================

        if (

            !reason ||

            !String(reason).trim()

        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Reason is required"

            });

        }


        // =============================================
        // UPDATE DATA
        // =============================================

        const updateData = {

            leave_id:
                Number(leaveId),

            emp_id:
                Number(emp_id),

            emp_code:
                emp_code || null,

            emp_name:
                emp_name || null,

            from_date,

            to_date:

                leaveType === "HALF_DAY"

                    ? from_date

                    : to_date,

            from_time:

                leaveType === "HALF_DAY"

                    ? from_time

                    : null,

            to_time:

                leaveType === "HALF_DAY"

                    ? (to_time || null)

                    : null,

            type:
                type,

            reason:
                String(reason).trim(),

            modified_by:
                userId
                    ? Number(userId)
                    : null,

            modified_by_name:
                userName,

            modified_on:
                new Date()

        };


        console.log(
            "FINAL UPDATE DATA:",
            updateData
        );


        // =============================================
        // UPDATE MODEL
        // =============================================

        const affectedRows =
            await employeeLeaveModel
                .updateEmployeeLeave(
                    updateData
                );


        // =============================================
        // NOT FOUND
        // =============================================

        if (

            !affectedRows ||

            affectedRows === 0

        ) {

            return res.status(404).json({

                success: false,

                message:
                    "Leave not found or update failed"

            });

        }


        // =============================================
        // SUCCESS
        // =============================================

        return res.status(200).json({

            success: true,

            message:
                "Leave updated successfully",

            leave_id:
                Number(leaveId)

        });


    } catch (error) {

        console.error(
            "========================================"
        );

        console.error(
            "UPDATE LEAVE ERROR:",
            error
        );

        console.error(
            "========================================"
        );


        return res.status(500).json({

            success: false,

            message:
                "Failed to update leave",

            details:
                error.message

        });

    }

},



// =====================================================
// DELETE EMPLOYEE LEAVE
// =====================================================
 deleteEmployeeLeave:async (
  req,
  res
) => {

  try {

    // ================================================
    // LEAVE ID
    // ================================================

    const leaveId =
      req.params.id;


    if (!leaveId) {

      return res.status(400).json({

        success: false,

        message:
          "Leave ID is required"

      });

    }


    // ================================================
    // LOGIN USER
    // ================================================

    const userId =

      req.user?.id ||

      req.user?.user_id ||

      null;


    const userName =

      req.user?.name ||

      req.user?.user_name ||

      req.user?.username ||

      "Unknown User";


    if (!userId) {

      return res.status(401).json({

        success: false,

        message:
          "Unauthorized user"

      });

    }


    // ================================================
    // DELETE LEAVE
    // ================================================

    const deletedRows =

      await employeeLeaveModel.deleteLeave(

        leaveId,

        userId,

        userName

      );


    // ================================================
    // NOT FOUND
    // ================================================

    if (

      !deletedRows ||

      deletedRows === 0

    ) {

      return res.status(404).json({

        success: false,

        message:
          "Leave not found or already deleted"

      });

    }


    // ================================================
    // SUCCESS
    // ================================================

    return res.status(200).json({

      success: true,

      message:
        "Leave deleted successfully"

    });


  } catch (error) {

    console.error(

      "DELETE EMPLOYEE LEAVE ERROR:",

      error

    );


    return res.status(500).json({

      success: false,

      message:
        "Failed to delete leave",

      error:
        error.message

    });

  }

},



    // =================================================
    // APPROVE LEAVE
    // ADMIN / SUPERADMIN ONLY
    // =================================================

 approveLeave: async (req, res) => {
        try {
            if (!isAdminUser(req)) return res.status(403).json({ success:false, message:"Only Admin or SuperAdmin can approve leave" });
            const leaveId = req.body.leave_id;
            if (!leaveId) return res.status(400).json({ success:false, message:"Leave ID is required" });

            const leave = await employeeLeaveModel.getLeaveById(leaveId);
            if (!leave) return res.status(404).json({ success:false, message:"Leave not found" });
            const status = String(leave.status || "").trim().toLowerCase();
            if (status === "approved") return res.status(400).json({ success:false, message:"Leave is already approved" });
            if (status === "rejected") return res.status(400).json({ success:false, message:"Rejected leave cannot be approved" });

            const leaveType = String(leave.type || "").trim().toUpperCase();
            const fromDate = new Date(leave.from_date);
            const toDate = new Date(leave.to_date || leave.from_date);
            if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate < fromDate) return res.status(400).json({ success:false, message:"Invalid leave dates" });

            let leaveDays;
            const leaveDates=[];
            if (leaveType === "HALF_DAY") {
                leaveDays=0.5;
                leaveDates.push(leave.from_date);
            } else {
                leaveDays=Math.floor((toDate.getTime()-fromDate.getTime())/(1000*60*60*24))+1;
                const current=new Date(fromDate);
                for(let i=0;i<leaveDays;i++){
                    leaveDates.push(`${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,"0")}-${String(current.getDate()).padStart(2,"0")}`);
                    current.setDate(current.getDate()+1);
                }
            }
            const userId=getUserId(req);
            const userName=getUserName(req);
            await employeeLeaveModel.approveLeaveAndDeductBalance({ leaveId:leave.id, empCode:leave.emp_code, leaveDays, leaveDates, userId, userName, approvedOn:new Date() });
            await employeeLeaveModel.logEmpLeave(leaveId,userId,userName,"Approved");

            return res.status(200).json({ success:true, message:"Leave approved and earned leave consumed successfully", leave_id:leave.id, consumed_leave_count:Math.max(1,Math.ceil(leaveDays)), leave_dates:leaveDates });
        } catch(error) {
            console.error("APPROVE LEAVE ERROR:",error);
            const statusCode=/Insufficient earned leave|already approved|Rejected leave|not found|Invalid/i.test(error.message||"")?400:500;
            return res.status(statusCode).json({ success:false, message:error.message||"Internal server error" });
        }
    },

rejectLeave: async (
        req,
        res
    ) => {

        try {

            console.log(
                "REJECT USER:",
                req.user
            );


            // -----------------------------------------
            // ROLE CHECK
            // -----------------------------------------

            if (!isAdminUser(req)) {

                return res.status(403).json({

                    success: false,

                    message:
                        "Only Admin or SuperAdmin can reject leave"

                });
            }


            const leaveId =
                req.body.leave_id;


            if (!leaveId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Leave ID is required"

                });
            }


            // -----------------------------------------
            // CHECK LEAVE
            // -----------------------------------------

            const leave =
                await employeeLeaveModel
                    .getLeaveById(
                        leaveId
                    );


            if (!leave) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Leave not found"

                });
            }


            const currentStatus =
                String(
                    leave.status ||
                    ""
                )
                    .trim()
                    .toLowerCase();


            if (
                currentStatus ===
                    "approved"
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Approved leave cannot be rejected"

                });
            }


            if (
                currentStatus ===
                    "rejected"
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Leave is already rejected"

                });
            }


            const userId =
                getUserId(req);

            const userName =
                getUserName(req);


            // -----------------------------------------
            // REJECT
            // -----------------------------------------

            const result =
                await employeeLeaveModel
                    .rejectLeave(
                        leaveId,
                        userId,
                        userName,
                        new Date()
                    );


            if (!result) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Leave update failed"

                });
            }


            // -----------------------------------------
            // LOG
            // -----------------------------------------

            await employeeLeaveModel
                .logEmpLeave(
                    leaveId,
                    userId,
                    userName,
                    "Rejected"
                );


            return res.status(200).json({

                success: true,

                message:
                    "Leave rejected successfully"

            });

        } catch (error) {

            console.error(
                "REJECT LEAVE ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Internal server error",

                details:
                    error.message

            });
        }
    },


    // =================================================
    // GET EMPLOYEE LEAVES
    // =================================================

    getEmployeeLeaves: async (
        req,
        res
    ) => {

        try {

            const empId =
                req.body?.emp_id ||
                req.query?.emp_id ||
                req.user?.employee_id;


            if (!empId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Employee ID is required"

                });
            }


            const status =
                req.body?.status ||
                req.query?.status ||
                "All";


            const search =
                req.body?.search ||
                req.query?.search ||
                "";


            const limit =
                Number(
                    req.body?.limit ||
                    req.query?.limit ||
                    50
                );


            const offset =
                Number(
                    req.body?.offset ||
                    req.query?.offset ||
                    0
                );


            const leaves =
                await employeeLeaveModel
                    .getEmployeeLeaves({

                        empId,

                        status,

                        search,

                        limit,

                        offset

                    });


            return res.status(200).json({

                success: true,

                leaves

            });

        } catch (error) {

            console.error(
                "GET EMPLOYEE LEAVES ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Internal server error",

                details:
                    error.message

            });
        }
    },


    // =================================================
    // ADMIN ALL LEAVES
    // CLIENT / SITE NOT REQUIRED
    // =================================================

getAdminAllEmployeeLeaves: async (req, res) => {

    try {

        console.log(
            "========================================"
        );

        console.log(
            "GET LEAVES USER:",
            req.user
        );

        console.log(
            "GET LEAVES QUERY:",
            req.query
        );

        console.log(
            "========================================"
        );


        // =============================================
        // STATUS
        // =============================================

        const status =
            req.query?.status ||
            req.body?.status ||
            "All";


        // =============================================
        // SEARCH
        // =============================================

        const search =
            req.query?.search ||
            req.body?.search ||
            "";


        // =============================================
        // LIMIT
        // =============================================

        const limit =
            Number(
                req.query?.limit ||
                req.body?.limit ||
                100
            );


        // =============================================
        // OFFSET
        // =============================================

        const offset =
            Number(
                req.query?.offset ||
                req.body?.offset ||
                0
            );


        // =============================================
        // LOGGED-IN USER ID
        // This is users.id
        // =============================================

        const userId =
            req.user?.id ||
            req.user?.user_id ||
            req.user?.userId ||
            null;


        // =============================================
        // USER ROLE
        // =============================================

        const userRole =
            req.user?.role ||
            req.user?.user_role ||
            "";


        // =============================================
        // NORMALIZE ROLE
        // =============================================

        const normalizedRole =
            String(userRole)
                .trim()
                .toLowerCase()
                .replace(/[\s_-]+/g, "");


        // =============================================
        // ADMIN CHECK
        // =============================================

        const isAdmin =
            normalizedRole === "admin" ||
            normalizedRole === "superadmin";


        console.log(
            "USER ID:",
            userId
        );

        console.log(
            "USER ROLE:",
            userRole
        );

        console.log(
            "IS ADMIN:",
            isAdmin
        );


        // =============================================
        // NORMAL USER VALIDATION
        // =============================================

        if (!isAdmin && !userId) {

            return res.status(400).json({

                success: false,

                message:
                    "User ID not found for logged-in user"

            });

        }


        // =============================================
        // GET LEAVES
        // =============================================

        const leaves =
            await employeeLeaveModel
                .getAdminAllEmployeeLeaves({

                    status,

                    search,

                    limit,

                    offset,

                    // users.id
                    userId:
                        userId
                            ? Number(userId)
                            : null,

                    isAdmin

                });


        console.log(
            "TOTAL LEAVES:",
            leaves.length
        );


        // =============================================
        // RESPONSE
        // =============================================

        return res.status(200).json({

            success: true,

            role: userRole,

            isAdmin,

            user: {

                id:
                    userId || "",

                role:
                    userRole || "",

                name:
                    req.user?.name ||
                    req.user?.username ||
                    "",

                email:
                    req.user?.email ||
                    ""

            },

            leaves:
                leaves || []

        });

    } catch (error) {

        console.error(
            "========================================"
        );

        console.error(
            "GET ALL LEAVES ERROR:",
            error
        );

        console.error(
            "========================================"
        );


        return res.status(500).json({

            success: false,

            message:
                error.message ||
                "Internal server error",

            details:
                error.message

        });

    }

},


    // =================================================
    // GET SINGLE LEAVE
    // =================================================

    getLeaveById: async (
        req,
        res
    ) => {

        try {

            const leaveId =
                req.params.id;


            if (!leaveId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Leave ID is required"

                });
            }


            const leave =
                await employeeLeaveModel
                    .getLeaveById(
                        leaveId
                    );


            if (!leave) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Leave not found"

                });
            }


            return res.status(200).json({

                success: true,

                leave

            });

        } catch (error) {

            console.error(
                "GET LEAVE ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Internal server error",

                details:
                    error.message

            });
        }
    },
getEmployeeLeaveBalance: async (req, res) => {
        try {
            let empId=req.query?.emp_id || req.body?.emp_id || null;
            let empCode=req.query?.emp_code || req.body?.emp_code || null;
            if(empId){
                empId=Number(empId);
                if(!Number.isInteger(empId)||empId<=0) return res.status(400).json({success:false,message:"Invalid employee ID"});
            }
            if(!empId&&!empCode){
                const userId=req.user?.id||req.user?.user_id;
                if(!userId) return res.status(400).json({success:false,message:"Employee ID or Employee Code is required"});
                const user=await employeeLeaveModel.getUserEmpCode(userId);
                if(!user||!user.emp_code) return res.status(404).json({success:false,message:"Employee code not found"});
                empCode=user.emp_code;
            }
            const balance=await employeeLeaveModel.getEmployeeLeaveBalance(empCode,empId);
            return res.status(200).json({success:true,balance});
        } catch(error){
            console.error("GET LEAVE BALANCE ERROR:",error);
            return res.status(500).json({success:false,message:error.message||"Failed to get leave balance"});
        }
    },

deleteLeave: async (
        req,
        res
    ) => {

        try {

            const leaveId =
                req.params.id;


            if (!leaveId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Leave ID is required"

                });
            }


            const userId =
                getUserId(req);

            const userName =
                getUserName(req);


            const result =
                await employeeLeaveModel
                    .deleteLeave(
                        leaveId,
                        userId,
                        userName
                    );


            if (!result) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Leave not found"

                });
            }


            return res.status(200).json({

                success: true,

                message:
                    "Leave deleted successfully"

            });

        } catch (error) {

            console.error(
                "DELETE LEAVE ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Internal server error",

                details:
                    error.message

            });
        }
    }

};


module.exports =
    employeeLeaveController;