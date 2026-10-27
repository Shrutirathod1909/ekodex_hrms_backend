const invoiceCompanyModel = require(
  "../models/invoiceCompanyModel"
);

// COMPANY DETAILS
const getCompanyByName = async (req, res) => {
  try {

    const data =
      await invoiceCompanyModel.getCompanyByName();

    res.status(200).json({
      success: true,
      data,
    });

  } catch (error) {

    console.error(
      "GET COMPANY ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch company data",
      error: error.message,
    });
  }
};

// SUPPLIER DETAILS
const getSupplierByName = async (req, res) => {
  try {

    const { supplier_name } = req.params;

    const data =
      await invoiceCompanyModel.getSupplierByName(
        supplier_name
      );

    res.status(200).json({
      success: true,
      data,
    });

  } catch (error) {

    console.error(
      "GET SUPPLIER ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch supplier data",
      error: error.message,
    });
  }
};

module.exports = {
  getCompanyByName,
  getSupplierByName,
};