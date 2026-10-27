/**
 * payrollUtils.js
 * Pure calculation helpers — no DB calls, fully testable in isolation.
 */
const logger = require("../utils/logger");
/**
 * Number of days in a given month/year.
 */
function daysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

/**
 * Count working days in a month.
 * Monday-Saturday = working
 * Sunday = weekly off
 */
function calculateWorkingDays(month, year) {
  const total = daysInMonth(month, year);

  let working = 0;

  for (let d = 1; d <= total; d++) {
    const day = new Date(year, month - 1, d).getDay();

    if (day !== 0) {
      working++;
    }
  }

  return working;
}

/**
 * Resolve month denominator.
 */



function resolveMonthDays(monthdays, month, year, billingNoDays) {
  const m = Number(month);
  const y = Number(year);

  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error(`Invalid month: ${month}`);
  }

  if (!Number.isInteger(y) || y < 1) {
    throw new Error(`Invalid year: ${year}`);
  }

  const calendarDays = new Date(y, m, 0).getDate();

  const billingType = String(monthdays ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");

  if (billingType === "withsunday") {
    return calendarDays;
  }

  if (billingType === "withoutsunday") {
    // calculateWorkingDays() ने Sundays वगळलेले असावेत
    return calculateWorkingDays(m, y);
  }

  if (billingType === "asperbillingcontract") {
    const contractDays = Number(billingNoDays);

    if (
      !Number.isFinite(contractDays) ||
      contractDays <= 0 ||
      contractDays > calendarDays
    ) {
      throw new Error(
        `Invalid billing contract days: ${billingNoDays}`,
      );
    }

    return contractDays;
  }

  throw new Error(`Unknown billing type: "${monthdays}"`);
}


  /**
   * Calculate net payable days.
   */

function calculateNetDays({
  presentDays = 0,
  halfDays = 0,
  weeklyOff = 0,
  paidWeeklyOff = 0,
  totalHoliday = 0,
  pl = 0,
  cl = 0,
  sl = 0,
  doubleDutyDays = 0,
  hasOtRate = false,
  excludeHoliday = false,
  excludeWeekoff = false,
  billingDays = 0,
}) {
  const toDays = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? Math.max(0, num) : 0;
  };

  const present = toDays(presentDays);
  const half = toDays(halfDays);
  const weekOff = toDays(weeklyOff);
  const paidWeekOffDays = toDays(paidWeeklyOff);
  const holiday = toDays(totalHoliday);
  const plDays = toDays(pl);
  const clDays = toDays(cl);
  const slDays = toDays(sl);
  const doubleDuty = toDays(doubleDutyDays);
  const monthDays = toDays(billingDays);

  let net = present;

  // Add weekly offs, including paid Sundays, if enabled.
  if (!excludeWeekoff) {
    net += weekOff + paidWeekOffDays;
  }

  // Add paid holidays if enabled.
  if (!excludeHoliday) {
    net += holiday;
  }

  // Add paid leaves.
  net += plDays + clDays + slDays;

  // Two half-days = one full day.
  net += half / 2;

  // Add double duty only when OT rate is not applicable.
  if (!hasOtRate) {
    net += doubleDuty;
  }

  const calculatedNetDays = Number(Math.max(0, net).toFixed(2));

  logger.log("===== NET DAYS DEBUG =====");
  logger.log({
    presentDays: present,
    weeklyOff: weekOff,
    paidWeeklyOff: paidWeekOffDays,
    halfDays: half,
    totalHoliday: holiday,
    pl: plDays,
    cl: clDays,
    sl: slDays,
    doubleDutyDays: doubleDuty,
    hasOtRate,
    excludeHoliday,
    excludeWeekoff,
    billingDays: monthDays,
    calculatedNetDays,
  });
  logger.log("==========================");

  // Do not cap net days at billingDays.
  return calculatedNetDays;
}

/**
 * ============================================================
 * CALCULATE SALARY COMPONENTS
 * ============================================================
 */
// function calculateSalaryComponents({
//   siteDetail,
//   netDays,
//   monthDays,
//   decimalPoint,
//   bonusArr = [],
// }) {
//   const dp = Number(decimalPoint ?? 2);

//   const days = Math.max(
//     0,
//     Number(netDays || 0)
//   );

//   const daysInMonthValue = Number(
//     monthDays || 0
//   );

//   logger.log(
//     "\n=============================================="
//   );

//   logger.log(
//     "CALCULATE SALARY COMPONENTS"
//   );

//   logger.log(
//     "Employee       :",
//     siteDetail.emp_full_name
//   );

//   logger.log(
//     "emp_total_cost :",
//     siteDetail.emp_total_cost
//   );

//   logger.log(
//     "emp_perday_rate:",
//     siteDetail.emp_perday_rate
//   );

//   logger.log(
//     "emp_basic      :",
//     siteDetail.emp_basic
//   );

//   logger.log(
//     "emp_basicda    :",
//     siteDetail.emp_basicda
//   );

//   logger.log(
//     "emp_da         :",
//     siteDetail.emp_da
//   );

//   logger.log(
//     "monthDays      :",
//     daysInMonthValue
//   );

//   logger.log(
//     "netDays        :",
//     days
//   );

//   logger.log(
//     "decimalPoint   :",
//     dp
//   );

//   // ==========================================================
//   // PER DAY RATE
//   // ==========================================================

//   let perDayRate = 0;

//   const dbPerDayRate = Number(
//     siteDetail.emp_perday_rate || 0
//   );

//   const monthlyBasic = Number(
//     siteDetail.emp_basic || 0
//   );

//   if (dbPerDayRate > 0) {

//     perDayRate = Number(
//       dbPerDayRate.toFixed(dp)
//     );

//   } else if (
//     monthlyBasic > 0 &&
//     daysInMonthValue > 0
//   ) {

//     perDayRate = Number(
//       (
//         monthlyBasic /
//         daysInMonthValue
//       ).toFixed(dp)
//     );
//   }

//   // ==========================================================
//   // BASIC
//   // ==========================================================

//   const basic = Number(
//     (
//       perDayRate * days
//     ).toFixed(dp)
//   );

//   // ==========================================================
//   // DAILY RATES
//   // ==========================================================

//   const hraRate = Number(
//     siteDetail.emp_basicda || 0
//   );

//   const vdaRate = Number(
//     siteDetail.emp_da || 0
//   );

//   const specialAllowRate = Number(
//     siteDetail.special_allow || 0
//   );

//   const otherAllowRate = Number(
//     siteDetail.other_allow || 0
//   );

//   const lwwRate = Number(
//     siteDetail.lww || 0
//   );

//   const leaveWagesRate = Number(
//     siteDetail.fixed_leave_wages || 0
//   );

//   const anyOtherRate = Number(
//     siteDetail.any_other || 0
//   );

//   // ==========================================================
//   // HRA
//   // ==========================================================

//   const hra = Number(
//     (
//       hraRate * days
//     ).toFixed(dp)
//   );

//   // ==========================================================
//   // VDA
//   // ==========================================================

//   const vda = Number(
//     (
//       vdaRate * days
//     ).toFixed(dp)
//   );

//   // ==========================================================
//   // SPECIAL ALLOWANCE
//   // ==========================================================

//   const specialAllow = Number(
//     (
//       specialAllowRate * days
//     ).toFixed(dp)
//   );

//   // ==========================================================
//   // OTHER ALLOWANCE
//   // ==========================================================

//   const otherAllow = Number(
//     (
//       otherAllowRate * days
//     ).toFixed(dp)
//   );

//   // ==========================================================
//   // LWW
//   // ==========================================================

//   const lww = Number(
//     (
//       lwwRate * days
//     ).toFixed(dp)
//   );

//   // ==========================================================
//   // FIXED LEAVE WAGES
//   // ==========================================================

//   const fixedLeaveWages = Number(
//     (
//       leaveWagesRate * days
//     ).toFixed(dp)
//   );

