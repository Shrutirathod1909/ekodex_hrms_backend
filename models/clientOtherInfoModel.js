const { poolPromise, sql } = require("../config/db");
const logger = require("../utils/logger");
// =========================
// GET ALL
// =========================
// =========================
// GET ALL
// =========================
const getAll = async () => {
  const pool = await poolPromise;

  return await pool.request().query(`
    SELECT
      id,
      client_id,
      rate_id,
      type_of_serv,
      charges_type,
      charges,
      calc_on,
      calc_operation,
      amount_to_compare,
      created_at
    FROM client_other_info
    ORDER BY client_id DESC, rate_id DESC
  `);
};

// =========================
// GET BY CLIENT_ID + RATE_ID
// =========================
const getByClientAndSiteId = async (client_id, site_id) => {
  try {
    logger.log("================================");
    logger.log("MODEL FUNCTION START");
    logger.log("CLIENT ID =", client_id);
    logger.log("SITE ID =", site_id);
    logger.log("================================");

    const pool = await poolPromise;

    const query = `
      SELECT *
      FROM client_other_info
      WHERE client_id = @client_id
      AND rate_id = @site_id
    `;

    logger.log("QUERY =");
    logger.log(query);

    const result = await pool
      .request()

      .input("client_id", sql.Int, Number(client_id))

      .input("site_id", sql.Int, Number(site_id))

      .query(query);

    logger.log("================================");
    logger.log("QUERY SUCCESS");
    logger.log("TOTAL ROWS =", result.recordset.length);

    logger.log("FULL DATA =", JSON.stringify(result.recordset, null, 2));

    logger.log("================================");

    return result;
  } catch (error) {
    logger.log("================================");
    logger.log("MODEL ERROR");
    logger.log("MESSAGE =", error.message);
    logger.log("FULL ERROR =", error);
    logger.log("================================");

    throw error;
  }
};

// =========================
// GET BY ID
// =========================
const getById = async (id) => {
  const pool = await poolPromise;

  return await pool.request().input("id", sql.Int, id).query(`
      SELECT *
      FROM client_other_info
      WHERE id = @id
    `);
};

// =========================
// INSERT
// =========================
const create = async (data) => {
  const pool = await poolPromise;

  return await pool
    .request()
    .input("client_id", sql.Int, data.client_id)
    .input("rate_id", sql.Int, data.rate_id)
    .input("emp_type", sql.VarChar, data.emp_type)
    .input("emp_hours", sql.NVarchar(10, 2), data.emp_hours)
    .input("emp_nos", sql.Int, data.emp_nos)
    .input("emp_cost_per_head", sql.NVarchar(10, 2), data.emp_cost_per_head)
    .input("emp_total_cost", sql.NVarchar(10, 2), data.emp_total_cost)
    .input("active", sql.Bit, data.active ?? 1)
    .input("service_charges_type", sql.VarChar, data.service_charges_type)
    .input("service_charges", sql.NVarchar(10, 2), data.service_charges)
    .input("holiday_type", sql.VarChar, data.holiday_type)
    .input("emp_perday_rate", sql.NVarchar(10, 2), data.emp_perday_rate)
    .input("divide_by", sql.Int, data.divide_by)
    .input("emp_basic", sql.NVarchar(10, 2), data.emp_basic)
    .input("emp_basicda", sql.NVarchar(10, 2), data.emp_basicda)
    .input("special_allow", sql.NVarchar(10, 2), data.special_allow)
    .input("other_allow", sql.NVarchar(10, 2), data.other_allow)
    .input("ot_rate", sql.NVarchar(10, 2), data.ot_rate)
    .input("lww", sql.NVarchar(10, 2), data.lww)
    .input("bonus", sql.NVarchar(10, 2), data.bonus)
    .input("fixed_leave_wages", sql.NVarchar(10, 2), data.fixed_leave_wages)
    .input("fixed_uniform_wages", sql.NVarchar(10, 2), data.fixed_uniform_wages)
    .input("any_other", sql.NVarchar(10, 2), data.any_other)
    .input("emp_da", sql.NVarchar(10, 2), data.emp_da)
    .input("source", sql.VarChar, data.source).query(`
      INSERT INTO client_other_info (
        client_id, rate_id, emp_type, emp_hours, emp_nos,
        emp_cost_per_head, emp_total_cost, active,
        service_charges_type, service_charges, holiday_type,
        emp_perday_rate, divide_by, emp_basic, emp_basicda,
        special_allow, other_allow, ot_rate, lww, bonus,
        fixed_leave_wages, fixed_uniform_wages, any_other,
        emp_da, source
      )
      VALUES (
        @client_id, @rate_id, @emp_type, @emp_hours, @emp_nos,
        @emp_cost_per_head, @emp_total_cost, @active,
        @service_charges_type, @service_charges, @holiday_type,
        @emp_perday_rate, @divide_by, @emp_basic, @emp_basicda,
        @special_allow, @other_allow, @ot_rate, @lww, @bonus,
        @fixed_leave_wages, @fixed_uniform_wages, @any_other,
        @emp_da, @source
      )
    `);
};

