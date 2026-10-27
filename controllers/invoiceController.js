/**
 * invoiceController.js
 * Full port of the PHP createInvoice() function.
 * All DB calls are async/await via model stubs.
 */
const sql = require("mssql");
const { poolPromise } = require("../config/db");
const logger = require("../utils/logger");
const invoiceModel = require("../models/invoiceModel");
const billingModel = require("../models/billingModel");
const ExcelJS = require("exceljs");
const { getSalaryTemplate } = require("../models/salaryModel");
const {
  getSiteInfo,
  getSiteDetail,
  getEmployeeByCode,
  getClientByCode,
  getClientById,
  getCompanyById,
  getLastId,
  deleteEmpWages,
  deleteActualCharges,
  insertEmpWages,
  insertActualCharge,
  generateFinalInvoice,
  getMasterDataById,
  getEmpWagesBySite,
  bankDetailOnInvoice,
  getOrderInfo,
  removeBillingAction,
  generateBillModel,
  generateTransportBillModel,
  getTransportBillById: getTransportBillByIdModel,
  getEmpWagesPf,
  getEmpWagesBonus,
  getEmpWagesServiceCharges,
  getEmpWagesPt,
  getEmpWagesOt,
  getEmpWagesEsic,
  getAtActualChargesBySite,
} = require("../models/invoiceModel");

const {
  getTotalDaysByStatusEmp,
  getTotalPresentDaysEmp,
  getTotalDoubleDutyDays,
  getTotalOvertimeByEmp,
  getTotalHalfDaysByEmp,
  getAttendanceDataByEmpSite,
} = require("../models/attendanceModel");

const {
  getAdditionalChargesByType,
  getOtherChargesAtActual,
  getAdditionalChargesAtActual,
  getServiceChargesAtActual,
  getEmployeeVouchers,
  getAdditionalChargesForPT,
} = require("../models/payrollModel");

const {
  resolveMonthDays,
  calculateNetDays,
  calculateSalaryComponents,
  calculateEarnedComponents,
  calculateOTWages,
  calculateEarnedGross,
  applyConditionalRate,
  resolvePfWagesBase,
  resolveEsicWagesBase,
  calculateServiceCharges,
  generateInvoiceNumber,
} = require("../utils/payrollUtils");

const {
  getUserSearch,
  deleteSearch,
  insertSearch,
  getUserRights,
  buildSearchConditions,
  getBillingCount,
  getBillingList,
  getBillingTotals,
  getPaidAmount,
  getBillingExcelData,
  getBillByAutoNo: getBillByAutoNoModel,

  updateBill: updateBillModel,
} = require("../models/billingModel");

// const { getUserDetailsById } = require("../models/User");

