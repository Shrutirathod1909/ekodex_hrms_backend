const AttendanceInvoiceModel = require("../models/attendanceInvoiceModel");

exports.createInvoice = async (req, res) => {
  try {
    const { siteId, month, year, attType, noOfDaysBilling } = req.body;

    const employees = await AttendanceInvoiceModel.getAttendanceDataByEmpSite(
      siteId,
      month,
      year,
      attType,
    );

    const invoiceData = [];

    for (const emp of employees) {
      const totalWO = await AttendanceInvoiceModel.getTotalDaysByStatusEmp(
        "W",
        siteId,
        month,
        year,
        emp.emp_code,
        emp.rank,
        attType,
      );

      const totalWP = await AttendanceInvoiceModel.getTotalDaysByStatusEmp(
        "WP",
        siteId,
        month,
        year,
        emp.emp_code,
        emp.rank,
        attType,
      );

      const totalAbsent = await AttendanceInvoiceModel.getTotalDaysByStatusEmp(
        "A",
        siteId,
        month,
        year,
        emp.emp_code,
        emp.rank,
        attType,
      );

      const totalHoliday = await AttendanceInvoiceModel.getTotalDaysByStatusEmp(
        "H",
        siteId,
        month,
        year,
        emp.emp_code,
        emp.rank,
        attType,
      );

      invoiceData.push({
        empCode: emp.emp_code,
        empName: emp.emp_name,
        rank: emp.rank,
        weeklyOff: totalWO.total_days,
        paidLeave: totalWP.total_days,
        absent: totalAbsent.total_days,
        holiday: totalHoliday.total_days,
      });
    }

    return res.status(200).json({
      success: true,
      data: invoiceData,
    });
  } catch (error) {
    console.error("Create Invoice Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
