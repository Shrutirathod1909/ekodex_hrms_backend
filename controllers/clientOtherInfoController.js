const model = require('../models/clientOtherInfoModel')
const logger = require("../utils/logger");
// GET ALL
exports.getAll = async (req, res) => {
  try {
    const result = await model.getAll()
    res.json(result.recordset)
  } catch (err) {
    logger.error(err)
    res.status(500).json({ message: 'Error fetching data' })
  }
}

exports.getByClientAndSiteId = async (req, res) => {

  try {

    const { client_id, site_id } = req.params;

    logger.log("================================");
    logger.log("CONTROLLER HIT");
    logger.log("CLIENT ID =", client_id);
    logger.log("SITE ID =", site_id);
    logger.log("================================");

    const result =
      await model.getByClientAndSiteId(
        client_id,
        site_id
      );

    logger.log("================================");
    logger.log("FINAL RESPONSE DATA");
    logger.log(result.recordset);
    logger.log("================================");

    return res.status(200).json({
      success: true,
      count: result.recordset.length,
      data: result.recordset,
    });

  } catch (err) {

    logger.log("================================");
    logger.log("CONTROLLER ERROR");
    logger.log(err);
    logger.log("================================");

    return res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: err.message,
    });
  }
};
// GET BY ID
exports.getById = async (req, res) => {
  try {
    const result = await model.getById(req.params.id)
    res.json(result.recordset[0])
  } catch (err) {
    res.status(500).json({ message: 'Error fetching data' })
  }
}

// CREATE
exports.create = async (req, res) => {
  try {
    await model.create(req.body)
    res.status(201).json({ message: 'Inserted successfully' })
  } catch (err) {
    logger.error(err)
    res.status(500).json({ message: 'Insert failed' })
  }
}

// UPDATE
exports.updateClientOtherInfo =
  async (req, res) => {

    try {

      const { rates } = req.body;

      logger.log(
        "REQ BODY = ",
        JSON.stringify(req.body, null, 2)
      );

      if (rates?.length > 0) {

        for (const row of rates) {

          logger.log(
            "UPDATING ROW = ",
            row
          );

          await model.update(
            row.id,
            row
          );
        }
      }

      return res.status(200).json({
        success: true,
        message: "Updated Successfully",
      });

    } catch (error) {

      logger.log(
        "UPDATE CONTROLLER ERROR = ",
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

// DELETE
exports.delete = async (req, res) => {
  try {
    await model.remove(req.params.id)
    res.json({ message: 'Deleted (inactive) successfully' })
  } catch (err) {
    res.status(500).json({ message: 'Delete failed' })
  }
}
