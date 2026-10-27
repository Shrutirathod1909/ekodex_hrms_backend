const dashboardModel = require("../models/dashboardModel");
const logger = require("../utils/logger");
const archiver = require("archiver");
const XLSX = require("xlsx");
const getEmployeeDocumentDashboard = async (req, res) => {
  try {
    console.log("========== DOCUMENT DASHBOARD AUTH ==========");
    console.log("REQ.USER:", req.user);

    const userId = Number(req.user?.id);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: logged-in user not found",
      });
    }

    const data =
      await dashboardModel.getEmployeeDocumentDashboard(
        req.query || {},
        userId
      );

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("GET EMPLOYEE DOCUMENT DASHBOARD ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Unable to load employee document dashboard",
      error: err.message,
    });
  }
};



const getEmployeeStageDashboard = async (req, res) => {
  try {
    console.log("======================================");
    console.log("EMPLOYEE STAGE DASHBOARD");
    console.log("AUTH USER:", req.user);
    console.log("QUERY PARAMS:", req.query);
    console.log("======================================");

    const userId = Number(req.user?.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid logged-in user",
      });
    }

    const {
      client_id = "",
      site_id = "",
      company_id = "",
      branch_id = "",
    } = req.query;

    console.log("FRONTEND FILTERS:", {
      client_id,
      site_id,
      company_id,
      branch_id,
    });

    const data =
      await dashboardModel.getEmployeeStageDashboard(
        userId,
        client_id,
        site_id,
        company_id,
        branch_id
      );

    console.log("STAGE DASHBOARD RESPONSE:", data);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(
      "Employee Stage Dashboard Controller Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch employee stage dashboard",
      error: error.message,
    });
  }
};

