const sql = require("mssql");
const { poolPromise } = require("../config/db");

const getCompanyById = async (
  id,
  transaction = null
) => {
  try {
    console.log("getCompanyById =>", {
      id,
      hasTransaction: !!transaction,
    });

    let request;

    if (transaction) {
      console.log("🔗 GET COMPANY BY ID USING TRANSACTION");
      request = transaction.request();
    } else {
      console.log("🔗 GET COMPANY BY ID USING NORMAL POOL");

      const pool = await poolPromise;
      request = pool.request();
    }

    request.input(
      "companyId",
      sql.Int,
      Number(id)
    );

    const result = await request.query(`
      SELECT *
      FROM companies
      WHERE [id] = @companyId
    `);

    console.log(
      "COMPANY RESULT COUNT =",
      result.recordset?.length || 0
    );

    if (result.recordset.length > 0) {
      return result.recordset[0];
    }

    return null;

  } catch (error) {
    console.error("❌ Database error in getCompanyById:", error);
    throw error;
  }
};

const getAdditionalChargesAtActual = async (
  siteId,
  transaction = null
) => {

  try {

    let request;

    // ==========================================
    // TRANSACTION / NORMAL POOL
    // ==========================================

    if (
      transaction &&
      typeof transaction.request === "function"
    ) {

      console.log(
        "🔗 GET ADDITIONAL CHARGES AT ACTUAL USING TRANSACTION"
      );

      request = transaction.request();

    } else {

      console.log(
        "🔗 GET ADDITIONAL CHARGES AT ACTUAL USING NORMAL POOL"
      );

      const pool = await poolPromise;

      request = pool.request();
    }


    // ==========================================
    // SITE ID VALIDATION
    // ==========================================

    const numericSiteId = Number(siteId);

    if (
      !Number.isInteger(numericSiteId) ||
      numericSiteId <= 0
    ) {
      throw new Error(
        `Invalid siteId: ${siteId}`
      );
    }


    // ==========================================
    // QUERY
    // ==========================================

    const result = await request
      .input(
        "siteId",
        sql.Int,
        numericSiteId
      )
      .query(`
        SELECT *
        FROM client_service_charges
        WHERE rate_id = @siteId
          AND ea_calculateon = 'AT ACTUAL'
      `);


    console.log(
      "✅ ACTUAL CHARGES FOUND:",
      result.recordset?.length || 0
    );


    return result.recordset || [];

  } catch (error) {

    console.error(
      "❌ GET ADDITIONAL CHARGES AT ACTUAL ERROR:",
      error
    );

    throw error;

  }
};

const getSiteDetail = async (siteId, rank) => {
  try {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("siteId", sql.Int, siteId)
      .input("rank", sql.NVarChar, rank).query(`
        SELECT *
        FROM client_other_info
        WHERE rate_id = @siteId
        AND emp_type = @rank
      `);

    return result.recordset;
  } catch (error) {
    throw error;
  }
};

const getTotalPresentDaysEmp = async (
  siteId,
  month,
  year,
  empCode,
  rank,
  attType,
) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("siteId", sql.VarChar, siteId)
    .input("month", sql.VarChar, month)
    .input("year", sql.VarChar, year)
    .input("empCode", sql.VarChar, empCode)
    .input("rank", sql.VarChar, rank)
    .input("attType", sql.VarChar, attType).query(`
      SELECT COUNT(id) AS total_days
      FROM attendance
      WHERE site_id = @siteId
        AND at_month = @month
        AND at_year = @year
        AND emp_code = @empCode
        AND active = '0'
        AND rank = @rank
        AND att_type = @attType
        AND (
              status LIKE '%P%'
           OR status LIKE '%D%'
           OR status LIKE '%N%'
        )
        AND status NOT IN ('CL','SL','PL','H')
    `);

  return result.recordset[0];
};

const getTotalDoubleDutyDays = async (
  siteId,
  month,
  year,
  empCode,
  rank,
  attType,
) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("siteId", sql.VarChar, siteId)
    .input("month", sql.VarChar, month)
    .input("year", sql.VarChar, year)
    .input("empCode", sql.VarChar, empCode)
    .input("rank", sql.VarChar, rank)
    .input("attType", sql.VarChar, attType).query(`
      SELECT COUNT(*) AS total_days
      FROM attendance
      WHERE site_id = @siteId
        AND at_month = @month
        AND at_year = @year
        AND emp_code = @empCode
        AND active = '0'
        AND rank = @rank
        AND att_type = @attType
        AND status LIKE '%PP%'
    `);

  return Number(result.recordset[0].total_days || 0);
};

