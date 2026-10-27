const express = require("express");
const router = express.Router();

const controller = require("../controllers/clientServiceChargesController");

// GET
router.get("/", controller.get);

// CREATE
router.post("/", controller.create);

// UPDATE
router.put("/:id", controller.update);

// DELETE
router.delete("/:id", controller.remove);

module.exports = router;