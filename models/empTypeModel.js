const { poolPromise, sql } = require('../config/db')

//
// GET ALL
//
exports.getAllEmpTypes = async (
  searchFields,
  fromDate,
  toDate
) => {
  const pool = await poolPromise

  let query = `
    SELECT *
    FROM emp_type
    WHERE active = '0'
  `

  const request = pool.request()

  if (searchFields) {
    const fields = JSON.parse(searchFields)

    fields.forEach((field, index) => {
      if (field.field && field.keyword) {
        query += ` AND ${field.field} LIKE @keyword${index}`

        request.input(
          `keyword${index}`,
          sql.VarChar,
          `%${field.keyword}%`
        )
      }
    })
  }

  if (fromDate && toDate) {
    query += `
      AND CAST(created_on AS DATE)
      BETWEEN @fromDate AND @toDate
    `

    request.input('fromDate', sql.Date, fromDate)
    request.input('toDate', sql.Date, toDate)
  }

  query += ` ORDER BY id DESC`

  const result = await request.query(query)

  return result.recordset
}

//
// CHECK EXIST
//
exports.checkExistEmpType = async (
  emp_type,
  id = null
) => {
  const pool = await poolPromise

  let query = `
    SELECT id
    FROM emp_type
    WHERE emp_type = @emp_type
    AND active = '0'
  `

  const request = pool
    .request()
    .input('emp_type', sql.VarChar, emp_type)

  if (id) {
    query += ` AND id != @id`
    request.input('id', sql.Int, id)
  }

  const result = await request.query(query)

  return result.recordset
}

//
// CREATE
//
exports.createEmpType = async (
  emp_type,
  branch_id,
  company_id,
  userId
) => {
  const pool = await poolPromise

  return await pool
    .request()
    .input('emp_type', sql.VarChar, emp_type)
    .input('active', sql.VarChar, '0')
    .input('created_by', sql.VarChar, String(userId))
    .input('created_on', sql.VarChar, new Date(Date.now() + 330 * 60000).toISOString().slice(0, 19).replace('T', ' '))
    .input('branch_id', sql.VarChar, branch_id || '')
    .input('company_id', sql.VarChar, company_id || '')
    .query(`
      INSERT INTO emp_type (
        emp_type,
        active,
        created_by,
        created_on,
        branch_id,
        company_id,
        source
      )
      VALUES (
        @emp_type,
        @active,
        @created_by,
        FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss'),
        @branch_id,
        @company_id,
        'WEB'
      )
    `)
}

//
// UPDATE
//
exports.updateEmpType = async (
  id,
  emp_type,
  userId
) => {
  const pool = await poolPromise

  return await pool
    .request()
    .input('id', sql.Int, id)
    .input('emp_type', sql.VarChar, emp_type)
    .input('modified_by', sql.VarChar, String(userId))
    .input('modified_on', sql.VarChar, new Date(Date.now() + 330 * 60000).toISOString().slice(0, 19).replace('T', ' '))
    .query(`
      UPDATE emp_type
      SET
        emp_type = @emp_type,
        modified_by = @modified_by,
        modified_on = FORMAT(DATEADD(MINUTE, 330, GETUTCDATE()), 'yyyy-MM-dd HH:mm:ss')
      WHERE id = @id
    `)
}

//
// DELETE
//
exports.deleteEmpType = async (
  id,
  userId
) => {
  const pool = await poolPromise

  return await pool
    .request()
    .input('id', sql.Int, id)
    .input('disabled_by', sql.VarChar, String(userId))
    .input('disabled_on', sql.VarChar, new Date(Date.now() + 330 * 60000).toISOString().slice(0, 19).replace('T', ' '))
    .query(`
      UPDATE emp_type
      SET
        active = '1',
        disabled_by = @disabled_by,
        disabled_on = @disabled_on
      WHERE id = @id
    `)
}
