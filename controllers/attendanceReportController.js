const attendanceModel = require("../models/attendanceModel");
const XLSX = require("xlsx");
const fs = require("fs");
exports.getAttendanceReport = async (req, res) => {
  try {
    const { fromDate, toDate } = req.body;
    const userId = req.user.id;

    if (!fromDate) {
      return res.status(400).json({
        error: true,
        message: "From Date is required",
      });
    }

    //-------------------------------------------------------
    // Get User
    //-------------------------------------------------------

    const user = await attendanceModel.getUserAccess(userId);

    if (!user) {
      return res.status(404).json({
        error: true,
        message: "User not found",
      });
    }

    //-------------------------------------------------------
    // Get Attendance Report
    //-------------------------------------------------------

    const attendanceData = await attendanceModel.getAttendanceReport(
      fromDate,
      toDate || fromDate,
      user,
    );

    if (!attendanceData || attendanceData.length === 0) {
      return res.status(404).json({
        error: true,
        message: "No attendance data found.",
      });
    }

    //-------------------------------------------------------
    // CSV Export
    //-------------------------------------------------------

    // const worksheet = XLSX.utils.json_to_sheet(attendanceData);

    // const csvData = XLSX.utils.sheet_to_csv(worksheet);

    // const fileName = `Attendance_Report_${fromDate}_${toDate || fromDate}.xls`;

    // res.setHeader("Content-Type", "text/xls; charset=utf-8");

    // res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    // return res.send(csvData);

    //-------------------------------------------------------
    // Excel Export
    //-------------------------------------------------------

    const workbook = XLSX.utils.book_new();

    const worksheet = XLSX.utils.json_to_sheet(attendanceData);

    XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance Report");

    // Generate buffer
    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
    });

    const fileName = `ERP_Attendance_Report_${fromDate}_${toDate || fromDate}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    return res.send(excelBuffer);
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      error: true,
      message: error.message,
    });
  }
};
exports.getAttendanceOTReport = async (req, res) => {
  try {
    const { from_date, to_date, user_id } = req.body;

    const userId = req.user?.id || user_id;

    if (!userId) {
      return res.status(400).json({
        error: true,
        message: "User ID missing",
      });
    }

    if (!from_date || !to_date) {
      return res.status(400).json({
        error: true,
        message: "From date and To date required",
      });
    }

    //-------------------------------------------------------
    // Get User
    //-------------------------------------------------------

    const user = await attendanceModel.getUserAccess(userId);

    if (!user) {
      return res.status(404).json({
        error: true,
        message: "User not found",
      });
    }

    //-------------------------------------------------------
    // Get OT Report
    //-------------------------------------------------------

    const data = await attendanceModel.getAttendanceOTReport(
      from_date,
      to_date,
      user
    );

    if (!data || data.length === 0) {
      return res.status(404).json({
        error: true,
        message: "No OT data found",
      });
    }

    console.log("OT REPORT COUNT :", data.length);

    //-------------------------------------------------------
    // Clean Data
    //-------------------------------------------------------

    const cleanData = data.map((row) => {
      const obj = {};

      Object.keys(row).forEach((key) => {
        let value = row[key];

        // null / undefined
        if (value === null || value === undefined) {
          value = "";
        }

        // Date
        if (value instanceof Date) {
          value = isNaN(value.getTime())
            ? ""
            : value.toISOString().substring(0, 10);
        }

        // Number
        if (typeof value === "number") {
          if (!Number.isFinite(value)) {
            value = 0;
          }
        }

        // Object
        if (typeof value === "object" && !(value instanceof Date)) {
          try {
            value = JSON.stringify(value);
          } catch {
            value = "";
          }
        }

        // String
        if (typeof value === "string") {
          value = value
            .replace(/[\0-\x08\x0B\x0C\x0E-\x1F]/g, "")
            .trim();
        }

        obj[key] = value;
      });

      return obj;
    });

    //-------------------------------------------------------
    // Validate Data
    //-------------------------------------------------------

    cleanData.forEach((row, index) => {
      Object.entries(row).forEach(([key, value]) => {
        if (
          value === undefined ||
          value === null ||
          Number.isNaN(value) ||
          value === Infinity ||
          value === -Infinity
        ) {
          console.log("INVALID VALUE =>", {
            row: index,
            field: key,
            value,
          });
        }
      });
    });

    console.log("CLEAN DATA :", cleanData.length);

    //-------------------------------------------------------
    // Create Workbook
    //-------------------------------------------------------

    const workbook = XLSX.utils.book_new();

    const worksheet = XLSX.utils.json_to_sheet(cleanData, {
      defval: "",
    });

    //-------------------------------------------------------
    // Auto Column Width
    //-------------------------------------------------------

    if (cleanData.length > 0) {
      worksheet["!cols"] = Object.keys(cleanData[0]).map((key) => {
        let maxLength = key.length;

        cleanData.forEach((row) => {
          const len = String(row[key] ?? "").length;

          if (len > maxLength) {
            maxLength = len;
          }
        });

        return {
          wch: Math.min(maxLength + 2, 40),
        };
      });
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, "OT Report");

    //-------------------------------------------------------
    // Generate Buffer
    //-------------------------------------------------------

    const buffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
    });

    //-------------------------------------------------------
    // Send Excel
    //-------------------------------------------------------

    const filename = `OT_Report_${from_date}_${to_date}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    return res.send(buffer);

  } catch (error) {
    console.error("Attendance OT Report Error:", error);

    return res.status(500).json({
      error: true,
      message: error.message,
    });
  }
};