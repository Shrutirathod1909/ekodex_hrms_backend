// hrms-backend/routes/authRoutes.js (This code is correct)
// const express = require("express");
// const { login } = require("../controllers/authController");
// const router = express.Router();

// router.post("/login", login);

// module.exports = router;

const express = require('express')
const router = express.Router()
const { login,getCompaniesByEmail, } = require('../controllers/authController')

router.post('/login', login)
router.get("/companies-by-email", getCompaniesByEmail);

module.exports = router