// =========================
// UPDATE
// =========================
const update = async (id, data) => {
  const pool = await poolPromise;

  logger.log("UPDATE ID =", id);
  logger.log("UPDATE DATA =", data);

  // =========================
  // CHECK EXISTING RECORD
  // =========================

  const existing = await pool.request().input("id", sql.BigInt, Number(id) || 0)
    .query(`
      SELECT * 
      FROM client_other_info
      WHERE id = @id
    `);

  // =========================
  // COMMON REQUEST
  // =========================

  const request = pool
    .request()

    .input("id", sql.BigInt, Number(id) || 0)

    // CLIENT ID
    .input(
      "client_id",
      sql.Int,
      Number(
        data.client_id ||
          data.clientId ||
          data.siteDetails?.clientId ||
          data.siteDetails?.client_id,
      ) || 0,
    )

    .input(
      "rate_id",
      sql.Int,
      Number(
        data.rate_id ||
          data.site_id ||
          data.siteId ||
          data.siteDetails?.site_id ||
          data.siteDetails?.id,
      ) || 0,
    )

    .input("emp_type", sql.NVarChar(50), data.emp_type || "")

    .input("emp_hours", sql.Decimal(10, 2), Number(data.hours) || 0)

    .input("emp_nos", sql.Int, Number(data.emp_nos) || 0)

    .input("emp_basic", sql.Decimal(18, 2), Number(data.basic) || 0)

    .input("emp_da", sql.Decimal(18, 2), Number(data.da) || 0)

    .input(
      "special_allow",
      sql.Decimal(18, 2),
      Number(data.special_allowance) || 0,
    )

    .input("other_allow", sql.Decimal(18, 2), Number(data.other_allowance) || 0)

    .input("lww", sql.Decimal(18, 2), Number(data.lww) || 0)

    .input("bonus", sql.Decimal(18, 2), Number(data.bonus) || 0)

    .input(
      "emp_cost_per_head",
      sql.Decimal(18, 2),
      Number(data.emp_cost_per_head) || 0,
    )

    .input(
      "emp_total_cost",
      sql.Decimal(18, 2),
      Number(data.emp_total_cost) || 0,
    )

    .input(
      "service_charges_type",
      sql.NVarChar(50),
      data.service_charges_type || "",
    )

    .input(
      "service_charges",
      sql.Decimal(18, 2),
      Number(data.service_charges) || 0,
    )

    .input(
      "emp_perday_rate",
      sql.Decimal(18, 2),
      Number(data.emp_perday_rate) || 0,
    )

    .input("ot_rate", sql.Decimal(18, 2), Number(data.ot_rate) || 0)

    .input(
      "fixed_leave_wages",
      sql.Decimal(18, 2),
      Number(data.leave_wages) || 0,
    )

    .input(
      "fixed_uniform_wages",
      sql.Decimal(18, 2),
      Number(data.uniform_washing) || 0,
    )

    .input("any_other", sql.Decimal(18, 2), Number(data.any_other) || 0);

  // =========================
  // INSERT
  // =========================

  if (existing.recordset.length === 0) {
    logger.log("INSERT RUNNING");

    return await request.query(`

      INSERT INTO client_other_info
      (
        client_id,
        rate_id,
        emp_type,
        emp_hours,
        emp_nos,
        emp_basic,
        emp_da,
        special_allow,
        other_allow,
        lww,
        bonus,
        emp_cost_per_head,
        emp_total_cost,
        service_charges_type,
        service_charges,
        emp_perday_rate,
        ot_rate,
        fixed_leave_wages,
        fixed_uniform_wages,
        any_other
      )

      VALUES
      (
        @client_id,
        @rate_id,
        @emp_type,
        @emp_hours,
        @emp_nos,
        @emp_basic,
        @emp_da,
        @special_allow,
        @other_allow,
        @lww,
        @bonus,
        @emp_cost_per_head,
        @emp_total_cost,
        @service_charges_type,
        @service_charges,
        @emp_perday_rate,
        @ot_rate,
        @fixed_leave_wages,
        @fixed_uniform_wages,
        @any_other
      );

      SELECT TOP 1 *
      FROM client_other_info
      ORDER BY id DESC;

    `);
  }

  // =========================
  // UPDATE
  // =========================

  logger.log("UPDATE RUNNING");

  return await request.query(`

    UPDATE client_other_info
    SET
      client_id = @client_id,
      rate_id = @rate_id,
      emp_type = @emp_type,
      emp_hours = @emp_hours,
      emp_nos = @emp_nos,
      emp_basic = @emp_basic,
      emp_da = @emp_da,
      special_allow = @special_allow,
      other_allow = @other_allow,
      lww = @lww,
      bonus = @bonus,
      emp_cost_per_head = @emp_cost_per_head,
      emp_total_cost = @emp_total_cost,
      service_charges_type = @service_charges_type,
      service_charges = @service_charges,
      emp_perday_rate = @emp_perday_rate,
      ot_rate = @ot_rate,
      fixed_leave_wages = @fixed_leave_wages,
      fixed_uniform_wages = @fixed_uniform_wages,
      any_other = @any_other

    WHERE id = @id;

    SELECT *
    FROM client_other_info
    WHERE id = @id;

  `);
};

// =========================
// DELETE (soft delete)
// =========================
const remove = async (id) => {
  const pool = await poolPromise;

  return await pool.request().input("id", sql.Int, id).query(`
      UPDATE client_other_info
      SET active = 0
      WHERE id = @id
    `);
};

module.exports = {
  getAll,
  getByClientAndSiteId,
  getById,
  create,
  update,
  remove,
};