const generateTransportBill = async (req, res) => {
  try {
    const userId = req.user.id;

    if (req.body.items && typeof req.body.items === "string") {
      req.body.items = JSON.parse(req.body.items);
    }

    const result = await generateTransportBillModel(req.body, userId);

    return res.status(200).json({
      success: true,
      message: "Transport Bill Generated Successfully",
      auto_no: result.auto_no,
      invoice_no: result.invoice_no,
    });
  } catch (error) {
    console.error("generateTransportBill Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const searchSuggestions = async (req, res) => {
  try {
    const { field, keyword } = req.query;

   const allowedFields = [
  "invoice_no",
  "company_name",
  "site_name",
  "x_client_code",
  "billing_company",
  "billing_branch",
];

    if (!field || !keyword || !allowedFields.includes(field)) {
      return res.json({
        success: true,
        data: [],
      });
    }

    const data = await billingModel.searchBillingSuggestions(field, keyword);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.log("Search Suggestion Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
const receivePayment = async (req, res) => {
  try {
    const userId = req.user.id;

    const data = req.body;

    if (!data.bill_no) {
      return res.status(400).json({
        success: false,
        message: "Bill number required",
      });
    }

    if (!data.amount) {
      return res.status(400).json({
        success: false,
        message: "Amount required",
      });
    }

    await billingModel.addPaymentHistory(data, userId);

    return res.json({
      success: true,

      message: "Payment received successfully",
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,

      message: "Payment receive failed",
    });
  }
};

const getTransportBillById = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("GET TRANSPORT BILL ID:", id);

    const bill = await getTransportBillByIdModel(id);

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: "Bill not found",
      });
    }

    return res.json({
      success: true,
      data: bill,
    });
  } catch (error) {
    console.log("TRANSPORT BILL ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const updateTransportBill = async (req, res) => {
  try {
    const { autoNo } = req.params;

    const userId = req.user.id;

    // Debug
    console.log("TRANSPORT BILL UPDATE BODY:", req.body);

    const result = await invoiceModel.updateTransportBill(
      autoNo,
      req.body,
      userId,
    );

    res.status(200).json({
      success: true,

      message: "Transport Bill Updated Successfully",

      data: result,
    });
  } catch (error) {
    console.log("UPDATE TRANSPORT BILL ERROR:", error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};
const generateBill = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await generateBillModel(req.body, userId);

    return res.status(200).json({
      success: true,
      message: "Bill Generated Successfully",
      auto_no: result.auto_no,
      invoice_no: result.invoice_no,
    });
  } catch (error) {
    console.error("generateBill Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const activeRequests = new Set();

    const createInvoice = async (req, res) => {
    const { site, m, y, type, billingDays, clientId } = req.body;
    const { id, role, email, company, branch } = req.user;
    const lockKey = `${site}-${m}-${y}-${type}`;
    if (activeRequests.has(lockKey)) {
      return res.status(429).json({
        success: false,
        message: "Request already in progress",
      });
    }
    activeRequests.add(lockKey);
    try {
      const savedWages = [];
      let clientDetails = null;
      let billingCompanyDetails = null;
      const siteId = site;
      const month = m;
      const year = y;
      const attType = type;
      const monthdays = billingDays;

      if (!siteId || !month || !year || !attType || !clientId) {
        return res.status(400).json({
          success: false,
          message: "site, month, year, type and clientId are required",
        });
      }
      const deletedWages = await deleteEmpWages(siteId, month, year, attType);
      const deletedCount = await deleteActualCharges(
        siteId,
        month,
        year,
        attType,
      );

      const siteInfoArr = await getSiteInfo(siteId);
      if (!siteInfoArr || siteInfoArr.length === 0) {
        throw new Error("Site information not found");
      }
      const siteInfo = siteInfoArr[0];
      const decimalPoint = String(siteInfo.convert_decimal) === "1" ? 0 : 2;
      const lastId = await getLastId("bill_details");
      const invoiceNo = generateInvoiceNumber(lastId);
      const nonCompliance = Number(siteInfo.non_compliance || 0);
      const atData = await getAttendanceDataByEmpSite(
        siteId,
        month,
        year,
        attType,
      );
      if (!atData || atData.length === 0) {
        return res.status(200).json({
          success: true,
          message: "No attendance data found",
          invoice_no: invoiceNo,
          wages: [],
        });
      }
    
  const noOfDaysMonth = resolveMonthDays(
    monthdays,
    Number(month),
    Number(year),
    siteInfo.billing_nodays,
  );
  const daysInMonth = (month, year) => {
    return new Date(Number(year), Number(month), 0).getDate();
  };
      const calendarDays = daysInMonth(
    Number(month),
    Number(year)
  );
      const [
        bonusArr,
        otRateArr,
        doubleOtRateArr,
        otherChargesArr,
        holidayPayArr,
        nightAllowArr,

        // PF
        empPfRateArr,
        cmpPfRateArr,

        // ESIC
        esicRateArr,
        empEsicRateArr,
        companyEsicRateArr,

        lwfRateArr,
        emplwfRateArr,
        loanRateArr,
        idRateArr,
        recoveryRateArr,
        installmentRateArr,
      ] = await Promise.all([
        getAdditionalChargesByType(siteId, "BONUS"),
        getAdditionalChargesByType(siteId, "OT"),
        getAdditionalChargesByType(siteId, "DoubleOT"),

        // OTHER AT ACTUAL
        getOtherChargesAtActual(siteId),

        getAdditionalChargesByType(siteId, "HolidayPay"),
        getAdditionalChargesByType(siteId, "NightAllowance"),

        // =====================================
        // PF - USE EXACT DB NAMES
        // =====================================
        getAdditionalChargesByType(siteId, "EMP PF"),
        getAdditionalChargesByType(siteId, "CMP PF"),

        // =====================================
        // ESIC - USE EXACT DB NAMES
        // =====================================
          getAdditionalChargesByType(siteId, "ESIC"),

        getAdditionalChargesByType(siteId, "EMP ESIC"),
        getAdditionalChargesByType(siteId, "CMP ESIC"),

        // =====================================
        // OTHER DEDUCTIONS
        // =====================================
        getAdditionalChargesByType(siteId, "MLWF"),
        getAdditionalChargesByType(siteId, "EmployerMLWF"),
        getAdditionalChargesByType(siteId, "LOAN"),
        getAdditionalChargesByType(siteId, "ID"),
        getAdditionalChargesByType(siteId, "RECOVERY"),
        getAdditionalChargesByType(siteId, "INSTALLMENTS"),
      ]);
      for (const empRow of atData) {
        logger.log("Processing Employee:", empRow.emp_code, empRow.emp_name);
        const empDetailArr = await getEmployeeByCode(empRow.emp_code);
        if (!empDetailArr || empDetailArr.length === 0) {
          logger.log("Employee not found:", empRow.emp_code);
          continue;
        }
        const empDetail = empDetailArr[0];
        const salaryTemplateId = empDetail.salary_template_id;
        const hasEmployeeSalaryTemplate =
          salaryTemplateId !== null &&
          salaryTemplateId !== undefined &&
          Number(salaryTemplateId) > 0;
        const [
          totalWo,
          totalWo1,
          totalPresent,
          totalAbsent,
          totalHoliday,
          totalCl,
          totalPl,
          totalSl,
          totalDd,
          totalOtHours,
          totalHf,
        ] = await Promise.all([
          getTotalDaysByStatusEmp(
            "W",
            empRow.site_id,
            month,
            year,
            empRow.emp_code,
            empRow.rank,
            attType,
          ),
          getTotalDaysByStatusEmp(
            "WP",
            empRow.site_id,
            month,
            year,
            empRow.emp_code,
            empRow.rank,
            attType,
          ),
          getTotalPresentDaysEmp(
            empRow.site_id,
            month,
            year,
            empRow.emp_code,
            empRow.rank,
            attType,
          ),
          getTotalDaysByStatusEmp(
            "A",
            empRow.site_id,
            month,
            year,
            empRow.emp_code,
            empRow.rank,
            attType,
          ),
          
          getTotalDaysByStatusEmp(
            "H",
            empRow.site_id,
            month,
            year,
            empRow.emp_code,
            empRow.rank,
            attType,
          ),
          getTotalDaysByStatusEmp(
            "CL",
            empRow.site_id,
            month,
            year,
            empRow.emp_code,
            empRow.rank,
            attType,
          ),
          getTotalDaysByStatusEmp(
            "PL",
            empRow.site_id,
            month,
            year,
            empRow.emp_code,
            empRow.rank,
            attType,
          ),
          getTotalDaysByStatusEmp(
            "SL",
            empRow.site_id,
            month,
            year,
            empRow.emp_code,
            empRow.rank,
            attType,
          ),
          getTotalDoubleDutyDays(
            empRow.site_id,
            month,
            year,
            empRow.emp_code,
            empRow.rank,
            attType,
          ),
          getTotalOvertimeByEmp(
            empRow.site_id,
            month,
            year,
            empRow.emp_code,
            empRow.rank,
            attType,
          ),
          getTotalHalfDaysByEmp(
            empRow.site_id,
            month,
            year,
            empRow.emp_code,
            empRow.rank,
            attType,
          ),
        ]);
        const presentDays = Number(totalPresent?.total_days || 0);
      const absentDays = Number(totalAbsent?.total_days || 0);
logger.log("ABSENT DAYS COUNT:", absentDays);
        const weeklyOff = Number(totalWo?.total_days || 0);
        const paidWeeklyOff = Number(totalWo1?.total_days || 0);
        const paidHoliday = Number(totalHoliday?.total_days || 0);
        const totalPlVal = Number(totalPl?.total_days || 0);

        const totalClVal = Number(totalCl?.total_days || 0);
        const totalSlVal = Number(totalSl?.total_days || 0);
        const halfDaysCount = Number(totalHf?.total_days || 0);
        const doubleDutyDays = Number(totalDd || 0);
        const overtimeHours = Number(totalOtHours || 0);
        const siteDetailArr = await getSiteDetail(empRow.site_id, empRow.rank);
        const siteDetail = siteDetailArr?.[0] || {};
  const isWithoutSunday =
    String(monthdays).trim().toLowerCase() === "withoutsunday";

  const excludeWeekoff =
    String(siteInfo.exclude_weekoff_netday) === "1";

  console.log("Total Present Days:", presentDays);
logger.log("DEBUG HALF DAYS:", {
  halfDaysCount,
  presentDays,
  noOfDaysMonth,
});
  const netDays = calculateNetDays({
    presentDays: Number(presentDays) || 0,
    halfDays: halfDaysCount,
    weeklyOff,
    paidWeeklyOff,
    totalHoliday: paidHoliday,
    pl: totalPlVal,
    cl: totalClVal,
    sl: totalSlVal,
    doubleDutyDays,
    hasOtRate: !!siteDetail.ot_rate,
    excludeHoliday: String(siteInfo.exclude_holiday_netday) === "1",
    excludeWeekoff,
    billingDays: noOfDaysMonth,
  });

  logger.log("Final Net Days:", netDays);

  logger.log("Billing Type:", monthdays);
  logger.log("WithoutSunday:", isWithoutSunday);
  logger.log("Exclude Weekoff:", excludeWeekoff);
  logger.log("Present Days:", presentDays);
  logger.log("Weekly Off:", weeklyOff);
  logger.log("Paid Weekly Off:", paidWeeklyOff);
  logger.log("Net Days:", netDays);
  const finalNetDays = Math.min(
    Math.max(0, Number(netDays) || 0),
    Math.max(0, Number(noOfDaysMonth) || 0)
  );
  // Net days हे महिन्याच्या एकूण दिवसांपेक्षा जास्त होऊ देऊ नका.

  logger.log({
    presentDays,
    weeklyOff,
    calculatedNetDays: netDays,
    finalNetDays,
  });

        const clientData = await getClientById(clientId);


        if (!clientData) {
          throw new Error(
            `Client not found in new_client for client ID: ${clientId}`,
          );
        }

        clientDetails = clientData;

        // IMPORTANT: used later in employee/wages loop
        const clientName = clientData.company_name || "";


        const billingCompanyId = clientData.billing_company_id;


        if (billingCompanyId) {
          const billingCompany = await getCompanyById(billingCompanyId);


          if (!billingCompany) {
            throw new Error(
              `Billing company not found in companies for ID: ${billingCompanyId}`,
            );
          }

          billingCompanyDetails = billingCompany;
        }
        const advanceData = await getEmployeeVouchers(
          empRow.site_id,
          month,
          year,
          empDetail.id,
        );
        const deductAdvance = advanceData
          ? Number(advanceData.totalexpense || 0)
          : 0;
        if (nonCompliance === 1) {
          const toNumber = (value) => {
            if (value === null || value === undefined || value === "") {
              return 0;
            }
            const n = Number(value);
            return Number.isFinite(n) ? n : 0;
          };
          const roundValue = (value, decimals = 2) => {
            const numberValue = toNumber(value);
            return Number(numberValue.toFixed(decimals));
          };
          const actualMonthDays = new Date(
            Number(year),
            Number(month),
            0,
          ).getDate();
          const getPerDayAmount = (monthlyAmount, monthDays) => {
            if (toNumber(monthDays) <= 0) {
              return 0;
            }
            return roundValue(
              toNumber(monthlyAmount) / toNumber(monthDays),
              decimalPoint,
            );
          };
          const getEarnedAmount = (monthlyAmount, monthDays, workingDays) => {
            const perDayAmount = getPerDayAmount(monthlyAmount, monthDays);
            return roundValue(perDayAmount * toNumber(workingDays), decimalPoint);
          };
          const templateArr = await getSalaryTemplate({
            employeeId: empDetail.id,
            employeeCode: empRow.emp_code,
            month,
            year,
          });
          if (!Array.isArray(templateArr) || templateArr.length === 0) {
            throw new Error(
              `Salary template not found for employee ${empRow.emp_code}`,
            );
          }
          const salaryTemplateData = templateArr[0];
  const safeMonthDays = Math.max(
    1,
    Number(noOfDaysMonth) || 1
  );
        const safeNetDays = Math.min(
    Math.max(0, Number(finalNetDays) || 0),
    Math.max(0, Number(noOfDaysMonth) || 0)
  );
          let salaryFactor = safeNetDays / safeMonthDays;
          salaryFactor = Math.min(1, Math.max(0, salaryFactor));
          salaryFactor = Number(salaryFactor.toFixed(6));
          const basic = toNumber(
            salaryTemplateData.basic_salary ?? salaryTemplateData.basic ?? 0,
          );
          const vda = toNumber(salaryTemplateData.vda ?? 0);
          const hra = toNumber(salaryTemplateData.hra ?? 0);
          const specialAllow = toNumber(
            salaryTemplateData.special_allow ??
              salaryTemplateData.special_allowance ??
              0,
          );
          const otherAllow = toNumber(
            salaryTemplateData.other_allow ??
              salaryTemplateData.other_allowance ??
              0,
          );
          const lww = toNumber(salaryTemplateData.lww ?? 0);
          const bonus = toNumber(salaryTemplateData.bonus ?? 0);
          const fixedLeaveWages = toNumber(
            salaryTemplateData.fixed_leave_wages ?? 0,
          );
          const fixedUniformWages = toNumber(
            salaryTemplateData.fixed_uniform_wages ?? 0,
          );
          const anyOther = toNumber(salaryTemplateData.any_other ?? 0);
          const basicVda = roundValue(basic + vda, decimalPoint);
          const calculatedGross = roundValue(
            basic +
              vda +
              hra +
              specialAllow +
              otherAllow +
              lww +
              bonus +
              fixedLeaveWages +
              fixedUniformWages +
              anyOther,
            decimalPoint,
          );
          const templateGross = toNumber(
            salaryTemplateData.gross_salary ?? salaryTemplateData.gross ?? 0,
          );
          let gross = calculatedGross;
          if (calculatedGross <= 0 && templateGross > 0) {
            gross = templateGross;
          }
          gross = roundValue(gross, decimalPoint);
          const perDayBasic = getPerDayAmount(basic, safeMonthDays);
          const perDayDa = getPerDayAmount(vda, safeMonthDays);
          const perDayBasicDa = roundValue(perDayBasic + perDayDa, decimalPoint);
          const perDayHra = getPerDayAmount(hra, safeMonthDays);
          const perDaySpecialAllow = getPerDayAmount(specialAllow, safeMonthDays);
          const perDayOtherAllow = getPerDayAmount(otherAllow, safeMonthDays);
          const perDayLww = getPerDayAmount(lww, safeMonthDays);
          const perDayBonus = getPerDayAmount(bonus, safeMonthDays);
          const perDayLeaveWages = getPerDayAmount(
            fixedLeaveWages,
            safeMonthDays,
          );
          const perDayUniformWages = getPerDayAmount(
            fixedUniformWages,
            safeMonthDays,
          );
          const perDayAnyOther = getPerDayAmount(anyOther, safeMonthDays);
          const perDayGross = getPerDayAmount(gross, safeMonthDays);
          const earnedBasic = roundValue(perDayBasic * safeNetDays, decimalPoint);
          const earnedDa = roundValue(perDayDa * safeNetDays, decimalPoint);
          const earnedBasicDa = roundValue(earnedBasic + earnedDa, decimalPoint);
          const earnedHra = roundValue(perDayHra * safeNetDays, decimalPoint);
          const earnedSpecialAllow = roundValue(
            perDaySpecialAllow * safeNetDays,
            decimalPoint,
          );
          const earnedOtherAllow = roundValue(
            perDayOtherAllow * safeNetDays,
            decimalPoint,
          );
          const earnedLww = roundValue(perDayLww * safeNetDays, decimalPoint);
          const earnedBonus = roundValue(perDayBonus * safeNetDays, decimalPoint);
          const earnedLeaveWages = roundValue(
            perDayLeaveWages * safeNetDays,
            decimalPoint,
          );
          const earnedUniformWages = roundValue(
            perDayUniformWages * safeNetDays,
            decimalPoint,
          );
          const earnedAnyOther = roundValue(
            perDayAnyOther * safeNetDays,
            decimalPoint,
          );
          let earnedGross = roundValue(
            earnedBasic +
              earnedDa +
              earnedHra +
              earnedSpecialAllow +
              earnedOtherAllow +
              earnedLww +
              earnedBonus +
              earnedLeaveWages +
              earnedUniformWages +
              earnedAnyOther,
            decimalPoint,
          );
          if (earnedGross <= 0 && gross > 0) {
            earnedGross = roundValue(perDayGross * safeNetDays, decimalPoint);
          }
          const templatePfWages = toNumber(salaryTemplateData.pf_wages);
          const perDayPfWages =
            templatePfWages > 0
              ? getPerDayAmount(templatePfWages, safeMonthDays)
              : perDayBasicDa;
          let pfWages = roundValue(perDayPfWages * safeNetDays, decimalPoint);
          const templateDeductPf = toNumber(salaryTemplateData.deduct_pf);
          const perDayDeductPf = getPerDayAmount(templateDeductPf, safeMonthDays);
          let deductPf = roundValue(perDayDeductPf * safeNetDays, decimalPoint);
          const templateEmpPf = toNumber(salaryTemplateData.emp_pf);
          const perDayEmpPf = getPerDayAmount(templateEmpPf, safeMonthDays);
          let empPf = roundValue(perDayEmpPf * safeNetDays, decimalPoint);
         
const deductPt = roundValue(
  await getAdditionalChargesForPT(
    empRow.site_id,
    "P.T.",
    earnedGross,
    empDetail.gender,
  ),
  decimalPoint,
);

          const templateEsicWages = toNumber(salaryTemplateData.esic_wages);
          const perDayEsicWages =
            templateEsicWages > 0
              ? getPerDayAmount(templateEsicWages, safeMonthDays)
              : perDayGross;
          let esicWages = roundValue(perDayEsicWages * safeNetDays, decimalPoint);
          const templateDeductEsic = toNumber(salaryTemplateData.deduct_esic);
          const perDayDeductEsic = getPerDayAmount(
            templateDeductEsic,
            safeMonthDays,
          );
          let deductEsic = roundValue(
            perDayDeductEsic * safeNetDays,
            decimalPoint,
          );
          const templateEmpEsic = toNumber(salaryTemplateData.emp_esic);
          const perDayEmpEsic = getPerDayAmount(templateEmpEsic, safeMonthDays);
          let empEsic = roundValue(perDayEmpEsic * safeNetDays, decimalPoint);
          const templateDeductLwf = toNumber(salaryTemplateData.deduct_lwf);
          const perDayDeductLwf = getPerDayAmount(
            templateDeductLwf,
            safeMonthDays,
          );
          let deductLwf = roundValue(perDayDeductLwf * safeNetDays, decimalPoint);
          const templateEmpLwf = toNumber(salaryTemplateData.emp_lwf);
          const perDayEmpLwf = getPerDayAmount(templateEmpLwf, safeMonthDays);
          let empLwf = roundValue(perDayEmpLwf * safeNetDays, decimalPoint);
          const safeDeductAdvance = toNumber(deductAdvance);
          const templateLoan = toNumber(salaryTemplateData.deduct_loan);
          const deductLoan =
            templateLoan > 0
              ? roundValue(
                  getPerDayAmount(templateLoan, safeMonthDays) * safeNetDays,
                  decimalPoint,
                )
              : toNumber(loanRateArr?.[0]?.charges_services);
          const templateId = toNumber(salaryTemplateData.deduct_id);
          const deductId =
            templateId > 0
              ? roundValue(
                  getPerDayAmount(templateId, safeMonthDays) * safeNetDays,
                  decimalPoint,
                )
              : toNumber(idRateArr?.[0]?.charges_services);
          const templateRecovery = toNumber(salaryTemplateData.deduct_recovery);
          const deductRecovery =
            templateRecovery > 0
              ? roundValue(
                  getPerDayAmount(templateRecovery, safeMonthDays) * safeNetDays,
                  decimalPoint,
                )
              : toNumber(recoveryRateArr?.[0]?.charges_services);
          const templateInstallment = toNumber(
            salaryTemplateData.deduct_installment,
          );
          const deductInstallment =
            templateInstallment > 0
              ? roundValue(
                  getPerDayAmount(templateInstallment, safeMonthDays) *
                    safeNetDays,
                  decimalPoint,
                )
              : toNumber(installmentRateArr?.[0]?.charges_services);
          const templateDeductOther = toNumber(salaryTemplateData.deduct_other);
          const deductOther = roundValue(
            getPerDayAmount(templateDeductOther, safeMonthDays) * safeNetDays,
            decimalPoint,
          );
          const templateDeductUniform = toNumber(
            salaryTemplateData.deduct_uniform,
          );
          const deductUniform = roundValue(
            getPerDayAmount(templateDeductUniform, safeMonthDays) * safeNetDays,
            decimalPoint,
          );
          const totalDeduction = roundValue(
            deductPf +
              deductPt +
              deductEsic +
              deductLwf +
              deductLoan +
              deductId +
              deductRecovery +
              deductInstallment +
              deductOther +
              deductUniform +
              safeDeductAdvance,
            decimalPoint,
          );
          let netTakeHome = roundValue(
            earnedGross - totalDeduction,
            decimalPoint,
          );
          if (netTakeHome < 0) {
            netTakeHome = 0;
          }
          const salaryPayable = netTakeHome;
          const templateEmpGratuity = toNumber(
            salaryTemplateData.emp_gratuty ?? salaryTemplateData.emp_gratuity,
          );
          const perDayEmpGratuity = getPerDayAmount(
            templateEmpGratuity,
            safeMonthDays,
          );
          const empGratuity = roundValue(
            perDayEmpGratuity * safeNetDays,
            decimalPoint,
          );
          const templateEmpAnyOther = toNumber(salaryTemplateData.emp_any_other);
          const perDayEmpAnyOther = getPerDayAmount(
            templateEmpAnyOther,
            safeMonthDays,
          );
          const empAnyOther = roundValue(
            perDayEmpAnyOther * safeNetDays,
            decimalPoint,
          );
          const empCtc = roundValue(
            earnedGross + empPf + empEsic + empLwf + empGratuity + empAnyOther,
            decimalPoint,
          );
          const templateServiceCharges = toNumber(
            salaryTemplateData.emp_service_charges ??
              salaryTemplateData.service_charges,
          );
          const perDayServiceCharges = getPerDayAmount(
            templateServiceCharges,
            safeMonthDays,
          );
          const serviceCharges = roundValue(
            perDayServiceCharges * safeNetDays,
            decimalPoint,
          );

          let empIctc = 0;
          const ctcCalculate = String(siteInfo.CTC_calculate || "")
            .trim()
            .toUpperCase();
          if (ctcCalculate === "NETSALARY+TOTALCONTRIBUTION+BONUS") {
            empIctc = roundValue(
              netTakeHome + empPf + empEsic + empLwf + empGratuity + earnedBonus,
              decimalPoint,
            );
          } else {
            empIctc = roundValue(empCtc + serviceCharges, decimalPoint);
          }
          logger.log("EMPLOYEE ICTC =", empIctc);
          const cgst = toNumber(siteInfo.cc_cgst);

          const sgst = toNumber(siteInfo.cc_sgst);

          const igst = toNumber(siteInfo.cc_igst);
          const cgstAmt = roundValue((empIctc * cgst) / 100, decimalPoint);

          const sgstAmt = roundValue((empIctc * sgst) / 100, decimalPoint);

          const igstAmt = roundValue((empIctc * igst) / 100, decimalPoint);

          const totalGst = roundValue(cgstAmt + sgstAmt + igstAmt, decimalPoint);

          const invoiceAmount = roundValue(empIctc + totalGst, decimalPoint);
          const formattedMonth = String(month).padStart(2, "0");

          console.log("======================================");
          console.log("RANK RATE DEBUG");
          console.log("Employee :", empRow.emp_name);
          console.log("Rank     :", empRow.rank);
          console.log("emp_total_cost :", siteDetail?.emp_total_cost);
          console.log("rank_rate :", Number(siteDetail?.emp_total_cost || 0));
          console.log("======================================");

          const wagesArr = {
            site_id: toNumber(empRow.site_id),

            client_id: siteInfo.client_id,
            client_code: empRow.client_code ?? "",
            client_name: clientName ?? "",

            at_month: formattedMonth,
            at_year: year,
            at_type: attType,

            emp_id: empDetail.id,
            emp_code: empRow.emp_code,
            emp_name: empRow.emp_name,
            rank: empRow.rank,

            rank_rate: Number(siteDetail.emp_total_cost || 0),

            month_days: safeMonthDays,

            present_days: roundValue(
              presentDays + halfDaysCount / 2,
              decimalPoint,
            ),

            absent_days: absentDays,
            weekly_off: weeklyOff,
            paid_leaves: paidWeeklyOff,
            paid_holiday: paidHoliday,
            total_holiday: paidHoliday,

            total_pl: totalPlVal,
            total_cl: totalClVal,
            total_sl: totalSlVal,

            half_day: halfDaysCount,
            net_days: safeNetDays,

            // =========================
            // SALARY COMPONENTS
            // =========================

            ot_days: 0,

            // Configured monthly basic
            basic: roundValue(basic, decimalPoint),

            vda: roundValue(vda, decimalPoint),

            // Do NOT put calculated gross here
            basic_vda: roundValue(basicVda, decimalPoint),

            hra: roundValue(hra, decimalPoint),

            special_allow: roundValue(specialAllow, decimalPoint),

            other_allow: roundValue(otherAllow, decimalPoint),

            lww: roundValue(lww, decimalPoint),

            bonus: roundValue(bonus, decimalPoint),

            fixed_leave_wages: roundValue(fixedLeaveWages, decimalPoint),

            fixed_uniform_wages: roundValue(fixedUniformWages, decimalPoint),

            any_other: roundValue(anyOther, decimalPoint),

            gross: roundValue(gross, decimalPoint),

            // =========================
            // OT
            // =========================

            ot_rate: 0,

            per_day_rate: roundValue(perDayGross, decimalPoint),

            // =========================
            // EARNED COMPONENTS
            // =========================

            earned_basic: roundValue(earnedBasic, decimalPoint),

            earned_da: roundValue(earnedDa, decimalPoint),

            earned_basic_da: roundValue(earnedBasicDa, decimalPoint),

            earned_hra: roundValue(earnedHra, decimalPoint),

            earned_special_allow: roundValue(earnedSpecialAllow, decimalPoint),

            earned_other_allow: roundValue(earnedOtherAllow, decimalPoint),

            earned_lww: roundValue(earnedLww, decimalPoint),

            earned_bonus: roundValue(earnedBonus, decimalPoint),

            earned_leave_wages: roundValue(earnedLeaveWages, decimalPoint),

            earned_uniform_wages: roundValue(earnedUniformWages, decimalPoint),

            earned_any_other: roundValue(earnedAnyOther, decimalPoint),

            earned_ot_wages: 0,
            earned_holiday_pay: 0,
            earned_incentive: 0,
            earned_night_allow: 0,
            night_allow: 0,

            earned_gross: roundValue(earnedGross, decimalPoint),

            // =========================
            // DEDUCTIONS
            // =========================

            pf_wages: roundValue(pfWages, decimalPoint),
            esic_wages: roundValue(esicWages, decimalPoint),

            deduct_pf: roundValue(deductPf, decimalPoint),
            deduct_pt: roundValue(deductPt, decimalPoint),
            deduct_esic: roundValue(deductEsic, decimalPoint),
            deduct_lwf: roundValue(deductLwf, decimalPoint),
            deduct_other: roundValue(deductOther, decimalPoint),

            deduct_advance: roundValue(safeDeductAdvance, decimalPoint),

            deduct_loan: roundValue(deductLoan, decimalPoint),
            deduct_uniform: roundValue(deductUniform, decimalPoint),
            deduct_id: roundValue(deductId, decimalPoint),
            deduct_recovery: roundValue(deductRecovery, decimalPoint),
            deduct_installment: roundValue(deductInstallment, decimalPoint),

            total_deduction: roundValue(totalDeduction, decimalPoint),

            net_take_home: roundValue(netTakeHome, decimalPoint),

            salary_payable: roundValue(salaryPayable, decimalPoint),

            // =========================
            // EMPLOYER
            // =========================

            emp_pf: roundValue(empPf, decimalPoint),
            emp_esic: roundValue(empEsic, decimalPoint),
            emp_lwf: roundValue(empLwf, decimalPoint),
            emp_gratuty: roundValue(empGratuity, decimalPoint),

            emp_any_other: roundValue(empAnyOther, decimalPoint),

            emp_ctc: roundValue(empCtc, decimalPoint),

            emp_service_charges: roundValue(serviceCharges, decimalPoint),

            emp_ictc: roundValue(empIctc, decimalPoint),

            CGST: roundValue(cgstAmt, decimalPoint),
            SGST: roundValue(sgstAmt, decimalPoint),
            IGST: roundValue(igstAmt, decimalPoint),

            emp_gst: roundValue(totalGst, decimalPoint),

            emp_invoice_amount: roundValue(invoiceAmount, decimalPoint),

            total_nos: 1,

            billing_type: "DailyAttendance",

            source: "Web Application",
          };

          console.table({
            emp_code: wagesArr.emp_code,

            month_days: wagesArr.month_days,

            net_days: wagesArr.net_days,

            salary_factor: salaryFactor,

            per_day_basic: perDayBasic,

            per_day_da: perDayDa,

            per_day_hra: perDayHra,

            per_day_gross: perDayGross,

            gross: wagesArr.gross,

            earned_gross: wagesArr.earned_gross,

            pf_wages: wagesArr.pf_wages,

            deduct_pf: wagesArr.deduct_pf,

            emp_pf: wagesArr.emp_pf,

            esic_wages: wagesArr.esic_wages,

            deduct_esic: wagesArr.deduct_esic,

            emp_esic: wagesArr.emp_esic,

            total_deduction: wagesArr.total_deduction,

            net_take_home: wagesArr.net_take_home,

            emp_ctc: wagesArr.emp_ctc,

            emp_ictc: wagesArr.emp_ictc,

            invoice_amount: wagesArr.emp_invoice_amount,
          });

          console.log("FULL WAGES OBJECT:");

          console.log(JSON.stringify(wagesArr, null, 2));

          await insertEmpWages(wagesArr);

          savedWages.push(wagesArr);

          continue;
        }
  const components = calculateSalaryComponents({
    siteDetail,
    netDays,
    monthDays: noOfDaysMonth,
    decimalPoint,
    bonusArr,
      isWithoutSunday,
  });

  logger.log("===== SALARY COMPONENTS DEBUG =====");
  logger.log({
    netDays,
    monthDays: noOfDaysMonth,
    components,
  });
  logger.log("===================================");

        let otRate = 0;

        if (siteDetail.ot_rate) {
          otRate = Number(siteDetail.ot_rate);
        } else if (otRateArr && otRateArr.length > 0) {
          otRate = Number(otRateArr[0].charges_services || 0);
        }

        const otDays = doubleDutyDays + overtimeHours;

  const earned = calculateEarnedComponents({
    components,
    netDays: finalNetDays,
    monthDays: noOfDaysMonth,
    empPerDayRate: siteDetail.emp_perday_rate,
    otherChargesArr,
    decimalPoint,
  });

  logger.log("===== EARNED COMPONENTS DEBUG =====");
  logger.log({
    components,
    finalNetDays,
    monthDays: noOfDaysMonth,
    empPerDayRate: siteDetail.emp_perday_rate,
    otherChargesArr,
    earned,
  });
  logger.log("===================================");

  logger.log("EARNED COMPONENTS RESULT:", {
    finalNetDays,
    noOfDaysMonth,
    empPerDayRate: siteDetail.emp_perday_rate,
    earned,
  });

        let earnedHra = earned.earnedHra;

        let earnedBasicDa = earned.earnedBasicDa;

        if (Number(siteDetail.emp_perday_rate || 0) > 0) {
          const hraRateArr = await getAdditionalChargesByType(
            empRow.site_id,
            "HRA",
          );

          if (hraRateArr && hraRateArr.length > 0) {
            const earnedBasicForHra = Number(
              (Number(siteDetail.emp_perday_rate) * Number(netDays)).toFixed(
                decimalPoint,
              ),
            );

            if (hraRateArr[0].count_services === "Rs") {
              earnedHra = Number(hraRateArr[0].charges_services || 0);
            } else {
              earnedHra = Number(
                (
                  (earnedBasicForHra *
                    Number(hraRateArr[0].charges_services || 0)) /
                  100
                ).toFixed(decimalPoint),
              );
            }

            earnedBasicDa = 0;
          } else {
            earnedHra = 0;
          }
        }
        const earnedOtWagesRaw = calculateOTWages({
          siteDetail,
          siteInfo,
          otRate,
          otDays,
          overtime: overtimeHours,
          gross: components.gross,
          otRateArr,
          decimalPoint,
        });

        let holidayPay = 0;

        if (
          holidayPayArr &&
          holidayPayArr.length > 0 &&
          holidayPayArr[0].ea_calculateon === "OnGrossSalary"
        ) {
          holidayPay = Number(
            (
              (Number(components.gross || 0) / Number(noOfDaysMonth)) *
              Number(paidHoliday)
            ).toFixed(decimalPoint),
          );
        }

        let nightAllow = 0;

        if (nightAllowArr && nightAllowArr.length > 0) {
          const na = nightAllowArr[0];

          if (na.count_services === "Rs") {
            nightAllow = Number(na.charges_services || 0);
          }
        }

        const partialWages = {
          earned_basic: siteDetail.emp_perday_rate
            ? Number(
                (Number(siteDetail.emp_perday_rate) * Number(netDays)).toFixed(
                  decimalPoint,
                ),
              )
            : Number(earned.earnedBasic || 0),

          earned_basic_da: Number(earnedBasicDa || 0),
          earned_hra: Number(earnedHra || 0),
          earned_special_allow: Number(earned.earnedSpecialAllow || 0),
          earned_other_allow: Number(earned.earnedOtherAllow || 0),
          earned_lww: Number(earned.earnedLww || 0),
          earned_bonus: Number(earned.earnedBonus || 0),
          earned_leave_wages: Number(earned.earnedLeaveWages || 0),
          earned_uniform_wages: 0,
          earned_holiday_pay: holidayPay,
          earned_ot_wages: Number(earnedOtWagesRaw || 0),
          month_days: noOfDaysMonth,
          ot_days: otDays,
        };
        const { earnedGross, earnedOtWages, daysPay, esicAppl } =
          calculateEarnedGross({
            siteDetail,
            siteInfo,
            wages: partialWages,
            doubleOtRateArr,
            decimalPoint,
          });
        // =====================================================
        // PF CALCULATION
        // DB:
        // EMP PF = Employee PF deduction
        // CMP PF = Company/Employer PF contribution
        // =====================================================

        // ======================================================
        // PF CALCULATION
        // ======================================================

        // let deductPf = 0;
        // let empPf = 0;
        // let pfWages = 0;

        // // ------------------------------------------------------
        // // EMPLOYEE PF
        // // ------------------------------------------------------
        // if (Array.isArray(empPfRateArr) && empPfRateArr.length > 0) {
        //   const rule = empPfRateArr[0];

        //   const calculateOn = String(rule.ea_calculateon || "")
        //     .trim()
        //     .toUpperCase();

        //   let matchBase = 0;

        //   // IMPORTANT:
        //   // Use earned.earnedBasic directly
        //   if (calculateOn === "BASIC") {
        //     matchBase = Number(earned?.earnedBasic || 0);
        //   } else if (calculateOn === "BASIC+DA") {
        //     matchBase = Number(earnedBasicDa || 0);
        //   } else if (calculateOn === "PFWAGES") {
        //     matchBase = Number(pfWages || 0);
        //   } else if (calculateOn === "ONGROSSSALARY") {
        //     matchBase = Number(earnedGross || 0);
        //   } else {
        //     matchBase = Number(earned?.earnedBasic || 0);
        //   }

        //   pfWages = matchBase;

        //   const rate = Number(rule.charges_services || 0);

        //   const unit = String(rule.count_services || "")
        //     .trim()
        //     .toUpperCase();

        //   if (unit === "%") {
        //     deductPf = Number(((matchBase * rate) / 100).toFixed(decimalPoint));
        //   } else {
        //     deductPf = Number(rate.toFixed(decimalPoint));
        //   }

        //   console.log("======================================");
        //   console.log("🔥 EMPLOYEE PF");
        //   console.log("Employee     =", empDetail?.emp_code);
        //   console.log("Calculate On =", calculateOn);
        //   console.log("Earned Basic =", earned?.earnedBasic);
        //   console.log("PF Base      =", matchBase);
        //   console.log("Rate         =", rate);
        //   console.log("Unit         =", unit);
        //   console.log("EMP PF       =", deductPf);
        //   console.log("======================================");
        // }

        // // ------------------------------------------------------
        // // EMPLOYER PF
        // // ------------------------------------------------------
        // if (Array.isArray(cmpPfRateArr) && cmpPfRateArr.length > 0) {
        //   const rule = cmpPfRateArr[0];

        //   const calculateOn = String(rule.ea_calculateon || "")
        //     .trim()
        //     .toUpperCase();

        //   let matchBase = 0;

        //   if (calculateOn === "BASIC") {
        //     matchBase = Number(earned?.earnedBasic || 0);
        //   } else if (calculateOn === "BASIC+DA") {
        //     matchBase = Number(earnedBasicDa || 0);
        //   } else if (calculateOn === "PFWAGES") {
        //     matchBase = Number(pfWages || 0);
        //   } else if (calculateOn === "ONGROSSSALARY") {
        //     matchBase = Number(earnedGross || 0);
        //   } else {
        //     matchBase = Number(earned?.earnedBasic || 0);
        //   }

        //   if (!pfWages) {
        //     pfWages = matchBase;
        //   }

        //   const rate = Number(rule.charges_services || 0);

        //   const unit = String(rule.count_services || "")
        //     .trim()
        //     .toUpperCase();

        //   if (unit === "%") {
        //     empPf = Number(((matchBase * rate) / 100).toFixed(decimalPoint));
        //   } else {
        //     empPf = Number(rate.toFixed(decimalPoint));
        //   }

        //   console.log("======================================");
        //   console.log("🔥 EMPLOYER PF");
        //   console.log("Employee     =", empDetail?.emp_code);
        //   console.log("Calculate On =", calculateOn);
        //   console.log("Earned Basic =", earned?.earnedBasic);
        //   console.log("PF Base      =", matchBase);
        //   console.log("Rate         =", rate);
        //   console.log("Unit         =", unit);
        //   console.log("CMP PF       =", empPf);
        //   console.log("======================================");
        // }

        // // ------------------------------------------------------
        // // FINAL PF
        // // ------------------------------------------------------
        // console.log("======================================");
        // console.log("🔥 FINAL PF CALCULATION");
        // console.log("EMP PF RATE =", empPfRateArr);
        // console.log("CMP PF RATE =", cmpPfRateArr);
        // console.log("PF WAGES    =", pfWages);
        // console.log("DEDUCT PF   =", deductPf);
        // console.log("EMP PF      =", empPf);
        // console.log("======================================");

        // console.log("======================================");
        // console.log("🔥 PF CALCULATION");
        // console.log("EMP PF RATE =", empPfRateArr);
        // console.log("CMP PF RATE =", cmpPfRateArr);
        // console.log("PF WAGES    =", pfWages);
        // console.log("DEDUCT PF   =", deductPf);
        // console.log("EMP PF      =", empPf);
        // console.log("======================================");
        // const deductPt = await getAdditionalChargesForPT(
        //   empRow.site_id,
        //   "P.T.",
        //   earnedGross,
        //   empDetail.gender,
        // );
        // let deductEsic = 0;
        // let empEsic = 0;
        // let esicWages = 0;

        let deductPf = 0;
        let empPf = 0;
        let pfWages = 0;

        // ------------------------------------------------------
        // PF WAGES DATA
        // ------------------------------------------------------
        const pfWagesData = {
          earned_basic: Number(earned?.earnedBasic || 0),
          earned_basic_da: Number(earnedBasicDa || 0),
          earned_hra: Number(earnedHra || 0),
          earned_special_allow: Number(earned?.earnedSpecialAllow || 0),
          earned_other_allow: Number(earned?.earnedOtherAllow || 0),
          earned_bonus: Number(earned?.earnedBonus || 0),
          daysPay: Number(earnedGross || 0),
        };

        console.log("======================================");
        console.log("🔥 PF WAGES DATA");
        console.log("Employee           =", empDetail?.emp_code);
        console.log("Earned Basic       =", pfWagesData.earned_basic);
        console.log("Earned Basic DA    =", pfWagesData.earned_basic_da);
        console.log("Earned HRA         =", pfWagesData.earned_hra);
        console.log("Earned Special     =", pfWagesData.earned_special_allow);
        console.log("Earned Other Allow =", pfWagesData.earned_other_allow);
        console.log("Earned Bonus       =", pfWagesData.earned_bonus);
        console.log("Earned Gross       =", pfWagesData.daysPay);
        console.log("======================================");

        // ------------------------------------------------------
        // EMPLOYEE PF
        // ------------------------------------------------------
        if (Array.isArray(empPfRateArr) && empPfRateArr.length > 0) {
          const rule = empPfRateArr[0];

          const matchBase = resolvePfWagesBase({
            pfCalculatedOn: rule.ea_calculateon,
            wages: pfWagesData,
            empPerDayRate: Number(siteDetail?.emp_perday_rate || 0),
            decimalPoint,
          });

          pfWages = matchBase;

          const rate = Number(rule.charges_services || 0);

          const unit = String(rule.count_services || "")
            .trim()
            .toUpperCase();

          if (unit === "%") {
            deductPf = Number(((matchBase * rate) / 100).toFixed(decimalPoint));
          } else {
            deductPf = Number(rate.toFixed(decimalPoint));
          }

          console.log("======================================");
          console.log("🔥 EMPLOYEE PF");
          console.log("Employee     =", empDetail?.emp_code);
          console.log("Calculate On =", rule.ea_calculateon);
          console.log(
            "Normalized   =",
            String(rule.ea_calculateon || "")
              .trim()
              .toUpperCase()
              .replace(/\s+/g, ""),
          );
          console.log("Earned Basic =", pfWagesData.earned_basic);
          console.log("Earned Basic DA =", pfWagesData.earned_basic_da);
          console.log("Earned HRA   =", pfWagesData.earned_hra);
          console.log("Earned Gross =", pfWagesData.daysPay);
          console.log("PF Base      =", matchBase);
          console.log("Rate         =", rate);
          console.log("Unit         =", unit);

          if (unit === "%") {
            console.log(
              "Calculation  =",
              `${matchBase} × ${rate} ÷ 100 = ${deductPf}`,
            );
          } else {
            console.log("Calculation  =", `Fixed Amount = ${rate}`);
          }

          console.log("EMP PF       =", deductPf);
          console.log("======================================");
        }

        // ------------------------------------------------------
        // EMPLOYER PF
        // ------------------------------------------------------
        if (Array.isArray(cmpPfRateArr) && cmpPfRateArr.length > 0) {
          const rule = cmpPfRateArr[0];

          const matchBase = resolvePfWagesBase({
            pfCalculatedOn: rule.ea_calculateon,
            wages: pfWagesData,
            empPerDayRate: Number(siteDetail?.emp_perday_rate || 0),
            decimalPoint,
          });

          if (!pfWages) {
            pfWages = matchBase;
          }

          const rate = Number(rule.charges_services || 0);

          const unit = String(rule.count_services || "")
            .trim()
            .toUpperCase();

          if (unit === "%") {
            empPf = Number(((matchBase * rate) / 100).toFixed(decimalPoint));
          } else {
            empPf = Number(rate.toFixed(decimalPoint));
          }

          console.log("======================================");
          console.log("🔥 EMPLOYER PF");
          console.log("Employee     =", empDetail?.emp_code);
          console.log("Calculate On =", rule.ea_calculateon);
          console.log(
            "Normalized   =",
            String(rule.ea_calculateon || "")
              .trim()
              .toUpperCase()
              .replace(/\s+/g, ""),
          );
          console.log("Earned Basic =", pfWagesData.earned_basic);
          console.log("Earned Basic DA =", pfWagesData.earned_basic_da);
          console.log("Earned HRA   =", pfWagesData.earned_hra);
          console.log("Earned Gross =", pfWagesData.daysPay);
          console.log("PF Base      =", matchBase);
          console.log("Rate         =", rate);
          console.log("Unit         =", unit);

          if (unit === "%") {
            console.log(
              "Calculation  =",
              `${matchBase} × ${rate} ÷ 100 = ${empPf}`,
            );
          } else {
            console.log("Calculation  =", `Fixed Amount = ${rate}`);
          }

          console.log("CMP PF       =", empPf);
          console.log("======================================");
        }

        // ------------------------------------------------------
        // FINAL PF
        // ------------------------------------------------------
        console.log("======================================");
        console.log("🔥 FINAL PF CALCULATION");
        console.log("Employee     =", empDetail?.emp_code);
        console.log("EMP PF RATE  =", empPfRateArr);
        console.log("CMP PF RATE  =", cmpPfRateArr);
        console.log("PF WAGES     =", pfWages);
        console.log("DEDUCT PF    =", deductPf);
        console.log("EMP PF       =", empPf);
        console.log("======================================");

    const deductPt = Number(
  Number(
    await getAdditionalChargesForPT(
      empRow.site_id,
      "P.T.",
      earnedGross,
      empDetail.gender,
    ),
  ).toFixed(decimalPoint),
);
        let deductEsic = 0;
  let empEsic = 0;
  let esicWages = 0;

  const toNum = (value) => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  const normalizeEsic = (value) =>
    String(value ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");

  const roundEsic = (value) =>
    Number(toNum(value).toFixed(decimalPoint));

  const esicWagesData = {
    earned_basic: toNum(earned?.earnedBasic),
    earned_basic_da: toNum(earnedBasicDa),
    earned_hra: toNum(earnedHra),
    earned_special_allow: toNum(earned?.earnedSpecialAllow),
    earned_other_allow: toNum(earned?.earnedOtherAllow),
    earned_bonus: toNum(earned?.earnedBonus),
    earned_gross: toNum(earnedGross),
    earned_ot_wages: toNum(earnedOtWages),
  };

  const gross = esicWagesData.earned_gross;
  const basicDa = esicWagesData.earned_basic_da;
  const hra = esicWagesData.earned_hra;
  const otherAllow = esicWagesData.earned_other_allow;
  const ot = esicWagesData.earned_ot_wages;

  // Site-level ESIC wages setting
  const getSiteEsicWages = () => {
    const setting = normalizeEsic(
      siteInfo?.ESIC_wages_calculated_on
    );

    switch (setting) {
      case "GROSS":
        return gross;

      case "BASIC":
        return basicDa;

      case "GROSS-OTHERALLOW":
        return gross - otherAllow;

      case "BASIC+HRA":
        return basicDa + hra;

      default:
        return 0;
    }
  };

  // ESIC rule calculation base

const getEsicRuleBase = (rule, currentEsicWages) => {
  const setting = normalizeEsic(rule?.ea_calculateon);

  switch (setting) {
    case "ESICWAGES":
      return currentEsicWages;

    case "BASIC":
      // BASIC only — HRA add करू नका
      return toNum(esicWagesData.earned_basic);

    case "ONGROSSSALARY":
    case "GROSS":
      return gross;

    case "GROSS-OTHER+OTAMT":
      return gross - otherAllow + ot;

    default:
      return resolveEsicWagesBase({
        esicCalculatedOn: rule?.ea_calculateon,
        wages: esicWagesData,
        decimalPoint,
      });
  }
};


  // Check rule condition against gross salary
  const esicRuleMatches = (rule) => {
    const operator = String(rule?.ea_operator ?? "").trim();
    const compareValue = toNum(rule?.ea_comp_operator);

    if (!operator) return true;

    switch (operator) {
      case "=":
      case "==":
        return gross === compareValue;
      case ">":
        return gross > compareValue;
      case ">=":
        return gross >= compareValue;
      case "<":
        return gross < compareValue;
      case "<=":
        return gross <= compareValue;
      default:
        console.warn("Unknown ESIC operator:", operator);
        return false;
    }
  };

  const calculateEsic = (rule, base) => {
    const rate = toNum(rule?.charges_services);
    const unit = String(rule?.count_services ?? "")
      .trim()
      .toUpperCase();

    if (unit === "%") {
      return roundEsic((base * rate) / 100);
    }

    return roundEsic(rate);
  };

  // Initial ESIC wages from site setting
  esicWages = roundEsic(getSiteEsicWages());

  // ======================================================
  // GENERIC ESIC - EMPLOYEE DEDUCTION
  // ======================================================
  if (Array.isArray(esicRateArr) && esicRateArr.length > 0) {
    const rule = esicRateArr[0];
    const calculateOn = normalizeEsic(rule?.ea_calculateon);
    const unit = String(rule?.count_services ?? "")
      .trim()
      .toUpperCase();

    let base = esicWages;

    if (calculateOn === "GROSS-OTHER+OTAMT") {
      base = gross - otherAllow + ot;
    }

    if (unit === "RS") {
      deductEsic = roundEsic(rule?.charges_services);
    } else {
      deductEsic = calculateEsic(rule, base);
    }
  }

  // ======================================================
  // EMPLOYEE ESIC - EMP ESIC
  // ======================================================
  if (Array.isArray(empEsicRateArr) && empEsicRateArr.length > 0) {
    for (const rule of empEsicRateArr) {
      const compareValue = toNum(rule?.ea_comp_operator);
      const hasCompareValue =
        rule?.ea_comp_operator !== "" &&
        rule?.ea_comp_operator !== null &&
        rule?.ea_comp_operator !== undefined;

      // PHP wage-cap behaviour
      if (hasCompareValue && gross > compareValue) {
        esicWages = roundEsic(compareValue);
      } else {
        esicWages = roundEsic(getSiteEsicWages());
      }

      if (!esicRuleMatches(rule)) continue;

      const calculateOn = normalizeEsic(rule?.ea_calculateon);
      const operator = String(rule?.ea_operator ?? "").trim();
      const base = getEsicRuleBase(rule, esicWages);

      if (!operator && calculateOn === "GROSS-OTHER+OTAMT") {
        const rate = toNum(rule?.charges_services);

        deductEsic = roundEsic(
          ((gross - otherAllow) * rate) / 100 +
          (ot * rate) / 100
        );
      } else {
        deductEsic = calculateEsic(rule, base);
      }
    }
  }

  // ======================================================
  // COMPANY ESIC - CMP ESIC
  // ======================================================
  if (
    Array.isArray(companyEsicRateArr) &&
    companyEsicRateArr.length > 0
  ) {
    esicWages = roundEsic(getSiteEsicWages());

    for (const rule of companyEsicRateArr) {
      if (!esicRuleMatches(rule)) continue;

      const calculateOn = normalizeEsic(rule?.ea_calculateon);
      const operator = String(rule?.ea_operator ?? "").trim();
      const base = getEsicRuleBase(rule, esicWages);

      if (!operator && calculateOn === "GROSS-OTHER+OTAMT") {
        const rate = toNum(rule?.charges_services);

        empEsic = roundEsic(
          ((gross - otherAllow) * rate) / 100 +
          (ot * rate) / 100
        );
      } else {
        empEsic = calculateEsic(rule, base);
      }
    }
  }

  console.log("========== FINAL ESIC ==========");
  console.log("Site ESIC setting:", siteInfo?.ESIC_wages_calculated_on);
  console.log("Gross:", gross);
  console.log("Other allowance:", otherAllow);
  console.log("OT wages:", ot);
  console.log("ESIC wages:", esicWages);
  console.log("Employee ESIC deduction:", deductEsic);
  console.log("Company ESIC contribution:", empEsic);
  console.log("================================");
      
        let deductLwf = 0;

        // ======================================================
        // EMPLOYEE LWF
        // ======================================================
        if (Array.isArray(lwfRateArr) && lwfRateArr.length > 0) {
          const rule = lwfRateArr[0];

          const calculateOn = String(rule.ea_calculateon || "")
            .trim()
            .toUpperCase()
            .replace(/\s+/g, "");

          const rate = Number(rule.charges_services || 0);

          if (calculateOn === "ATACTUAL") {
            // Fixed amount
            deductLwf = Number(rate.toFixed(decimalPoint));
          } else {
            // Pro-rata LWF
            deductLwf = Number(
              ((rate / Number(noOfDaysMonth)) * Number(netDays)).toFixed(
                decimalPoint,
              ),
            );
          }

          console.log("======================================");
          console.log("🔥 EMPLOYEE LWF");
          console.log("Employee     =", empDetail?.emp_code);
          console.log("Calculate On =", calculateOn);
          console.log("Rate         =", rate);
          console.log("Month Days   =", noOfDaysMonth);
          console.log("Net Days     =", netDays);
          console.log("EMP LWF      =", deductLwf);
          console.log("======================================");
        }

        // ======================================================
        // EMPLOYER LWF
        // ======================================================
        let empLwf = 0;

        if (Array.isArray(emplwfRateArr) && emplwfRateArr.length > 0) {
          const rule = emplwfRateArr[0];

          const calculateOn = String(rule.ea_calculateon || "")
            .trim()
            .toUpperCase()
            .replace(/\s+/g, "");

          const rate = Number(rule.charges_services || 0);

          if (calculateOn === "ATACTUAL") {
            // Fixed amount
            empLwf = Number(rate.toFixed(decimalPoint));
          } else {
            // Pro-rata LWF
            empLwf = Number(
              ((rate / Number(noOfDaysMonth)) * Number(netDays)).toFixed(
                decimalPoint,
              ),
            );
          }

          console.log("======================================");
          console.log("🔥 EMPLOYER LWF");
          console.log("Employee     =", empDetail?.emp_code);
          console.log("Calculate On =", calculateOn);
          console.log("Rate         =", rate);
          console.log("Month Days   =", noOfDaysMonth);
          console.log("Net Days     =", netDays);
          console.log("CMP LWF      =", empLwf);
          console.log("======================================");
        }

        console.log("======================================");
        console.log("🔥 FINAL LWF");
        console.log("EMP LWF      =", deductLwf);
        console.log("CMP LWF      =", empLwf);
        console.log("======================================");
        const deductLoan = loanRateArr?.length
          ? Number(loanRateArr[0].charges_services || 0)
          : 0;

        const deductId = idRateArr?.length
          ? Number(idRateArr[0].charges_services || 0)
          : 0;

        const deductRecovery = recoveryRateArr?.length
          ? Number(recoveryRateArr[0].charges_services || 0)
          : 0;

        const deductInstallment = installmentRateArr?.length
          ? Number(installmentRateArr[0].charges_services || 0)
          : 0;
        const totalDeduction = Number(
          (
            Number(deductPf) +
            Number(deductPt || 0) +
            Number(deductEsic) +
            Number(deductLwf) +
            Number(deductLoan) +
            Number(deductId) +
            Number(deductRecovery) +
            Number(deductInstallment) +
            Number(deductAdvance)
          ).toFixed(decimalPoint),
        );
        const netTakeHome = Number(
          (Number(earnedGross) - Number(totalDeduction)).toFixed(decimalPoint),
        );

        const salaryPayable = netTakeHome;
        let empAnyOther = 0;

        if (siteDetail.fixed_uniform_wages) {
          empAnyOther =
            String(siteInfo.calculate_uniform_days) === "1"
              ? Number(
                  (
                    (Number(siteDetail.fixed_uniform_wages) /
                      Number(noOfDaysMonth)) *
                    Number(netDays)
                  ).toFixed(decimalPoint),
                )
              : Number(
                  Number(siteDetail.fixed_uniform_wages).toFixed(decimalPoint),
                );
        }
        const empCtc = Number(
          (
            Number(earnedGross) +
            Number(empPf) +
            Number(empEsic) +
            Number(empLwf) +
            Number(empAnyOther)
          ).toFixed(decimalPoint),
        );
        const serviceAtActual = await getServiceChargesAtActual(empRow.site_id);
        const serviceCharges = calculateServiceCharges({
          siteDetail,
          empCtc,
          netDays,
          serviceAtActual,
          decimalPoint,
        });

        console.log("========== SERVICE CHARGE RESULT ==========");

        console.log("Employee:", empRow.emp_name);
        console.log("Net Days:", netDays);
        console.log("Service Type:", siteDetail?.service_charges_type);
        console.log("Service Rate:", siteDetail?.service_charges);
        console.log("CALCULATED serviceCharges:", serviceCharges);
        console.log("============================================");
        let empIctc;

        if (siteInfo.CTC_calculate === "NETSALARY+TOTALCONTRIBUTION+BONUS") {
          empIctc = Number(
            (
              Number(earnedGross) +
              Number(empPf) +
              Number(earned.earnedBonus || 0) +
              Number(empLwf)
            ).toFixed(decimalPoint),
          );
        } else {
          empIctc = Number(
            (Number(empCtc) + Number(serviceCharges)).toFixed(decimalPoint),
          );
        }
        const cgst = Number(siteInfo.cc_cgst || 0);

        const sgst = Number(siteInfo.cc_sgst || 0);

        const igst = Number(siteInfo.cc_igst || 0);

        const cgstAmt = Number(
          ((Number(empIctc) * cgst) / 100).toFixed(decimalPoint),
        );

        const sgstAmt = Number(
          ((Number(empIctc) * sgst) / 100).toFixed(decimalPoint),
        );

        const igstAmt = Number(
          ((Number(empIctc) * igst) / 100).toFixed(decimalPoint),
        );

        const totalGst = Number(
          (cgstAmt + sgstAmt + igstAmt).toFixed(decimalPoint),
        );
        const invoiceAmount = Number(
          (Number(empIctc) + Number(totalGst)).toFixed(decimalPoint),
        );
        const formattedMonth = String(month).padStart(2, "0");
        const wagesArr = {
          site_id: Number.parseInt(empRow.site_id, 10),

          client_id: siteInfo.client_id,
          client_code: empRow.client_code ?? "",
          client_name: clientName ?? "",

          at_month: formattedMonth,
          at_year: year,
          at_type: attType,

          emp_id: empDetail.id,
          emp_code: empRow.emp_code,
          emp_name: empRow.emp_name,
          rank: empRow.rank,

          rank_rate: Number(siteDetail?.emp_total_cost || 0),

          month_days: Number(noOfDaysMonth) || 0,

          paid_holiday: Number(paidHoliday) || 0,
          total_holiday: Number(paidHoliday) || 0,

          total_pl: Number(totalPlVal) || 0,
          total_cl: Number(totalClVal) || 0,
          total_sl: Number(totalSlVal) || 0,

          present_days: Number(presentDays || 0) + Number(halfDaysCount || 0) / 2,

          absent_days: Number(absentDays) || 0,

          weekly_off: Number(weeklyOff) || 0,

          paid_leaves: Number(paidWeeklyOff) || 0,

          net_days: Number(netDays) || 0,

          ot_days: Number(otDays) || 0,

          // =====================================================
          // BASIC / SALARY COMPONENTS
          // =====================================================

          // IMPORTANT:
          // basic = configured basic salary
          // NOT earnedGross
          basic: Number(Number(components.basic || 0).toFixed(decimalPoint)),

          hra: Number(Number(components.hra || 0).toFixed(decimalPoint)),

          vda: Number(Number(components.vda || 0).toFixed(decimalPoint)),

          basic_vda: Number(
            Number(components.basicDa || 0).toFixed(decimalPoint),
          ),

          special_allow: Number(
            Number(components.specialAllow || 0).toFixed(decimalPoint),
          ),

          other_allow: Number(
            Number(components.otherAllow || 0).toFixed(decimalPoint),
          ),

          lww: Number(Number(components.lww || 0).toFixed(decimalPoint)),

          bonus: Number(Number(components.bonus || 0).toFixed(decimalPoint)),

          fixed_leave_wages: Number(
            Number(components.fixedLeaveWages || 0).toFixed(decimalPoint),
          ),

          fixed_uniform_wages: Number(
            Number(components.fixedUniformWages || 0).toFixed(decimalPoint),
          ),

          any_other: Number(
            Number(components.anyOther || 0).toFixed(decimalPoint),
          ),

          // Gross should come from calculated salary component gross
          gross: Number(Number(components.gross || 0).toFixed(decimalPoint)),

          // =====================================================
          // OT
          // =====================================================

          ot_rate: Number(Number(otRate || 0).toFixed(decimalPoint)),

          per_day_rate: siteDetail.emp_perday_rate
            ? Number(Number(siteDetail.emp_perday_rate).toFixed(decimalPoint))
            : 0,

          // =====================================================
          // EARNED COMPONENTS
          // =====================================================

          earned_basic: Number(
            Number(earned.earnedBasic || 0).toFixed(decimalPoint),
          ),

          earned_da: Number(Number(earned.earnedDa || 0).toFixed(decimalPoint)),

          earned_basic_da: Number(
            Number(earnedBasicDa || 0).toFixed(decimalPoint),
          ),

          earned_special_allow: Number(
            Number(earned.earnedSpecialAllow || 0).toFixed(decimalPoint),
          ),

          earned_hra: Number(Number(earned.earnedHra || 0).toFixed(decimalPoint)),

          earned_other_allow: Number(
            Number(earned.earnedOtherAllow || 0).toFixed(decimalPoint),
          ),

          earned_lww: Number(Number(earned.earnedLww || 0).toFixed(decimalPoint)),

          earned_bonus: Number(
            Number(earned.earnedBonus || 0).toFixed(decimalPoint),
          ),

          earned_leave_wages: Number(
            Number(earned.earnedLeaveWages || 0).toFixed(decimalPoint),
          ),

          earned_uniform_wages: Number(
            Number(earned.earnedUniformWages || 0).toFixed(decimalPoint),
          ),

          earned_any_other: Number(
            Number(earned.earnedAnyOther || 0).toFixed(decimalPoint),
          ),

          earned_ot_wages: Number(
            Number(earnedOtWages || 0).toFixed(decimalPoint),
          ),

          earned_holiday_pay: Number(
            Number(holidayPay || 0).toFixed(decimalPoint),
          ),

          night_allow: Number(Number(nightAllow || 0).toFixed(decimalPoint)),

          earned_gross: Number(Number(earnedGross || 0).toFixed(decimalPoint)),

          // =====================================================
          // PF / ESIC
          // =====================================================

          pf_wages: Number(Number(pfWages || 0).toFixed(decimalPoint)),

          esic_wages: Number(Number(esicWages || 0).toFixed(decimalPoint)),

          deduct_pf: Number(Number(deductPf || 0).toFixed(decimalPoint)),

          deduct_pt: Number(Number(deductPt || 0).toFixed(decimalPoint)),

          deduct_esic: Number(Number(deductEsic || 0).toFixed(decimalPoint)),

          deduct_lwf: Number(Number(deductLwf || 0).toFixed(decimalPoint)),

          deduct_loan: Number(Number(deductLoan || 0).toFixed(decimalPoint)),

          deduct_uniform: 0,

          deduct_id: Number(Number(deductId || 0).toFixed(decimalPoint)),

          deduct_recovery: Number(
            Number(deductRecovery || 0).toFixed(decimalPoint),
          ),

          deduct_installment: Number(
            Number(deductInstallment || 0).toFixed(decimalPoint),
          ),

          deduct_other: 0,

          deduct_advance: Number(
            Number(deductAdvance || 0).toFixed(decimalPoint),
          ),

          total_deduction: Number(
            Number(totalDeduction || 0).toFixed(decimalPoint),
          ),

          net_take_home: Number(Number(netTakeHome || 0).toFixed(decimalPoint)),

          salary_payable: Number(
            Number(salaryPayable || 0).toFixed(decimalPoint),
          ),

          // =====================================================
          // EMPLOYER CONTRIBUTION
          // =====================================================

          emp_pf: Number(Number(empPf || 0).toFixed(decimalPoint)),

          emp_esic: Number(Number(empEsic || 0).toFixed(decimalPoint)),

          emp_gratuty: 0,

          emp_any_other: Number(Number(empAnyOther || 0).toFixed(decimalPoint)),

          emp_lwf: Number(Number(empLwf || 0).toFixed(decimalPoint)),

          emp_ctc: Number(Number(empCtc || 0).toFixed(decimalPoint)),

          emp_service_charges: Number(
            Number(serviceCharges || 0).toFixed(decimalPoint),
          ),

          emp_ictc: Number(Number(empIctc || 0).toFixed(decimalPoint)),

          CGST: Number(Number(cgstAmt || 0).toFixed(decimalPoint)),

          SGST: Number(Number(sgstAmt || 0).toFixed(decimalPoint)),

          IGST: Number(Number(igstAmt || 0).toFixed(decimalPoint)),

          emp_gst: Number(Number(totalGst || 0).toFixed(decimalPoint)),

          emp_invoice_amount: Number(
            Number(invoiceAmount || 0).toFixed(decimalPoint),
          ),

          total_nos: 1,

          billing_type: "DailyAttendance",

          source: "Web Application",
        };

        console.log("========== INSERT EMP WAGES Rank Rate  ==========");
        console.log("Rank :", wagesArr.rank);
        console.log("Rank Rate :", wagesArr.rank_rate);
        console.log("rank_rate :", Number(siteDetail?.emp_total_cost || 0));
        console.log("Service Charges Type:", siteDetail?.service_charges_type);
        console.log(
          "Service Charges :",
          Number(siteDetail?.service_charges || 0),
        );

        console.log("======================================");
        await insertEmpWages(wagesArr);
        savedWages.push(wagesArr);
      }

      // =====================================================
      // 1. ALL AT ACTUAL CHARGES
      // =====================================================

      const actActualCharges = await getAdditionalChargesAtActual(siteId);

      console.log("🔥 AT ACTUAL CHARGES =", actActualCharges);

      if (Array.isArray(actActualCharges) && actActualCharges.length > 0) {
        for (const charge of actActualCharges) {
          await insertActualCharge({
            site_id: siteId,
            client_id: siteInfo.client_id,
            client_code: siteInfo.client_code,

            at_month: month,
            at_year: year,
            at_type: attType,

            charges_type: String(charge.type_of_services || "").trim(),

            total_nos: 0,
            cost_per_head: 0,

            total: Number(Number(charge.charges_services || 0).toFixed(2)),
          });
        }
      }

      // =====================================================
      // 2. OTHER + AT ACTUAL CHARGES
      // =====================================================

      const otherActualCharges = await getOtherChargesAtActual(siteId);

      console.log("🔥 OTHER AT ACTUAL CHARGES =", otherActualCharges);

      if (Array.isArray(otherActualCharges) && otherActualCharges.length > 0) {
        for (const charge of otherActualCharges) {
          await insertActualCharge({
            site_id: siteId,
            client_id: siteInfo.client_id,
            client_code: siteInfo.client_code,

            at_month: month,
            at_year: year,
            at_type: attType,

            charges_type: String(charge.type_of_services || "").trim(),

            total_nos: 0,
            cost_per_head: 0,

            total: Number(Number(charge.charges_services || 0).toFixed(2)),
          });
        }
      }

      // EMP WAGES PF SUMMARY
      console.log("========== EMP WAGES PF ==========");
      console.log("========== EMP WAGES PF ==========");
      console.log("========== EMP WAGES PF ==========");
      console.log("========== EMP WAGES PF ==========");
      console.log("========== EMP WAGES PF ==========");
      console.log("========== EMP WAGES PF ==========");
      console.log("========== EMP WAGES PF ==========");
      console.log("siteId:", site);
      console.log("month:", m);
      console.log("year:", y);
      console.log("atType:", type);
      console.log("==================================");

      const empWagesPf = await getEmpWagesPf(site, m, y, type);

      console.log("========== EMP WAGES PF ==========");
      console.log("========== EMP WAGES PF ==========");
      console.log("========== EMP WAGES PF ==========");
      console.log("========== EMP WAGES PF ==========");
      console.log("========== EMP WAGES PF ==========");
      console.log("========== EMP WAGES PF ==========");
      console.log("========== EMP WAGES PF ==========");
      console.log("Total Employees:", empWagesPf?.total_nos);
      console.log("siteId:", site);
      console.log("month:", m);
      console.log("year:", y);
      console.log("atType:", type);
      console.log("Total PF:", empWagesPf?.totalpf);
      console.log("==================================");

      const empWagesBonus = await getEmpWagesBonus(site, m, y, type);
      console.log("========== EMP WAGES BONUS ==========");
      console.log("Total Employees:", empWagesBonus?.total_nos);
      console.log("Total Bonus:", empWagesBonus?.totalbonus);
      console.log("=====================================");

      const empWagesServiceCharges = await getEmpWagesServiceCharges(
        site,
        m,
        y,
        type,
      );
      const empWagesPt = await getEmpWagesPt(site, m, y, type);
      const empWagesOt = await getEmpWagesOt(site, m, y, type);
      const empWagesEsic = await getEmpWagesEsic(site, m, y, type);
      const atActualCharges = await getAtActualChargesBySite(site, m, y, type);

      console.log("========== ACTUAL CHARGES ==========");
      console.log(atActualCharges);
      console.log("====================================");

      return res.status(200).json({
        success: true,
        message: "Invoice created successfully",
        invoice_no: invoiceNo,
        site: siteInfo,
        month,
        year,
        type: attType,
        non_compliance: nonCompliance,
        total_employees: savedWages.length,
        wages: savedWages,
        client: clientDetails,
        billingCompany: billingCompanyDetails,
        billingDays: monthdays,
        // EMP WAGES PF
        empWagesPf: {
          total_nos: Number(empWagesPf?.total_nos || 0),
          totalpf: Number(empWagesPf?.totalpf || 0),
        },

        empWagesBonus: {
          total_nos: Number(empWagesBonus?.total_nos || 0),
          totalbonus: Number(empWagesBonus?.totalbonus || 0),
        },

        empWagesServiceCharges: {
          total_nos: Number(empWagesServiceCharges?.total_nos || 0),
          totalservice_charges: Number(
            empWagesServiceCharges?.totalservice_charges || 0,
          ),
        },
        empWagesPt: {
          total_nos: Number(empWagesPt?.total_nos || 0),
          totalpt: Number(empWagesPt?.totalpt || 0),
        },
        empWagesOt: {
          total_nos: Number(empWagesOt?.total_nos || 0),
          totalot: Number(empWagesOt?.totalot || 0),
          totalotdays: Number(empWagesOt?.totalotdays || 0),
          ot_rate: Number(empWagesOt?.ot_rate || 0),
        },
        empWagesEsic: {
          total_nos: Number(empWagesEsic?.total_nos || 0),
          totalesic: Number(empWagesEsic?.totalesic || 0),
        },

        atActualCharges: atActualCharges,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Failed to create invoice",

        error: err.message,
      });
    } finally {
      activeRequests.delete(lockKey);
    }
  };
const getBillByAutoNo = async (req, res) => {
  try {
    const { autoNo } = req.params;

    const bill = await getBillByAutoNoModel(autoNo);

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: "Bill not found",
      });
    }

    res.status(200).json({
      success: true,

      data: bill,
    });
  } catch (error) {
    console.log("Get Bill Error:", error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

const updateBill = async (req, res) => {
  try {
    const { autoNo } = req.params;

    const {
      client_id, // ADD
      site_id, // ADD

      invoice_no,
      invoice_month,
      invoice_year,
      invoice_date,
      bill_title,
      items,
      deletedRows,
    } = req.body;

    const userId = req.user.id;

    const updateData = {
      autoNo,

      client_id, // ADD
      site_id, // ADD

      invoice_no,
      invoice_month,
      invoice_year,
      invoice_date,
      bill_title,

      items,
      deletedRows,

      modified_by: userId,
    };

    console.log("UPDATE DATA :", updateData);

    await updateBillModel(updateData);

    res.status(200).json({
      success: true,
      message: "Bill Updated Successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
const generateFinal = async (req, res) => {
  try {
    console.log("BODY:", req.body);

    if (req.body.items) {
      req.body.items = JSON.parse(req.body.items);
    }

    const result = await generateFinalInvoice(
      req.body,
      req.files || [],
      req.user,
    );

    return res.status(200).json({
      success: true,
      message: "Invoice generated successfully",
      invoice_no: result.invoice_no,
      auto_no: result.auto_no,
    });
  } catch (error) {
    console.error("=================================");
    console.error("GENERATE FINAL ERROR");
    console.error("=================================");
    console.error("Message:", error.message);
    console.error("Stack:", error.stack);
    console.error("=================================");

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
const billingIndex = async (req, res) => {
  try {
    const userId = req.user.id;

    // =========================================
    // USER ROLE AND COMPANY
    // =========================================

    const userRole = String(req.user.role || "")
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");

    const isSuperAdmin = [
      "super admin",
      "superadmin",
    ].includes(userRole);

    const companyId =
      req.user.company_id ??
      req.user.billing_company_id ??
      null;

    // Admin must have a valid company ID
    if (!isSuperAdmin) {
      if (
        companyId === null ||
        companyId === undefined ||
        companyId === "" ||
        !Number.isSafeInteger(Number(companyId)) ||
        Number(companyId) <= 0
      ) {
        return res.status(403).json({
          success: false,
          message: "Valid company ID is required for this user",
        });
      }
    }

    // =========================================
    // PAGINATION AND FILTERS
    // =========================================

    const page = Math.max(
      0,
      Number.parseInt(req.query.page, 10) || 0
    );

    const perPage = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.perPage, 10) || 10)
    );

    const wo = String(req.query.wo || "");

    let filters = [];

    try {
      filters = req.query.filters
        ? JSON.parse(req.query.filters)
        : [];
    } catch {
      return res.status(400).json({
        success: false,
        message: "Invalid filters format",
      });
    }

    if (!Array.isArray(filters)) {
      return res.status(400).json({
        success: false,
        message: "Filters must be an array",
      });
    }

    const month = req.query.month || "";
    const year = req.query.year || "";
    const gstType = req.query.gstType || "all";

    console.log("========== BILLING REQUEST ==========");
    console.log("User ID:", userId);
    console.log("Role:", userRole);
    console.log("Super Admin:", isSuperAdmin);
    console.log(
      "Company ID:",
      isSuperAdmin ? "ALL COMPANIES" : companyId
    );
    console.log("Page:", page);
    console.log("Per Page:", perPage);
    console.log("Search:", wo);
    console.log("Filters:", filters);
    console.log("Month:", month);
    console.log("Year:", year);
    console.log("GST Type:", gstType);
    console.log("====================================");

    // =========================================
    // TOTAL BILL COUNT
    // =========================================

    const totalRows = await getBillingCount(
      userId,
      "Active",
      wo,
      filters,
      month,
      year,
      gstType,
      companyId,
      isSuperAdmin
    );

    // =========================================
    // PAGINATED BILLING LIST
    // =========================================

    const billingList = await getBillingList(
      userId,
      page,
      perPage,
      "Active",
      wo,
      filters,
      month,
      year,
      gstType,
      companyId,
      isSuperAdmin
    );

    // =========================================
    // ALL MATCHING BILLS FOR SUMMARY
    // =========================================

    const totalCount = await getBillingTotals(
      userId,
      "Active",
      wo,
      filters,
      month,
      year,
      gstType,
      companyId,
      isSuperAdmin
    );

    // =========================================
    // CALCULATE SUMMARY
    // =========================================

    let totalAmount = 0;
    let balanceAmount = 0;
    let totalBills = 0;
    let totalReceived = 0;
    let totalEstimate = 0;

    for (const row of totalCount) {
      const paidAmount = Number(
        await getPaidAmount(row.invoice_no)
      ) || 0;

      totalAmount +=
        Number(row.total_cost_without_gst || 0) +
        Number(row.cgst || 0) +
        Number(row.sgst || 0) +
        Number(row.igst || 0);

      balanceAmount +=
        Number(row.final_amount || 0) - paidAmount;

      totalEstimate += Number(
        row.cc_est_billing_amount || 0
      );

      totalReceived += paidAmount;
      totalBills++;
    }

    // =========================================
    // USER SETTINGS AND PERMISSIONS
    // =========================================

    const userSearch = await getUserSearch(
      userId,
      "bill_details"
    );

    const userAccess = await getUserRights(
      "HRMS",
      11,
      userId
    );

    // =========================================
    // RESPONSE
    // =========================================

    return res.json({
      success: true,
      page,
      perPage,
      totalRows: Number(totalRows?.totalBills || 0),
      data: billingList,
      summary: {
        totalBills,
        totalAmount,
        balanceAmount,
        totalReceived,
        totalEstimate,
      },
      userSearch,
      userAccess,
    });
  } catch (err) {
    console.error("BILLING ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const downloadBillingExcel = async (req, res) => {
  try {
    const { gstType = "all" } = req.query;

    console.log("Download GST Type:", gstType);

    const data = await getBillingExcelData(gstType);

    const workbook = new ExcelJS.Workbook();

    const sheet = workbook.addWorksheet(
      gstType === "gst"
        ? "GST Billing Report"
        : gstType === "non-gst"
          ? "Non GST Billing Report"
          : "Billing Report",
    );

    sheet.columns = [
      {
        header: "Invoice No",
        key: "invoice_no",
        width: 15,
      },

      {
        header: "Client / Company",
        key: "company_name",
        width: 30,
      },

      {
        header: "Site",
        key: "site_name",
        width: 25,
      },

      {
        header: "Invoice Date",
        key: "invoice_date",
        width: 15,
      },

      {
        header: "Month",
        key: "invoice_month",
        width: 12,
      },

      {
        header: "Year",
        key: "invoice_year",
        width: 10,
      },

      {
        header: "Item Description",
        key: "item_description",
        width: 25,
      },

      {
        header: "HSN / SAC",
        key: "sac_code",
        width: 15,
      },

      {
        header: "Qty / Ton / Day",
        key: "qty",
        width: 15,
      },

      {
        header: "Rate",
        key: "rate",
        width: 12,
      },

      {
        header: "Net Amount",
        key: "net_amount",
        width: 15,
      },

      {
        header: "CGST",
        key: "cgst",
        width: 12,
      },

      {
        header: "SGST",
        key: "sgst",
        width: 12,
      },

      {
        header: "IGST",
        key: "igst",
        width: 12,
      },

      {
        header: "Final Amount",
        key: "final_amount",
        width: 15,
      },
    ];

    data.forEach((row) => {
      sheet.addRow(row);
    });

    sheet.getRow(1).font = {
      bold: true,
    };

    sheet.getRow(1).alignment = {
      horizontal: "center",
    };

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    let fileName = "Billing_Report.xlsx";

    if (gstType === "gst") {
      fileName = "GST_Billing_Report.xlsx";
    } else if (gstType === "non-gst") {
      fileName = "Non_GST_Billing_Report.xlsx";
    }

    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

    await workbook.xlsx.write(res);

    res.end();
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getPaymentHistory = async (req, res) => {
  try {
    const invoice_no = req.query.invoice_no;

    if (!invoice_no) {
      return res.status(400).json({
        success: false,

        message: "Invoice number required",
      });
    }

    const data = await billingModel.getPaymentHistory(invoice_no);

    res.json({
      success: true,

      data: data,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

const searchBills = async (req, res) => {
  try {
    const userId = req.user.id;

    await deleteSearch(userId, "bill_details");

    const {
      search_fields,
      search_keyword,
      search_date_field,
      search_from_date,
      search_to_date,
      search_from_month,
      search_from_year,
    } = req.body;

    console.log(
      search_fields,
      search_keyword,
      search_date_field, // empty
      search_from_date, // empty
      search_to_date, // empty
      search_from_month,
      search_from_year,
    );

    for (let i = 0; i < search_fields.length; i++) {
      if (search_fields[i] || search_date_field || search_from_month) {
        await insertSearch({
          search_fields: search_fields[i],
          search_keyword: search_keyword[i],
          search_date_field,
          search_from_date,
          search_to_date,
          search_from_month,
          search_from_year,
          search_by: userId,
          ref_no: "bill_details",
        });
      }
    }

    res.json({
      success: true,
      message: "Search saved",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const resetSearchBills = async (req, res) => {
  try {
    const userId = req.user.id;

    await deleteSearch(userId, "bill_details");

    await insertSearch({
      search_date_field: "",
      search_from_date: "",
      search_to_date: "",
      search_from_month: new Date().getMonth() + 1,
      search_from_year: new Date().getFullYear(),
      search_by: userId,
      ref_no: "bill_details",
    });

    res.json({
      success: true,
      message: "Search reset successfully",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const changeInvoice = async (req, res) => {
  try {
    const result = await billingModel.changeInvoice(req.body, req.user);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const printInvoice = async (req, res) => {
  try {
    const { autoNo } = req.params;

    const billInfo = await getMasterDataById("bill_details", "auto_no", autoNo);

    if (!billInfo.length) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    const clientDetail = await getMasterDataById(
      "new_client",
      "id",
      billInfo[0].client_id,
    );

    const siteDetail = await getMasterDataById(
      "client_rates",
      "id",
      billInfo[0].rate_id,
    );

    const companyDetail = await getMasterDataById(
      "companies",
      "id",
      clientDetail[0].billing_company_id,
    );

    const empWages = await getEmpWagesBySite(
      billInfo[0].rate_id,
      billInfo[0].invoice_month,
      billInfo[0].invoice_year,
      "Both",
    );

    const supportings = await getMasterDataById(
      "bill_supportings",
      "auto_no",
      autoNo,
    );

    const companyBankDetail = await bankDetailOnInvoice(
      clientDetail[0].billing_company_id,
      clientDetail[0].company_bank_name,
    );

    const orderInfo = await getOrderInfo(autoNo);

    const monthName = new Date(
      2000,
      parseInt(billInfo[0].invoice_month) - 1,
      1,
    ).toLocaleString("default", {
      month: "long",
    });

    return res.status(200).json({
      success: true,
      data: {
        billInfo,
        clientDetail,
        siteDetail,
        companyDetail,
        empWages,
        supportings,
        companyBankDetail,
        orderInfo,
        monthName,
        year: billInfo[0].invoice_year,
      },
    });
  } catch (error) {
    console.error("Print Invoice Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const XLSX = require("xlsx");
const { TYPE } = require("tedious/lib/token/token");

const downloadWagesTemplate = async (req, res) => {
  try {
    const headers = [
      "SR NO",
      "CLIENT CODE",
      "Client Name",
      "Month",
      "Year",
      "EMPLOYEE Code",
      "Employee Name",
      "Designation",
      "Gender",
      "Month Days",
      "Present Days",
      "Absent Days",
      "OT Day",
      "Weekly Off",
      "Paid Leaves",
      "Half Day",
      "Total Salary Days",
      "Basic",
      "VDA",
      "HRA",
      "Speacial Allowance",
      "Other Allowance",
      "OT Rate",
      "LWW",
      "Bonus",
      "Leave Wages",
      "Uniform Washing",
      "Rate/Day",
      "Any Other",
      "Total Gross",
      "Basic(EC)",
      "VDA(EC)",
      "HRA(EC)",
      "Speacial Allowance(EC)",
      "Other Allowance(EC)",
      "OT Amount(EC)",
      "LWW(EC)",
      "Bonus(EC)",
      "Leave Wages(EC)",
      "Uniform Washhing(EC)",
      "Any Other(EC)",
      "Total Earned(EC)",
      "Wages For PF",
      "Wages For ESIC",
      "EPF",
      "ESIC",
      "PT",
      "MLWF",
      "Advance",
      "Loan",
      "Uniform",
      "ID",
      "Recovery",
      "Installments",
      "Any other",
      "Total Deduction",
      "Net Salary",
      "Arrears Payable If Any",
      "Salary Payable",
      "EPF",
      "ESIC",
      "MLWF",
      "Sub Total",
      "Service Charges",
      "Tax Value Before Tax",
      "CGST",
      "SGST",
      "IGST",
      "Tax Invoice Value",
    ];

    const worksheet = XLSX.utils.aoa_to_sheet([headers]);

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "Employee Wages");

    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx", // IMPORTANT
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Wages_Template.xlsx"',
    );

    return res.send(buffer);
  } catch (error) {
    console.error("Template Download Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate template",
    });
  }
};

const removeBilling = async (req, res) => {
  try {
    const { autoNo, billingType } = req.query;

    if (!autoNo) {
      return res.status(400).json({
        success: false,
        message: "Auto No is required",
      });
    }

    // Logged in user id from token
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not found in token",
      });
    }

    await removeBillingAction(autoNo, billingType, userId);

    return res.status(200).json({
      success: true,
      message: "Data Removed Successfully",
    });
  } catch (error) {
    console.error("Remove Billing Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to remove billing",
    });
  }
};

module.exports = {
  createInvoice,
  generateFinal,
  billingIndex,
  searchBills,
  resetSearchBills,
  printInvoice,
  downloadWagesTemplate,
  removeBilling,
  generateBill,
  generateTransportBill,
  getBillByAutoNo,
  updateBill,
  getTransportBillById,
  updateTransportBill,
  receivePayment,
  getPaymentHistory,
  changeInvoice,

  downloadBillingExcel,
  searchSuggestions,
};
