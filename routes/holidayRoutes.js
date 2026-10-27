const express = require('express')
const router = express.Router()

const holidayController = require('../controllers/holidayController');
const upload = require('../middleware/upload');
const authMiddleware = require('../middleware/authMiddleware');

// CRUD
router.post(
  "/",authMiddleware,
  upload.any(), // 👈 IMPORTANT for multiple files
  holidayController.createHoliday
);
router.get('/export', authMiddleware, holidayController.exportHolidays);
router.get('/', authMiddleware,  holidayController.getHolidays)
router.put('/:id',authMiddleware,upload.any(), holidayController.updateHoliday)
router.delete('/:id',authMiddleware, holidayController.deleteHoliday)

module.exports = router