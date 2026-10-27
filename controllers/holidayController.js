const xlsx = require("xlsx");
const sql = require("mssql");
const { poolPromise } = require("../config/db");
const logger = require("../utils/logger");
const Holiday = require("../models/holidayModel");
const clientModel = require("../models/clientModel");
const toUpper = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim().toUpperCase();
};
/* =========================================================
   CREATE
========================================================= */

exports.createHoliday = async (req, res) => {
  try {
    logger.log("========== CREATE HOLIDAY HIT ==========");
    logger.log("BODY:", req.body);
    logger.log("FILES:", req.files);

    const userDetail = await clientModel.getUserById(req.user.id);

    const holidaysData = JSON.parse(
      req.body?.holidaysData || "[]"
    );

    if (!Array.isArray(holidaysData)) {
      return res.status(400).json({
        success: false,
        message: "holidaysData must be an array",
      });
    }

    const data = {
      state: toUpper(req.body?.state),
      rank: toUpper(req.body?.rank),
      created_by: req.user?.id || null,
      created_by_name: userDetail?.first_name || null,
      company_id:
        req.body?.company_id || req.user?.company_id || null,
      branch_id:
        req.body?.branch_id || req.user?.branch_id || null,
    };

    logger.log("MAIN DATA:", data);

    // Insert main holiday
    const result = await Holiday.insertHoliday(data);

    const holidayId = result.recordset?.[0]?.id;

    if (holidayId == null) {
      throw new Error("Holiday ID was not returned");
    }

    logger.log("INSERTED HOLIDAY ID:", holidayId);

    // Insert holiday details and their logs
    for (let i = 0; i < holidaysData.length; i++) {
      const holiday = holidaysData[i];

      let image = "";

      if (req.files?.length) {
        const file = req.files.find(
          (f) => f.fieldname === `holiday_image_${i}`
        );

        if (file) {
          image = file.filename;
        }
      }

      const detailData = {
        holiday_id: holidayId,
        name: holiday.name,
        date: holiday.date,
        image,
      };

      logger.log("DETAIL DATA:", detailData);

      // Insert detail and retrieve inserted ID
      const detailResult =
        await Holiday.insertHolidayDetail(detailData);

      logger.log("DETAIL INSERT RESULT:", detailResult);

      const detailId = detailResult.recordset?.[0]?.id;

      logger.log("INSERTED DETAIL ID:", detailId);

      if (detailId == null) {
        throw new Error(
          "Holiday detail ID was not returned by insertHolidayDetail"
        );
      }

      // Insert log with the same detail ID
      const logData = {
        ...detailData,
        id: detailId,
      };

      await Holiday.insertHolidayDetailLog(logData);

      logger.log("DETAIL LOG INSERTED:", logData);
    }

    return res.status(200).json({
      success: true,
      message: "Holiday inserted successfully",
      holiday_id: holidayId,
    });
  } catch (err) {
    logger.log("ERROR FULL:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* =========================================================
   GET
========================================================= */
exports.getHolidays = async (req, res) => {
  try {
    const { fromDate, toDate, searchFields } = req.query;

    const parsedSearch = searchFields
      ? JSON.parse(searchFields)
      : [];

    const rows = await Holiday.fetchHolidaysRaw(
      fromDate,
      toDate,
      parsedSearch,
      req.user
    );

    const map = new Map();

    rows.forEach((row) => {
      if (!map.has(row.id)) {
        map.set(row.id, {
          id: row.id,
          state: row.state,
          rank: row.rank,
          company_id: row.company_id,
          branch_id: row.branch_id,
          superadmin_status: row.superadmin_status,
          created_by: row.created_by,
          created_by_name: row.created_by_name,
          created_on: row.created_on,
          modified_on: row.modified_on,
          modified_by: row.modified_by,
          modified_by_name: row.modified_by_name,
          disabled_on: row.disabled_on,
          disabled_by_name: row.disabled_by_name,
          holidays: [],
        });
      }

      if (row.detail_id) {
        map.get(row.id).holidays.push({
          id: row.detail_id,
          name: row.holiday_name,
          date: row.holiday_date,
          image: row.image,
        });
      }
    });

    return res.json([...map.values()]);
  } catch (err) {
    logger.log("GET HOLIDAY ERROR:", err);

    return res.status(500).json({
      message: err.message,
    });
  }
};
/* =========================================================
   EXPORT
========================================================= */
exports.exportHolidays = async (req, res) => {
  try {
    const { fromDate, toDate, searchFields } = req.query;
    const parsedSearch = searchFields ? JSON.parse(searchFields) : [];

    const rows = await Holiday.fetchHolidaysRaw(fromDate, toDate, parsedSearch, req.user);

    const headers = [
      "State",
      "Rank",
      "Company ID",
      "Branch ID",
      "Holiday Name",
      "Holiday Date",
      "Created By",
      "Created On"
    ];

    const excelRows = rows.map((r) => [
      r.state || "",
      r.rank || "",
      r.company_id || "",
      r.branch_id || "",
      r.holiday_name || "",
      r.holiday_date || "",
      r.created_by_name || "",
      r.created_on || ""
    ]);

    const finalSheetData = [headers, ...excelRows];
    const worksheet = xlsx.utils.aoa_to_sheet(finalSheetData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Holidays");

    const buffer = xlsx.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    res.setHeader("Content-Disposition", `attachment; filename="Holidays_${Date.now()}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buffer);
  } catch (error) {
    logger.error("EXPORT HOLIDAY ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};
/* =========================================================
   UPDATE
========================================================= */
exports.updateHoliday = async (req, res) => {
  try {
    logger.log("BODY:", req.body);
    logger.log("FILES:", req.files);

    const state = req.body?.state || "";
    const rank = req.body?.rank || "All";

    const holidaysData = JSON.parse(req.body?.holidaysData || "[]");

    const modifiedBy = req.user?.id || req.user?.user_id || "";
    const userDetail = await clientModel.getUserById(req.user.id);
    const modifiedByName = userDetail?.first_name || "";

    await Holiday.updateHolidayMain({
      id: req.params.id,
      state,
      rank,
      company_id: req.body?.company_id || null,
      branch_id: req.body?.branch_id || null,
      modified_by: modifiedBy,
      modified_by_name: modifiedByName,
    });

    await Holiday.inactiveOldDetails(req.params.id);

    for (let i = 0; i < holidaysData.length; i++) {
      const h = holidaysData[i];

      // Use new uploaded file, OR keep existing image from frontend data
      let image = "";

      if (req.files) {
        const file = req.files.find(
          (f) => f.fieldname === `holiday_image_${i}`,
        );
        if (file) {
          // New file uploaded → use new filename
          image = file.filename;
        } else if (h.image) {
          // No new file → preserve existing image (strip base URL if present)
          const existingImage = String(h.image);
          // Extract just the filename from full URL if needed
          image = existingImage.includes("/holidays/")
            ? existingImage.split("/holidays/").pop()
            : existingImage;
        }
      } else if (h.image) {
        const existingImage = String(h.image);
        image = existingImage.includes("/holidays/")
          ? existingImage.split("/holidays/").pop()
          : existingImage;
      }

      await Holiday.insertHolidayDetail({
        holiday_id: req.params.id,
        name: h.name,
        date: h.date,
        image,
      });
    }

    res.json({ message: "Updated successfully" });
  } catch (err) {
    logger.log(err);
    res.status(500).json({ message: err.message });
  }
};
/* =========================================================
   DELETE
========================================================= */
exports.deleteHoliday = async (req, res) => {
  try {
    const disabledBy = String(req.user?.id || req.user?.user_id || "");

    const isSuperAdmin =
      req.user?.is_superadmin === true ||
      Number(req.user?.id || req.user?.user_id) === 1 ||
      ["SUPER ADMIN", "SUPERADMIN"].includes(
        String(req.user?.role || "").trim().toUpperCase()
      );

    await Holiday.softDeleteHoliday(
      req.params.id,
      disabledBy,
      isSuperAdmin ? 1 : 0
    );

    const pool = await poolPromise;

    await pool
      .request()
      .input("holiday_id", sql.VarChar(20), String(req.params.id))
      .query(`
        UPDATE holiday_detail
        SET active = '1'
        WHERE holiday_id = @holiday_id
      `);

    res.json({
      message: "Holiday deleted successfully",
      superadmin_status: isSuperAdmin ? 1 : 0,
    });
  } catch (err) {
    console.error("DELETE HOLIDAY ERROR:", err);
    res.status(400).json({ message: err.message });
  }
};