//   // ==========================================================
//   // ANY OTHER
//   // ==========================================================

//   const anyOther = Number(
//     (
//       anyOtherRate * days
//     ).toFixed(dp)
//   );

//   // ==========================================================
//   // BONUS
//   // ==========================================================

//   let configuredBonus = 0;

//   let fixedBonus = 0;

//   let bonus = 0;

//   if (
//     Array.isArray(bonusArr) &&
//     bonusArr.length > 0
//   ) {

//     const cfg = bonusArr[0];

//     const countType = String(
//       cfg.count_services || ""
//     )
//       .trim()
//       .toUpperCase();

//     const bonusRate = Number(
//       cfg.charges_services || 0
//     );

//     if (countType === "RS") {

//       configuredBonus = Number(
//         (
//           bonusRate * days
//         ).toFixed(dp)
//       );

//     } else {

//       const dailyBonus = Number(
//         (
//           (
//             perDayRate *
//             bonusRate
//           ) / 100
//         ).toFixed(dp)
//       );

//       configuredBonus = Number(
//         (
//           dailyBonus *
//           days
//         ).toFixed(dp)
//       );
//     }
//   }

//   // ==========================================================
//   // FIXED BONUS
//   // ==========================================================

//   const fixedBonusRate = Number(
//     siteDetail.bonus || 0
//   );

//   if (fixedBonusRate > 0) {

//     fixedBonus = Number(
//       (
//         fixedBonusRate *
//         days
//       ).toFixed(dp)
//     );

//     bonus = fixedBonus;

//   } else {

//     bonus = configuredBonus;
//   }

//   // ==========================================================
//   // BASIC + VDA
//   // ==========================================================

//   const basicDa = Number(
//     (
//       basic +
//       vda
//     ).toFixed(dp)
//   );

//   // ==========================================================
//   // GROSS
//   // ==========================================================

//   const gross = Number(
//     (
//       basic +
//       hra +
//       vda +
//       specialAllow +
//       otherAllow +
//       lww +
//       bonus +
//       fixedLeaveWages +
//       anyOther
//     ).toFixed(dp)
//   );

//   // ==========================================================
//   // DEBUG
//   // ==========================================================

//   logger.log(
//     "----------------------------------------------"
//   );

//   logger.log(
//     "Per Day Rate     :",
//     perDayRate
//   );

//   logger.log(
//     "Basic            :",
//     basic
//   );

//   logger.log(
//     "HRA              :",
//     hra
//   );

//   logger.log(
//     "VDA              :",
//     vda
//   );

//   logger.log(
//     "Basic + VDA      :",
//     basicDa
//   );

//   logger.log(
//     "Special Allow    :",
//     specialAllow
//   );

//   logger.log(
//     "Other Allow      :",
//     otherAllow
//   );

//   logger.log(
//     "LWW              :",
//     lww
//   );

//   logger.log(
//     "Configured Bonus :",
//     configuredBonus
//   );

//   logger.log(
//     "Fixed Bonus      :",
//     fixedBonus
//   );

//   logger.log(
//     "Final Bonus      :",
//     bonus
//   );

//   logger.log(
//     "Leave Wages      :",
//     fixedLeaveWages
//   );

//   logger.log(
//     "Any Other        :",
//     anyOther
//   );

//   logger.log(
//     "GROSS            :",
//     gross
//   );

//   logger.log(
//     "----------------------------------------------"
//   );

//   return {
//     perDayRate,
//     basic,
//     hra,
//     vda,
//     basicDa,
//     specialAllow,
//     otherAllow,
//     lww,
//     bonus,
//     fixedBonus,
//     fixedLeaveWages,
//     anyOther,
//     gross,
//   };
// }

function calculateSalaryComponents({
  siteDetail = {},
  netDays = 0,
  monthDays = 0,
  decimalPoint = 2,
  bonusArr = [],
  isWithoutSunday = false,
}) {
  const days = Math.max(0, Number(netDays) || 0);
  const noOfDaysMonth = Math.max(0, Number(monthDays) || 0);

  const roundValue = (value) => {
    const factor = Math.pow(10, decimalPoint);
    const num = Number(value);

    return (
      Math.round(
        ((Number.isFinite(num) ? num : 0) + Number.EPSILON) *
          factor
      ) / factor
    );
  };

  const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const hasValue = (value) =>
    value !== null && value !== undefined && value !== "";

  const empPerDayRate = toNumber(siteDetail.emp_perday_rate);
  const empBasic = toNumber(siteDetail.emp_basic);

  const isPerDayEmployee =
    hasValue(siteDetail.emp_perday_rate) && empPerDayRate > 0;

  // WITHOUT SUNDAY = pro-rata
  // WITH SUNDAY = full monthly components
  const salaryFactor = isWithoutSunday
    ? noOfDaysMonth > 0
      ? days / noOfDaysMonth
      : 0
    : 1;

  logger.log("========== calculateSalaryComponents START ==========");
  logger.log({
    mode: isWithoutSunday ? "WITHOUT SUNDAY" : "WITH SUNDAY",
    netDays: days,
    monthDays: noOfDaysMonth,
    salaryFactor,
    isPerDayEmployee,
    empPerDayRate,
    empBasic,
  });

  // BASIC
  let perDayRate = 0;
  let basic = 0;

  if (isPerDayEmployee) {
    perDayRate = empPerDayRate;
    basic = roundValue(empPerDayRate * days);
  } else {
    basic = roundValue(empBasic * salaryFactor);
  }

  // HRA AND VDA
  const hra = roundValue(
    toNumber(siteDetail.emp_basicda) * salaryFactor
  );

  const vda = roundValue(
    toNumber(siteDetail.emp_da) * salaryFactor
  );

  const basicDa = roundValue(basic + vda);

  // ALLOWANCES
  const specialAllow = roundValue(
    toNumber(siteDetail.special_allow) * salaryFactor
  );

  const otherAllow = roundValue(
    toNumber(siteDetail.other_allow) * salaryFactor
  );

  const lww = roundValue(
    toNumber(siteDetail.lww) * salaryFactor
  );

  const fixedLeaveWages = roundValue(
    toNumber(siteDetail.fixed_leave_wages) * salaryFactor
  );

  const anyOther = roundValue(
    toNumber(siteDetail.any_other) * salaryFactor
  );

  // BONUS
  let bonus = 0;
  let fixedBonus = 0;

  const bonusData = Array.isArray(bonusArr) ? bonusArr[0] : null;

  if (bonusData) {
    const countServices = String(
      bonusData.count_services || ""
    )
      .trim()
      .toUpperCase();

    const chargesServices = toNumber(bonusData.charges_services);

    if (countServices === "RS") {
      bonus = chargesServices;
    } else {
      let bonusBasic;

      if (isPerDayEmployee) {
        bonusBasic = basic;
      } else if (isWithoutSunday) {
        // Without Sunday: earned basic for payable days
        bonusBasic = basic;
      } else {
        // With Sunday: preserve original full-month bonus base
        bonusBasic =
          noOfDaysMonth > 0
            ? (basic / noOfDaysMonth) * days
            : 0;
      }

      bonus = (bonusBasic * chargesServices) / 100;
    }
  }

  // Fixed site-level bonus overrides calculated bonus
  if (
    hasValue(siteDetail.bonus) &&
    toNumber(siteDetail.bonus) > 0
  ) {
    fixedBonus = toNumber(siteDetail.bonus);
    bonus = fixedBonus;
  }

  bonus = roundValue(bonus);
  fixedBonus = roundValue(fixedBonus);

  // GROSS
  let gross = 0;

  if (isPerDayEmployee) {
    if (isWithoutSunday) {
      // Without Sunday: rate × payable days
      gross = roundValue(empPerDayRate * days);
    } else {
      // With Sunday: preserve original calculation
      gross = roundValue(empPerDayRate);
    }
  } else {
    gross = roundValue(
      basicDa +
        hra +
        specialAllow +
        otherAllow +
        lww +
        fixedBonus +
        fixedLeaveWages +
        anyOther
    );
  }

  const result = {
    perDayRate,
    basic,
    hra,
    vda,
    basicDa,
    specialAllow,
    otherAllow,
    lww,
    bonus,
    fixedBonus,
    fixedLeaveWages,
    anyOther,
    gross,
  };

  logger.log("Calculation mode:", isWithoutSunday ? "WITHOUT SUNDAY" : "WITH SUNDAY");
  logger.log("Salary components:", result);
  logger.log("========== calculateSalaryComponents END ==========");

  return result;
}


