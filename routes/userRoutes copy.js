const sql = require('mssql')
const { poolPromise } = require('../config/db')
const express = require('express')
const router = express.Router()
const userController = require('../controllers/userController')
const multer = require('multer')
const authMiddleware = require('../middleware/authMiddleware')

// Multer setup for profile image uploads
const storage = multer.diskStorage({
  // The destination function now checks if the directory exists
  destination: (req, file, cb) => {
    const uploadPath = 'uploads/profiles/'
    // This is a good practice, though manual creation is the main fix
    require('fs').mkdirSync(uploadPath, { recursive: true })
    cb(null, uploadPath)
  },
  filename: (req, file, cb) => {
    cb(null, `user-${Date.now()}-${file.originalname}`)
  },
})
const upload = multer({ storage: storage })

// Define User routes
router.get('/', userController.getUsers)
router.post(
  '/',
  authMiddleware,
  upload.single('profileImage'),
  userController.createUser,
)
router.delete('/:id', authMiddleware, userController.deleteUser)
router.put(
  '/:id',
  authMiddleware,
  upload.single('profileImage'),
  userController.updateUser,
)

// Helper routes
router.get('/roles', userController.getRoles)
//clients
router.get('/clients', async (req, res) => {
  try {
    const pool = await poolPromise

    const query = `
      SELECT DISTINCT
          nc.id,
          nc.company_name,
          nc.contact_person,
          nc.client_email,
          nc.contact_no
      FROM new_client nc
      INNER JOIN users u
          ON LTRIM(RTRIM(u.client_id)) = CAST(nc.id AS VARCHAR(50))
      WHERE nc.active = '0'
      ORDER BY nc.company_name ASC
    `

    const result = await pool.request().query(query)

    return res.status(200).json({
      success: true,
      data: result.recordset,
    })
  } catch (error) {
    console.error('CLIENT API ERROR =>', error)

    return res.status(500).json({
      success: false,
      message: error.message,
    })
  }
})

router.get('/export', authMiddleware, userController.exportUsersToExcel)

module.exports = router
