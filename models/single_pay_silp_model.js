
 // ===============================
// models/single_pay_silp_model.js
// ===============================

const {
  sql,
  poolPromise,
} = require("../config/db");

const fetchSinglePaySlip = async (emp_id, month, year) => {
  const pool = await poolPromise;

  // =====================================
  // 1. MAIN PAYSLIP + ATTENDANCE DATA
  // =====================================

  const query = `
    SELECT
      e.id AS employee_id,
      e.emp_full_name,
      e.employee_code,
      e.bank_name,
      e.dob,
      e.date_of_joining,
      e.account_no,
      e.ac_holder_name,

      c.company_name AS client_name,
      cr.site_name,
      cr.client_code,

      ss.basic_rate,
      ss.gross_salary,
      ss.total_earning,
      ss.total_deduction,
      ss.salary_slip_img_path,
      ss.no_of_days,
      ss.def_gross_salary,
      ss.def_basic_salary,
      ss.rank AS salary_rank,

      e.rank,

      -- Present days
      (
        SELECT COUNT(*)
        FROM attendance a
        WHERE a.emp_code = e.employee_code
          AND a.site_id = e.site_id
          AND TRY_CONVERT(INT, a.at_month) = @month
          AND TRY_CONVERT(INT, a.at_year) = @year
          AND a.active = '0'
          AND (
            a.status LIKE '%P%'
            OR a.status LIKE '%D%'
            OR a.status LIKE '%N%'
          )
      ) AS present_days,

      -- Half days
      (
        SELECT COUNT(*)
        FROM attendance a
        WHERE a.emp_code = e.employee_code
          AND a.site_id = e.site_id
          AND TRY_CONVERT(INT, a.at_month) = @month
          AND TRY_CONVERT(INT, a.at_year) = @year
          AND a.active = '0'
          AND a.status = 'HF'
      ) AS half_days,

      -- Absent days
      (
        SELECT COUNT(*)
        FROM attendance a
        WHERE a.emp_code = e.employee_code
          AND a.site_id = e.site_id
          AND TRY_CONVERT(INT, a.at_month) = @month
          AND TRY_CONVERT(INT, a.at_year) = @year
          AND a.active = '0'
          AND a.status = 'A'
      ) AS absent_days,

      -- Weekoff days: assumed status WO
      (
        SELECT COUNT(*)
        FROM attendance a
        WHERE a.emp_code = e.employee_code
          AND a.site_id = e.site_id
          AND TRY_CONVERT(INT, a.at_month) = @month
          AND TRY_CONVERT(INT, a.at_year) = @year
          AND a.active = '0'
          AND a.status = 'WO'
      ) AS weekoff_days,

      -- Holiday days: assumed status H or HO
      (
        SELECT COUNT(*)
        FROM attendance a
        WHERE a.emp_code = e.employee_code
          AND a.site_id = e.site_id
          AND TRY_CONVERT(INT, a.at_month) = @month
          AND TRY_CONVERT(INT, a.at_year) = @year
          AND a.active = '0'
          AND a.status IN ('H', 'HO')
      ) AS holiday_days,

      -- Wages sheet fields
      ws.gender,
      ws.basic,
      ws.vda,
      ws.total_basic_vda,
      ws.special_allowance,
      ws.hra,
      ws.other_allowance,
      ws.lww,
      ws.bonus,
      ws.gross,
      ws.month_days,
      ws.present_days AS ws_present_days,
      ws.paid_holiday,
      ws.actual_paid_days,
      ws.ot_hours,

      ws.earn_basic,
      ws.earn_da,
      ws.earn_total_basic_da,
      ws.earn_special_allowance_da,
      ws.earn_hra_da,
      ws.earn_other_allowance_da,
      ws.earn_lww_da,
      ws.earn_bonus_da,
      ws.earn_ot_rate,
      ws.earn_ot_amount,
      ws.earn_total_gross_wages,

      ws.pf_wages,
      ws.esic_wages,
      ws.deduct_pf,
      ws.deduct_pt,
      ws.deduct_esic,
      ws.deduct_lwf,
      ws.total_deduction AS ws_total_deduction,
      ws.net_take_home,

      ws.part_pf_percent,
      ws.part_esic,
      ws.part_t_shirt,
      ws.part_ctc,
      ws.part_service_charges,
      ws.part_tctc,
      ws.part_gst,
      ws.part_invoice_amount,

      ws.advances,
      ws.source AS wages_source

    FROM employee e

    LEFT JOIN new_client c
      ON c.id = e.client_id

    LEFT JOIN client_rates cr
      ON cr.id = e.site_id

    LEFT JOIN salary_slip ss
      ON ss.emp_id = e.id
      AND TRY_CONVERT(INT, ss.at_month) = @month
      AND TRY_CONVERT(INT, ss.at_year) = @year

    LEFT JOIN wages_sheet ws
      ON ws.emp_id = e.id
      AND TRY_CONVERT(INT, ws.at_month) = @month
      AND TRY_CONVERT(INT, ws.at_year) = @year

    WHERE e.id = @emp_id
  `;

  const result = await pool
    .request()
    .input("emp_id", sql.Int, emp_id)
    .input("month", sql.Int, month)
    .input("year", sql.Int, year)
    .query(query);

  const data = result.recordset[0];

  if (!data) {
    return null;
  }

  // =====================================
  // 2. EARNINGS
  // =====================================

  const earningResult = await pool
    .request()
    .input("emp_id", sql.Int, emp_id)
    .input("month", sql.Int, month)
    .input("year", sql.Int, year)
    .query(`
      SELECT
        se.id,
        se.emp_id,
        se.parent_id,
        se.tmpl_id,
        se.earning_name,
        se.earning_rate,
        se.earning_amount,
        se.calc_amount,
        se.active,
        se.source
      FROM ss_earning se
      INNER JOIN salary_slip ss
        ON ss.id = se.parent_id
      WHERE ss.emp_id = @emp_id
        AND TRY_CONVERT(INT, ss.at_month) = @month
        AND TRY_CONVERT(INT, ss.at_year) = @year
        AND ISNULL(ss.active, 0) = 0
        AND ISNULL(se.active, 0) = 0
      ORDER BY se.id
    `);

  // =====================================
  // 3. DEDUCTIONS
  // =====================================

  const deductionResult = await pool
    .request()
    .input("emp_id", sql.Int, emp_id)
    .input("month", sql.Int, month)
    .input("year", sql.Int, year)
    .query(`
      SELECT
        sd.id,
        sd.emp_id,
        sd.parent_id,
        sd.tmpl_id,
        sd.deduction_name,
        sd.deduction_rate,
        sd.deduction_amount,
        sd.calc_amount,
        sd.active,
        sd.source
      FROM ss_deduction sd
      INNER JOIN salary_slip ss
        ON ss.id = sd.parent_id
      WHERE ss.emp_id = @emp_id
        AND TRY_CONVERT(INT, ss.at_month) = @month
        AND TRY_CONVERT(INT, ss.at_year) = @year
        AND ISNULL(ss.active, 0) = 0
        AND ISNULL(sd.active, 0) = 0
      ORDER BY sd.id
    `);

  // =====================================
  // 4. FORMAT EARNINGS
  // =====================================

  const earnings = earningResult.recordset.map((row) => ({
    id: row.id,
    emp_id: row.emp_id,
    parent_id: row.parent_id,
    tmpl_id: row.tmpl_id,
    earning_name: row.earning_name,
    earning_rate: Number(row.earning_rate || 0),
    earning_amount: Number(row.earning_amount || 0),
    calc_amount: Number(row.calc_amount || 0),
    active: row.active,
    source: row.source,
  }));

  // =====================================
  // 5. FORMAT DEDUCTIONS
  // =====================================

  const deductions = deductionResult.recordset.map((row) => ({
    id: row.id,
    emp_id: row.emp_id,
    parent_id: row.parent_id,
    tmpl_id: row.tmpl_id,
    deduction_name: row.deduction_name,
    deduction_rate: Number(row.deduction_rate || 0),
    deduction_amount: Number(row.deduction_amount || 0),
    calc_amount: Number(row.calc_amount || 0),
    active: row.active,
    source: row.source,
  }));

  // =====================================
  // 6. MONTH / WORKING DAYS
  // =====================================

  // Total calendar days in the requested month
  const month_days = new Date(year, month, 0).getDate();

  const present_days = Number(data.present_days || 0);
  const half_days = Number(data.half_days || 0);
  const absent_days = Number(data.absent_days || 0);
  const weekoff_days = Number(data.weekoff_days || 0);
  const holiday_days = Number(data.holiday_days || 0);

  // Working days exclude weekoffs and holidays.
  // This assumes attendance records exist for each weekoff/holiday.
  const work_days = Math.max(
    0,
    month_days - weekoff_days - holiday_days
  );

  // Half day contributes 0.5 attendance day.
  const attendance_days = present_days + half_days * 0.5;

  // Use wages-sheet values where available.
  // Otherwise, calculate basic attendance-based paid days.
  const actual_paid_days =
    data.actual_paid_days != null
      ? Number(data.actual_paid_days)
      : attendance_days +
        Number(data.paid_holiday || 0);

  // =====================================
  // 7. SALARY TOTALS
  // =====================================

  const total_earning = Number(data.total_earning || 0);
  const total_deduction = Number(data.total_deduction || 0);

  const net_salary = total_earning - total_deduction;

  // =====================================
  // 8. FULL SALARY SLIP URL
  // =====================================

  const salarySlipUrl = data.salary_slip_img_path
    ? `${process.env.BASE_URL}/${data.salary_slip_img_path}`
    : null;

  // =====================================
  // 9. FINAL RESPONSE
  // =====================================

  return {
    ...data,

    month: Number(month),
    year: Number(year),

    // Month and attendance summary
    month_days,
    work_days,
    present_days,
    half_days,
    absent_days,
    weekoff_days,
    holiday_days,
    attendance_days,
    actual_paid_days,

    // Salary totals
    total_earning,
    total_deduction,
    net_salary,

    // Details
    earnings,
    deductions,

    salary_slip_full_url: salarySlipUrl,
  };
};



module.exports = {
  fetchSinglePaySlip,
};
