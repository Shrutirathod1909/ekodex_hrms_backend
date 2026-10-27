const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");
const { getRelativePathFromApi } = require("../utils/img_path");
const employeeSiteModel = require("../models/employeesite.model");

// const uploadFolder = path.join(__dirname, "../uploads");

// if (!fs.existsSync(uploadFolder)) {
//   fs.mkdirSync(uploadFolder, { recursive: true });
// }

let uploadedData = [];
let errorData = [];

// ============================
// BULK UPLOAD
// ============================


exports.bulkUpload = async (req, res) => {
  try {
    console.log("REQ.FILE =>", req.file);

    // 1. Check uploaded file
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No uploaded file found",
      });
    }

    // 2. Get logged-in user ID
    const createdBy = req.user?.id;

    if (!createdBy) {
      return res.status(401).json({
        success: false,
        message: "Logged-in user ID not found",
      });
    }

    console.log("CREATED BY USER ID =>", createdBy);

    // 3. Get uploaded file path
    const file = req.file.path;

    console.log("UPLOADED FILE PATH =>", file);
    console.log("FILE EXISTS =>", fs.existsSync(file));

    if (!fs.existsSync(file)) {
      return res.status(400).json({
        success: false,
        message: `Uploaded file not found: ${file}`,
      });
    }

    // 4. Read Excel / CSV
    const workbook = XLSX.readFile(file);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      return res.status(400).json({
        success: false,
        message: "No worksheet found in uploaded file",
      });
    }

    const data = XLSX.utils.sheet_to_json(sheet, {
      defval: "",
    });

    console.log("EXCEL DATA =>", data);

    if (!data.length) {
      return res.status(400).json({
        success: false,
        message: "Excel file is empty",
      });
    }

    // 5. Insert into temp_employee
    let insertedCount = 0;
    let skippedCount = 0;

    for (const row of data) {
      const employeeCode = String(
        row.employee_code ?? ""
      ).trim();

      const employeeName = String(
        row.employee_name ?? ""
      ).trim();

      const clientCode = String(
        row.client_code ?? ""
      ).trim();

      const siteName = String(
        row.site_name ?? ""
      ).trim();

      console.log("PROCESSING ROW =>", {
        employee_code: employeeCode,
        employee_name: employeeName,
        client_code: clientCode,
        site_name: siteName,
        created_by: createdBy,
      });

      // 6. Skip completely empty rows
      if (
        !employeeCode &&
        !employeeName &&
        !clientCode &&
        !siteName
      ) {
        skippedCount++;
        continue;
      }

      // 7. Insert record with logged-in user ID
      await employeeSiteModel.insertTempEmployee({
        employee_code: employeeCode,
        employee_name: employeeName,
        client_code: clientCode,
        site_name: siteName,
        created_by: createdBy,
      });

      insertedCount++;
    }

    // 8. Success response
    return res.status(200).json({
      success: true,
      insertedCount,
      skippedCount,
      created_by: createdBy,
      message: "File uploaded successfully",
    });

  } catch (err) {
    console.error("UPLOAD ERROR =>", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};


// ============================
// VERIFY + UPDATE
// ============================================================
// VERIFY BULK EMPLOYEE SITE UPLOAD
// ============================================================


exports.verifyBulkUpload = async (req, res) => {
  try {
    const rows = await employeeSiteModel.getTempEmployeeRows();

    if (!rows || rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No uploaded rows found in temp_employee table",
      });
    }

    const errors = [];
    let successCount = 0;

    for (const row of rows) {
      const employeeCode = String(row.employee_code ?? "").trim();
      const employeeName = String(
        row.emp_full_name ?? row.employee_name ?? ""
      ).trim();
      const clientCode = String(
        row.client_code ?? row.client_id ?? ""
      ).trim();
      const siteName = String(row.site_name ?? "").trim();
      const siteCode = String(row.site_code ?? "").trim();

      const addError = (message) => {
        errors.push({
          employee_code: employeeCode,
          employee_name: employeeName,
          client_code: clientCode,
          site_code: siteCode,
          site_name: siteName,
          error: message,
        });
      };

      try {
        if (!employeeCode) {
          addError("Employee code is required");
          continue;
        }

        if (!clientCode) {
          addError("Client code is required");
          continue;
        }

        if (!siteName) {
          addError("Site name is required");
          continue;
        }

        const employee = await employeeSiteModel.checkEmployee(
          employeeCode,
          employeeName
        );

        if (!employee) {
          addError("Employee not found");
          continue;
        }

        const site = await employeeSiteModel.checkSite(
          clientCode,
          siteName
        );

        if (!site) {
          addError("Site not found");
          continue;
        }

        const updateResult =
          await employeeSiteModel.updateEmployeeSite(
            employeeCode,
            site
          );

        if (updateResult?.rowsAffected?.[0] > 0) {
          successCount++;
        } else {
          addError("Employee update failed");
        }
      } catch (rowError) {
        console.error("ROW PROCESSING ERROR =", rowError);

        addError(
          rowError.message || "Unknown error while processing row"
        );
      }
    }

    // सर्व rows successfully update झाल्या तरच temp data delete करा
    if (errors.length === 0 && successCount === rows.length) {

      return res.status(200).json({
        success: true,
        message:
          `${successCount} employee site(s) updated successfully. ` ,
        totalCount: rows.length,
        successCount,
        errorCount: 0,
        results: false,
        errors: [],
      });
    }

    // Errors असतील तर temp data delete करू नका
    return res.status(200).json({
      success: true,
      message:
        `${successCount} employee site(s) updated. ` +
        `${errors.length} row(s) have errors. Temporary data retained.`,
      totalCount: rows.length,
      successCount,
      errorCount: errors.length,
      results: errors.length > 0,
      errors,
    });
  } catch (err) {
    console.error("VERIFY BULK UPLOAD ERROR =", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Bulk verification failed",
    });
  }
};  
// ============================
// DOWNLOAD TEMPLATE
// ============================
exports.downloadTemplate = async (req, res) => {
  try {
    const templateData = [
      {
        employee_code: "",
        employee_name: "",
        site_code: "",
        site_name: "",
      },
    ];

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(templateData);

    XLSX.utils.book_append_sheet(workbook, worksheet, "EmployeeSiteUpdate");

    const buffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
    });

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="EmployeeSiteTemplate.xlsx"',
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    return res.send(buffer);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ============================
// DOWNLOAD ERROR FILE
// ============================
exports.downloadErrorFile = async (req, res) => {
  try {
    const workbook = XLSX.utils.book_new();

    const worksheet = XLSX.utils.json_to_sheet(errorData);

    XLSX.utils.book_append_sheet(workbook, worksheet, "Errors");

    const filePath = path.join(uploadFolder, "EmployeeSiteErrors.xlsx");

    XLSX.writeFile(workbook, filePath);

    return res.download(filePath);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
