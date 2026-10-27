const IdCardModel = require("../models/idCardModel");
const PDFDocument = require("pdfkit");
const path = require("path");
require("dotenv").config();
const fs = require("fs");

// ================= GET ALL =================
exports.getAllIdCards = async (req, res) => {
  try {
    const data = await IdCardModel.getAll();

    res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ================= GET SINGLE =================
exports.getIdCardByCode = async (req, res) => {
  try {
    const data = await IdCardModel.getByCode(req.params.emp_code);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// exports.downloadIdCard = async (emp_code) => {
//   try {
//     console.log("emp_code", emp_code);
//     // const code = req.params.emp_code || emp_code;
//     const emp = await IdCardModel.getByCode(emp_code);

//     if (!emp) {
//       throw new Error("Employee not found");
//     }

//     const idcardsDir = path.join(process.env.FRONTEND_FOLDER, "/api/idcards");
//     // console.log(process.env.FRONTEND_FOLDER);

//     if (!fs.existsSync(idcardsDir)) {
//       fs.mkdirSync(idcardsDir, { recursive: true });
//     }

//     const pdfPath = path.join(idcardsDir, `${emp.employee_code}.pdf`);

//     const rank = (
//       emp.designation ||
//       emp.rank ||
//       emp.post_name ||
//       "SECURITY GUARD"
//     ).toUpperCase();

//     const doc = new PDFDocument({
//       size: [360, 610],
//       margins: 0,
//     });

//     const fileStream = fs.createWriteStream(pdfPath);

//     doc.pipe(fileStream);

//     // res.setHeader(
//     //   "Content-Disposition",
//     //   `attachment; filename=${emp.employee_code}.pdf`,
//     // );

//     // res.setHeader("Content-Type", "application/pdf");

//     // doc.pipe(res);

//     // ================= MAIN BORDER (SAME COLOR) =================
//     doc.roundedRect(8, 8, 344, 594, 28).lineWidth(2).stroke("#111"); // SAME BLACK BORDER

//     // ================= RIGHT YELLOW STRIP (SAME COLOR) =================
//     const stripX = 290;
//     const stripY = 8;
//     const stripW = 62;
//     const stripH = 594;
//     const radius = 28;

//     doc
//       .moveTo(stripX, stripY)
//       .lineTo(stripX + stripW - radius, stripY)
//       .quadraticCurveTo(
//         stripX + stripW,
//         stripY,
//         stripX + stripW,
//         stripY + radius,
//       )
//       .lineTo(stripX + stripW, stripY + stripH - radius)
//       .quadraticCurveTo(
//         stripX + stripW,
//         stripY + stripH,
//         stripX + stripW - radius,
//         stripY + stripH,
//       )
//       .lineTo(stripX, stripY + stripH)
//       .lineTo(stripX, stripY)
//       .fillAndStroke("#f4c400", "#111"); // SAME YELLOW + BLACK

//     // ================= RANK (VERTICAL SAME STYLE) =================
//     doc.save();
//     doc.fillColor("#000").font("Helvetica-Bold").fontSize(18);

//     doc.translate(322, 500);
//     doc.rotate(90);

//     doc.text(rank, -110, 0, {
//       width: 220,
//       align: "center",
//     });

//     doc.restore();

//     // ================= CENTER BASE =================
//     const pageW = 360;
//     const centerX = pageW / 2;

//     // ================= LOGO (SAME UI COLOR) =================
//     const logoPath = path.join(
//       process.env.FRONTEND_FOLDER,
//       "/api/ods_logo.png",
//     );

//     if (fs.existsSync(logoPath)) {
//       const logoW = 95;

//       doc.image(logoPath, centerX - logoW / 2, 22, {
//         width: logoW,
//       });
//     }

//     // ================= COMPANY NAME (BLACK SAME UI) =================
//     doc
//       .fillColor("#000")
//       .font("Helvetica-Bold")
//       .fontSize(22)
//       .text("ODS PROTECTIVE", 0, 115, {
//         width: pageW,
//         align: "center",
//       });

//     doc.text("SERVICES PVT. LTD.", 0, 145, {
//       width: pageW,
//       align: "center",
//     });

//     // ================= BLACK LINE (SAME COLOR) =================
//     doc.moveTo(60, 192).lineTo(280, 192).lineWidth(3).stroke("#000");

//     // ================= TAGLINE (GREY SAME UI) =================
//     doc
//       .font("Helvetica")
//       .fontSize(11)
//       .fillColor("#444")
//       .text("Experienced, Dedicated, Different!!", 0, 205, {
//         width: pageW,
//         align: "center",
//       });

//     // ================= PHOTO (CENTER SAME UI BOX) =================
//     const photoW = 120;
//     const photoH = 150;

//     const photoX = centerX - photoW / 2;
//     const photoY = 245;

//     doc.rect(photoX, photoY, photoW, photoH).lineWidth(3).stroke("#222"); // SAME DARK BORDER

//     // let imagePath = path.join(__dirname, "../uploads/default.png");

//     let imagePath = path.join(
//       process.env.FRONTEND_FOLDER,
//       "/api/demo_user_pro.png",
//     );

//     if (
//       emp.profile_image &&
//       fs.existsSync(
//         path.join(process.env.FRONTEND_FOLDER, "/api/", emp.profile_image),
//       )
//     ) {
//       imagePath = path.join(
//         process.env.FRONTEND_FOLDER,
//         "/api/",
//         emp.profile_image,
//       );
//     }

//     if (fs.existsSync(imagePath)) {
//       doc.image(imagePath, photoX + 2, photoY + 2, {
//         width: photoW - 4,
//         height: photoH - 4,
//       });
//     }

//     // ================= EMP CODE (CENTER BLACK) =================
//     doc
//       .font("Helvetica-Bold")
//       .fontSize(11)
//       .fillColor("#000")
//       .text(`Emp Code: ${emp.employee_code || "N/A"}`, 0, 415, {
//         width: pageW,
//         align: "center",
//       });

//     // ================= NAME (CENTER BLACK BIG) =================
//     let name = emp.emp_full_name || "N/A";

//     let fontSize = 15;

//     // reduce font size if name is too long
//     if (name.length > 15) fontSize = 14;
//     if (name.length > 30) fontSize = 14;
//     if (name.length > 40) fontSize = 12;

//     doc
//       .font("Helvetica-Bold")
//       .fontSize(fontSize)
//       .fillColor("#000")
//       .text(name, 0, 445, {
//         width: pageW,
//         align: "center",
//       });
//     // ================= SIGNATURE (CENTER SAME UI) =================
//     const sigX = 35;
//     const sigY = 535;

//     // ================= SIGNATURE LINE =================

//     // ================= AUTHORISED =================
//     doc
//       .font("Helvetica-Bold")
//       .fontSize(13)
//       .fillColor("#000")
//       .text("Authorised", sigX, sigY + 5, {
//         width: 120,
//         align: "center",
//       });

//     // 👇 GAP HERE (increase Y difference)
//     doc
//       .font("Helvetica")
//       .fontSize(11)
//       .fillColor("#000")
//       .text("Signatory", sigX, sigY + 40, {
//         // 👈 gap increased
//         width: 120,
//         align: "center",
//       });
//     doc.end();

//     fileStream.on("finish", () => {
//       console.log(`ID Card Saved : ${pdfPath}`);
//     });

//     return {
//       filePath: pdfPath,
//     };
//   } catch (err) {
//     console.log(err);
//     throw err;
//   }
// };

exports.downloadIdCard = async (emp_code) => {
  try {

    // ==========================================
    // GET EMPLOYEE + COMPANY + BRANCH DETAILS
    // ==========================================

    const emp = await IdCardModel.getByCode(emp_code);

    if (!emp) {
      throw new Error("Employee not found");
    }

    console.log("==========================================");
    console.log("ID CARD EMPLOYEE");
    console.log("Employee Code :", emp.employee_code);
    console.log("Employee Name :", emp.emp_full_name);
    console.log("Company ID    :", emp.company_id);
    console.log("Company Name  :", emp.company_name);
    console.log("Company Logo  :", emp.company_logo);
    console.log("Branch ID     :", emp.branch_id);
    console.log("Branch Name   :", emp.branch_name);
    console.log("Branch Address:", emp.branch_address);
    console.log("==========================================");


    // ==========================================
    // COMPANY DETAILS
    // ==========================================

    const companyName =
      emp.company_name ||
      "COMPANY NAME";

    const companyLogo =
      emp.company_logo ||
      "";

    // ==========================================
    // BRANCH DETAILS
    // ==========================================

    const branchName =
      emp.branch_name ||
      "";

    const branchAddress =
      emp.branch_address ||
      "";


    // ==========================================
    // CREATE ID CARD DIRECTORY
    // ==========================================

    const idcardsDir = path.join(
      process.env.FRONTEND_FOLDER,
      "/api/idcards"
    );

    if (!fs.existsSync(idcardsDir)) {
      fs.mkdirSync(idcardsDir, {
        recursive: true,
      });
    }


    // ==========================================
    // PDF PATH
    // ==========================================

    const pdfPath = path.join(
      idcardsDir,
      `IDCARD_${emp.employee_code}.pdf`
    );


    // ==========================================
    // EMPLOYEE DESIGNATION
    // ==========================================

    const rank = (
      emp.designation ||
      emp.rank ||
      emp.post_name ||
      "SECURITY GUARD"
    ).toUpperCase();


    // ==========================================
    // PDF SIZE
    // ==========================================

    const pageW = 360;
    const pageH = 610;

    const doc = new PDFDocument({
      size: [pageW, pageH],
      margins: 0,
    });


    // ==========================================
    // FILE STREAM
    // ==========================================

    const fileStream =
      fs.createWriteStream(pdfPath);

    doc.pipe(fileStream);


    // ==========================================
    // RIGHT BLUE STRIP
    // ==========================================

    const stripX = 292;
    const stripY = 10;
    const stripW = 58;
    const stripH = 590;


    // ==========================================
    // MAIN CONTENT AREA
    // ==========================================

    const contentLeft = 20;
    const contentRight = 280;

    const contentWidth =
      contentRight - contentLeft;

    const contentCenterX =
      contentLeft +
      contentWidth / 2;


    // ==========================================
    // CARD BORDER
    // ==========================================

    doc
      .roundedRect(
        8,
        8,
        344,
        594,
        28
      )
      .lineWidth(2)
      .stroke("#1F2937");


    // ==========================================
    // RIGHT BLUE STRIP
    // ==========================================

    doc
      .roundedRect(
        stripX,
        stripY,
        stripW,
        stripH,
        28
      )
      .fill("#2F73C5");


    // ==========================================
    // VERTICAL DESIGNATION
    // ==========================================

    doc.save();

    doc
      .fillColor("#FFFFFF")
      .font("Helvetica-Bold")
      .fontSize(15);

    doc.translate(
      stripX + stripW / 2,
      pageH / 2
    );

    doc.rotate(90);

    doc.text(
      rank,
      -130,
      -10,
      {
        width: 260,
        align: "center",
      }
    );

    doc.restore();


    // ==========================================
    // COMPANY LOGO PATH
    // ==========================================

    let logoPath = null;

    if (companyLogo) {

      // ----------------------------------------
      // CASE 1:
      // company_logo = uploads/company/logo.png
      // ----------------------------------------

      const fullLogoPath = path.join(
        process.env.FRONTEND_FOLDER,
        "/api/",
        companyLogo
      );

      if (fs.existsSync(fullLogoPath)) {
        logoPath = fullLogoPath;
      }


      // ----------------------------------------
      // CASE 2:
      // company_logo = logo.png
      // ----------------------------------------

      if (!logoPath) {

        const uploadLogoPath = path.join(
          __dirname,
          "../uploads",
          companyLogo
        );

        if (fs.existsSync(uploadLogoPath)) {
          logoPath = uploadLogoPath;
        }
      }


      // ----------------------------------------
      // CASE 3:
      // company_logo starts with /uploads/
      // ----------------------------------------

      if (!logoPath) {

        const cleanedLogo =
          companyLogo
            .replace(/^\/+/, "")
            .replace(/^uploads\//, "");

        const cleanedLogoPath =
          path.join(
            __dirname,
            "../uploads",
            cleanedLogo
          );

        if (fs.existsSync(cleanedLogoPath)) {
          logoPath = cleanedLogoPath;
        }
      }
    }


    console.log(
      "Company Logo Path:",
      logoPath
    );


    // ==========================================
    // COMPANY LOGO
    // ==========================================

    const logoW = 90;

    const logoY = 25;

    if (
      logoPath &&
      fs.existsSync(logoPath)
    ) {

      doc.image(
        logoPath,
        contentCenterX -
          logoW / 2,
        logoY,
        {
          width: logoW,
        }
      );

    }


    // ==========================================
    // COMPANY NAME
    // ==========================================

    let companyFontSize = 16;

    if (companyName.length > 25) {
      companyFontSize = 14;
    }

    if (companyName.length > 35) {
      companyFontSize = 12;
    }

    const companyNameY = 75;

    doc
      .font("Helvetica-Bold")
      .fontSize(companyFontSize)
      .fillColor("#1F2937")
      .text(
        companyName.toUpperCase(),
        contentLeft,
        companyNameY,
        {
          width: contentWidth,
          align: "center",
          lineGap: 1,
        }
      );


    // ==========================================
    // BRANCH NAME
    // ==========================================

    const branchNameY = 98;

    if (branchName) {

      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#374151")
        .text(
          branchName.toUpperCase(),
          contentLeft + 5,
          branchNameY,
          {
            width: contentWidth - 10,
            align: "center",
          }
        );

    }


    // ==========================================
    // BRANCH ADDRESS
    // ==========================================

    const branchAddressY = 114;

    if (branchAddress) {

      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor("#4B5563")
        .text(
          branchAddress,
          contentLeft + 5,
          branchAddressY,
          {
            width: contentWidth - 10,
            align: "center",
            lineGap: 1,
          }
        );

    }


    // ==========================================
    // HEADER DIVIDER
    // ==========================================

    let headerLineY = 120;

    if (branchName && branchAddress) {
      headerLineY = 148;
    }
    else if (branchName) {
      headerLineY = 132;
    }

    doc
      .moveTo(
        contentLeft + 30,
        headerLineY
      )
      .lineTo(
        contentRight - 25,
        headerLineY
      )
      .lineWidth(1.5)
      .stroke("#1F2937");


    // ==========================================
    // TAGLINE
    // ==========================================

    const taglineY =
      headerLineY + 8;

    doc
      .font("Helvetica-Oblique")
      .fontSize(8.5)
      .fillColor("#4B5563")
      .text(
        "Experienced, Dedicated, Different!!",
        contentLeft,
        taglineY,
        {
          width: contentWidth,
          align: "center",
        }
      );


    // ==========================================
    // PHOTO BOX
    // ==========================================

    const photoW = 125;
    const photoH = 125;

    const photoX =
      contentCenterX -
      photoW / 2;

    const photoY =
      taglineY + 42;


    // ==========================================
    // PHOTO OUTER BORDER
    // ==========================================

    doc
      .roundedRect(
        photoX - 4,
        photoY - 4,
        photoW + 8,
        photoH + 8,
        7
      )
      .lineWidth(2)
      .stroke("#1F2937");


    // ==========================================
    // DEFAULT PROFILE IMAGE
    // ==========================================

    let imagePath = path.join(
      __dirname,
      "../uploads",
      "user_default.jpeg"
    );


    // ==========================================
    // EMPLOYEE PROFILE IMAGE
    // ==========================================

    if (emp.profile_image) {

      const uploadedImagePath =
        path.join(
          process.env.FRONTEND_FOLDER,
          "/api/",
          emp.profile_image
        );

      if (
        fs.existsSync(
          uploadedImagePath
        )
      ) {

        imagePath =
          uploadedImagePath;

      }
    }


    // ==========================================
    // PROFILE IMAGE
    // ==========================================

    if (
      fs.existsSync(imagePath)
    ) {

      doc.image(
        imagePath,
        photoX,
        photoY,
        {
          width: photoW,
          height: photoH,
        }
      );

    }


    // ==========================================
    // EMPLOYEE CODE
    // ==========================================

    const empCodeY =
      photoY +
      photoH +
      20;

    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#374151")
      .text(
        `EMP CODE : ${
          emp.employee_code ||
          "N/A"
        }`,
        contentLeft,
        empCodeY,
        {
          width: contentWidth,
          align: "center",
        }
      );


    // ==========================================
    // EMPLOYEE NAME
    // ==========================================

    const name = (
      emp.emp_full_name ||
      "N/A"
    ).toUpperCase();

    let nameFontSize = 17;

    if (name.length > 18) {
      nameFontSize = 15;
    }

    if (name.length > 28) {
      nameFontSize = 13;
    }

    if (name.length > 38) {
      nameFontSize = 11;
    }

    const nameY =
      empCodeY + 30;

    doc
      .font("Helvetica-Bold")
      .fontSize(nameFontSize)
      .fillColor("#111827")
      .text(
        name,
        contentLeft,
        nameY,
        {
          width: contentWidth,
          align: "center",
          lineGap: 2,
        }
      );


    // ==========================================
    // DESIGNATION
    // ==========================================

    const designationY =
      nameY + 40;

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#4B5563")
      .text(
        rank,
        contentLeft,
        designationY,
        {
          width: contentWidth,
          align: "center",
        }
      );


    // ==========================================
    // BOTTOM DIVIDER
    // ==========================================

    const bottomLineY = 515;

    doc
      .moveTo(
        contentLeft + 35,
        bottomLineY
      )
      .lineTo(
        contentRight - 30,
        bottomLineY
      )
      .lineWidth(1)
      .stroke("#9CA3AF");


    // ==========================================
    // AUTHORISED SIGNATORY
    // ==========================================

    const signatoryY = 535;

    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#1F2937")
      .text(
        "AUTHORISED SIGNATORY",
        contentLeft,
        signatoryY,
        {
          width: contentWidth,
          align: "center",
        }
      );


    // ==========================================
    // FOOTER
    // ==========================================

    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#6B7280")
      .text(
        "This card is the property of the company",
        contentLeft,
        575,
        {
          width: contentWidth,
          align: "center",
        }
      );


    // ==========================================
    // END PDF
    // ==========================================

    doc.end();


    // ==========================================
    // WAIT FOR PDF SAVE
    // ==========================================

    return new Promise(
      (resolve, reject) => {

        fileStream.on(
          "finish",
          () => {

            console.log(
              `ID Card Saved : ${pdfPath}`
            );

            resolve({
              filePath: pdfPath,
            });

          }
        );

        fileStream.on(
          "error",
          reject
        );

      }
    );

  } catch (err) {

    console.error(
      "ID Card Generation Error:",
      err
    );

    throw err;
  }
};