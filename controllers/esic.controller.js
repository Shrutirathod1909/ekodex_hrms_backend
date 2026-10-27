const esicModel = require("../models/esic.model");

// ================= GET ESIC DATA =================
exports.get_esic_data = async (req, res) => {
  try {

    const { month, year } = req.query;

    const data = await esicModel.getEsicData(month, year);

    const formatted = data.map(row => ({

      IP: row.ESIC_NO,

      "INSURED NAME": row["INSURED NAME"],

      "PRESENT DAYS": row["PRESENT DAYS"],

      GROSS: row.GROSS,

      "EE CONTRIBUTION": Number(
        row["EE CONTRIBUTION"] || 0
      ).toFixed(2)

    }));

    return res.json({
      success: true,
      data: formatted
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false
    });

  }
};