/**
 * ============================================================
 * CALCULATE EARNED COMPONENTS
 * ============================================================
 *
 * IMPORTANT:
 *
 * Salary components are already calculated using netDays.
 *
 * Therefore we DO NOT prorate again here.
 */
// function calculateEarnedComponents({
//   components,
//   netDays,
//   monthDays,
//   empPerDayRate,
//   otherChargesArr = [],
//   decimalPoint,
// }) {
//   const dp = Number(decimalPoint ?? 2);

//   const days = Math.max(
//     0,
//     Number(netDays || 0)
//   );

//   const month = Number(
//     monthDays || 0
//   );

//   const amount = (value) => {
//     return Number(
//       Number(value || 0).toFixed(dp)
//     );
//   };

//   // ==========================================================
//   // BASIC
//   // ==========================================================

//   const earnedBasic = amount(
//     components?.basic
//   );

//   // ==========================================================
//   // DA / VDA
//   // ==========================================================

//   const earnedDa = amount(
//     components?.vda
//   );

//   // ==========================================================
//   // BASIC + DA
//   // ==========================================================

//   const earnedBasicDa = amount(
//     earnedBasic +
//     earnedDa
//   );

//   // ==========================================================
//   // HRA
//   // ==========================================================

//   const earnedHra = amount(
//     components?.hra
//   );

//   // ==========================================================
//   // SPECIAL ALLOWANCE
//   // ==========================================================

//   const earnedSpecialAllow = amount(
//     components?.specialAllow
//   );

//   // ==========================================================
//   // OTHER ALLOWANCE
//   // ==========================================================

//   const earnedOtherAllow = amount(
//     components?.otherAllow
//   );

//   // ==========================================================
//   // LWW
//   // ==========================================================

//   const earnedLww = amount(
//     components?.lww
//   );

//   // ==========================================================
//   // BONUS
//   // ==========================================================

//   const earnedBonus = amount(
//     components?.bonus
//   );

//   // ==========================================================
//   // LEAVE WAGES
//   // ==========================================================

//   const earnedLeaveWages = amount(
//     components?.fixedLeaveWages
//   );

//   // ==========================================================
//   // UNIFORM
//   // ==========================================================

//   const earnedUniformWages = 0;

//   // ==========================================================
//   // ANY OTHER
//   // ==========================================================

//   let earnedAnyOther = 0;

//   if (
//     Array.isArray(otherChargesArr) &&
//     otherChargesArr.length > 0
//   ) {

//     const charge =
//       otherChargesArr[0];

//     const calculateOn =
//       String(
//         charge.ea_calculateon || ""
//       )
//         .trim()
//         .toUpperCase();

//     if (
//       calculateOn === "ATACTUAL"
//     ) {

//       earnedAnyOther = amount(
//         charge.charges_services
//       );

//     } else {

//       earnedAnyOther = amount(
//         charge.charges_services
//       );
//     }

//   } else {

//     earnedAnyOther = amount(
//       components?.anyOther
//     );
//   }

//   // ==========================================================
//   // DEBUG
//   // ==========================================================

//   logger.log(
//     "\n========== EARNED COMPONENTS =========="
//   );

//   logger.log(
//     "Per Day Rate      :",
//     empPerDayRate
//   );

//   logger.log(
//     "Net Days          :",
//     days
//   );

//   logger.log(
//     "Month Days        :",
//     month
//   );

//   logger.log(
//     "Earned Basic      :",
//     earnedBasic
//   );

//   logger.log(
//     "Earned DA         :",
//     earnedDa
//   );

//   logger.log(
//     "Earned Basic + DA :",
//     earnedBasicDa
//   );

//   logger.log(
//     "Earned HRA        :",
//     earnedHra
//   );

//   logger.log(
//     "Earned Special    :",
//     earnedSpecialAllow
//   );

//   logger.log(
//     "Earned Other      :",
//     earnedOtherAllow
//   );

//   logger.log(
//     "Earned LWW        :",
//     earnedLww
//   );

//   logger.log(
//     "Earned Bonus      :",
//     earnedBonus
//   );

//   logger.log(
//     "Earned Leave      :",
//     earnedLeaveWages
//   );

//   logger.log(
//     "Earned Any Other  :",
//     earnedAnyOther
//   );

//   logger.log(
//     "========================================\n"
//   );

//   return {
//     earnedBasic,
//     earnedDa,
//     earnedBasicDa,
//     earnedSpecialAllow,
//     earnedHra,
//     earnedOtherAllow,
//     earnedLww,
//     earnedBonus,
//     earnedLeaveWages,
//     earnedUniformWages,
//     earnedAnyOther,
//   };
// }

const calculateEarnedComponents = ({
  components = {},
  netDays = 0,
  monthDays = 30,
  empPerDayRate = 0,
  otherChargesArr = [],
  decimalPoint = 2,
}) => {
  logger.log("\n========================================");
  logger.log("       EARNED COMPONENTS CALCULATION");
  logger.log("========================================");

  // -----------------------------------------
  // HELPER FUNCTIONS
  // -----------------------------------------

  const roundValue = (value) => {
    const factor = Math.pow(10, decimalPoint);
    const num = Number(value) || 0;

    return Math.round((num + Number.EPSILON) * factor) / factor;
  };

  const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const days = Math.max(0, toNumber(netDays));
  const totalMonthDays = Math.max(1, toNumber(monthDays));
  const perDayRate = Math.max(0, toNumber(empPerDayRate));

  // -----------------------------------------
  // MONTHLY COMPONENT VALUES
  // -----------------------------------------

  const basic = toNumber(components.basic);
  const vda = toNumber(components.vda);
  const hra = toNumber(components.hra);
  const specialAllow = toNumber(components.specialAllow);
  const otherAllow = toNumber(components.otherAllow);
  const lww = toNumber(components.lww);
  const bonus = toNumber(components.bonus);
  const fixedLeaveWages = toNumber(components.fixedLeaveWages);

  logger.log("INPUT VALUES:", {
    basic,
    vda,
    hra,
    specialAllow,
    otherAllow,
    lww,
    bonus,
    fixedLeaveWages,
    perDayRate,
    netDays: days,
    monthDays: totalMonthDays,
  });

  // -----------------------------------------
  // INITIAL VALUES
  // -----------------------------------------

  let earnedBasic = 0;
  let earnedDa = 0;
  let earnedBasicDa = 0;
  let earnedHra = 0;
  let earnedSpecialAllow = 0;
  let earnedOtherAllow = 0;
  let earnedLww = 0;
  let earnedBonus = 0;
  let earnedLeaveWages = 0;
  let earnedUniformWages = 0;
  let earnedAnyOther = 0;

  // -----------------------------------------
  // BASIC AND DA
  // -----------------------------------------

  if (perDayRate > 0) {
    // Per-day rate is treated as Basic only.
    earnedBasic = roundValue(perDayRate * days);

    // DA is separately calculated from monthly VDA.
    earnedDa = roundValue((vda / totalMonthDays) * days);
  } else {
    earnedBasic = roundValue((basic / totalMonthDays) * days);
    earnedDa = roundValue((vda / totalMonthDays) * days);
  }

  earnedBasicDa = roundValue(earnedBasic + earnedDa);

  // -----------------------------------------
  // HRA
  // -----------------------------------------

  earnedHra = roundValue((hra / totalMonthDays) * days);

  // -----------------------------------------
  // SPECIAL ALLOWANCE
  // -----------------------------------------

  earnedSpecialAllow = roundValue(
    (specialAllow / totalMonthDays) * days
  );

  // -----------------------------------------
  // OTHER ALLOWANCE
  // -----------------------------------------

  earnedOtherAllow = roundValue(
    (otherAllow / totalMonthDays) * days
  );

  // -----------------------------------------
  // LWW
  // -----------------------------------------

  earnedLww = roundValue((lww / totalMonthDays) * days);

  // -----------------------------------------
  // BONUS
  // -----------------------------------------
  // Assumption: bonus is monthly and attendance-based.

  // earnedBonus = roundValue((bonus / totalMonthDays) * days);

  // -----------------------------------------
  // LEAVE WAGES
  // -----------------------------------------

  earnedLeaveWages = roundValue(
    (fixedLeaveWages / totalMonthDays) * days
  );

  // -----------------------------------------
  // UNIFORM WAGES
  // -----------------------------------------
  // No uniform-wages source field/formula was provided.

  earnedUniformWages = 0;

  // -----------------------------------------
  // OTHER CHARGES
  // -----------------------------------------
  // Sum every charge instead of using only [0].
  // AT ACTUAL = full amount.
  // Other calculation modes = attendance pro-rata.

  if (Array.isArray(otherChargesArr)) {
    earnedAnyOther = roundValue(
      otherChargesArr.reduce((total, charge) => {
        const chargeAmount = toNumber(charge?.charges_services);
        const calculateOn = String(
          charge?.ea_calculateon || ""
        ).trim().toUpperCase();

        let earnedCharge = 0;

        if (calculateOn === "AT ACTUAL") {
          earnedCharge = chargeAmount;
        } else {
          earnedCharge =
            (chargeAmount / totalMonthDays) * days;
        }

        logger.log("OTHER CHARGE:", {
          chargeAmount,
          calculateOn,
          earnedCharge: roundValue(earnedCharge),
        });

        return total + earnedCharge;
      }, 0)
    );
  }

  // -----------------------------------------
  // FINAL OUTPUT
  // -----------------------------------------

  const result = {
    earnedBasic,
    earnedDa,
    earnedBasicDa,
    earnedHra,
    earnedSpecialAllow,
    earnedOtherAllow,
    earnedLww,
   earnedBonus: 0,
    earnedLeaveWages,
    earnedUniformWages,
    earnedAnyOther,
  };

  logger.log("FINAL EARNED COMPONENTS:", result);
  logger.log("========================================\n");

  return result;
};

