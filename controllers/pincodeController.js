const pincodeModel = require("../models/pincodeModel");

const getAllPincodes = async (req, res) => {
  try {
    const pincodes = await pincodeModel.getAllPincodes();

    return res.status(200).json(pincodes);
  } catch (error) {
    console.error("GET PINCODES ERROR:", error);

    return res.status(500).json({
      message: "Server Error",
    });
  }
};

const searchPincodeController = async (req, res) => {
  try {
    const search = req.query.q || "";

    if (search.length < 2) {
      return res.json([]);
    }

    const data = await pincodeModel.searchPincodes(search);

    res.json(data);
  } catch (error) {
    console.error("Pincode Search Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch pincodes",
    });
  }
};

module.exports = {
  getAllPincodes,
  searchPincodeController,
};
