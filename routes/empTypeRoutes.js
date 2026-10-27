const express = require('express')

const router = express.Router()

const authMiddleware = require('../middleware/authMiddleware')

const empTypeController = require('../controllers/empTypeController')

//
// GET ALL
//
router.get(
  '/',
  authMiddleware,
  empTypeController.getAllEmpTypes
)

//
// CREATE
//
router.post(
  '/',
  authMiddleware,
  empTypeController.createEmpType
)

//
// EXPORT
//
router.get(
  '/export',
  authMiddleware,
  empTypeController.exportEmpTypes
)

//
// UPDATE
//
router.put(
  '/:id',
  authMiddleware,
  empTypeController.updateEmpType
)

//
// DELETE
//
router.delete(
  '/:id',
  authMiddleware,
  empTypeController.deleteEmpType
)

module.exports = router