/**
 * ============================================================
 * CALCULATE OT WAGES
 * ============================================================
 */
function calculateOTWages({
  siteDetail,
  siteInfo,
  otRate,
  otDays,
  overtime,
  gross,
  otRateArr = [],
  decimalPoint = 2,
}) {
  let earnedOtWages = 0;

  const dp = Number(decimalPoint ?? 2);

  // ==========================================================
  // EMPLOYEE OT RATE
  // ==========================================================

  if (siteDetail.ot_rate) {
    if (Number(siteInfo.multiply_ot_hours) === 1) {
      earnedOtWages =
        Number(otRate || 0) *
        Number(otDays || 0) *
        Number(siteDetail.emp_hours || 0);
    } else {
      earnedOtWages = Number(otRate || 0) * Number(otDays || 0);
    }

    // ==========================================================
    // CONFIGURED OT RATE
    // ==========================================================
  } else if (Array.isArray(otRateArr) && otRateArr.length > 0) {
    const calculateOn = String(otRateArr[0].ea_calculateon || "")
      .trim()
      .toUpperCase();

    if (calculateOn === "ATACTUAL") {
      earnedOtWages = Number(otRate || 0);
    } else {
      earnedOtWages = Number(otRate || 0) * Number(otDays || 0);
    }

    // ==========================================================
    // DEFAULT OT
    // ==========================================================
  } else if (Number(overtime || 0) > 0) {
    earnedOtWages = (Number(gross || 0) / 8) * Number(otDays || 0);
  }

  return Number(earnedOtWages.toFixed(dp));
}

/**
 * ============================================================
 * CALCULATE EARNED GROSS
 * ============================================================
 */
// function calculateEarnedGross({
//   siteDetail,
//   siteInfo,
//   wages,
//   doubleOtRateArr = [],
//   decimalPoint = 2,
// }) {
//   const dp = Number(
//     decimalPoint ?? 2
//   );

//   let earnedOtWages =
//     Number(
//       wages.earned_ot_wages || 0
//     );

//   // ==========================================================
//   // DOUBLE OT
//   // ==========================================================

//   const applyDoubleOT = (
//     base
//   ) => {

//     if (
//       !Array.isArray(doubleOtRateArr) ||
//       doubleOtRateArr.length === 0
//     ) {

//       return earnedOtWages;
//     }

//     const rule =
//       String(
//         doubleOtRateArr[0]?.ea_calculateon ||
//         ""
//       )
//         .trim()
//         .toUpperCase()
//         .replace(/\s+/g, "");

//     if (
//       rule === "GROSS/8HOURS"
//     ) {

//       return (
//         Number(base || 0) /
//         Number(wages.month_days || 1) /
//         8
//       ) *
//       2 *
//       Number(wages.ot_days || 0);
//     }

//     if (
//       rule === "GROSS/9HOURS"
//     ) {

//       return (
//         Number(base || 0) /
//         Number(wages.month_days || 1) /
//         9
//       ) *
//       2 *
//       Number(wages.ot_days || 0);
//     }

//     if (
//       rule === "GROSS/12HOURS"
//     ) {

//       return (
//         Number(base || 0) /
//         Number(wages.month_days || 1) /
//         12
//       ) *
//       2 *
//       Number(wages.ot_days || 0);
//     }

//     return earnedOtWages;
//   };

//   let earnedGross = 0;

//   let daysPay = 0;

//   let esicAppl = 0;

//   // ==========================================================
//   // PER DAY RATE EMPLOYEE
//   // ==========================================================

//   if (
//     Number(siteDetail.emp_perday_rate || 0) > 0
//   ) {

//     earnedGross = Number(
//       (
//         Number(
//           wages.earned_basic || 0
//         ) +
//         Number(
//           wages.earned_basic_da || 0
//         ) +
//         Number(
//           wages.earned_hra || 0
//         )
//       ).toFixed(dp)
//     );

//     earnedOtWages =
//       Number(
//         applyDoubleOT(
//           earnedGross
//         ).toFixed(dp)
//       );

//     daysPay =
//       earnedGross;

//     esicAppl =
//       earnedGross;

//     if (
//       earnedOtWages > 0
//     ) {

//       esicAppl =
//         Number(
//           (
//             esicAppl +
//             earnedOtWages
//           ).toFixed(dp)
//         );
//     }

//   // ==========================================================
//   // MONTHLY SALARY EMPLOYEE
//   // ==========================================================

//   } else {

//     const baseGross =
//       Number(
//         wages.earned_basic_da || 0
//       ) +
//       Number(
//         wages.earned_special_allow || 0
//       ) +
//       Number(
//         wages.earned_hra || 0
//       ) +
//       Number(
//         wages.earned_other_allow || 0
//       ) +
//       Number(
//         wages.earned_lww || 0
//       ) +
//       Number(
//         wages.earned_bonus || 0
//       ) +
//       Number(
//         wages.earned_leave_wages || 0
//       ) +
//       Number(
//         wages.earned_uniform_wages || 0
//       ) +
//       Number(
//         wages.earned_holiday_pay || 0
//       );

//     earnedGross =
//       Number(
//         baseGross.toFixed(dp)
//       );

//     earnedOtWages =
//       Number(
//         applyDoubleOT(
//           earnedGross
//         ).toFixed(dp)
//       );

//     // Include OT in gross unless suppressed
//     if (
//       String(
//         siteInfo.calculate_earnedgross_withoutot
//       ) !== "1"
//     ) {

