const ChargesModel = require("../models/chargesModel");
const clientModel = require("../models/clientModel");
const { getChargesMaster } = require("../models/payrollModel");
exports.getCharges = async (req, res) => {
  try {
    const { searchFields, dateField, fromDate, toDate } = req.query;

    let whereClause = "WHERE active = '0'";

    // ==========================================
    // SEARCH FILTERS
    // ==========================================

    if (searchFields) {
      const fields = JSON.parse(searchFields);

      fields.forEach((item) => {
        if (!item.field || !item.keyword) return;

        const keyword = item.keyword.trim();

        switch (item.field) {
          case "charges_master":
            whereClause += ` AND charges_master LIKE '%${keyword}%'`;
            break;

          case "label_display":
            whereClause += ` AND label_display LIKE '%${keyword}%'`;
            break;

          default:
            break;
        }
      });
    }

    // ==========================================
    // DATE FILTER
    // ==========================================

    const allowedDateFields = {
      created_on: "created_on",
      modified_on: "modified_on",
    };

    const selectedDateField = allowedDateFields[dateField] || null;

    console.log("DATE FILTER =>", {
      dateField,
      selectedDateField,
      fromDate,
      toDate,
    });

    if (selectedDateField) {
      // From Date
      if (fromDate) {
        whereClause += `
          AND ${selectedDateField} >= '${fromDate} 00:00:00'
        `;
      }

      // To Date
      if (toDate) {
        whereClause += `
          AND ${selectedDateField} <= '${toDate} 23:59:59'
        `;
      }
    }

    console.log("FINAL WHERE CLAUSE =>", whereClause);

    // ==========================================
    // GET DATA
    // ==========================================

    const data = await ChargesModel.getAll(whereClause);

    // ==========================================
    // SIMPLE RESPONSE
    // ==========================================

    if (req.query.simple === "true") {
      return res.json(
        data.map((item) => ({
          id: item.id,
          name: item.charges_master,
        })),
      );
    }

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    logger.error(err);

    console.error("GET CHARGES ERROR =>", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// CREATE
exports.createCharge = async (req, res) => {
  try {
    const userDetail = await clientModel.getUserById(req.user.id);
    // console.log(userDetail); // branch_id,  branch_id
    await ChargesModel.create(req.body, userDetail);

    res.status(201).json({
      success: true,
      message: "Charge created successfully",
    });
  } catch (err) {
    logger.error(err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// UPDATE
exports.updateCharge = async (req, res) => {
  try {
    console.log("updateCharge");
    const userDetail = await clientModel.getUserById(req.user.id);
    await ChargesModel.update(req.params.id, req.body, userDetail);

    res.json({
      success: true,
      message: "Charge updated successfully",
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// DELETE (soft delete)
exports.deleteCharge = async (req, res) => {
  try {
    console.log("deleteCharge", req.params.id);
    const userDetail = await clientModel.getUserById(req.user.id);
    await ChargesModel.remove(req.params.id, userDetail);

    res.json({
      success: true,
      message: "Charge deleted successfully",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getChargesMasterList = async (req, res) => {
  try {
    const data = await getChargesMaster();

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("GET CHARGES MASTER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