const getTotalOvertimeByEmp = async (
  siteId,
  month,
  year,
  empCode,
  rank,
  attType,
) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("siteId", sql.VarChar, siteId)
    .input("month", sql.VarChar, month)
    .input("year", sql.VarChar, year)
    .input("empCode", sql.VarChar, empCode)
    .input("rank", sql.VarChar, rank)
    .input("attType", sql.VarChar, attType).query(`
      SELECT status
      FROM attendance
      WHERE site_id = @siteId
        AND at_month = @month
        AND at_year = @year
        AND emp_code = @empCode
        AND active = '0'
        AND rank = @rank
        AND att_type = @attType
        AND status NOT IN ('P','W','PP')
    `);

  let totalOT = 0;

  for (const row of result.recordset) {
    const value = parseFloat(String(row.status).replace(/^P/, ""));

    if (!isNaN(value)) {
      totalOT += value;
    }
  }

  return totalOT;
};

const getTotalHalfDaysByEmp = async (
  siteId,
  month,
  year,
  empCode,
  rank,
  attType,
) => {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("siteId", sql.VarChar, siteId)
    .input("month", sql.VarChar, month)
    .input("year", sql.VarChar, year)
    .input("empCode", sql.VarChar, empCode)
    .input("rank", sql.VarChar, rank)
    .input("attType", sql.VarChar, attType).query(`
      SELECT COUNT(id) AS total_days
      FROM attendance
      WHERE site_id = @siteId
        AND at_month = @month
        AND at_year = @year
        AND emp_code = @empCode
        AND active = '0'
        AND rank = @rank
        AND att_type = @attType
        AND status LIKE '%HF%'
    `);

  return result.recordset[0];
};

// function calculateNetDays({
//   presentDays = 0,
//   halfDays = 0,
//   weeklyOff = 0,
//   paidWeeklyOff = 0,
//   holidays = 0,
//   pl = 0,
//   cl = 0,
//   sl = 0,
//   doubleDutyDays = 0,
//   excludeWeekoff = 0,
//   excludeHoliday = 0,
//   hasOtRate = true,
// }) {
//   let netDays = Number(presentDays);

//   // Weekly Off
//   if (Number(excludeWeekoff) === 0) {
//     netDays += Number(weeklyOff);
//   }

//   // Paid Weekly Off always counted
//   netDays += Number(paidWeeklyOff);

//   // Holidays
//   if (Number(excludeHoliday) === 0) {
//     netDays += Number(holidays);
//   }

//   // Leaves
//   netDays += Number(pl);
//   netDays += Number(cl);
//   netDays += Number(sl);

//   // Half days
//   netDays += Number(halfDays) / 2;

//   // Double duty only when ot_rate is blank
//   if (!hasOtRate) {
//     netDays += Number(doubleDutyDays);
//   }

//   return Number(netDays.toFixed(2));
// }

function calculateNetDays({
  presentDays,
  halfDays,
  doubleDutyDays,
  totalOTHours,
  empHours,
  multiplyOtHours,
}) {
  let netDays = 0;

  netDays += Number(presentDays || 0);
  netDays += Number(halfDays || 0) * 0.5;
  netDays += Number(doubleDutyDays || 0);

  if (Number(multiplyOtHours) === 1 && Number(empHours) > 0) {
    netDays += Number(totalOTHours || 0) / Number(empHours);
  }

  return Number(netDays.toFixed(2));
}




