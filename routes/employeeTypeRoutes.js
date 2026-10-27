const express = require('express')

const router = express.Router()

const authMiddleware =
  require('../middleware/authMiddleware')

const employeeTypeController =
  require('../controllers/employeeTypeController')


// ==========================================
// GET ALL
// ==========================================

router.get(
  '/',
  authMiddleware,
  employeeTypeController.getAllEmployeeTypes,
)


// ==========================================
// EXPORT EXCEL
// IMPORTANT: /export should be before /:id
// ==========================================

router.get(
  '/export',
  authMiddleware,
  employeeTypeController.exportEmployeeTypes,
)


// ==========================================
// CREATE
// ==========================================

router.post(
  '/',
  authMiddleware,
  employeeTypeController.createEmployeeType,
)


// ==========================================
// UPDATE
// ==========================================

router.put(
  '/:id',
  authMiddleware,
  employeeTypeController.updateEmployeeType,
)


// ==========================================
// DELETE
// ==========================================

router.delete(
  '/:id',
  authMiddleware,
  employeeTypeController.deleteEmployeeType,
)


module.exports = router