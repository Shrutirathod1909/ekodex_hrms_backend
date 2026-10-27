const { sql, poolPromise } = require("../config/db");

// ================= ADD IMAGE =================
exports.addImage = async (productId, filename) => {
  const pool = await poolPromise;

  const imagePath = `uploads/${filename}`;

  const result = await pool
    .request()
    .input("product_id", sql.Int, productId)
    .input("image_path", sql.VarChar, imagePath).query(`
      INSERT INTO product_images
      (
        product_id,
        image_path,
        created_on
      )
      VALUES
      (
        @product_id,
        @image_path,
        DATEADD(MINUTE, 330, GETUTCDATE())
      )
    `);

  return result;
};

// ================= GET PRODUCT IMAGES =================
exports.getByProduct = async (productId) => {
  const pool = await poolPromise;

  const result = await pool.request().input("product_id", sql.Int, productId)
    .query(`
      SELECT *
      FROM product_images
      WHERE product_id = @product_id
      ORDER BY image_id DESC
    `);

  return result.recordset;
};

// ================= DELETE IMAGE =================
exports.deleteImage = async (imageId) => {
  const pool = await poolPromise;

  const result = await pool.request().input("image_id", sql.Int, imageId)
    .query(`
      DELETE FROM product_images
      WHERE image_id = @image_id
    `);

  return result;
};
