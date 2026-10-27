const xlsx = require('xlsx')

const empTypeModel = require('../models/empTypeModel')
const logger = require("../utils/logger");
function formatDateForExcel(val) {
  if (!val) return ''

  const d = new Date(val)

  if (isNaN(d.getTime())) return ''

  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()

  return `${dd}-${mm}-${yyyy}`
}

//
// GET ALL
//
exports.getAllEmpTypes = async (req, res) => {
  try {
    const { searchFields, fromDate, toDate } =
      req.query

    const data =
      await empTypeModel.getAllEmpTypes(
        searchFields,
        fromDate,
        toDate
      )

    res.json(data)
  } catch (error) {
    logger.error(error)

    res.status(500).json({
      message: 'Failed to get employee types',
    })
  }
}

//
// CREATE
//
exports.createEmpType = async (req, res) => {
  try {
    const { emp_type, branch_id, company_id } =
      req.body

    const exist =
      await empTypeModel.checkExistEmpType(
        emp_type
      )

    if (exist.length > 0) {
      return res.status(400).json({
        message: 'Employee type already exists',
      })
    }

    await empTypeModel.createEmpType(
      emp_type,
      branch_id,
      company_id,
      req.user.id
    )

    res.status(201).json({
      message: 'Employee type created successfully',
    })
  } catch (error) {
    logger.error(error)

    res.status(500).json({
      message: 'Server error creating employee type',
    })
  }
}

//
// EXPORT
//
exports.exportEmpTypes = async (req, res) => {
  try {
    const { searchFields, fromDate, toDate } =
      req.query

    const rows =
      await empTypeModel.getAllEmpTypes(
        searchFields,
        fromDate,
        toDate
      )

    const headers = ['Employee Type', 'Created On']

    const excelRows = rows.map((e) => [
      e.emp_type || '',
      formatDateForExcel(e.created_on),
    ])

    const finalSheetData = [
      headers,
      ...excelRows,
    ]

    const worksheet =
      xlsx.utils.aoa_to_sheet(finalSheetData)

    const workbook = xlsx.utils.book_new()

    xlsx.utils.book_append_sheet(
      workbook,
      worksheet,
      'EmployeeTypes'
    )

    const randomNumber = Math.floor(
      1000000000 + Math.random() * 9000000000
    )

    const fileName = `EmployeeTypes_${randomNumber}.xlsx`

    const excelBuffer = xlsx.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    })

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`
    )

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

    res.send(excelBuffer)
  } catch (error) {
    logger.error(error)

    res.status(500).json({
      message: 'Failed to download Excel',
    })
  }
}

//
// UPDATE
//
exports.updateEmpType = async (req, res) => {
  try {
    const { emp_type } = req.body

    const exist =
      await empTypeModel.checkExistEmpType(
        emp_type,
        req.params.id
      )

    if (exist.length > 0) {
      return res.status(400).json({
        message: 'Employee type already exists',
      })
    }

    await empTypeModel.updateEmpType(
      req.params.id,
      emp_type,
      req.user.id
    )

    res.json({
      message: 'Employee type updated successfully',
    })
  } catch (error) {
    logger.error(error)

    res.status(500).json({
      message: 'Failed to update employee type',
    })
  }
}

//
// DELETE
//
exports.deleteEmpType = async (req, res) => {
  try {
    await empTypeModel.deleteEmpType(
      req.params.id,
      req.user.id
    )

    res.json({
      message: 'Employee Type deleted successfully',
    })
  } catch (error) {
    logger.error(error)

    res.status(500).json({
      message: 'Failed to delete employee type',
    })
  }
}
