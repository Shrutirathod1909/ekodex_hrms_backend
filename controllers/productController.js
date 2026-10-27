const Product = require("../models/productModel");
const ProductImage = require("../models/productImageModel");
const logger = require("../utils/logger");
const { getRelativePathFromApi } = require("../utils/img_path");
const clientModel = require("../models/clientModel");
// ================= CREATE PRODUCT =================
exports.createProduct = async (req, res) => {
  try {
    const userDetail = await clientModel.getUserById(req.user.id);
    const data = req.body;

    // Assign the logged-in user id to created_by
    data.created_by = userDetail.id ? req.user.id : "";
    data.created_by_name = userDetail.first_name ?? "";

    // Clean up empty strings from the frontend form to prevent MSSQL conversion crashes
    data.height = data.height && data.height.trim() !== "" ? data.height : null;
    data.width = data.width && data.width.trim() !== "" ? data.width : null;
    data.length = data.length && data.length.trim() !== "" ? data.length : null;
    data.gender = data.gender && data.gender.trim() !== "" ? data.gender : null;
    data.hsn_code =
      data.hsn_code && data.hsn_code.trim() !== "" ? data.hsn_code : null;

    // Numeric conversions (fallback to null if blank)
    data.purchase_price =
      data.purchase_price !== "" && data.purchase_price !== undefined
        ? Number(data.purchase_price)
        : 0;
    data.sale_price =
      data.sale_price !== "" && data.sale_price !== undefined
        ? Number(data.sale_price)
        : 0;
    data.gst_percentage =
      data.gst_percentage !== "" && data.gst_percentage !== undefined
        ? Number(data.gst_percentage)
        : 0;

    // ADD THESE: Extract uom_id and uom from the request
    data.uom_id = data.uom_id ? Number(data.uom_id) : null;
    data.uom = data.uom && data.uom.trim() !== "" ? data.uom : null;

    // Matches your updated model definition
    const result = await Product.create(data);

    // GET PRODUCT ID securely
    if (!result.recordset || result.recordset.length === 0) {
      throw new Error(
        "Failed to retrieve the inserted product identity record.",
      );
    }
    const productId = result.recordset[0].id;

    // SAVE IMAGES
    if (req.files && req.files.length > 0) {
      for (let file of req.files) {
        await ProductImage.addImage(productId, file.filename);
      }
    }

    res.json({
      success: true,
      message: "Product Created Successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ================= GET PRODUCTS (UPDATED FOR TABS) =================
exports.getProducts = async (req, res) => {
  try {
    const statusType = req.query.status || "active";

    const page = parseInt(req.query.page) || 1;

    const limit = parseInt(req.query.limit) || 10;

    const { products, totalCount } = await Product.getAll(
      statusType,
      page,
      limit,
    );

    for (const item of products) {
      item.images = await ProductImage.getByProduct(item.id);
    }

    return res.status(200).json({
      success: true,
      data: products,
      totalCount,
      page,
      limit,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
exports.getProductsBySupplier = async (req, res) => {
  try {
    const { supplier_name } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (!supplier_name) {
      return res.status(400).json({
        success: false,
        message: "Supplier name is required",
      });
    }

    const data = await Product.getBySupplier(
      supplier_name,
      parseInt(page),
      parseInt(limit),
    );

    res.status(200).json({
      success: true,
      supplier_name,
      ...data,
    });
  } catch (error) {
    console.error("Get by supplier error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
// ================= UPDATE PRODUCT =================
exports.updateProduct = async (req, res) => {
  try {
    const userDetail = await clientModel.getUserById(req.user.id);
    const id = req.params.id;

    logger.info(`Updating Product ID: ${id}`);

    const data = req.body;

    data.modified_by = userDetail.id ? req.user.id : null;
    data.modified_by_name = userDetail.first_name ?? null;

    data.purchase_price =
      data.purchase_price !== "" ? Number(data.purchase_price) : 0;

    data.sale_price = data.sale_price !== "" ? Number(data.sale_price) : 0;

    data.gst_percentage =
      data.gst_percentage !== "" ? Number(data.gst_percentage) : 0;

    data.uom_id = data.uom_id ? Number(data.uom_id) : null;

    await Product.update(id, data);

    // SAVE NEW IMAGES
    if (req.files && req.files.length > 0) {
      for (let file of req.files) {
        await ProductImage.addImage(id, file.filename);
      }
    }

    logger.info(`Product Updated Successfully ID: ${id}`);

    res.json({
      success: true,
      message: "Product Updated Successfully",
    });
  } catch (err) {
    logger.error(`UPDATE PRODUCT ERROR: ${err.message}`);

    console.log(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ================= DELETE PRODUCT (SOFT-DELETE) =================
exports.deleteProduct = async (req, res) => {
  try {
    const id = req.params.id;
    const userDetail = await clientModel.getUserById(req.user.id);
    const disabled_by = userDetail.id ? req.user.id : null;
    const disabled_by_name = userDetail.first_name ?? null;

    logger.info(
      `Deleting Product ID: ${id} by User: ${disabled_by} : ${disabled_by_name}`,
    );

    const result = await Product.delete(id, disabled_by, disabled_by_name);

    logger.info(`Product Deleted ID: ${id}`);

    res.json({
      success: true,
      message: "Product Archived Successfully",
    });
  } catch (err) {
    logger.error(`DELETE PRODUCT ERROR: ${err.message}`);

    console.log(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ================= RESTORE PRODUCT (RE-ACTIVE) =================
exports.restoreProduct = async (req, res) => {
  try {
    const userDetail = await clientModel.getUserById(req.user.id);
    const id = req.params.id;

    console.log("Restoring product ID back to active list workspace view:", id);

    // Updates active column back to 0 inside your product Master database table
    await Product.restore(id, userDetail);

    res.json({
      success: true,
      message: "Product Restored Successfully",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ================= DELETE IMAGE =================
exports.deleteImage = async (req, res) => {
  try {
    const imageId = req.params.image_id;
    await ProductImage.deleteImage(imageId);
    res.json({
      success: true,
      message: "Image Deleted Successfully",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ================= BULK UPLOAD PRODUCTS =================
exports.bulkUploadProducts = async (req, res) => {
  try {
    const userDetail = await clientModel.getUserById(req.user.id);
    const { products } = req.body; // Expecting an array of product objects

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid or empty product listing array.",
      });
    }

    const created_by = userDetail.id ? req.user.id : null;
    const created_by_name = userDetail.first_name ?? null;

    // Call the bulk validation and model writer engine
    const insertedIds = await Product.bulkCreate(
      products,
      created_by,
      created_by_name,
    );

    res.json({
      success: true,
      message: `Successfully processed and imported ${insertedIds.length} products dynamically.`,
      count: insertedIds.length,
    });
  } catch (err) {
    console.error("Bulk Upload Error: ", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