const getAdditionalChargesByType = async (
  siteId,
  chargeType,
  transaction = null
) => {
  try {
    let request;

    // Validate site ID
    const numericSiteId = Number(siteId);

    if (!Number.isInteger(numericSiteId) || numericSiteId <= 0) {
      throw new Error(`Invalid siteId: ${siteId}`);
    }

    // Validate charge type
    const normalizedChargeType = String(chargeType ?? "").trim();

    if (!normalizedChargeType) {
      throw new Error(`Invalid chargeType: ${chargeType}`);
    }

    // Use transaction request when available
    if (transaction && typeof transaction.request === "function") {
      console.log(
        `🔗 GET ADDITIONAL CHARGES [${normalizedChargeType}] USING TRANSACTION`
      );

      request = transaction.request();
    } else {
      console.log(
        `🔗 GET ADDITIONAL CHARGES [${normalizedChargeType}] USING NORMAL POOL`
      );

      const pool = await poolPromise;
      request = pool.request();
    }

    // Fetch charges in the same numeric descending order
    // as the legacy PHP query.
    const result = await request
      .input("siteId", sql.Int, numericSiteId)
      .input("chargeType", sql.VarChar(100), normalizedChargeType)
      .query(`
        SELECT *
        FROM client_service_charges
        WHERE rate_id = @siteId
          AND type_of_services = @chargeType
          AND ea_calculateon <> 'AT ACTUAL'
        ORDER BY
          TRY_CAST(ea_comp_operator AS INT) DESC
      `);

    const rows = result.recordset || [];

    console.log(
      `✅ TOTAL ${normalizedChargeType} CHARGES:`,
      rows.length
    );

    console.table(
      rows.map((row) => ({
        id: row.id,
        rate_id: row.rate_id,
        type_of_services: row.type_of_services,
        active: row.active,
        ea_calculateon: row.ea_calculateon,
        ea_operator: row.ea_operator,
        ea_comp_operator: row.ea_comp_operator,
        charges_services: row.charges_services,
      }))
    );

    return rows;
  } catch (error) {
    console.error(
      `❌ GET ADDITIONAL CHARGES ERROR [${chargeType}]:`,
      error
    );

    throw error;
  }
};


const getOtherChargesAtActual = async (
  siteId,
  transaction = null
) => {
  console.log("🔥 GET OTHER CHARGES AT ACTUAL CALLED =", {
    siteId,
    hasTransaction: !!transaction,
  });

  try {
    let request;

    if (transaction) {
      console.log("🔗 GET OTHER CHARGES USING TRANSACTION");
      request = transaction.request();
    } else {
      console.log("🔗 GET OTHER CHARGES USING NORMAL POOL");

      const pool = await poolPromise;
      request = pool.request();
    }

    request.input(
      "siteId",
      sql.Int,
      Number(siteId)
    );

    const result = await request.query(`
      SELECT *
      FROM client_service_charges
      WHERE rate_id = @siteId
        AND ea_calculateon = 'AT ACTUAL'
    `);

    console.log(
      "✅ OTHER CHARGES AT ACTUAL RESULT =",
      result.recordset.length
    );

    return result.recordset || [];

  } catch (error) {
    console.error(
      "❌ GET OTHER CHARGES AT ACTUAL ERROR =",
      error
    );

    throw error;
  }
};

// const getEmployeeVouchers = async (siteId, month, year, empId) => {
//   const pool = await poolPromise;

//   const result = await pool
//     .request()
//     .input("siteId", sql.Int, siteId)
//     .input("month", sql.Int, month)
//     .input("year", sql.Int, year)
//     .input("empId", sql.Int, empId).query(`
//       SELECT
//         ISNULL(SUM(amount), 0) AS totalexpense
//       FROM emp_advance
//       WHERE site_id = @siteId
//         AND MONTH(adv_date) = @month
//         AND YEAR(adv_date) = @year
//         AND emp_id = @empId
//         AND status = 'Approved'
//     `);

//   return result.recordset[0];
// };

// const getEmployeeVouchers = async (siteId, month, year, empId) => {
//   const pool = await poolPromise;

//   const startDate = new Date(year, month - 1, 1);
//   const endDate = new Date(year, month, 1);

//   const result = await pool
//     .request()
//     .input("siteId", sql.Int, siteId)
//     .input("empId", sql.Int, empId)
//     .input("startDate", sql.Date, startDate)
//     .input("endDate", sql.Date, endDate).query(`
//       SELECT
//         ISNULL(SUM(amount), 0) AS totalexpense
//       FROM emp_advance
//       WHERE site_id = @siteId
//         AND emp_id = @empId
//         AND adv_date >= @startDate
//         AND adv_date < @endDate
//         AND status = 'Approved'
//     `);

//   return result.recordset[0];
// };