//       earnedGross =
//         Number(
//           (
//             baseGross +
//             earnedOtWages
//           ).toFixed(dp)
//         );
//     }

//     daysPay =
//       earnedGross;

//     esicAppl =
//       earnedGross;
//   }

//   return {
//     earnedGross,

//     earnedOtWages,

//     daysPay,

//     esicAppl,
//   };
// }

function calculateEarnedGross({
  siteDetail,
  siteInfo,
  wages,
  doubleOtRateArr = [],
  decimalPoint = 2,
}) {
  const dp = Number(decimalPoint ?? 2);

  let earnedOtWages = Number(wages.earned_ot_wages || 0);

  let earnedGross = 0;
  let daysPay = 0;
  let esicAppl = 0;

  // ==========================================================
  // DOUBLE OT
  // ==========================================================

  const applyDoubleOT = (base) => {
    if (!Array.isArray(doubleOtRateArr) || doubleOtRateArr.length === 0) {
      logger.log("[DOUBLE OT] No double OT rate configuration");

      return earnedOtWages;
    }

    const rule = String(doubleOtRateArr[0]?.ea_calculateon || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");

    logger.log(
      "[DOUBLE OT] calculateOn =",
      doubleOtRateArr[0]?.ea_calculateon,
    );

    logger.log("[DOUBLE OT] normalized rule =", rule);

    if (rule === "GROSS/8HOURS") {
      const result =
        (Number(base || 0) / Number(wages.month_days || 1) / 8) *
        2 *
        Number(wages.ot_days || 0);

      logger.log(
        `DOUBLE OT = (${base} ÷ ${wages.month_days} ÷ 8) × 2 × ${wages.ot_days}`,
      );

      logger.log("DOUBLE OT RESULT =", result);

      return result;
    }

    if (rule === "GROSS/9HOURS") {
      const result =
        (Number(base || 0) / Number(wages.month_days || 1) / 9) *
        2 *
        Number(wages.ot_days || 0);

      logger.log(
        `DOUBLE OT = (${base} ÷ ${wages.month_days} ÷ 9) × 2 × ${wages.ot_days}`,
      );

      logger.log("DOUBLE OT RESULT =", result);

      return result;
    }

    if (rule === "GROSS/12HOURS") {
      const result =
        (Number(base || 0) / Number(wages.month_days || 1) / 12) *
        2 *
        Number(wages.ot_days || 0);

      logger.log(
        `DOUBLE OT = (${base} ÷ ${wages.month_days} ÷ 12) × 2 × ${wages.ot_days}`,
      );

      logger.log("DOUBLE OT RESULT =", result);

      return result;
    }

    logger.log("[DOUBLE OT] No matching double OT rule");

    return earnedOtWages;
  };

  // ==========================================================
  // EMPLOYEE TYPE
  // ==========================================================

  const empPerDayRate = Number(siteDetail?.emp_perday_rate) || 0;

  logger.log("\n==============================================");
  logger.log("     EARNED GROSS CALCULATION");
  logger.log("==============================================");

  logger.log("emp_perday_rate =", empPerDayRate);

  logger.log("\n[ WAGES RECEIVED BY calculateEarnedGross ]");

  logger.log("earned_basic =", wages?.earned_basic);

  logger.log("earned_basic_da =", wages?.earned_basic_da);

  logger.log("earned_hra =", wages?.earned_hra);

  logger.log("earned_special_allow =", wages?.earned_special_allow);

  logger.log("earned_other_allow =", wages?.earned_other_allow);

  logger.log("earned_lww =", wages?.earned_lww);

  logger.log("earned_bonus =", wages?.earned_bonus);

  logger.log("earned_leave_wages =", wages?.earned_leave_wages);

  logger.log("earned_uniform_wages =", wages?.earned_uniform_wages);

  logger.log("earned_holiday_pay =", wages?.earned_holiday_pay);

  logger.log("earned_any_other =", wages?.earned_any_other);

  // ==========================================================
  // PER DAY EMPLOYEE
  // ==========================================================

  if (empPerDayRate > 0) {
    logger.log("\n[ PER DAY EMPLOYEE ]");

    const earnedBasic = Number(wages.earned_basic || 0);

    const earnedBasicDa = Number(wages.earned_basic_da || 0);

    const earnedHra = Number(wages.earned_hra || 0);

    logger.log(
      `earnedGross = ${earnedBasic} + ${earnedBasicDa} + ${earnedHra}`,
    );

    earnedGross = Number((earnedBasic + earnedBasicDa + earnedHra).toFixed(dp));

    logger.log("earnedGross =", earnedGross);

    earnedOtWages = Number(applyDoubleOT(earnedGross).toFixed(dp));

    logger.log("earnedOtWages =", earnedOtWages);

    daysPay = earnedGross;

    esicAppl = earnedGross;

    if (earnedOtWages > 0) {
      esicAppl = Number((esicAppl + earnedOtWages).toFixed(dp));
    }
  }

  // ==========================================================
  // MONTHLY EMPLOYEE
  // ==========================================================
  else {
    logger.log("\n[ MONTHLY EMPLOYEE ]");

    const earnedBasicDa = Number(wages.earned_basic_da || 0);

    const earnedSpecialAllow = Number(wages.earned_special_allow || 0);

    const earnedHra = Number(wages.earned_hra || 0);

    const earnedOtherAllow = Number(wages.earned_other_allow || 0);

    const earnedLww = Number(wages.earned_lww || 0);

    const earnedBonus = Number(wages.earned_bonus || 0);

    const earnedLeaveWages = Number(wages.earned_leave_wages || 0);

    const earnedUniformWages = Number(wages.earned_uniform_wages || 0);

    const earnedHolidayPay = Number(wages.earned_holiday_pay || 0);

    const earnedAnyOther = Number(wages.earned_any_other || 0);

    logger.log("\n[ EARNED COMPONENTS ]");

    logger.log("earnedBasicDa =", earnedBasicDa);

    logger.log("earnedSpecialAllow =", earnedSpecialAllow);

    logger.log("earnedHra =", earnedHra);

    logger.log("earnedOtherAllow =", earnedOtherAllow);

    logger.log("earnedLww =", earnedLww);

    logger.log("earnedBonus =", earnedBonus);

    logger.log("earnedLeaveWages =", earnedLeaveWages);

    logger.log("earnedUniformWages =", earnedUniformWages);

    logger.log("earnedHolidayPay =", earnedHolidayPay);

    logger.log("earnedAnyOther =", earnedAnyOther);

    // ========================================================
    // BASE GROSS
    // ========================================================

    const baseGross =
      earnedBasicDa +
      earnedSpecialAllow +
      earnedHra +
      earnedOtherAllow +
      earnedLww +
      earnedBonus +
      earnedLeaveWages +
      earnedUniformWages +
      earnedHolidayPay +
      earnedAnyOther;

    logger.log("\n[ BASE EARNED GROSS ]");

    logger.log(
      `baseGross = ${earnedBasicDa} + ${earnedSpecialAllow} + ${earnedHra} + ${earnedOtherAllow} + ${earnedLww} + ${earnedBonus} + ${earnedLeaveWages} + ${earnedUniformWages} + ${earnedHolidayPay} + ${earnedAnyOther}`,
    );

    logger.log("baseGross =", baseGross);

    earnedGross = Number(baseGross.toFixed(dp));

    logger.log("earnedGross before OT =", earnedGross);

    // ========================================================
    // OT
    // ========================================================

    earnedOtWages = Number(applyDoubleOT(earnedGross).toFixed(dp));

    logger.log("earnedOtWages =", earnedOtWages);

    // ========================================================
    // FINAL EARNED GROSS
    // ========================================================

    if (String(siteInfo?.calculate_earnedgross_withoutot) !== "1") {
      earnedGross = Number((baseGross + earnedOtWages).toFixed(dp));

      logger.log(
        `earnedGross = ${baseGross} + ${earnedOtWages} = ${earnedGross}`,
      );
    } else {
      logger.log("OT excluded because calculate_earnedgross_withoutot = 1");

      earnedGross = Number(baseGross.toFixed(dp));

      logger.log("earnedGross =", earnedGross);
    }

    daysPay = earnedGross;
    esicAppl = earnedGross;
  }

  // ==========================================================
  // FINAL
  // ==========================================================

  logger.log("\n==============================================");
  logger.log("      FINAL EARNED GROSS");
  logger.log("==============================================");

  logger.log("earnedGross =", earnedGross);

  logger.log("earnedOtWages =", earnedOtWages);

  logger.log("daysPay =", daysPay);

  logger.log("esicAppl =", esicAppl);

  logger.log("==============================================\n");

  return {
    earnedGross,
    earnedOtWages,
    daysPay,
    esicAppl,
  };
}

/**
 * ============================================================
 * CONDITIONAL PF / ESIC RATE
 * ============================================================
 */
function applyConditionalRate({
  operator,
  compareValue,
  matchBase,
  rate,
  decimalPoint,
}) {
  const dp = Number(decimalPoint ?? 2);

  const cmp = Number(compareValue);

  const base = Number(matchBase);

  const compute = () => Number(((base * Number(rate || 0)) / 100).toFixed(dp));

  switch (
    String(operator || "")
      .toLowerCase()
      .replace(/\s+/g, "")
  ) {
    case "equalto":
      return base === cmp ? compute() : null;

    case "greaterthan":
      return base > cmp ? compute() : null;

    case "greaterthanorequalto":
      return base >= cmp ? compute() : null;

    case "lessthan":
      return base < cmp ? compute() : null;

    case "lessthanorequalto":
      return base <= cmp ? compute() : null;

    case "":
      return compute();

    default:
      return null;
  }
}

/**
 * ============================================================
 * PF WAGES BASE
 * ============================================================
 */
// function resolvePfWagesBase({ pfCalculatedOn, wages }) {
//   switch (
//     String(pfCalculatedOn || "")
//       .trim()
//       .toUpperCase()
//   ) {
//     case "GROSS":
//       return wages.daysPay;

//     case "BASIC":
//       return wages.earned_basic;

//     case "GROSS-HRA":
//       return wages.daysPay - wages.earned_hra;

//     case "BASIC+SPECIALALLOW":
//       return wages.earned_basic_da + wages.earned_special_allow;

//     case "BASIC+DA":
//       return wages.earned_basic_da;

//     case "BASIC+DA+SPECIALALLOW+OTHERALLOW":
//       return (
//         wages.earned_basic_da +
//         wages.earned_special_allow +
//         wages.earned_other_allow
//       );

//     default:
//       return 0;
//   }
// }

/**
 * ============================================================
 * PF WAGES BASE
 * ============================================================
 */
// function resolvePfWagesBase({
//   pfCalculatedOn,
//   wages,
//   empPerDayRate = 0,
//   decimalPoint = 2,
// }) {
//   const dp = Number(decimalPoint ?? 2);

//   // ==========================================================
//   // NORMALIZE CALCULATE-ON
//   //
//   // Handles:
//   // BASIC
//   // basic
//   // Basic
//   // BASIC + DA
//   // BASIC+DA
//   // BASIC + SPECIAL ALLOW
//   // BASIC+SPECIALALLOW
//   // Extra spaces
//   // ==========================================================
//   const calculateOn = String(pfCalculatedOn || "")
//     .trim()
//     .toUpperCase()
//     .replace(/\s+/g, "");

//   const basic = Number(wages?.earned_basic || 0);
//   const basicDa = Number(wages?.earned_basic_da || 0);
//   const hra = Number(wages?.earned_hra || 0);
//   const specialAllow = Number(wages?.earned_special_allow || 0);
//   const otherAllow = Number(wages?.earned_other_allow || 0);
//   const bonus = Number(wages?.earned_bonus || 0);
//   const daysPay = Number(wages?.daysPay ?? wages?.earned_gross ?? 0);

//   let pfBase = 0;
//   let formula = "";

//   // ==========================================================
//   // GROSS
//   // PHP:
//   // $wages_arr['pf_wages'] = round($days_pay, ...)
//   // ==========================================================
//   if (
//     calculateOn === "GROSS" ||
//     calculateOn === "GROSSSALARY" ||
//     calculateOn === "ONGROSSSALARY"
//   ) {
//     pfBase = daysPay;

//     formula = `GROSS = ${daysPay}`;
//   }

//   // ==========================================================
//   // BASIC
//   //
//   // PHP:
//   // Per-day employee:
//   //     earned_basic
//   //
//   // Monthly employee:
//   //     earned_basic_da
//   // ==========================================================
//   else if (calculateOn === "BASIC") {
//     if (Number(empPerDayRate || 0) > 0) {
//       pfBase = basic;

//       formula = `Per-day BASIC = earned_basic = ${basic}`;
//     } else {
//       pfBase = basicDa;

//       formula = `Monthly BASIC = earned_basic_da = ${basicDa}`;
//     }
//   }

//   // ==========================================================
//   // GROSS - HRA
//   // ==========================================================
//   else if (calculateOn === "GROSS-HRA") {
//     pfBase = Number((daysPay - hra).toFixed(dp));

//     formula = `${daysPay} - ${hra} = ${pfBase}`;
//   }

//   // ==========================================================
//   // GROSS - HRA - BONUS
//   //
//   // PHP Employee/CMP PF:
//   // earned_gross - earned_hra - earned_bonus
//   // ==========================================================
//   else if (calculateOn === "GROSS-HRA-BONUS") {
//     pfBase = Number((daysPay - hra - bonus).toFixed(dp));

//     formula = `${daysPay} - ${hra} - ${bonus} = ${pfBase}`;
//   }

//   // ==========================================================
//   // BASIC + SPECIAL ALLOW
//   //
//   // PHP:
//   // earned_basic_da + earned_special_allow
//   // ==========================================================
//   else if (calculateOn === "BASIC+SPECIALALLOW") {
//     pfBase = Number((basicDa + specialAllow).toFixed(dp));

//     formula = `${basicDa} + ${specialAllow} = ${pfBase}`;
//   }

//   // ==========================================================
//   // BASIC + OTHER ALLOW
//   //
//   // PHP:
//   // earned_basic_da + earned_other_allow
//   // ==========================================================
//   else if (calculateOn === "BASIC+OTHERALLOW") {
//     pfBase = Number((basicDa + otherAllow).toFixed(dp));

//     formula = `${basicDa} + ${otherAllow} = ${pfBase}`;
//   }

//   // ==========================================================
//   // BASIC + DA
//   //
//   // PHP:
//   // earned_basic_da
//   // ==========================================================
//   else if (calculateOn === "BASIC+DA") {
//     pfBase = Number(basicDa.toFixed(dp));

//     formula = `earned_basic_da = ${pfBase}`;
//   }

//   // ==========================================================
//   // BASIC + DA + SPECIAL ALLOW + OTHER ALLOW
//   //
//   // PHP:
//   // earned_basic_da
//   // + earned_special_allow
//   // + earned_other_allow
//   // ==========================================================
//   else if (calculateOn === "BASIC+DA+SPECIALALLOW+OTHERALLOW") {
//     pfBase = Number((basicDa + specialAllow + otherAllow).toFixed(dp));

//     formula = `${basicDa} + ${specialAllow} + ${otherAllow} = ${pfBase}`;
//   }

//   // ==========================================================
//   // BASIC + DA + BONUS
//   //
//   // NEW CONDITION
//   //
//   // earned_basic_da + earned_bonus
//   // ==========================================================
//   else if (calculateOn === "BASIC+DA+BONUS") {
//     pfBase = Number((basicDa + bonus).toFixed(dp));

//     formula = `${basicDa} + ${bonus} = ${pfBase}`;
//   }

//   // ==========================================================
//   // UNKNOWN / EMPTY
//   // ==========================================================
//   else {
//     pfBase = 0;

//     formula = `Unknown Calculate On = "${pfCalculatedOn}"`;
//   }

//   // ==========================================================
//   // PF DEBUG LOG
//   // ==========================================================
//   logger.log("======================================");
//   logger.log("🔥 PF WAGES BASE");
//   logger.log("Original Calculate On =", pfCalculatedOn);
//   logger.log("Normalized Calculate On =", calculateOn);
//   logger.log("Per Day Rate =", Number(empPerDayRate || 0));
//   logger.log("Earned Basic =", basic);
//   logger.log("Earned Basic DA =", basicDa);
//   logger.log("Earned HRA =", hra);
//   logger.log("Earned Special Allow =", specialAllow);
//   logger.log("Earned Other Allow =", otherAllow);
//   logger.log("Earned Bonus =", bonus);
//   logger.log("Days Pay / Gross =", daysPay);
//   logger.log("Formula =", formula);
//   logger.log("PF Base =", pfBase);
//   logger.log("======================================");

//   return pfBase;
// }

function resolvePfWagesBase({
  pfCalculatedOn,
  wages,
  empPerDayRate = 0,
  decimalPoint = 2,
}) {
  const dp = Math.max(0, Number(decimalPoint ?? 2));

  const toNumber = (value) => {
    if (value === null || value === undefined || value === "") {
      return 0;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  };

  const calculateOn = String(pfCalculatedOn || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  const basic = toNumber(wages?.earned_basic);
  const basicDa = toNumber(wages?.earned_basic_da);
  const hra = toNumber(wages?.earned_hra);
  const specialAllow = toNumber(wages?.earned_special_allow);
  const otherAllow = toNumber(wages?.earned_other_allow);
  const bonus = toNumber(wages?.earned_bonus);
  const gross = toNumber(wages?.daysPay ?? wages?.earned_gross);

  let pfBase = 0;
  let formula = "";
  let supported = true;

  switch (calculateOn) {
    case "GROSS":
    case "GROSSSALARY":
    case "ONGROSSSALARY":
      pfBase = gross;
      formula = `GROSS = ${gross}`;
      break;

    case "BASIC":
      if (toNumber(empPerDayRate) > 0) {
        pfBase = basic;
        formula = `Per-day BASIC = ${basic}`;
      } else {
        // Keep this mapping only if it matches your PHP logic.
        pfBase = basicDa;
        formula = `Monthly BASIC field = earned_basic_da = ${basicDa}`;
      }
      break;

    case "GROSS-HRA":
      pfBase = gross - hra;
      formula = `${gross} - ${hra} = ${pfBase}`;
      break;

    case "GROSS-HRA-BONUS":
      pfBase = gross - hra - bonus;
      formula = `${gross} - ${hra} - ${bonus} = ${pfBase}`;
      break;

    case "BASIC+SPECIALALLOW":
    case "BASIC+SPECIALALLOWANCE":
      pfBase = basicDa + specialAllow;
      formula = `${basicDa} + ${specialAllow} = ${pfBase}`;
      break;

    case "BASIC+OTHERALLOW":
    case "BASIC+OTHERALLOWANCE":
      pfBase = basicDa + otherAllow;
      formula = `${basicDa} + ${otherAllow} = ${pfBase}`;
      break;

    case "BASIC+DA":
      pfBase = basicDa;
      formula = `earned_basic_da = ${basicDa}`;
      break;

    case "BASIC+DA+SPECIALALLOW+OTHERALLOW":
      pfBase = basicDa + specialAllow + otherAllow;
      formula = `${basicDa} + ${specialAllow} + ${otherAllow} = ${pfBase}`;
      break;

    case "BASIC+DA+BONUS":
      pfBase = basicDa + bonus;
      formula = `${basicDa} + ${bonus} = ${pfBase}`;
      break;

    default:
      supported = false;
      formula = `Unknown Calculate On = "${pfCalculatedOn}"`;

      logger.warn("Unsupported PF Calculate On:", pfCalculatedOn);
      break;
  }

  // Prevent negative PF wages.
  pfBase = Math.max(0, Number(pfBase.toFixed(dp)));

  logger.log("======================================");
  logger.log("PF WAGES BASE");
  logger.log("Original Calculate On =", pfCalculatedOn);
  logger.log("Normalized Calculate On =", calculateOn);
  logger.log("Supported =", supported);
  logger.log("Per Day Rate =", toNumber(empPerDayRate));
  logger.log("Earned Basic =", basic);
  logger.log("Earned Basic DA =", basicDa);
  logger.log("Earned HRA =", hra);
  logger.log("Earned Special Allow =", specialAllow);
  logger.log("Earned Other Allow =", otherAllow);
  logger.log("Earned Bonus =", bonus);
  logger.log("Gross =", gross);
  logger.log("Formula =", formula);
  logger.log("PF Base =", pfBase);
  logger.log("======================================");

  return pfBase;
}


/**
 * ============================================================
 * ESIC WAGES BASE
 * ============================================================
 */

function resolveEsicWagesBase({ esicCalculatedOn, wages, decimalPoint = 2 }) {
  const dp = Number(decimalPoint ?? 2);

  // ==========================================================
  // NORMALIZE CALCULATE-ON
  // ==========================================================
  const calculateOn = String(esicCalculatedOn || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  const basic = Number(wages?.earned_basic || 0);

  const basicDa = Number(wages?.earned_basic_da || 0);

  const hra = Number(wages?.earned_hra || 0);

  const specialAllow = Number(wages?.earned_special_allow || 0);

  const otherAllow = Number(wages?.earned_other_allow || 0);

  const bonus = Number(wages?.earned_bonus || 0);

  const gross = Number(wages?.earned_gross ?? wages?.daysPay ?? 0);

  let esicBase = 0;
  let formula = "";

  // ==========================================================
  // GROSS
  // ==========================================================
  if (
    calculateOn === "GROSS" ||
    calculateOn === "GROSSSALARY" ||
    calculateOn === "ONGROSSSALARY"
  ) {
    esicBase = Number(gross.toFixed(dp));

    formula = `GROSS = ${gross}`;
  }

  // ==========================================================
  // BASIC
  // ==========================================================
else if (calculateOn === "BASIC") {
  esicBase = Number(basic.toFixed(dp));
  formula = `BASIC = earned_basic = ${basic}`;
} 

  // ==========================================================
  // GROSS - HRA
  // ==========================================================
  else if (calculateOn === "GROSS-HRA") {
    esicBase = Number((gross - hra).toFixed(dp));

    formula = `${gross} - ${hra} = ${esicBase}`;
  }

  // ==========================================================
  // GROSS - HRA - BONUS
  // ==========================================================
  else if (calculateOn === "GROSS-HRA-BONUS") {
    esicBase = Number((gross - hra - bonus).toFixed(dp));

    formula = `${gross} - ${hra} - ${bonus} = ${esicBase}`;
  }

  // ==========================================================
  // GROSS - OTHER ALLOW
  // ==========================================================
  else if (calculateOn === "GROSS-OTHERALLOW") {
    esicBase = Number((gross - otherAllow).toFixed(dp));

    formula = `${gross} - ${otherAllow} = ${esicBase}`;
  }

  // ==========================================================
  // BASIC + HRA
  // ==========================================================
  else if (calculateOn === "BASIC+HRA") {
    esicBase = Number((basicDa + hra).toFixed(dp));

    formula = `${basicDa} + ${hra} = ${esicBase}`;
  }

  // ==========================================================
  // BASIC + SPECIAL ALLOW
  // ==========================================================
  else if (calculateOn === "BASIC+SPECIALALLOW") {
    esicBase = Number((basicDa + specialAllow).toFixed(dp));

    formula = `${basicDa} + ${specialAllow} = ${esicBase}`;
  }

  // ==========================================================
  // BASIC + OTHER ALLOW
  // ==========================================================
  else if (calculateOn === "BASIC+OTHERALLOW") {
    esicBase = Number((basicDa + otherAllow).toFixed(dp));

    formula = `${basicDa} + ${otherAllow} = ${esicBase}`;
  }

  // ==========================================================
  // BASIC + DA
  // ==========================================================
  else if (calculateOn === "BASIC+DA") {
    esicBase = Number(basicDa.toFixed(dp));

    formula = `earned_basic_da = ${esicBase}`;
  }

  // ==========================================================
  // BASIC + DA + SPECIAL ALLOW + OTHER ALLOW
  // ==========================================================
  else if (calculateOn === "BASIC+DA+SPECIALALLOW+OTHERALLOW") {
    esicBase = Number((basicDa + specialAllow + otherAllow).toFixed(dp));

    formula = `${basicDa} + ${specialAllow} + ${otherAllow} = ${esicBase}`;
  }

  // ==========================================================
  // BASIC + DA + BONUS
  // ==========================================================
  else if (calculateOn === "BASIC+DA+BONUS") {
    esicBase = Number((basicDa + bonus).toFixed(dp));

    formula = `${basicDa} + ${bonus} = ${esicBase}`;
  }

  // ==========================================================
  // UNKNOWN / EMPTY
  // ==========================================================
  else {
    esicBase = 0;

    formula = `Unknown Calculate On = "${esicCalculatedOn}"`;
  }

  // ==========================================================
  // ESIC DEBUG LOG
  // ==========================================================
  logger.log("======================================");
  logger.log("🔥 ESIC WAGES BASE");
  logger.log("Original Calculate On =", esicCalculatedOn);
  logger.log("Normalized Calculate On =", calculateOn);
  logger.log("Earned Basic =", basic);
  logger.log("Earned Basic DA =", basicDa);
  logger.log("Earned HRA =", hra);
  logger.log("Earned Special Allow =", specialAllow);
  logger.log("Earned Other Allow =", otherAllow);
  logger.log("Earned Bonus =", bonus);
  logger.log("Earned Gross =", gross);
  logger.log("Formula =", formula);
  logger.log("ESIC Base =", esicBase);
  logger.log("======================================");

  return esicBase;
}
// function resolveEsicWagesBase({ esicCalculatedOn, wages }) {
//   switch (
//     String(esicCalculatedOn || "")
//       .trim()
//       .toUpperCase()
//   ) {
//     case "GROSS":
//       return wages.earned_gross;

//     case "BASIC":
//       return wages.earned_basic_da;

//     case "GROSS-OTHERALLOW":
//       return wages.earned_gross - wages.earned_other_allow;

//     case "BASIC+HRA":
//       return wages.earned_basic_da + wages.earned_hra;

//     default:
//       return 0;
//   }
// }

/**
 * ============================================================
 * SERVICE CHARGES
 * ============================================================
 */

function calculateServiceCharges({
  siteDetail,
  empCtc,
  netDays,
  serviceAtActual,
  decimalPoint = 2,
}) {
  const dp = Number(decimalPoint ?? 2);
  const charge = Number(siteDetail.service_charges || 0);
  const type = String(siteDetail.service_charges_type || "")
    .trim()
    .toUpperCase();

  // Rs: netDays * service charges
  if (type === "RS" && charge > 0) {
    return Number((Number(netDays || 0) * charge).toFixed(dp));
  }

  // Percentage: empCtc * percentage / 100
  if (type === "%" && charge > 0) {
    return Number(((Number(empCtc || 0) * charge) / 100).toFixed(dp));
  }

  // At Actual
  if (Array.isArray(serviceAtActual) && serviceAtActual.length > 0) {
    return Number(
      Number(serviceAtActual[0].charges_services || 0).toFixed(dp)
    );
  }

  return 0;
}


/**
 * ============================================================
 * GST CALCULATION
 * ============================================================
 *
 * GST is ALWAYS calculated LAST.
 *
 * Example:
 *
 * Sub Total = 10000
 * GST Rate  = 18
 *
 * GST Amount = 1800
 * Grand Total = 11800
 *
 * GST is NOT included in salary/gross calculation.
 */
function calculateGST({ taxableAmount, gstRate = 0, decimalPoint = 2 }) {
  const dp = Number(decimalPoint ?? 2);

  const base = Number(taxableAmount || 0);

  const rate = Number(gstRate || 0);

  const gstAmount = Number(((base * rate) / 100).toFixed(dp));

  const grandTotal = Number((base + gstAmount).toFixed(dp));

  return {
    taxableAmount: Number(base.toFixed(dp)),

    gstRate: Number(rate.toFixed(dp)),

    gstAmount,

    grandTotal,
  };
}

/**
 * ============================================================
 * FINAL BILL TOTAL
 * ============================================================
 *
 * GST is shown at the LAST.
 *
 * Flow:
 *
 * Earned Gross
 * + OT
 * + Service Charges
 * + Other Charges
 * + Other Billing Charges
 * -----------------------
 * = Taxable Sub Total
 * + GST
 * -----------------------
 * = Grand Total
 *
 * NOTE:
 * GST is NOT added into earnedGross.
 */
function calculateFinalBillTotal({
  earnedGross = 0,
  earnedOtWages = 0,
  serviceCharges = 0,
  otherCharges = 0,
  additionalCharges = 0,
  gstRate = 0,
  decimalPoint = 2,
}) {
  const dp = Number(decimalPoint ?? 2);

  // ==========================================================
  // AMOUNTS BEFORE GST
  // ==========================================================

  const gross = Number(earnedGross || 0);

  const ot = Number(earnedOtWages || 0);

  const service = Number(serviceCharges || 0);

  const other = Number(otherCharges || 0);

  const additional = Number(additionalCharges || 0);

  // ==========================================================
  // TAXABLE SUB TOTAL
  // ==========================================================

  const subTotal = Number(
    (gross + ot + service + other + additional).toFixed(dp),
  );

  // ==========================================================
  // GST — LAST
  // ==========================================================

  const gst = calculateGST({
    taxableAmount: subTotal,

    gstRate,

    decimalPoint: dp,
  });

  // ==========================================================
  // FINAL RESULT
  // ==========================================================

  const finalTotal = Number(gst.grandTotal.toFixed(dp));

  logger.log("\n==============================================");

  logger.log("FINAL BILL CALCULATION");

  logger.log("Earned Gross       :", gross);

  logger.log("OT Wages           :", ot);

  logger.log("Service Charges    :", service);

  logger.log("Other Charges      :", other);

  logger.log("Additional Charges :", additional);

  logger.log("----------------------------------------------");

  logger.log("SUB TOTAL          :", subTotal);

  logger.log("GST Rate (%)       :", gst.gstRate);

  logger.log("GST Amount         :", gst.gstAmount);

  logger.log("----------------------------------------------");

  logger.log("GRAND TOTAL        :", finalTotal);

  logger.log("==============================================\n");

  return {
    earnedGross: Number(gross.toFixed(dp)),

    earnedOtWages: Number(ot.toFixed(dp)),

    serviceCharges: Number(service.toFixed(dp)),

    otherCharges: Number(other.toFixed(dp)),

    additionalCharges: Number(additional.toFixed(dp)),

    subTotal,

    gstRate: gst.gstRate,

    gstAmount: gst.gstAmount,

    grandTotal: finalTotal,
  };
}

/**
 * ============================================================
 * INVOICE NUMBER
 * ============================================================
 */
function generateInvoiceNumber(lastId) {
  const now = new Date();

  const year = now.getFullYear();

  const next = String(year + 1).slice(-2);

  return `SV/${Number(lastId || 0) + 1}/${year}-${next}`;
}

/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */
module.exports = {
  daysInMonth,

  calculateWorkingDays,

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

  // GST
  calculateGST,

  // Final invoice total
  calculateFinalBillTotal,

  generateInvoiceNumber,
};
