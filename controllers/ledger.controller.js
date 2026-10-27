const ledgerModel = require("../models/ledger.model");

// ================== GET LEDGER DATA ==================
const getLedger = async (req, res) => {
  try {
    const { client_id, site_id, from_date, to_date } = req.query;

    // get clients
    const client_list = await ledgerModel.getAllClients();

    // get bill details
    const bill_details = await ledgerModel.getBillByClientAndSite2(
      client_id,
      site_id,
      from_date,
      to_date
    );

    return res.json({
      success: true,
      client_list,
      bill_details,
      filters: {
        client_id,
        site_id,
        from_date,
        to_date,
      },
    });
  } catch (error) {
    console.error("Ledger Controller Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

module.exports = {
  getLedger,
};