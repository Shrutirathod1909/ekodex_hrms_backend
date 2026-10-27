const CsvPfModel = require("../models/csvPf.model");

const CsvPfController = {

  async getPfCsvData(req, res) {
    try {

      const { client_id, site_id, month, year } = req.query;

      const data = await CsvPfModel.getPfData({
        client_id,
        site_id,
        month,
        year
      });

      return res.status(200).json({
        success: true,
        count: data.length,
        data
      });

    } catch (error) {
      console.error("FULL ERROR:", error?.message || error);

      return res.status(500).json({
        success: false,
        message: error?.message || "Internal Server Error"
      });
    }
  }

};

module.exports = CsvPfController;