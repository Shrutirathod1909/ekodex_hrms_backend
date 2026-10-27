const express = require('express')
const router = express.Router()

const controller = require('../controllers/clientOtherInfoController')
const authMiddleware = require('../middleware/authMiddleware')

// GET ALL
router.get('/', authMiddleware, controller.getAll)

// GET BY ID
router.get('/:id', authMiddleware, controller.getById)

// CREATE
router.post('/', authMiddleware, controller.create)

router.get(
  '/:client_id/:site_id',
  authMiddleware,
  controller.getByClientAndSiteId
)
router.post(
  "/update",
  authMiddleware,
  controller.updateClientOtherInfo
);

// DELETE
router.delete('/:id', authMiddleware, controller.delete)

module.exports = router