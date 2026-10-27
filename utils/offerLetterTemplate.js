const fs = require("fs");
const path = require("path");

const generateOfferLetterHTML = (emp) => {

// ==========================================
// COMPANY DETAILS FROM ENV
// ==========================================

const companyName =
process.env.COMPANY_NAME ||
"ODS PROTECTIVE SERVICES PVT. LTD.";

const companyAddress =
process.env.COMPANY_ADDRESS ||
"";

const companyLogo =
process.env.COMPANY_LOGO ||
"ods_logo.jpeg";

// ==========================================
// COMPANY LOGO
// ==========================================

const logoPath = path.join(
__dirname,
"../uploads",
companyLogo
);

let logoBase64 = "";

try {
if (fs.existsSync(logoPath)) {
logoBase64 = fs.readFileSync(
logoPath,
"base64"
);
}
} catch (err) {
console.log("Logo not found:", err.message);
}

// ==========================================
// LOGO MIME TYPE
// ==========================================

const logoExtension = path
.extname(companyLogo)
.toLowerCase();

let logoMimeType = "image/jpeg";

if (logoExtension === ".png") {
logoMimeType = "image/png";
} else if (logoExtension === ".webp") {
logoMimeType = "image/webp";
}

emp.company_logo = logoBase64
? `data:${logoMimeType};base64,${logoBase64}`
: "";

// ==========================================
// EMPLOYEE PHOTO
// ==========================================

let empPhotoBase64 = "";

// तुमच्या database मध्ये profile_image असेल तर ते वापरा
let empPhotoPath = null;

if (emp.profile_image) {

empPhotoPath = path.join(
  process.env.FRONTEND_FOLDER || "",
  "api",
  emp.profile_image
);

}

// Fallback default employee image
if (
!empPhotoPath ||
!fs.existsSync(empPhotoPath)
) {

empPhotoPath = path.join(
  __dirname,
  "../uploads",
  "employee_photo.jpg"
);

}

try {

if (fs.existsSync(empPhotoPath)) {

  empPhotoBase64 = fs.readFileSync(
    empPhotoPath,
    "base64"
  );

}

} catch (err) {

console.log(
  "Employee photo not found:",
  err.message
);

}

emp.employee_photo = empPhotoBase64
? `data:image/jpeg;base64,${empPhotoBase64}`
: "";

// ==========================================
// SAFE VALUES
// ==========================================

const employeeName =
`${emp.first_name || ""} ${emp.last_name || ""}`.trim() ||
"N/A";

const employeeCode =
emp.employee_code || "N/A";

const employeeDepartment =
emp.department ||
emp.rank ||
"N/A";

const joiningDate =
emp.date_of_joining || "N/A";

const employeeSalary =
emp.salary || "As per company policy";

// ==========================================
// RETURN HTML
// ==========================================

return `

<!DOCTYPE html>

<html>

<head>

  <meta charset="UTF-8" />

  <style>

    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 0;
      background: #fff;
    }


    /* ======================================
       PAGE
    ====================================== */

    .copy {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: 15mm;
      box-sizing: border-box;
      border: 1px solid #000;
      page-break-after: always;
    }


    /* ======================================
       HEADER
    ====================================== */

    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #000;
      padding-bottom: 10px;
      margin-bottom: 10px;
    }


    .left {
      display: flex;
      align-items: center;
      gap: 10px;
    }


    .logo {
      width: 60px;
      height: 60px;
      object-fit: contain;
    }


    .company-info {
      display: flex;
      flex-direction: column;
      max-width: 600px;
    }


    .company-name {
      font-size: 16px;
      font-weight: bold;
      text-transform: uppercase;
    }


    .company-address {
      font-size: 11px;
      color: #444;
      margin-top: 4px;
      line-height: 1.4;
    }


    /* ======================================
       TITLE
    ====================================== */

    .title {
      text-align: center;
      font-size: 18px;
      font-weight: bold;
      margin: 15px 0;
      text-transform: uppercase;
      text-decoration: underline;
    }


    /* ======================================
       META
    ====================================== */

    .meta {
      font-size: 12px;
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
    }


    .meta-right {
      text-align: right;
    }


    /* ======================================
       CONTENT
    ====================================== */

    .content {
      font-size: 13px;
      line-height: 1.6;
    }


    /* ======================================
       SIGNATURE AREA
    ====================================== */

    .signature {
      margin-top: 50px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }


    /* ======================================
       EMPLOYEE PHOTO
    ====================================== */

    .emp-block {
      text-align: center;
      width: 180px;
    }


    .emp-photo {
      width: 90px;
      height: 90px;
      border: 1px solid #000;
      object-fit: cover;
    }


    .emp-name {
      margin-top: 5px;
      font-size: 12px;
      font-weight: bold;
    }


    .emp-company {
      font-size: 10px;
      margin-top: 3px;
    }


    /* ======================================
       EMPLOYEE SIGNATURE
    ====================================== */

    .sign-block {
      text-align: center;
    }


    .sign-line {
      border-bottom: 1px solid #000;
      width: 140px;
      margin-top: 30px;
    }


    .sign-text {
      font-size: 12px;
      margin-top: 5px;
    }


    /* ======================================
       AUTHORISED SIGNATORY
    ====================================== */

    .authorised-signatory {
      margin-top: 45px;
      margin-left: auto;
      width: 180px;
      text-align: center;
      font-size: 12px;
    }


    .authorised-line {
      border-bottom: 1px solid #000;
      width: 150px;
      margin: 0 auto 8px;
    }


    /* ======================================
       PRINT
    ====================================== */

    @media print {

      .copy {
        page-break-after: always;
      }

      .copy:last-child {
        page-break-after: auto;
      }

    }

  </style>

</head>

<body>

  <!-- ======================================
       COPY 1
  ====================================== -->

  <div class="copy">

<!-- HEADER -->

<div class="top-bar">

  <div class="left">


    ${
      emp.company_logo
        ? `
          <img
            class="logo"
            src="${emp.company_logo}"
            alt="Company Logo"
          />
        `
        : ""
    }


    <div class="company-info">


      <!-- COMPANY NAME FROM ENV -->

      <div class="company-name">
        ${companyName}
      </div>


      <!-- COMPANY ADDRESS FROM ENV -->

      ${
        companyAddress
          ? `
            <div class="company-address">
              ${companyAddress}
            </div>
          `
          : ""
      }


    </div>

  </div>

</div>


<!-- TITLE -->

<div class="title">
  POSTING ORDER
</div>


<!-- META -->

<div class="meta">

  <div class="meta-left">

    Date:
    ${new Date().toLocaleDateString("en-GB")}

  </div>


  <div class="meta-right">

    <div>
      Date:
      ${new Date().toLocaleDateString("en-GB")}
    </div>

    <div>
      Code:
      ${employeeCode}
    </div>

  </div>

</div>


<!-- CONTENT -->

<div class="content">

  <p>To,</p>

  <p>Dear Sir,</p>


  <p>

    We have appointed

    <b>${employeeName}</b>

    as

    <b>${employeeDepartment}</b>

    for work at your above location.

  </p>


  <p>

    w.e.f.

    <b>${joiningDate}</b>

    and he/she will report to you on or before

    <b>${joiningDate}</b>.

  </p>


  <p>

    The signature of the appointed person along
    with his/her photograph is attached herewith.

  </p>


  <p>

    Salary:

    ${employeeSalary}

  </p>

</div>


<!-- SIGNATURE AREA -->

<div class="signature">


  <!-- EMPLOYEE PHOTO -->

  <div class="emp-block">


    ${
      emp.employee_photo
        ? `
          <img
            class="emp-photo"
            src="${emp.employee_photo}"
            alt="Employee Photo"
          />
        `
        : ""
    }


    <div class="emp-name">

      ${employeeName}

    </div>


    <div class="emp-company">

      ${companyName}

    </div>

  </div>


  <!-- EMPLOYEE SIGNATURE -->

  <div class="sign-block">

    <div class="sign-line"></div>

    <div class="sign-text">

      ${employeeName}

      <br/>

      ID:
      ${employeeCode}

    </div>

  </div>

</div>


<!-- AUTHORISED SIGNATORY -->

<div class="authorised-signatory">

  <div class="authorised-line"></div>

  <div>

    Authorized Signatory

  </div>

</div>

  </div>

  <!-- ======================================
       COPY 2
  ====================================== -->

  <div class="copy">

<!-- HEADER -->

<div class="top-bar">

  <div class="left">


    ${
      emp.company_logo
        ? `
          <img
            class="logo"
            src="${emp.company_logo}"
            alt="Company Logo"
          />
        `
        : ""
    }


    <div class="company-info">


      <!-- COMPANY NAME FROM ENV -->

      <div class="company-name">

        ${companyName}

      </div>


      <!-- COMPANY ADDRESS FROM ENV -->

      ${
        companyAddress
          ? `
            <div class="company-address">

              ${companyAddress}

            </div>
          `
          : ""
      }


    </div>

  </div>

</div>


<!-- TITLE -->

<div class="title">

  POSTING ORDER

</div>


<!-- META -->

<div class="meta">

  <div class="meta-left">

    Date:
    ${new Date().toLocaleDateString("en-GB")}

  </div>


  <div class="meta-right">

    <div>

      Date:
      ${new Date().toLocaleDateString("en-GB")}

    </div>

    <div>

      Code:
      ${employeeCode}

    </div>

  </div>

</div>


<!-- CONTENT -->

<div class="content">

  <p>To,</p>

  <p>Dear Sir,</p>


  <p>

    We have appointed

    <b>${employeeName}</b>

    as

    <b>${employeeDepartment}</b>

    for work at your above location.

  </p>


  <p>

    w.e.f.

    <b>${joiningDate}</b>

    and he/she will report to you on or before

    <b>${joiningDate}</b>.

  </p>


  <p>

    The signature of the appointed person along
    with his/her photograph is attached herewith.

  </p>


  <p>

    Salary:

    ${employeeSalary}

  </p>

</div>


<!-- SIGNATURE AREA -->

<div class="signature">


  <!-- EMPLOYEE PHOTO -->

  <div class="emp-block">


    ${
      emp.employee_photo
        ? `
          <img
            class="emp-photo"
            src="${emp.employee_photo}"
            alt="Employee Photo"
          />
        `
        : ""
    }


    <div class="emp-name">

      ${employeeName}

    </div>


    <div class="emp-company">

      ${companyName}

    </div>

  </div>


  <!-- EMPLOYEE SIGNATURE -->

  <div class="sign-block">

    <div class="sign-line"></div>

    <div class="sign-text">

      ${employeeName}

      <br/>

      ID:
      ${employeeCode}

    </div>

  </div>

</div>


<!-- AUTHORISED SIGNATORY -->

<div class="authorised-signatory">

  <div class="authorised-line"></div>

  <div>

    Authorized Signatory

  </div>

</div>

  </div>

</body>

</html>
`;
};

module.exports = generateOfferLetterHTML;
