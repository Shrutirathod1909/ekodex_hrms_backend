
const { poolPromise, sql } = require("../config/db");

const ALLOWED_COLUMNS = [
  "company_id",
  "branch_id",
  "client_id",
  "site_id",
];

async function addSuperadminId(column, newId) {
  if (!ALLOWED_COLUMNS.includes(column)) {
    throw new Error("Invalid column name");
  }

  if (newId === null || newId === undefined || newId === "") {
    throw new Error("Valid ID is required");
  }

  const pool = await poolPromise;

  const request = pool.request();

  request.input("newId", sql.VarChar(50), String(newId));

  const query = `
    UPDATE users
    SET ${column} =
      CASE
        WHEN ${column} IS NULL OR LTRIM(RTRIM(${column})) = ''
          THEN @newId

        WHEN ',' + REPLACE(${column}, ' ', '') + ','
             LIKE '%,' + @newId + ',%'
          THEN ${column}

        ELSE ${column} + ',' + @newId
      END
    WHERE id = 1
      AND role = 'SUPER ADMIN';
  `;

  const result = await request.query(query);

  if (result.rowsAffected[0] === 0) {
    throw new Error("Superadmin user with id = 1 was not found");
  }

  return {
    success: true,
    column,
    addedId: String(newId),
  };
}

async function addCompanyId(companyId) {
  return addSuperadminId("company_id", companyId);
}

async function addBranchId(branchId) {
  return addSuperadminId("branch_id", branchId);
}

async function addClientId(clientId) {
  return addSuperadminId("client_id", clientId);
}

async function addSiteId(siteId) {
  return addSuperadminId("site_id", siteId);
}

module.exports = {
  addSuperadminId,
  addCompanyId,
  addBranchId,
  addClientId,
  addSiteId,
};
