const { sql } = require('../config/db')

// GET USER BY EMAIL
const getUserByEmail = async (email) => {
  const result = await sql.query`
    SELECT TOP 1 * FROM users WHERE email = ${email}
  `
  return result.recordset[0]
}

module.exports = { getUserByEmail }
