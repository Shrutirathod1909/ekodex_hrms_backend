const { poolPromise, sql } = require("../config/db");
const logger = require("../utils/logger");
const { getFormattedDateTime } = require("../utils/dateHelper");

// ================= HELPER =================
const getUserName = async (pool, userId) => {
  if (!userId) return null;
  const res = await pool.request()
    .input("id", sql.Int, userId)
    .query("SELECT TOP 1 first_name, last_name, fullname FROM users WHERE id = @id");
  if (res.recordset.length > 0) {
    const u = res.recordset[0];
    if (u.fullname && u.fullname.trim() !== "") {
      return u.fullname.trim();
    }
    if (u.first_name || u.last_name) {
      return `${u.first_name || ''} ${u.last_name || ''}`.trim();
    }
    return null;
  }
  return null;
};

// ================= GET ALL TRAINING VIDEOS =================
const getTrainingVideos = async (queryParams = {}) => {
  try {
    const pool = await poolPromise;
    const { search } = queryParams;

    const request = pool.request();

    let whereClauses = ["active = 0"];

    if (search) {
      whereClauses.push("(title LIKE @search OR rank LIKE @search)");
      request.input("search", sql.NVarChar, `%${search}%`);
    }

    const whereSQL = "WHERE " + whereClauses.join(" AND ");

    const result = await request.query(`
      SELECT
        id,
        title,
        description,
        rank,
        video_link,
        from_date,
        to_date,
        active,
        created_by,
        created_by_name,
        created_on,
        modified_by,
        modified_by_name,
        modified_on
      FROM emp_training_videos
      ${whereSQL}
      ORDER BY id DESC
    `);

    logger.log("GET TRAINING VIDEOS DB => COUNT:", result.recordset.length);
    return result.recordset;
  } catch (error) {
    logger.error("GET TRAINING VIDEOS DB ERROR:", error);
    throw error;
  }
};

// ================= GET BY ID =================
const getTrainingVideoById = async (id) => {
  try {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .query(`
        SELECT * FROM emp_training_videos
        WHERE id = @id AND active = 0
      `);

    return result.recordset[0] || null;
  } catch (error) {
    logger.error("GET TRAINING VIDEO BY ID DB ERROR:", error);
    throw error;
  }
};

// ================= CREATE TRAINING VIDEO =================
const createTrainingVideo = async (data, user) => {
  try {
    const pool = await poolPromise;

    const title       = (data.title || "").trim();
    const description = (data.description || "").trim();
    const rank        = (data.rank || "").trim();
    const video_link  = (data.video_link || "").trim();
    const from_date   = data.from_date || null;
    const to_date     = data.to_date || null;

    if (!title) throw new Error("Title is required");
    if (!video_link) throw new Error("Video link is required");

    logger.log("CREATING TRAINING VIDEO =>", title);

    const now = getFormattedDateTime();

    const result = await pool
      .request()
      .input("title",            sql.NVarChar, title)
      .input("description",      sql.NVarChar, description || null)
      .input("rank",             sql.NVarChar, rank || null)
      .input("video_link",       sql.NVarChar, video_link)
      .input("from_date",        sql.NVarChar, from_date)
      .input("to_date",          sql.NVarChar, to_date)
      .input("created_by",       sql.NVarChar, user?.id ? String(user.id) : null)
      .input("created_by_name",  sql.NVarChar, await getUserName(pool, user?.id))
      .input("created_on",       sql.NVarChar, now)
      .query(`
        INSERT INTO emp_training_videos
          (title, description, rank, video_link, from_date, to_date,
           created_by, created_by_name, created_on, active)
        OUTPUT INSERTED.*
        VALUES
          (@title, @description, @rank, @video_link, @from_date, @to_date,
           @created_by, @created_by_name, @created_on, 0)
      `);

    logger.log("TRAINING VIDEO CREATED SUCCESSFULLY =>", title);
    return result.recordset[0];
  } catch (error) {
    logger.error("CREATE TRAINING VIDEO DB ERROR:", error);
    throw error;
  }
};

// ================= UPDATE TRAINING VIDEO =================
const updateTrainingVideo = async (id, data, user) => {
  try {
    const pool = await poolPromise;

    const title       = (data.title || "").trim();
    const description = (data.description || "").trim();
    const rank        = (data.rank || "").trim();
    const video_link  = (data.video_link || "").trim();
    const from_date   = data.from_date || null;
    const to_date     = data.to_date || null;

    if (!title) throw new Error("Title is required");
    if (!video_link) throw new Error("Video link is required");

    logger.log("UPDATING TRAINING VIDEO ID =>", id);

    const now = getFormattedDateTime();

    const result = await pool
      .request()
      .input("id",               sql.Int,      id)
      .input("title",            sql.NVarChar, title)
      .input("description",      sql.NVarChar, description || null)
      .input("rank",             sql.NVarChar, rank || null)
      .input("video_link",       sql.NVarChar, video_link)
      .input("from_date",        sql.NVarChar, from_date)
      .input("to_date",          sql.NVarChar, to_date)
      .input("modified_by",      sql.NVarChar, user?.id ? String(user.id) : null)
      .input("modified_by_name", sql.NVarChar, await getUserName(pool, user?.id))
      .input("modified_on",      sql.NVarChar, now)
      .query(`
        UPDATE emp_training_videos
        SET
          title            = @title,
          description      = @description,
          rank             = @rank,
          video_link       = @video_link,
          from_date        = @from_date,
          to_date          = @to_date,
          modified_by      = @modified_by,
          modified_by_name = @modified_by_name,
          modified_on      = @modified_on
        WHERE id = @id;

        SELECT * FROM emp_training_videos WHERE id = @id;
      `);

    logger.log("TRAINING VIDEO UPDATED SUCCESSFULLY => ID:", id);
    return result.recordset[0];
  } catch (error) {
    logger.error("UPDATE TRAINING VIDEO DB ERROR:", error);
    throw error;
  }
};

// ================= DELETE (SOFT) =================
const deleteTrainingVideo = async (id, user) => {
  try {
    const pool = await poolPromise;

    logger.log("SOFT DELETING TRAINING VIDEO ID =>", id);

    const now = getFormattedDateTime();

    await pool
      .request()
      .input("id",            sql.Int,      id)
      .input("deleted_on",    sql.NVarChar, now)
      .input("deleted_by",    sql.NVarChar, user?.id ? String(user.id) : null)
      .input("deleted_by_name", sql.NVarChar, await getUserName(pool, user?.id))
      .query(`
        UPDATE emp_training_videos
        SET
          active           = 1,
          deleted_on       = @deleted_on,
          deleted_by       = @deleted_by,
          deleted_by_name  = @deleted_by_name
        WHERE id = @id
      `);

    logger.log("TRAINING VIDEO SOFT DELETED => ID:", id);
  } catch (error) {
    logger.error("DELETE TRAINING VIDEO DB ERROR:", error);
    throw error;
  }
};

module.exports = {
  getTrainingVideos,
  getTrainingVideoById,
  createTrainingVideo,
  updateTrainingVideo,
  deleteTrainingVideo,
};
