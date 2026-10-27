const UniformIssue = require(
  "../models/uniformIssueModel"
);

// ================= GET ALL =================
exports.getAllUniforms = async (
  req,
  res
) => {
  try {

    const data =
      await UniformIssue.getAll();

    res.status(200).json({
      success: true,
      data,
    });

  } catch (error) {

    console.log(
      "GET ALL ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ================= GET BY ID =================
exports.getUniformById = async (
  req,
  res
) => {
  try {

    const data =
      await UniformIssue.getById(
        req.params.id
      );

    res.status(200).json({
      success: true,
      data,
    });

  } catch (error) {

    console.log(
      "GET BY ID ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ================= CREATE =================
// ================= CREATE =================
exports.createUniform = async (req, res) => {

  try {

    const data = req.body;

    const items = JSON.parse(
      data.items || "[]"
    );

    const attachment =
      req.file?.filename || "";

    const created_by =
      req.user?.id || 0;

    const created_by_name =
      req.user?.name || "";

    if (!items.length) {

      return res.status(400).json({
        success: false,
        message:
          "Please add at least one item",
      });
    }

    // LOOP ALL ITEMS
    for (const item of items) {

      await UniformIssue.create({

        // ================= HEADER =================

        issue_date:
          data.issue_date,

        issue_type:
          data.issue_type,

        employee_name:
          data.employee_name,

        employee_code:
          data.employee_code,

        transfer_by:
          data.transfer_by,
 warehouse_id: data.warehouse_id,
        remarks:
          data.remarks,

        attachment,

        client_id:
          data.client_id,

        client_name:
          data.client_name,

        site_id:
          data.site_id,

        site_name:
          data.site_name,

        // ================= AMOUNT =================

        total_amount:
          Number(data.total_amount || 0),

        advance_amount:
          Number(data.advance_amount || 0),

        emi_no:
          Number(data.emi_no || 0),

        // ================= CREATED =================

        created_by,
        created_by_name,

        // ================= ITEM DATA =================

        item_name:
          item.itemName,

        sku_code:
          item.sku_code,

        color:
          item.color,

        hsn_code:
          item.hsn_code,

        qty:
          Number(item.qty),

        mrp:
          Number(item.mrp),

        sale_price:
          Number(item.rate),

      });
    }

    res.status(201).json({
      success: true,
      message:
        "Uniform saved successfully",
    });

  } catch (error) {

    console.log(
      "CREATE ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// ================= DELETE =================
exports.deleteUniform = async (
  req,
  res
) => {
  try {

    await UniformIssue.delete(
      req.params.id
    );

    res.status(200).json({
      success: true,
      message:
        "Uniform Deleted Successfully",
    });

  } catch (error) {

    console.log(
      "DELETE ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};