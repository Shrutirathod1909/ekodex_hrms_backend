const model = require("../models/clientServiceChargesModel");
const logger = require("../utils/logger");
// =========================
// GET
// =========================
exports.get = async (req, res) => {

  logger.log("API HIT");

  try {

    const { client_id, rate_id } =
      req.query;

    logger.log(
      "REQ QUERY =",
      req.query
    );

    const data =
      await model.getAll(
        client_id,
        rate_id
      );

    logger.log(
      "DATA =",
      data
    );

    return res.status(200).json({
      success: true,
      data
    });

  } catch (err) {

    logger.log(
      "BACKEND ERROR START"
    );

    logger.log(err);

    logger.log(
      "ERROR MESSAGE =",
      err.message
    );

    logger.log(
      "BACKEND ERROR END"
    );

    return res.status(500).json({
      success: false,
      message: err.message || "Server Error"
    });
  }
};

// =========================
// CREATE
// =========================
exports.create = async (req, res) => {
  try {
    const { client_id, otherDetails } = req.body;

    if (!Array.isArray(otherDetails)) {
      return res.status(400).json({
        success: false,
        message: "otherDetails must be an array"
      });
    }

    const results = [];

    for (const row of otherDetails) {
          logger.log("row.site_id =", row.site_id);
      const result = await model.create({
        client_id,
        rate_id: row.site_id,

        type_of_services: row.type_of_services,
        count_services: row.count_services,
        charges_services: row.charges_services,
        totalcharges_services: row.totalcharges_services,

        active: row.active ?? 0,
        newemp_type: row.newemp_type,
        ea_calculateon: row.ea_calculateon,
        ea_operator: row.ea_operator,
        ea_comp_operator: row.ea_comp_operator,
        source: row.source
      });

      results.push(result);
    }

    return res.status(201).json({
      success: true,
      data: results
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};


// =========================
// UPDATE
// =========================
exports.update = async (req, res) => {
  try {
    await model.update(req.params.id, req.body);

    return res.status(200).json({
      success: true,
      message: "Updated successfully"
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

// =========================
// DELETE
// =========================
exports.remove = async (req, res) => {
  try {
    await model.remove(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Deleted successfully"
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};