const getAllClients = async (req, res) => {
  try {
    console.log("====================================");
    console.log("GET ALL CLIENTS");
    console.log("====================================");

    // ---------------------------------------------
    // AUTH USER
    // ---------------------------------------------

    const userId = Number(req.user?.id);

    console.log("AUTH USER ID:", userId);
    console.log("AUTH USER ROLE:", req.user?.role);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    // ---------------------------------------------
    // MODEL
    // ---------------------------------------------

    const result =
      await dashboardModel.getClientSiteCount(
        req
      );

    // ---------------------------------------------
    // RESPONSE
    // ---------------------------------------------

    return res.status(200).json({
      success: true,
      data: result,
    });

  } catch (error) {

    console.error(
      "GET CLIENTS ERROR =>",
      error
    );

    logger.log(
      "GET CLIENTS ERROR =>",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Server error fetching clients",
      error: error.message,
    });
  }
};
const getSiteWiseAttendance = async (req, res) => {
  try {

    let {
      filterType = "today",
      fromDate,
      toDate,
      date,
    } = req.query;


    const today = new Date();


    switch (filterType) {


      case "today":

        fromDate = new Date(today);
        toDate = new Date(today);

        break;



      case "yesterday":

        fromDate = new Date(today);
        fromDate.setDate(today.getDate() - 1);

        toDate = new Date(today);
        toDate.setDate(today.getDate() - 1);

        break;



      case "7days":

        fromDate = new Date(today);
        fromDate.setDate(today.getDate() - 6);

        toDate = new Date(today);

        break;



      case "30days":

        fromDate = new Date(today);
        fromDate.setDate(today.getDate() - 29);

        toDate = new Date(today);

        break;



      case "currentMonth":

        fromDate = new Date(
          today.getFullYear(),
          today.getMonth(),
          1
        );

        toDate = new Date(today);

        break;



      case "lastMonth":

        fromDate = new Date(
          today.getFullYear(),
          today.getMonth() - 1,
          1
        );


        toDate = new Date(
          today.getFullYear(),
          today.getMonth(),
          0
        );

        break;



      case "custom":


        if (!fromDate || !toDate) {

          return res.status(400).json({

            success:false,

            message:"fromDate and toDate required"

          });

        }


        fromDate = new Date(fromDate);

        toDate = new Date(toDate);


        break;



      default:


        if(date){

          fromDate = new Date(date);

          toDate = new Date(date);


        }else{


          fromDate = new Date(today);

          toDate = new Date(today);


        }


        break;

    }



    // Remove timezone issue

    const formatDate = (date)=>{

      const y = date.getFullYear();

      const m = String(
        date.getMonth()+1
      ).padStart(2,"0");


      const d = String(
        date.getDate()
      ).padStart(2,"0");


      return `${y}-${m}-${d}`;

    };



    fromDate = formatDate(fromDate);

    toDate = formatDate(toDate);



    const userId =
      req.user?.id ||
      req.session?.secure_data ||
      1;



    console.log({
      filterType,
      fromDate,
      toDate,
      userId
    });



    const data =
      await dashboardModel.getSiteWiseAttendance(
        fromDate,
        toDate,
        userId
      );



    return res.status(200).json({

      success:true,

      filterType,

      fromDate,

      toDate,

      data

    });



  } catch(error){


    console.error(
      "Site Attendance Error:",
      error
    );


    return res.status(500).json({

      success:false,

      message:error.message

    });


  }

};
const getEmployeeDocumentSummary = async (req, res) => {
  try {
    console.log("====================================");
    console.log("EMPLOYEE DOCUMENT SUMMARY");
    console.log("AUTH USER:", req.user);
    console.log("====================================");

    const userId = Number(req.user?.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid logged-in user",
      });
    }

    const {
      company_id = "",
      site_id = "",
      client_id = "",
      branch_id = "",
    } = req.query;

    const data =
      await dashboardModel.getEmployeeDocumentSummary(
        userId,
        client_id,
        site_id,
        company_id,
        branch_id
      );

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(
      "Employee Document Summary Controller Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getClientSites = async (req, res) => {
  try {
    console.log("Logged User:", req.user);

    const user = req.user || {};

    const role = String(
      user.role ||
      user.user_role ||
      user.user_type ||
      user.role_name ||
      ""
    )
      .toLowerCase()
      .trim();

    const isSuperAdmin = [
      "superadmin",
      "super admin",
      "super_admin",
    ].includes(role);

    const companyId = user.company_id;

    console.log("Detected Role:", role);
    console.log("Is Superadmin:", isSuperAdmin);
    console.log("Company ID:", companyId);

    if (!isSuperAdmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "company_id not found for logged-in user",
        role,
      });
    }

    const data = await dashboardModel.getClientSites({
      isSuperAdmin,
      companyId,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("getClientSites Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getAttendanceReport = async (req, res) => {
  try {
    const { fromDate, toDate, siteCode } = req.body;
    const userId = req.user.id;

    if (!fromDate) {
      return res.status(400).json({
        error: true,
        message: "From Date is required",
      });
    }

    //----------------------------------------------------
    // USER ACCESS
    //----------------------------------------------------

    const user = await dashboardModel.getUserAccess(userId);

    if (!user) {
      return res.status(404).json({
        error: true,
        message: "User not found",
      });
    }

    //----------------------------------------------------
    // GET ATTENDANCE DATA
    //----------------------------------------------------

    const attendanceData = await dashboardModel.getAttendanceReport(
      fromDate,
      toDate || fromDate,
      user,
      siteCode
    );

    if (!attendanceData || attendanceData.length === 0) {
      return res.status(404).json({
        error: true,
        message: "No attendance data found",
      });
    }

    console.log("Attendance Rows :", attendanceData.length);

    //----------------------------------------------------
    // CREATE CSV
    //----------------------------------------------------

    const worksheet = XLSX.utils.json_to_sheet(attendanceData);

    const csvData = XLSX.utils.sheet_to_csv(worksheet);

    // UTF-8 BOM (Marathi/Hindi text साठी)
    const csvBuffer = Buffer.from("\uFEFF" + csvData, "utf8");

    console.log("CSV Buffer Size :", csvBuffer.length);

    //----------------------------------------------------
    // FILE NAMES
    //----------------------------------------------------

    const csvName = `ERP_Attendance_Report_${fromDate}_${toDate || fromDate}.csv`;

    const zipName = `ERP_Attendance_Report_${fromDate}_${toDate || fromDate}.zip`;

    //----------------------------------------------------
    // RESPONSE HEADERS
    //----------------------------------------------------

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${zipName}"`
    );

    //----------------------------------------------------
    // CREATE ZIP
    //----------------------------------------------------

    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    archive.on("error", (err) => {
      console.log("Archive Error :", err);

      if (!res.headersSent) {
        return res.status(500).json({
          error: true,
          message: err.message,
        });
      }

      res.end();
    });

    archive.pipe(res);

    //----------------------------------------------------
    // ADD CSV
    //----------------------------------------------------

    archive.append(csvBuffer, {
      name: csvName,
    });

    //----------------------------------------------------
    // FINALIZE ZIP
    //----------------------------------------------------

    await archive.finalize();
  } catch (error) {
    console.log("Attendance Export Error :", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: true,
        message: error.message,
      });
    }
  }
};


module.exports = {
  getEmployeeDocumentDashboard,
  getEmployeeStageDashboard,
  getSiteWiseAttendance,
  getAllClients,
  getEmployeeDocumentSummary,getAttendanceReport,getClientSites
};