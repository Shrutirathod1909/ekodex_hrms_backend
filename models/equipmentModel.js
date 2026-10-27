const { poolPromise } = require("../config/db");

// ==============================
// CREATE EQUIPMENT
// ==============================
const createEquipment = async (data) => {

  const pool = await poolPromise;

  const result = await pool.request()

    .input("equipment_master", data.equipment_master)
    .input("rate", data.rate)

    .input("active", data.active || 0)

    .input("created_by", data.created_by)

    .input("branch_id", data.branch_id)

    .input("company_id", data.company_id)

    .input("source", data.source || "web")

    .query(`
      INSERT INTO equipment_master
      (
        equipment_master,
        rate,
        active,
        created_by,
        created_on,
        branch_id,
        company_id,
        source
      )
      VALUES
      (
        @equipment_master,
        @rate,
        @active,
        @created_by,
        CAST(GETDATE() AS DATE),
        @branch_id,
        @company_id,
        @source
      );

      SELECT SCOPE_IDENTITY() AS id;
    `);

  return result.recordset[0];
};

// ==============================
// GET ALL + SEARCH
// ==============================
const getAllEquipment = async (queryParams) => {

  const pool = await poolPromise;

let query = `
  SELECT
    id,
    equipment_master,
    rate,
    active,
    created_by,
    CONVERT(VARCHAR(10), created_on, 105) AS created_on,
    modified_by,
   CONVERT(VARCHAR(10), modified_on, 105) AS modified_on,
    branch_id,
    company_id,
    source
  FROM equipment_master
  WHERE active = 0
`;

  const request = pool.request();

  // ==============================
  // COMPANY FILTER
  // ==============================
  if (queryParams.company_id) {

    query += ` AND company_id = @company_id`;

    request.input(
      "company_id",
      queryParams.company_id
    );
  }

  // ==============================
  // BRANCH FILTER
  // ==============================
  if (queryParams.branch_id) {

    query += ` AND branch_id = @branch_id`;

    request.input(
      "branch_id",
      queryParams.branch_id
    );
  }

  // ==============================
  // SEARCH FILTER
  // ==============================
  const allowedFields = [
    "equipment_master",
    "rate",
  ];

  if (queryParams.searchFields) {

    const searchFields =
      JSON.parse(queryParams.searchFields);

    searchFields.forEach((item, index) => {

      if (
        item.field &&
        item.keyword &&
        allowedFields.includes(item.field)
      ) {

        query += `
          AND ${item.field}
          LIKE @keyword${index}
        `;

        request.input(
          `keyword${index}`,
          `%${item.keyword}%`
        );
      }
    });
  }

  // ==============================
  // DATE FILTER
  // ==============================
  if (
    queryParams.fromDate &&
    queryParams.toDate
  ) {

    query += `
      AND CAST(created_on AS DATE)
      BETWEEN @fromDate AND @toDate
    `;

    request.input(
      "fromDate",
      queryParams.fromDate
    );

    request.input(
      "toDate",
      queryParams.toDate
    );
  }

  query += ` ORDER BY id DESC`;

  const result = await request.query(query);

  return result.recordset;
};

// ==============================
// GET BY ID
// ==============================
const getEquipmentById = async (id) => {

  const pool = await poolPromise;

  const result = await pool.request()

    .input("id", id)

    .query(`
      SELECT *
      FROM equipment_master
      WHERE id = @id
    `);

  return result.recordset[0];
};

// ==============================
// UPDATE
// ==============================
const updateEquipment = async (id, data) => {

  const pool = await poolPromise;

  await pool.request()

    .input("id", id)

    .input(
      "equipment_master",
      data.equipment_master
    )

    .input("rate", data.rate)

    .input("active", data.active || 0)

    .input(
      "modified_by",
      data.modified_by
    )

    .query(`
      UPDATE equipment_master
      SET
        equipment_master = @equipment_master,
        rate = @rate,
        active = @active,
        modified_by = @modified_by,
        modified_on = CAST(GETDATE() AS DATE)
      WHERE id = @id
    `);

  return true;
};

// ==============================
// DELETE (SOFT DELETE)
// ==============================
const deleteEquipment = async (
  id,
  userId
) => {

  const pool = await poolPromise;

  await pool.request()

    .input("id", id)

    .input(
      "disabled_by",
      userId
    )

    .query(`
      UPDATE equipment_master
      SET
        disabled_by = @disabled_by,
        disabled_on = CAST(GETDATE() AS DATE),
        active = 1
      WHERE id = @id
    `);

  return true;
};

module.exports = {
  createEquipment,
  getAllEquipment,
  getEquipmentById,
  updateEquipment,
  deleteEquipment,
};