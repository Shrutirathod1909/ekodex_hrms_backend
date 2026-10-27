const { poolPromise, sql } = require("../config/db");
const logger = require("../utils/logger");
// =========================
// GET
// =========================
exports.getAll = async (client_id, site_id) => {

  const pool = await poolPromise;
  const request = pool.request();

  let query = `
    SELECT *
    FROM client_service_charges
    WHERE 1=1
  `;

  logger.log("client_id =", client_id);
  logger.log("site_id =", site_id);

  if (client_id) {
    query += ` AND client_id = @client_id`;

    request.input(
      "client_id",
      sql.Int,
      parseInt(client_id)
    );
  }

  if (site_id) {

    query += ` AND rate_id = @site_id`;

    request.input(
      "site_id",
      sql.Int,
      parseInt(site_id)
    );
  }

  logger.log("FINAL QUERY =", query);

  const result =
    await request.query(query);

  return result.recordset;
};
// =========================
// CREATE
// =========================
exports.create = async (data) => {
  const pool = await poolPromise;

  const result = await pool.request()
    .input("client_id", sql.Int, data.client_id || 0)

.input(
  "rate_id",
  sql.Int,
  data.rate_id ? Number(data.rate_id) : null
)

    .input("type_of_services", sql.VarChar, data.type_of_services || "")
    .input("count_services", sql.Int, data.count_services || 0)
    .input("charges_services", sql.Decimal(18,2), data.charges_services || 0)
    .input("totalcharges_services", sql.Decimal(18,2), data.totalcharges_services || 0)
    .input("active", sql.Bit, data.active ?? 0)
    .input("newemp_type", sql.VarChar, data.newemp_type || "")
    .input("ea_calculateon", sql.VarChar, data.ea_calculateon || "")
    .input("ea_operator", sql.VarChar, data.ea_operator || "")
    .input("ea_comp_operator", sql.VarChar, data.ea_comp_operator || "")
    .input("source", sql.VarChar, data.source || "")

    .query(`
      INSERT INTO client_service_charges (
        client_id, rate_id, type_of_services,
        count_services, charges_services, totalcharges_services,
        active, newemp_type, ea_calculateon,
        ea_operator, ea_comp_operator, source
      )
      VALUES (
        @client_id, @rate_id, @type_of_services,
        @count_services, @charges_services, @totalcharges_services,
        @active, @newemp_type, @ea_calculateon,
        @ea_operator, @ea_comp_operator, @source
      );

      SELECT SCOPE_IDENTITY() AS id;
    `);

  return result.recordset[0];
};
// =========================
// UPDATE (FIXED)
// =========================
exports.update = async (id, data) => {
  const pool = await poolPromise;

  await pool.request()
    .input("id", sql.Int, id)
    .input("client_id", sql.Int, data.client_id || 0)
.input("rate_id", sql.Int, data.site_id ? Number(data.site_id) : null)
    .input("type_of_services", sql.VarChar, data.type_of_services || "")
    .input("count_services", sql.Int, data.count_services || 0)
    .input("charges_services", sql.Decimal(18,2), data.charges_services || 0)
    .input("totalcharges_services", sql.Decimal(18,2), data.totalcharges_services || 0)
    .input("active", sql.Bit, data.active ?? 0)
    .input("newemp_type", sql.VarChar, data.newemp_type || "")
    .input("ea_calculateon", sql.VarChar, data.ea_calculateon || "")
    .input("ea_operator", sql.VarChar, data.ea_operator || "")
    .input("ea_comp_operator", sql.VarChar, data.ea_comp_operator || "")
    .input("source", sql.VarChar, data.source || "")

    .query(`
      UPDATE client_service_charges
      SET
        client_id = @client_id,
        rate_id = @rate_id,
        type_of_services = @type_of_services,
        count_services = @count_services,
        charges_services = @charges_services,
        totalcharges_services = @totalcharges_services,
        active = @active,
        newemp_type = @newemp_type,
        ea_calculateon = @ea_calculateon,
        ea_operator = @ea_operator,
        ea_comp_operator = @ea_comp_operator,
        source = @source
      WHERE id = @id
    `);

  return true;
};

// =========================
// DELETE (soft)
// =========================
exports.remove = async (id) => {
  const pool = await poolPromise;

  await pool.request()
    .input("id", sql.Int, id)
    .query(`
      UPDATE client_service_charges
      SET active = 1
      WHERE id = @id
    `);

  return true;
};