const getEmployeeVouchers = async (
  siteId,
  month,
  year,
  empId,
  transaction = null
) => {
  try {
    console.log("getEmployeeVouchers =>", {
      siteId,
      month,
      year,
      empId,
      hasTransaction: !!transaction,
    });

    let request;

    if (transaction) {
      console.log("🔗 GET EMPLOYEE VOUCHERS USING TRANSACTION");
      request = transaction.request();
    } else {
      console.log("🔗 GET EMPLOYEE VOUCHERS USING NORMAL POOL");

      const pool = await poolPromise;
      request = pool.request();
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    request
      .input("siteId", sql.Int, Number(siteId))
      .input("empId", sql.Int, Number(empId))
      .input("startDate", sql.Date, startDate)
      .input("endDate", sql.Date, endDate);

    const result = await request.query(`
      SELECT
        ISNULL(SUM(CAST(amount AS FLOAT)), 0) AS totalexpense
      FROM emp_advance
      WHERE site_id = @siteId
        AND emp_id = @empId
        AND adv_date >= @startDate
        AND adv_date < @endDate
        AND status = 'Approved'
    `);

    console.log(
      "EMPLOYEE ADVANCE RESULT =",
      result.recordset[0]
    );

    return result.recordset[0];

  } catch (error) {
    console.error("❌ getEmployeeVouchers Error:", error);
    throw error;
  }
};

const getServiceChargesAtActual = async (
  siteId,
  transaction = null
) => {
  try {
    let request;

    // =====================================
    // TRANSACTION / NORMAL POOL
    // =====================================

    if (
      transaction &&
      typeof transaction.request === "function"
    ) {
      console.log(
        "🔗 GET SERVICE CHARGES AT ACTUAL USING TRANSACTION"
      );

      request = transaction.request();

    } else {
      console.log(
        "🔗 GET SERVICE CHARGES AT ACTUAL USING NORMAL POOL"
      );

      const pool = await poolPromise;

      request = pool.request();
    }


    // =====================================
    // QUERY
    // =====================================

    const result = await request
      .input(
        "siteId",
        sql.Int,
        Number(siteId)
      )
      .query(`
        SELECT *
        FROM client_service_charges
        WHERE rate_id = @siteId
          AND LTRIM(RTRIM(ea_calculateon)) = 'AT ACTUAL'
      `);


    console.log(
      "✅ SERVICE CHARGES AT ACTUAL FOUND:",
      result.recordset?.length || 0
    );

    return result.recordset || [];

  } catch (error) {

    console.error(
      "❌ GET SERVICE CHARGES AT ACTUAL ERROR:",
      error
    );

    throw error;
  }
};



const getAdditionalChargesForPT = async (
  siteId,
  type,
  gross,
  gender,
  transaction = null,
) => {
  if (String(gender ?? "").trim().toLowerCase() === "female") {
    return 0;
  }

  const result = await getAdditionalChargesByType(
    siteId,
    type,
    transaction,
  );

  const grossAmount = Number(gross ?? 0);
  let pt = 0;

  if (!Number.isFinite(grossAmount) || !Array.isArray(result)) {
    return 0;
  }

  for (const row of result) {
    const operator = String(row.ea_operator ?? "")
      .trim()
      .toLowerCase();

    const compareValue = String(row.ea_comp_operator ?? "").trim();
    const charge = Number(row.charges_services ?? 0);

    if (!Number.isFinite(charge)) continue;

    let matched = false;

    if (operator === "between") {
      const parts = compareValue.split("-");

      if (parts.length === 2) {
        const min = Number(parts[0].trim());
        const max = Number(parts[1].trim());

        if (Number.isFinite(min) && Number.isFinite(max)) {
          matched = grossAmount > min && grossAmount < max;
        }
      }
    } else {
      const compareAmount = Number(compareValue);

      if (Number.isFinite(compareAmount)) {
        switch (operator) {
          case "equal to":
            matched = grossAmount === compareAmount;
            break;
          case "greater than":
            matched = grossAmount > compareAmount;
            break;
          case "greater than or equal to":
            matched = grossAmount >= compareAmount;
            break;
          case "less than":
            matched = grossAmount < compareAmount;
            break;
          case "less than or equal to":
            matched = grossAmount <= compareAmount;
            break;
        }
      }
    }

    if (matched) {
      pt = charge;

      if (pt > 0) {
        break;
      }
    }
  }

  return pt;
};


function calculateSalaryComponents({
  siteDetail,
  netDays,
  monthDays,
  decimalPoint,
  bonusArr = [],
}) {
  let basic = 0;
  let hra = Number(siteDetail.emp_basicda || 0);
  let vda = Number(siteDetail.emp_da || 0);

  if (siteDetail.emp_perday_rate) {
    basic = Number(
      (siteDetail.emp_perday_rate * netDays).toFixed(decimalPoint),
    );
  } else {
    basic = Number(Number(siteDetail.emp_basic || 0).toFixed(decimalPoint));
  }

  const specialAllow = Number(siteDetail.special_allow || 0);
  const otherAllow = Number(siteDetail.other_allow || 0);
  const lww = Number(siteDetail.lww || 0);
  const anyOther = Number(siteDetail.any_other || 0);

  let bonus = 0;
  let fixedBonus = 0;

  if (bonusArr.length > 0) {
    const bonusConfig = bonusArr[0];

    if (bonusConfig.count_services === "Rs") {
      bonus = Number(bonusConfig.charges_services);
    } else {
      if (siteDetail.emp_perday_rate) {
        bonus = (basic * Number(bonusConfig.charges_services)) / 100;
      } else {
        const netBasicDa = (basic / monthDays) * netDays;

        bonus = (netBasicDa * Number(bonusConfig.charges_services)) / 100;
      }
    }
  }

  if (Number(siteDetail.bonus || 0) > 0) {
    fixedBonus = Number(siteDetail.bonus);
    bonus = fixedBonus;
  }

  const fixedLeaveWages = Number(siteDetail.fixed_leave_wages || 0);

  const gross = siteDetail.emp_perday_rate
    ? Number(siteDetail.emp_perday_rate)
    : basic +
      vda +
      hra +
      specialAllow +
      otherAllow +
      lww +
      fixedBonus +
      fixedLeaveWages +
      anyOther;

  return {
    basic,
    hra,
    vda,
    basicDa: basic + vda,
    specialAllow,
    otherAllow,
    lww,
    bonus,
    fixedBonus,
    fixedLeaveWages,
    anyOther,
    gross,
  };
}

function calculateEarnedComponents({
  components,
  netDays,
  monthDays,
  empPerDayRate,
  otherChargesArr = [],
  decimalPoint = 2,
}) {
  // सुरक्षा: monthDays 0 नसावा
  if (!monthDays || Number(monthDays) <= 0) {
    throw new Error("monthDays must be greater than 0");
  }

  // Convert values safely
  const basic = Number(components?.basic || 0);
  const vda = Number(components?.vda || 0);
  const hra = Number(components?.hra || 0);
  const specialAllow = Number(components?.specialAllow || 0);
  const otherAllow = Number(components?.otherAllow || 0);
  const lww = Number(components?.lww || 0);
  const bonus = Number(components?.bonus || 0);
  const fixedLeaveWages = Number(components?.fixedLeaveWages || 0);
  const fixedUniformWages = Number(components?.fixedUniformWages || 0);

  const safeNetDays = Number(netDays || 0);
  const safeMonthDays = Number(monthDays || 0);
  const safeEmpPerDayRate = Number(empPerDayRate || 0);

  /*
    ==============================
    BASIC
    ==============================
  */

  const earnedBasic =
    safeEmpPerDayRate > 0
      ? 0
      : Number(
          ((basic / safeMonthDays) * safeNetDays).toFixed(decimalPoint)
        );

  /*
    ==============================
    VDA
    ==============================
  */

  const earnedDa =
    safeEmpPerDayRate > 0
      ? 0
      : Number(
          ((vda / safeMonthDays) * safeNetDays).toFixed(decimalPoint)
        );

  /*
    ==============================
    BASIC + DA
    ==============================
  */

  const earnedBasicDa = Number(
    (earnedBasic + earnedDa).toFixed(decimalPoint)
  );

  /*
    ==============================
    HRA
    ==============================
  */

  const earnedHra = Number(
    ((hra / safeMonthDays) * safeNetDays).toFixed(decimalPoint)
  );

  /*
    ==============================
    SPECIAL ALLOWANCE
    ==============================
  */

  const earnedSpecialAllow = Number(
    ((specialAllow / safeMonthDays) * safeNetDays).toFixed(decimalPoint)
  );

  /*
    ==============================
    OTHER ALLOWANCE
    ==============================
  */

  const earnedOtherAllow = Number(
    ((otherAllow / safeMonthDays) * safeNetDays).toFixed(decimalPoint)
  );

  /*
    ==============================
    LWW
    ==============================
  */

  const earnedLww = Number(
    ((lww / safeMonthDays) * safeNetDays).toFixed(decimalPoint)
  );

  /*
    ==============================
    BONUS
    ==============================
  */

  const earnedBonus =
    safeEmpPerDayRate > 0
      ? Number(bonus.toFixed(decimalPoint))
      : Number(
          ((bonus / safeMonthDays) * safeNetDays).toFixed(decimalPoint)
        );

  /*
    ==============================
    LEAVE WAGES
    ==============================
  */

  const earnedLeaveWages = Number(
    ((fixedLeaveWages / safeMonthDays) * safeNetDays).toFixed(decimalPoint)
  );

  /*
    ==============================
    UNIFORM WAGES
    ==============================
  */

  const earnedUniformWages = Number(
    ((fixedUniformWages / safeMonthDays) * safeNetDays).toFixed(decimalPoint)
  );

  /*
    ==============================
    ANY OTHER / ADDITIONAL CHARGES
    ==============================
  */

  let earnedAnyOther = 0;

  if (Array.isArray(otherChargesArr) && otherChargesArr.length > 0) {
    earnedAnyOther = otherChargesArr.reduce((total, charge) => {
      const chargeAmount = Number(charge?.charges_services || 0);

      let earnedCharge = 0;

      if (
        String(charge?.ea_calculateon || "")
          .trim()
          .toUpperCase() === "AT ACTUAL"
      ) {
        earnedCharge = chargeAmount;
      } else {
        earnedCharge =
          (chargeAmount / safeMonthDays) * safeNetDays;
      }

      return total + earnedCharge;
    }, 0);

    earnedAnyOther = Number(
      earnedAnyOther.toFixed(decimalPoint)
    );
  }

  /*
    ==============================
    FINAL EARNED GROSS
    ==============================

    IMPORTANT:
    fixedLeaveWages / UniformWages / AnyOther
    तुमच्या gross मध्ये include करायचे की नाही,
    हे तुमच्या existing business logic वर depend आहे.
  */

  const earnedGross = Number(
    (
      earnedBasic +
      earnedDa +
      earnedHra +
      earnedSpecialAllow +
      earnedOtherAllow +
      earnedLww +
      earnedBonus +
      earnedLeaveWages +
      earnedUniformWages +
      earnedAnyOther
    ).toFixed(decimalPoint)
  );

  /*
    ==============================
    RETURN
    ==============================
  */

  return {
    earnedBasic,
    earnedDa,
    earnedBasicDa,

    earnedHra,
    earnedSpecialAllow,
    earnedOtherAllow,
    earnedLww,
    earnedBonus,

    earnedLeaveWages,
    earnedUniformWages,
    earnedAnyOther,

    earnedGross,
  };
}

function calculateOTWages({
  siteDetail,
  siteInfo,
  otRate,
  otDays,
  overtime,
  gross,
  otRateArr = [],
  decimalPoint,
}) {
  let earnedOtWages = 0;

  if (siteDetail.ot_rate) {
    if (Number(siteInfo.multiply_ot_hours) === 1) {
      earnedOtWages = otRate * otDays * Number(siteDetail.emp_hours || 0);
    } else {
      earnedOtWages = otRate * otDays;
    }
  } else if (otRateArr.length > 0) {
    if (otRateArr[0].ea_calculateon === "AT ACTUAL") {
      earnedOtWages = otRate;
    } else {
      earnedOtWages = otRate * otDays;
    }
  } else {
    if (overtime > 0) {
      earnedOtWages = (gross / 8) * otDays;
    }
  }

  return Number(earnedOtWages.toFixed(decimalPoint));
}

function calculateEarnedGross({
  siteDetail,
  siteInfo,
  wages,
  doubleOtRateArr = [],
  decimalPoint = 2,
}) {
  let earnedGross = 0;
  let daysPay = 0;
  let esicAppl = 0;
  let earnedOtWages = wages.earned_ot_wages || 0;

  // ==================================
  // PER DAY RATE EMPLOYEE
  // ==================================
  if (siteDetail.emp_perday_rate) {
    earnedGross = Number(
      (
        Number(wages.earned_basic || 0) +
        Number(wages.earned_basic_da || 0) +
        Number(wages.earned_hra || 0)
      ).toFixed(decimalPoint),
    );

    if (doubleOtRateArr.length > 0) {
      const rule = doubleOtRateArr[0]?.ea_calculateon;

      if (rule === "GROSS/8 hours") {
        earnedOtWages =
          (earnedGross / wages.month_days / 8) * 2 * wages.ot_days;
      } else if (rule === "GROSS/9 hours") {
        earnedOtWages =
          (earnedGross / wages.month_days / 9) * 2 * wages.ot_days;
      } else if (rule === "GROSS/12 hours") {
        earnedOtWages =
          (earnedGross / wages.month_days / 12) * 2 * wages.ot_days;
      }
    }

    daysPay = earnedGross;
    esicAppl = earnedGross;

    if (earnedOtWages > 0) {
      esicAppl += Number(earnedOtWages.toFixed(decimalPoint));
    }
  }

  // ==================================
  // MONTHLY SALARY EMPLOYEE
  // ==================================
  else {
    earnedGross = Number(
      (
        Number(wages.earned_basic_da || 0) +
        Number(wages.earned_special_allow || 0) +
        Number(wages.earned_hra || 0) +
        Number(wages.earned_other_allow || 0) +
        Number(wages.earned_lww || 0) +
        Number(wages.earned_bonus || 0) +
        Number(wages.earned_leave_wages || 0) +
        Number(wages.earned_uniform_wages || 0) +
        Number(wages.earned_holiday_pay || 0)
      ).toFixed(decimalPoint),
    );

    if (doubleOtRateArr.length > 0) {
      const rule = doubleOtRateArr[0]?.ea_calculateon;

      if (rule === "GROSS/8 hours") {
        earnedOtWages =
          (earnedGross / wages.month_days / 8) * 2 * wages.ot_days;
      } else if (rule === "GROSS/9 hours") {
        earnedOtWages =
          (earnedGross / wages.month_days / 9) * 2 * wages.ot_days;
      } else if (rule === "GROSS/12 hours") {
        earnedOtWages =
          (earnedGross / wages.month_days / 12) * 2 * wages.ot_days;
      }
    }

    if (String(siteInfo.calculate_earnedgross_withoutot) !== "1") {
      earnedGross = Number(
        (
          Number(wages.earned_basic_da || 0) +
          Number(wages.earned_special_allow || 0) +
          Number(wages.earned_hra || 0) +
          Number(wages.earned_other_allow || 0) +
          Number(wages.earned_lww || 0) +
          Number(wages.earned_bonus || 0) +
          Number(wages.earned_leave_wages || 0) +
          Number(wages.earned_uniform_wages || 0) +
          Number(earnedOtWages || 0) +
          Number(wages.earned_holiday_pay || 0)
        ).toFixed(decimalPoint),
      );
    }

    daysPay = earnedGross;
    esicAppl = earnedGross;
  }

  return {
    earnedGross,
    earnedOtWages: Number(earnedOtWages.toFixed(decimalPoint)),
    daysPay,
    esicAppl,
  };
}

const getChargesMaster = async () => {
  const pool = await poolPromise;

  const result = await pool.request().query(`
    SELECT
      id,
      charges_master,
      label_display
    FROM charges_master
    where active='0'
    ORDER BY id ASC
  `);

  return result.recordset;
};

module.exports = {
  getChargesMaster,
  getSiteDetail,
  calculateEarnedGross,
  getTotalPresentDaysEmp,
  getTotalDoubleDutyDays,
  getTotalOvertimeByEmp,
  getTotalHalfDaysByEmp,
  calculateNetDays,
  
  getAdditionalChargesByType,
  getOtherChargesAtActual,
  getEmployeeVouchers,
  getServiceChargesAtActual,
  getAdditionalChargesForPT,
  calculateSalaryComponents,
  calculateEarnedComponents,
  calculateOTWages,
  getAdditionalChargesAtActual,
  getCompanyById,
};
