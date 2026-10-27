const bankTrfSheetModel = require("../models/bank_trf_sheet_model");

// ================= BANK TRF SHEET =================
const getBankTrfSheet = async (req, res) => {
  try {
    const { client_id, site_id, month, year } = req.body;

    // ================= VALIDATION =================
    if (!client_id || !site_id || !month || !year) {
      return res.status(400).json({
        success: false,
        message: "client_id, site_id, month, year required",
      });
    }

    // ================= GET DATA =================
    const billInfo = await bankTrfSheetModel.getBillInfo(
      client_id,
      site_id,
      month,
      year,
    );

    const empWages = await bankTrfSheetModel.getSalaryBySite(
      site_id,
      month,
      year,
    );

    const clientDetail = await bankTrfSheetModel.getClientDetail(client_id);

    const siteDetail = await bankTrfSheetModel.getSiteDetail(site_id);

    // ================= RESPONSE =================
    return res.status(200).json({
      success: true,
      message: "Bank Transfer Sheet Data Fetched Successfully",

      data: {
        billInfo,
        empWages,
        clientDetail,
        siteDetail,
        site_id,
        month,
        year,
      },
    });
  } catch (error) {
    console.log("BANK TRF SHEET ERROR :", error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  getBankTrfSheet,
};
