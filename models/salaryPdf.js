const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

// =====================================================
// BASE DIRECTORIES
// =====================================================

const BASE_PDF_DIR = path.join(
    process.cwd(),
    "uploads",
    "salary-pdf"
);

const EMPLOYEE_PDF_DIR = path.join(
    BASE_PDF_DIR,
    "employees"
);

const SITE_PDF_DIR = path.join(
    BASE_PDF_DIR,
    "sites"
);

// =====================================================
// PUBLIC URL
// =====================================================

const getBaseUrl = () => {
    return (
        process.env.BASE_URL ||
        `http://localhost:${process.env.PORT || 5000}`
    ).replace(/\/$/, "");
};

// =====================================================
// SAFE STRING
// =====================================================

const safeString = (value, fallback = "") => {
    if (
        value === undefined ||
        value === null ||
        String(value).trim() === ""
    ) {
        return fallback;
    }

    return String(value)
        .trim()
        .replace(/[<>:"/\\|?*]/g, "_");
};

// =====================================================
// SAFE NUMBER
// =====================================================

const num = (value) => {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return 0;
    }

    const n = Number(
        String(value)
            .replace(/,/g, "")
            .trim()
    );

    return Number.isFinite(n) ? n : 0;
};

// =====================================================
// MONEY FORMAT
// =====================================================

const money = (value) => {
    return num(value).toFixed(2);
};

// =====================================================
// DISPLAY VALUE
// =====================================================

const displayValue = (value, fallback = "-") => {
    if (
        value === undefined ||
        value === null ||
        String(value).trim() === ""
    ) {
        return fallback;
    }

    return String(value);
};

// =====================================================
// CREATE DIRECTORIES
// =====================================================

const createDirectories = async () => {
    await fs.promises.mkdir(BASE_PDF_DIR, {
        recursive: true
    });

    await fs.promises.mkdir(EMPLOYEE_PDF_DIR, {
        recursive: true
    });

    await fs.promises.mkdir(SITE_PDF_DIR, {
        recursive: true
    });

    return {
        baseDir: BASE_PDF_DIR,
        employeeDir: EMPLOYEE_PDF_DIR,
        siteDir: SITE_PDF_DIR
    };
};

// =====================================================
// EMPLOYEE FOLDER
// =====================================================

const getEmployeeFolder = (employee) => {
    const employeeCode = safeString(
        employee.employeeCode ||
        employee.employee_code,
        "employee"
    );

    const employeeName = safeString(
        employee.employeeName ||
        employee.employee_name,
        "employee"
    );

    const month = safeString(
        employee.month ||
        employee.at_month,
        "month"
    );

    const year = safeString(
        employee.year ||
        employee.at_year,
        "year"
    );

    return path.join(
        EMPLOYEE_PDF_DIR,
        `${employeeCode}_${employeeName}_${month}_${year}`
    );
};

// =====================================================
// SITE FOLDER
// =====================================================

const getSiteFolder = (data) => {
    const siteId = safeString(
        data.siteId ||
        data.site_id,
        "site"
    );

    const siteName = safeString(
        data.siteName ||
        data.site_name,
        "site"
    );

    const month = safeString(
        data.month ||
        data.at_month,
        "month"
    );

    const year = safeString(
        data.year ||
        data.at_year,
        "year"
    );

    return path.join(
        SITE_PDF_DIR,
        `${siteId}_${siteName}_${month}_${year}`
    );
};

// =====================================================
// DRAW CELL
// =====================================================

const drawCell = (
    doc,
    text,
    x,
    y,
    width,
    height,
    options = {}
) => {
    const {
        fontSize = 7,
        bold = false,
        align = "left",
        fill = null,
        border = true,
        padding = 3
    } = options;

    if (fill) {
        doc
            .save()
            .fillColor(fill)
            .rect(x, y, width, height)
            .fill()
            .restore();
    }

    if (border) {
        doc
            .save()
            .lineWidth(0.4)
            .strokeColor("#666666")
            .rect(x, y, width, height)
            .stroke()
            .restore();
    }

    doc
        .font(
            bold
                ? "Helvetica-Bold"
                : "Helvetica"
        )
        .fontSize(fontSize)
        .fillColor("#000000");

    doc.text(
        displayValue(text, ""),
        x + padding,
        y + padding,
        {
            width: Math.max(
                1,
                width - padding * 2
            ),

            height: Math.max(
                1,
                height - padding * 2
            ),

            align,

            lineBreak: true,

            ellipsis: true
        }
    );
};

// =====================================================
// SECTION TITLE
// =====================================================

const drawSectionTitle = (
    doc,
    title,
    x,
    y,
    width,
    height = 20
) => {
    drawCell(
        doc,
        title,
        x,
        y,
        width,
        height,
        {
            fontSize: 8,
            bold: true,
            fill: "#E8E8E8"
        }
    );

    return y + height;
};

// =====================================================
// COMPANY HEADER
// =====================================================

const drawCompanyHeader = (
    doc,
    employee,
    startY = 30
) => {
    const pageWidth = doc.page.width;

    const left = 30;

    const width = pageWidth - 60;

    let y = startY;

    const companyName =
        employee.companyName ||
        employee.company_name ||
        "EKODEX TECHNOLOGIES PVT LTD";

    const companyAddress =
        employee.companyAddress ||
        employee.company_address ||
        employee.address ||
        "";

    // TOP LINE

    doc
        .save()
        .strokeColor("#CCCCCC")
        .moveTo(left, y)
        .lineTo(left + width, y)
        .stroke()
        .restore();

    y += 6;

    // COMPANY NAME

    doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#E00000")
        .text(
            companyName,
            left,
            y,
            {
                width,
                align: "center"
            }
        );

    y += 16;

    // ADDRESS

    doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor("#333333")
        .text(
            companyAddress ||
            "Office Address",
            left + 5,
            y,
            {
                width: width - 10,
                align: "center"
            }
        );

    y += 24;

    // BOTTOM LINE

    doc
        .save()
        .strokeColor("#CCCCCC")
        .moveTo(left, y)
        .lineTo(left + width, y)
        .stroke()
        .restore();

    y += 5;

    // MONTH

    const month =
        employee.month ||
        employee.at_month ||
        "";

    const year =
        employee.year ||
        employee.at_year ||
        "";

    doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#333333")
        .text(
            `PAY SLIP FOR THE MONTH OF ${month} ${year}`,
            left,
            y,
            {
                width,
                align: "center"
            }
        );

    y += 15;

    doc
        .save()
        .strokeColor("#CCCCCC")
        .moveTo(left, y)
        .lineTo(left + width, y)
        .stroke()
        .restore();

    return y + 5;
};

// =====================================================
// EMPLOYEE DETAILS
// =====================================================

const drawEmployeeDetails = (
    doc,
    employee,
    startY
) => {
    const x = 30;

    const totalWidth =
        doc.page.width - 60;

    const col1 = 130;
    const col2 = 170;
    const col3 = 110;

    const col4 =
        totalWidth -
        col1 -
        col2 -
        col3;

    const rowHeight = 20;

    let y = startY;

    const rows = [
        [
            "Employee Name",
            employee.employeeName ||
            employee.employee_name ||
            "",

            "Emp. Code",
            employee.employeeCode ||
            employee.employee_code ||
            ""
        ],

        [
            "Site Name",
            employee.siteName ||
            employee.site_name ||
            "",

            "Designation",
            employee.designation ||
            employee.rank ||
            ""
        ]
    ];

    rows.forEach(row => {
        drawCell(
            doc,
            row[0],
            x,
            y,
            col1,
            rowHeight,
            {
                fontSize: 6.5,
                bold: true,
                fill: "#F1F1F1"
            }
        );

        drawCell(
            doc,
            row[1],
            x + col1,
            y,
            col2,
            rowHeight,
            {
                fontSize: 6.5
            }
        );

        drawCell(
            doc,
            row[2],
            x + col1 + col2,
            y,
            col3,
            rowHeight,
            {
                fontSize: 6.5,
                bold: true,
                fill: "#F1F1F1"
            }
        );

        drawCell(
            doc,
            row[3],
            x + col1 + col2 + col3,
            y,
            col4,
            rowHeight,
            {
                fontSize: 6.5
            }
        );

        y += rowHeight;
    });

    return y;
};

// =====================================================
// PERSONAL DETAILS
// =====================================================

const drawPersonalDetails = (
    doc,
    employee,
    startY
) => {
    const x = 30;

    const totalWidth =
        doc.page.width - 60;

    const labelWidth = 100;
    const valueWidth = 150;
    const labelWidth2 = 100;

    const valueWidth2 =
        totalWidth -
        labelWidth -
        valueWidth -
        labelWidth2;

    const rowHeight = 18;

    let y = startY;

    const rows = [
        [
            "DOJ",
            employee.doj ||
            employee.date_of_joining ||
            "",

            "UAN",
            employee.uan || ""
        ],

        [
            "Month Days",
            employee.monthDays ||
            employee.month_days ||
            30,

            "ESIC IP",
            employee.esicIp ||
            employee.esic_ip ||
            ""
        ],

        [
            "Payable Days",
            employee.payableDays ||
            employee.payable_days ||
            0,

            "DOB",
            employee.dob || ""
        ],

        [
            "PAN",
            employee.pan || "",

            "Aadhaar No.",
            employee.aadhaar ||
            employee.aadhaarNo ||
            employee.aadhar_no ||
            ""
        ],

        [
            "Bank Name",
            employee.bankName ||
            employee.bank_name ||
            "",

            "Account No.",
            employee.accountNo ||
            employee.account_no ||
            ""
        ],

        [
            "IFSC Code",
            employee.ifscCode ||
            employee.ifsc_code ||
            "",

            "Insurance No.",
            employee.insuranceNo ||
            employee.insurance_no ||
            ""
        ]
    ];

    rows.forEach(row => {
        drawCell(
            doc,
            row[0],
            x,
            y,
            labelWidth,
            rowHeight,
            {
                fontSize: 6.5,
                bold: true,
                fill: "#F1F1F1"
            }
        );

        drawCell(
            doc,
            row[1],
            x + labelWidth,
            y,
            valueWidth,
            rowHeight,
            {
                fontSize: 6.5
            }
        );

        drawCell(
            doc,
            row[2],
            x + labelWidth + valueWidth,
            y,
            labelWidth2,
            rowHeight,
            {
                fontSize: 6.5,
                bold: true,
                fill: "#F1F1F1"
            }
        );

        drawCell(
            doc,
            row[3],
            x +
            labelWidth +
            valueWidth +
            labelWidth2,
            y,
            valueWidth2,
            rowHeight,
            {
                fontSize: 6.5
            }
        );

        y += rowHeight;
    });

    return y;
};

// =====================================================
// LEAVE / ATTENDANCE
// =====================================================

const drawAttendance = (
    doc,
    employee,
    startY
) => {
    const x = 30;

    const totalWidth =
        doc.page.width - 60;

    const leftWidth =
        totalWidth / 2;

    const rightWidth =
        totalWidth - leftWidth;

    const rowHeight = 18;

    let y = startY;

    drawSectionTitle(
        doc,
        "LEAVE & ATTENDANCE DETAILS",
        x,
        y,
        totalWidth,
        18
    );

    y += 18;

    const rows = [
        [
            `Present Days : ${
                employee.presentDays ??
                employee.totalPresent ??
                0
            }`,

            `Work Days : ${
                employee.workDays ??
                employee.work_days ??
                employee.monthDays ??
                30
            }`
        ],

        [
            `Weekly Off : ${
                employee.weeklyOffs ??
                employee.weekOffs ??
                employee.totalWO ??
                0
            }`,

            `Paid Holiday : ${
                employee.paidHoliday ??
                0
            }`
        ],

        [
            `Paid Leave : ${
                employee.paidLeave ??
                0
            }`,

            `Absent Days : ${
                employee.absentDays ??
                employee.totalAbsent ??
                0
            }`
        ],

        [
            `PL : ${
                employee.pl ??
                employee.PL ??
                0
            }`,

            `SL : ${
                employee.sl ??
                employee.SL ??
                0
            }`
        ],

        [
            `CL : ${
                employee.cl ??
                employee.CL ??
                0
            }`,

            `OT Days : ${
                employee.otDays ??
                employee.ot_days ??
                0
            }`
        ]
    ];

    rows.forEach(row => {
        drawCell(
            doc,
            row[0],
            x,
            y,
            leftWidth,
            rowHeight,
            {
                fontSize: 6.5
            }
        );

        drawCell(
            doc,
            row[1],
            x + leftWidth,
            y,
            rightWidth,
            rowHeight,
            {
                fontSize: 6.5
            }
        );

        y += rowHeight;
    });

    return y;
};

// =====================================================
// SALARY TABLE
// =====================================================

const drawSalaryTable = (
    doc,
    employee,
    startY
) => {
    const x = 30;

    const width =
        doc.page.width - 60;

    const leftWidth =
        width / 2;

    const rightWidth =
        width - leftWidth;

    const earnNameWidth =
        leftWidth - 120;

    const rateWidth = 60;

    const earnedWidth = 60;

    const deductionNameWidth =
        rightWidth - 80;

    const deductionAmountWidth = 80;

    const rowHeight = 17;

    let y = startY;

    // TITLE

    drawSectionTitle(
        doc,
        "SALARY DETAILS",
        x,
        y,
        width,
        18
    );

    y += 18;

    // HEADER

    drawCell(
        doc,
        "EARNINGS",
        x,
        y,
        earnNameWidth,
        rowHeight,
        {
            fontSize: 6.5,
            bold: true,
            fill: "#E8E8E8"
        }
    );

    drawCell(
        doc,
        "RATE",
        x + earnNameWidth,
        y,
        rateWidth,
        rowHeight,
        {
            fontSize: 6.5,
            bold: true,
            align: "right",
            fill: "#E8E8E8"
        }
    );

    drawCell(
        doc,
        "EARNED",
        x +
        earnNameWidth +
        rateWidth,
        y,
        earnedWidth,
        rowHeight,
        {
            fontSize: 6.5,
            bold: true,
            align: "right",
            fill: "#E8E8E8"
        }
    );

    drawCell(
        doc,
        "DEDUCTIONS",
        x + leftWidth,
        y,
        deductionNameWidth,
        rowHeight,
        {
            fontSize: 6.5,
            bold: true,
            fill: "#E8E8E8"
        }
    );

    drawCell(
        doc,
        "AMOUNT",
        x +
        leftWidth +
        deductionNameWidth,
        y,
        deductionAmountWidth,
        rowHeight,
        {
            fontSize: 6.5,
            bold: true,
            align: "right",
            fill: "#E8E8E8"
        }
    );

    y += rowHeight;

    // EARNINGS

    const earnings = [
        {
            name: "Basic + VDA",
            rate:
                employee.basicVda ??
                employee.basicSalary ??
                0,

            earned:
                employee.earnedBasicDa ??
                employee.basicEarned ??
                employee.basicVda ??
                employee.basicSalary ??
                0
        },

        {
            name: "Special Allowance",
            rate:
                employee.specialAllowance ??
                0,

            earned:
                employee.specialAllowanceEarned ??
                employee.specialAllowance ??
                0
        },

        {
            name: "HRA",
            rate:
                employee.hra ??
                0,

            earned:
                employee.hraEarned ??
                employee.hra ??
                0
        },

        {
            name: "Other Allowance",
            rate:
                employee.otherAllowance ??
                0,

            earned:
                employee.otherAllowanceEarned ??
                employee.otherAllowance ??
                0
        },

        {
            name: "LWW",
            rate:
                employee.lww ??
                0,

            earned:
                employee.lwwEarned ??
                employee.lww ??
                0
        },

        {
            name: "Bonus",
            rate:
                employee.bonus ??
                0,

            earned:
                employee.bonusEarned ??
                employee.bonus ??
                0
        },

        {
            name: "OT Wages",
            rate:
                employee.otRate ??
                employee.otAllowance ??
                0,

            earned:
                employee.otAllowanceEarned ??
                employee.otAllowance ??
                0
        },

        {
            name: "Leave Wages",
            rate:
                employee.fixedLeaveWages ??
                0,

            earned:
                employee.earnedLeaveWages ??
                employee.fixedLeaveWages ??
                0
        },

        {
            name: "Uniform Wages",
            rate:
                employee.fixedUniformWages ??
                0,

            earned:
                employee.earnedUniformWages ??
                employee.fixedUniformWages ??
                0
        },

        {
            name: "Night Allowance",
            rate:
                employee.nightAllow ??
                0,

            earned:
                employee.earnedNightAllow ??
                employee.nightAllow ??
                0
        },

        {
            name: "Incentive",
            rate:
                employee.incentive ??
                0,

            earned:
                employee.earnedIncentive ??
                employee.incentive ??
                0
        },

        {
            name: "Any Other",
            rate:
                employee.anyOther ??
                0,

            earned:
                employee.earnedAnyOther ??
                employee.anyOther ??
                0
        }
    ];

    // DEDUCTIONS

    const deductions = [
        {
            name: "PF",
            amount:
                employee.pf ??
                employee.deductPf ??
                0
        },

        {
            name: "ESIC",
            amount:
                employee.esic ??
                employee.deductEsic ??
                0
        },

        {
            name: "PT",
            amount:
                employee.pt ??
                employee.deductPt ??
                0
        },

        {
            name: "LWF",
            amount:
                employee.lwf ??
                employee.deductLwf ??
                0
        },

        {
            name: "Advance",
            amount:
                employee.advance ??
                employee.deductAdvance ??
                0
        },

        {
            name: "Loan",
            amount:
                employee.loan ??
                employee.deductLoan ??
                0
        },

        {
            name: "Uniform",
            amount:
                employee.uniform ??
                employee.uniformId ??
                employee.deductUniform ??
                0
        },

        {
            name: "Recovery",
            amount:
                employee.recovery ??
                employee.deductRecovery ??
                0
        },

        {
            name: "Installment",
            amount:
                employee.installment ??
                employee.deductInstallment ??
                0
        },

        {
            name: "Other",
            amount:
                employee.deductOther ??
                0
        }
    ];

    const maxRows =
        Math.max(
            earnings.length,
            deductions.length
        );

    for (
        let i = 0;
        i < maxRows;
        i++
    ) {
        const earning =
            earnings[i] ||
            {
                name: "",
                rate: "",
                earned: ""
            };

        const deduction =
            deductions[i] ||
            {
                name: "",
                amount: ""
            };

        drawCell(
            doc,
            earning.name,
            x,
            y,
            earnNameWidth,
            rowHeight,
            {
                fontSize: 6
            }
        );

        drawCell(
            doc,
            earning.rate === ""
                ? ""
                : money(earning.rate),

            x + earnNameWidth,
            y,
            rateWidth,
            rowHeight,
            {
                fontSize: 6,
                align: "right"
            }
        );

        drawCell(
            doc,
            earning.earned === ""
                ? ""
                : money(earning.earned),

            x +
            earnNameWidth +
            rateWidth,

            y,

            earnedWidth,

            rowHeight,

            {
                fontSize: 6,
                align: "right"
            }
        );

        drawCell(
            doc,
            deduction.name,

            x + leftWidth,

            y,

            deductionNameWidth,

            rowHeight,

            {
                fontSize: 6
            }
        );

        drawCell(
            doc,

            deduction.amount === ""
                ? ""
                : money(deduction.amount),

            x +
            leftWidth +
            deductionNameWidth,

            y,

            deductionAmountWidth,

            rowHeight,

            {
                fontSize: 6,
                align: "right"
            }
        );

        y += rowHeight;
    }

    // TOTAL

    const totalEarning =
        employee.totalEarning ??
        employee.totalEarnings ??
        employee.grossSalary ??
        earnings.reduce(
            (sum, item) =>
                sum + num(item.earned),
            0
        );

    const totalDeduction =
        employee.totalDeduction ??
        deductions.reduce(
            (sum, item) =>
                sum + num(item.amount),
            0
        );

    drawCell(
        doc,
        "TOTAL EARNINGS",

        x,

        y,

        earnNameWidth +
        rateWidth,

        rowHeight,

        {
            fontSize: 6.5,
            bold: true,
            fill: "#E8E8E8"
        }
    );

    drawCell(
        doc,
        money(totalEarning),

        x +
        earnNameWidth +
        rateWidth,

        y,

        earnedWidth,

        rowHeight,

        {
            fontSize: 6.5,
            bold: true,
            align: "right",
            fill: "#E8E8E8"
        }
    );

    drawCell(
        doc,
        "TOTAL DEDUCTION",

        x + leftWidth,

        y,

        deductionNameWidth,

        rowHeight,

        {
            fontSize: 6.5,
            bold: true,
            fill: "#E8E8E8"
        }
    );

    drawCell(
        doc,
        money(totalDeduction),

        x +
        leftWidth +
        deductionNameWidth,

        y,

        deductionAmountWidth,

        rowHeight,

        {
            fontSize: 6.5,
            bold: true,
            align: "right",
            fill: "#E8E8E8"
        }
    );

    y += rowHeight;

    // NET SALARY

    const netSalary =
        employee.netSalary ??
        employee.netTakeHome ??
        employee.salaryPayable ??
        employee.netAmount ??
        (
            num(totalEarning) -
            num(totalDeduction)
        );

    drawCell(
        doc,
        "NET TAKE HOME",

        x,

        y,

        width * 0.70,

        22,

        {
            fontSize: 8,
            bold: true,
            fill: "#DCDCDC"
        }
    );

    drawCell(
        doc,
        money(netSalary),

        x +
        width * 0.70,

        y,

        width * 0.30,

        22,

        {
            fontSize: 8,
            bold: true,
            align: "right",
            fill: "#DCDCDC"
        }
    );

    return y + 22;
};

// =====================================================
// DAILY ATTENDANCE
// =====================================================

const drawDailyAttendance = (
    doc,
    employee,
    startY
) => {
    const attendance =
        employee.dailyAttendance ||
        employee.attendanceDetails ||
        employee.attendance ||
        [];

    if (
        !Array.isArray(attendance) ||
        attendance.length === 0
    ) {
        return startY;
    }

    const x = 30;

    const width =
        doc.page.width - 60;

    let y = startY;

    drawSectionTitle(
        doc,
        "DAILY ATTENDANCE DETAILS",
        x,
        y,
        width,
        18
    );

    y += 18;

    const columns = [
        {
            title: "Date",
            width: width * 0.25,
            key: "date"
        },

        {
            title: "Status",
            width: width * 0.20,
            key: "status"
        },

        {
            title: "Check In",
            width: width * 0.20,
            key: "checkIn"
        },

        {
            title: "Check Out",
            width: width * 0.20,
            key: "checkOut"
        },

        {
            title: "OT",
            width: width * 0.15,
            key: "ot"
        }
    ];

    // HEADER

    let xx = x;

    columns.forEach(column => {
        drawCell(
            doc,
            column.title,
            xx,
            y,
            column.width,
            18,
            {
                fontSize: 6.5,
                bold: true,
                fill: "#E8E8E8",
                align: "center"
            }
        );

        xx += column.width;
    });

    y += 18;

    attendance.forEach(item => {
        xx = x;

        columns.forEach(column => {
            let value =
                item[column.key];

            if (
                column.key === "date"
            ) {
                value =
                    item.date ||
                    item.attendanceDate ||
                    item.check_in_date ||
                    "";
            }

            if (
                column.key === "checkIn"
            ) {
                value =
                    item.checkIn ||
                    item.check_in ||
                    "";
            }

            if (
                column.key === "checkOut"
            ) {
                value =
                    item.checkOut ||
                    item.check_out ||
                    "";
            }

            if (
                column.key === "ot"
            ) {
                value =
                    item.ot ||
                    item.otHours ||
                    item.overtime ||
                    0;
            }

            drawCell(
                doc,
                value,
                xx,
                y,
                column.width,
                17,
                {
                    fontSize: 6,
                    align: "center"
                }
            );

            xx += column.width;
        });

        y += 17;
    });

    return y;
};

// =====================================================
// EMPLOYEE FOOTER
// =====================================================

const drawEmployeeFooter = (
    doc,
    pageNumber = 1,
    totalPages = 1
) => {
    const footerY =
        doc.page.height - 25;

    doc
        .font("Helvetica")
        .fontSize(6)
        .fillColor("#555555")
        .text(
            "This is a computer generated salary slip.",
            30,
            footerY,
            {
                width: 300,
                align: "left"
            }
        );

    doc.text(
        `Page ${pageNumber} of ${totalPages}`,
        doc.page.width - 140,
        footerY,
        {
            width: 110,
            align: "right"
        }
    );
};

// =====================================================
// EMPLOYEE PDF
// =====================================================

const generateEmployeePdf = async (employee) => {

    console.log("\n========================================");
    console.log("STARTING EMPLOYEE PDF GENERATION");
    console.log("========================================");

    try {

        console.log("Employee Data:", employee);

        console.log("Creating directories...");

        await createDirectories();

        console.log("Directories created successfully.");

        const employeeCode = safeString(
            employee.employeeCode || employee.employee_code,
            "employee"
        );

        const employeeName = safeString(
            employee.employeeName || employee.employee_name,
            "employee"
        );

        const month = safeString(
            employee.month || employee.at_month,
            "month"
        );

        const year = safeString(
            employee.year || employee.at_year,
            "year"
        );

        const folderName =
            `${employeeCode}_${employeeName}_${month}_${year}`;

        const folder = path.join(
            EMPLOYEE_PDF_DIR,
            folderName
        );

        console.log("Employee Folder:", folder);

        await fs.promises.mkdir(folder, {
            recursive: true
        });

        console.log("Employee folder created successfully.");

        const fileName =
            `Salary_${employeeCode}_${month}_${year}.pdf`;

        const filePath = path.join(
            folder,
            fileName
        );

        console.log("PDF File Path:", filePath);

        const relativePath = path.join(
            "uploads",
            "salary-pdf",
            "employees",
            folderName,
            fileName
        ).replace(/\\/g, "/");

        const salarySlipUrl =
            `${getBaseUrl()}/${relativePath}`;

        console.log("PDF URL:", salarySlipUrl);

        return new Promise((resolve, reject) => {

            let doc;
            let stream;

            try {

                console.log("Creating PDFDocument...");

                doc = new PDFDocument({
                    size: "A4",
                    margin: 30,
                    bufferPages: true
                });

                console.log("PDFDocument created successfully.");

                stream = fs.createWriteStream(filePath);

                console.log("Write stream created.");

                // =====================================
                // STREAM EVENTS
                // =====================================

                stream.on("error", (error) => {

                    console.error("\n❌ PDF STREAM ERROR");
                    console.error("Message:", error.message);
                    console.error("Stack:", error.stack);

                    reject(error);
                });

                stream.on("finish", () => {

                    console.log("\n========================================");
                    console.log("✅ EMPLOYEE PDF CREATED SUCCESSFULLY");
                    console.log("========================================");

                    console.log("File Path:", filePath);
                    console.log("File Exists:", fs.existsSync(filePath));

                    if (fs.existsSync(filePath)) {

                        const stats =
                            fs.statSync(filePath);

                        console.log(
                            "File Size:",
                            stats.size,
                            "bytes"
                        );

                    }

                    console.log(
                        "Salary Slip URL:",
                        salarySlipUrl
                    );

                    resolve({
                        success: true,
                        filePath,
                        relativePath,
                        salary_slip_url: salarySlipUrl
                    });
                });

                // =====================================
                // DOCUMENT ERROR
                // =====================================

                doc.on("error", (error) => {

                    console.error("\n❌ PDF DOCUMENT ERROR");
                    console.error("Message:", error.message);
                    console.error("Stack:", error.stack);

                    reject(error);
                });

                // =====================================
                // PIPE
                // =====================================

                doc.pipe(stream);

                console.log("PDF piped to write stream.");

                let y = 30;

                console.log(
                    "Calling drawCompanyHeader..."
                );

                y = drawCompanyHeader(
                    doc,
                    employee,
                    y
                );

                console.log(
                    "drawCompanyHeader completed. Y:",
                    y
                );

                // =====================================
                // EMPLOYEE DETAILS
                // =====================================

                console.log(
                    "Calling drawEmployeeDetails..."
                );

                y = drawEmployeeDetails(
                    doc,
                    employee,
                    y
                );

                console.log(
                    "drawEmployeeDetails completed. Y:",
                    y
                );

                y += 5;

                // =====================================
                // PERSONAL DETAILS
                // =====================================

                console.log(
                    "Calling drawPersonalDetails..."
                );

                y = drawPersonalDetails(
                    doc,
                    employee,
                    y
                );

                console.log(
                    "drawPersonalDetails completed. Y:",
                    y
                );

                y += 5;

                // =====================================
                // ATTENDANCE
                // =====================================

                console.log(
                    "Calling drawAttendance..."
                );

                y = drawAttendance(
                    doc,
                    employee,
                    y
                );

                console.log(
                    "drawAttendance completed. Y:",
                    y
                );

                y += 7;

                // =====================================
                // SALARY TABLE
                // =====================================

                console.log(
                    "Calling drawSalaryTable..."
                );

                if (
                    typeof drawSalaryTable !==
                    "function"
                ) {

                    throw new Error(
                        "drawSalaryTable is not defined!"
                    );

                }

                y = drawSalaryTable(
                    doc,
                    employee,
                    y
                );

                console.log(
                    "drawSalaryTable completed. Y:",
                    y
                );

                // =====================================
                // DAILY ATTENDANCE
                // =====================================

                y += 8;

                console.log(
                    "Calling drawDailyAttendance..."
                );

                if (
                    typeof drawDailyAttendance !==
                    "function"
                ) {

                    throw new Error(
                        "drawDailyAttendance is not defined!"
                    );

                }

                y = drawDailyAttendance(
                    doc,
                    employee,
                    y
                );

                console.log(
                    "drawDailyAttendance completed. Y:",
                    y
                );

                // =====================================
                // FOOTER
                // =====================================

                console.log("Drawing footer...");

                doc
                    .font("Helvetica")
                    .fontSize(6)
                    .fillColor("#555555")
                    .text(
                        "This is a computer generated salary slip.",
                        30,
                        doc.page.height - 28,
                        {
                            width:
                                doc.page.width - 60,

                            align: "center"
                        }
                    );

                console.log(
                    "Ending PDF document..."
                );

                doc.end();

            } catch (error) {

                console.error(
                    "\n========================================"
                );

                console.error(
                    "❌ EMPLOYEE PDF GENERATION ERROR"
                );

                console.error(
                    "========================================"
                );

                console.error(
                    "Error Name:",
                    error.name
                );

                console.error(
                    "Error Message:",
                    error.message
                );

                console.error(
                    "Error Stack:",
                    error.stack
                );

                if (doc) {

                    try {
                        doc.end();
                    } catch (e) {
                        console.error(
                            "Error closing document:",
                            e.message
                        );
                    }

                }

                reject(error);
            }

        });

    } catch (error) {

        console.error(
            "\n========================================"
        );

        console.error(
            "❌ INITIAL PDF SETUP ERROR"
        );

        console.error(
            "========================================"
        );

        console.error(
            "Error Name:",
            error.name
        );

        console.error(
            "Error Message:",
            error.message
        );

        console.error(
            "Error Stack:",
            error.stack
        );

        throw error;
    }
};

// =====================================================
// SITE EMPLOYEE ROWS
// =====================================================

const getSiteEmployeeRows = (
    data
) => {
    const employees =
        Array.isArray(
            data.employees
        )
            ? data.employees
            : [];

    return employees.map(
        (
            employee,
            index
        ) => ({
            srNo: index + 1,

            name:
                employee.employeeName ||
                employee.employee_name ||
                "",

            employeeCode:
                employee.employeeCode ||
                employee.employee_code ||
                "",

            gross:
                employee.gross ??
                employee.grossSalary ??
                employee.totalEarning ??
                0,

            post:
                employee.rank ||
                employee.designation ||
                "",

            dp:
                employee.totalCount ??
                employee.presentDays ??
                employee.totalPresent ??
                0,

            salary:
                employee.salary ??
                employee.basicSalary ??
                employee.basicVda ??
                0,

            other:
                employee.other ??
                employee.otherAllowance ??
                0,

            advance:
                employee.advance ??
                employee.deductAdvance ??
                0,

            pf:
                employee.pf ??
                employee.deductPf ??
                0,

            esic:
                employee.esic ??
                employee.deductEsic ??
                0,

            pt:
                employee.pt ??
                employee.deductPt ??
                0,

            unf:
                employee.unf ??
                employee.uniformId ??
                employee.deductUniform ??
                0,

            rc:
                employee.rc ??
                employee.deductRecovery ??
                0,

            fine:
                employee.fine ??
                0,

            installment:
                employee.installment ??
                employee.deductInstallment ??
                0,

            totalDeduction:
                employee.totalDeduction ??
                0,

            netAmount:
                employee.netAmount ??
                employee.netSalary ??
                employee.netTakeHome ??
                0,

            accountHolder:
                employee.accountHolder ||
                employee.accountHolderName ||
                "",

            bankName:
                employee.bankName ||
                "",

            cardNo:
                employee.cardNo ||
                employee.accountNo ||
                "",

            sign: ""
        })
    );
};

// =====================================================
// SITE COLUMNS
// =====================================================

const getSiteColumns = () => {
    return [
        {
            title: "Sr",
            key: "srNo",
            width: 18,
            align: "center"
        },

        {
            title: "Name",
            key: "name",
            width: 75
        },

        {
            title: "ID",
            key: "employeeCode",
            width: 38
        },

        {
            title: "Gross",
            key: "gross",
            width: 45,
            align: "right",
            value: row =>
                money(row.gross)
        },

        {
            title: "Post",
            key: "post",
            width: 52
        },

        {
            title: "DP",
            key: "dp",
            width: 25,
            align: "center"
        },

        {
            title: "Salary",
            key: "salary",
            width: 45,
            align: "right",
            value: row =>
                money(row.salary)
        },

        {
            title: "Other",
            key: "other",
            width: 38,
            align: "right",
            value: row =>
                money(row.other)
        },

        {
            title: "Adv",
            key: "advance",
            width: 38,
            align: "right",
            value: row =>
                money(row.advance)
        },

        {
            title: "PF",
            key: "pf",
            width: 32,
            align: "right",
            value: row =>
                money(row.pf)
        },

        {
            title: "ESIC",
            key: "esic",
            width: 35,
            align: "right",
            value: row =>
                money(row.esic)
        },

        {
            title: "PT",
            key: "pt",
            width: 30,
            align: "right",
            value: row =>
                money(row.pt)
        },

        {
            title: "UNF",
            key: "unf",
            width: 30,
            align: "right",
            value: row =>
                money(row.unf)
        },

        {
            title: "RC",
            key: "rc",
            width: 30,
            align: "right",
            value: row =>
                money(row.rc)
        },

        {
            title: "Fine",
            key: "fine",
            width: 30,
            align: "right",
            value: row =>
                money(row.fine)
        },

        {
            title: "IS",
            key: "installment",
            width: 30,
            align: "right",
            value: row =>
                money(row.installment)
        },

        {
            title: "TTL Ded",
            key: "totalDeduction",
            width: 40,
            align: "right",
            value: row =>
                money(row.totalDeduction)
        },

        {
            title: "Net",
            key: "netAmount",
            width: 45,
            align: "right",
            value: row =>
                money(row.netAmount)
        }
    ];
};

// =====================================================
// DRAW TABLE HEADER
// =====================================================

const drawTableHeader = (
    doc,
    columns,
    startX,
    startY,
    height = 22
) => {
    let x = startX;

    columns.forEach(column => {
        drawCell(
            doc,
            column.title,
            x,
            startY,
            column.width,
            height,
            {
                fontSize: 5.5,
                bold: true,
                align:
                    column.align ||
                    "left",

                fill: "#E8E8E8"
            }
        );

        x += column.width;
    });

    return startY + height;
};

// =====================================================
// DRAW SITE ROW
// =====================================================

const drawSiteRow = (
    doc,
    columns,
    row,
    startX,
    startY,
    height = 17
) => {
    let x = startX;

    columns.forEach(column => {
        const value =
            typeof column.value ===
            "function"
                ? column.value(row)
                : row[column.key];

        drawCell(
            doc,
            value,
            x,
            startY,
            column.width,
            height,
            {
                fontSize: 5.2,

                align:
                    column.align ||
                    "left"
            }
        );

        x += column.width;
    });

    return startY + height;
};

// =====================================================
// CALCULATE SITE TOTAL
// =====================================================

const calculateSiteTotal = (
    rows
) => {
    const fields = [
        "gross",
        "salary",
        "other",
        "advance",
        "pf",
        "esic",
        "pt",
        "unf",
        "rc",
        "fine",
        "installment",
        "totalDeduction",
        "netAmount"
    ];

    const total = {};

    fields.forEach(field => {
        total[field] = 0;
    });

    total.dp = 0;

    rows.forEach(row => {
        fields.forEach(field => {
            total[field] +=
                num(row[field]);
        });

        total.dp +=
            num(row.dp);
    });

    return total;
};

// =====================================================
// DRAW SITE TOTAL
// =====================================================

const drawSiteTotal = (
    doc,
    columns,
    total,
    startX,
    startY
) => {
    let x = startX;

    columns.forEach(column => {
        let value = "";

        if (
            column.key === "name"
        ) {
            value = "TOTAL";
        }

        if (
            column.key === "dp"
        ) {
            value =
                num(total.dp).toFixed(1);
        }

        if (
            [
                "gross",
                "salary",
                "other",
                "advance",
                "pf",
                "esic",
                "pt",
                "unf",
                "rc",
                "fine",
                "installment",
                "totalDeduction",
                "netAmount"
            ].includes(
                column.key
            )
        ) {
            value =
                money(
                    total[column.key]
                );
        }

        drawCell(
            doc,
            value,
            x,
            startY,
            column.width,
            20,
            {
                fontSize: 5.5,

                bold: true,

                align:
                    column.align ||
                    "left",

                fill: "#DCDCDC"
            }
        );

        x += column.width;
    });

    return startY + 20;
};

// =====================================================
// SITE HEADER
// =====================================================

const drawSiteHeader = (
    doc,
    data,
    startY = 20
) => {
    let y =
        drawCompanyHeader(
            doc,
            {
                companyName:
                    data.companyName ||
                    data.billingCompanyName ||
                    data.billingCompany?.name ||
                    data.billingCompany?.companyName ||
                    "EKODEX TECHNOLOGIES PVT LTD",

                companyAddress:
                    data.companyAddress ||
                    data.billingCompanyAddress ||
                    data.billingCompany?.address ||
                    "",

                month:
                    data.month,

                year:
                    data.year
            },

            startY
        );

    const x = 20;

    const width =
        doc.page.width - 40;

    const h = 20;

    drawCell(
        doc,

        `SITE: ${
            displayValue(
                data.siteName ||
                data.site_name
            )
        }`,

        x,

        y,

        width * 0.40,

        h,

        {
            fontSize: 6.5,
            bold: true,
            fill: "#F1F1F1"
        }
    );

    drawCell(
        doc,

        `CLIENT: ${
            displayValue(
                data.clientName ||
                data.client_name
            )
        }`,

        x + width * 0.40,

        y,

        width * 0.30,

        h,

        {
            fontSize: 6.5,
            bold: true,
            fill: "#F1F1F1"
        }
    );

    drawCell(
        doc,

        `MONTH: ${
            displayValue(data.month)
        }`,

        x + width * 0.70,

        y,

        width * 0.15,

        h,

        {
            fontSize: 6,
            bold: true,
            align: "center",
            fill: "#F1F1F1"
        }
    );

    drawCell(
        doc,

        `YEAR: ${
            displayValue(data.year)
        }`,

        x + width * 0.85,

        y,

        width * 0.15,

        h,

        {
            fontSize: 6,
            bold: true,
            align: "center",
            fill: "#F1F1F1"
        }
    );

    return y + 25;
};

// =====================================================
// SITE FOOTER
// =====================================================

const drawSiteFooter = (
    doc,
    pageNumber,
    totalPages
) => {
    const y =
        doc.page.height - 20;

    doc
        .font("Helvetica")
        .fontSize(5.5)
        .fillColor("#555555")
        .text(
            "This is a computer generated salary sheet.",
            20,
            y,
            {
                width: 300
            }
        );

    doc.text(
        `Page ${pageNumber} of ${totalPages}`,
        doc.page.width - 110,
        y,
        {
            width: 90,
            align: "right"
        }
    );
};

// =====================================================
// SITE PDF
// =====================================================

const generateSitePdf = async (
    data
) => {
    await createDirectories();

    const folder =
        getSiteFolder(data);

    await fs.promises.mkdir(
        folder,
        {
            recursive: true
        }
    );

    const siteId =
        safeString(
            data.siteId ||
            data.site_id,
            "site"
        );

    const siteName =
        safeString(
            data.siteName ||
            data.site_name,
            "site"
        );

    const month =
        safeString(
            data.month,
            "month"
        );

    const year =
        safeString(
            data.year,
            "year"
        );

    const fileName =
        `Site_Salary_${siteId}_${month}_${year}.pdf`;

    const filePath =
        path.join(
            folder,
            fileName
        );

    const relativePath =
        path.join(
            "uploads",
            "salary-pdf",
            "sites",

            `${siteId}_${siteName}_${month}_${year}`,

            fileName
        ).replace(/\\/g, "/");

    const salarySheetUrl =
        `${getBaseUrl()}/${relativePath}`;

    return new Promise(
        (
            resolve,
            reject
        ) => {
            try {
                const doc =
                    new PDFDocument({
                        size: "A4",
                        layout: "landscape",
                        margin: 20,
                        bufferPages: true
                    });

                const stream =
                    fs.createWriteStream(
                        filePath
                    );

                doc.pipe(stream);

                const rows =
                    getSiteEmployeeRows(
                        data
                    );

                const columns =
                    getSiteColumns();

                const startX = 20;

                const rowHeight = 17;

                const headerHeight = 22;

                const pageBottom =
                    doc.page.height - 35;

                let y =
                    drawSiteHeader(
                        doc,
                        data,
                        20
                    );

                y =
                    drawSectionTitle(
                        doc,
                        "EMPLOYEE SALARY DETAILS",
                        startX,
                        y,
                        doc.page.width - 40,
                        18
                    );

                y += 2;

                // TABLE HEADER

                y =
                    drawTableHeader(
                        doc,
                        columns,
                        startX,
                        y,
                        headerHeight
                    );

                // EMPLOYEE ROWS

                rows.forEach(row => {
                    if (
                        y +
                        rowHeight >
                        pageBottom
                    ) {
                        doc.addPage();

                        y =
                            drawSiteHeader(
                                doc,
                                data,
                                20
                            );

                        y =
                            drawSectionTitle(
                                doc,
                                "EMPLOYEE SALARY DETAILS - CONTINUED",
                                startX,
                                y,
                                doc.page.width - 40,
                                18
                            );

                        y += 2;

                        y =
                            drawTableHeader(
                                doc,
                                columns,
                                startX,
                                y,
                                headerHeight
                            );
                    }

                    y =
                        drawSiteRow(
                            doc,
                            columns,
                            row,
                            startX,
                            y,
                            rowHeight
                        );
                });

                // TOTAL

                const total =
                    calculateSiteTotal(
                        rows
                    );

                if (
                    y + 25 >
                    pageBottom
                ) {
                    doc.addPage();

                    y =
                        drawSiteHeader(
                            doc,
                            data,
                            20
                        );

                    y =
                        drawTableHeader(
                            doc,
                            columns,
                            startX,
                            y + 5,
                            headerHeight
                        );
                }

                y =
                    drawSiteTotal(
                        doc,
                        columns,
                        total,
                        startX,
                        y + 3
                    );

                // PAYMENT SUMMARY

                if (
                    y + 90 >
                    pageBottom
                ) {
                    doc.addPage();

                    y =
                        drawSiteHeader(
                            doc,
                            data,
                            20
                        );
                }

                y += 7;

                y =
                    drawSectionTitle(
                        doc,
                        "SALARY PAYMENT SUMMARY",
                        startX,
                        y,
                        doc.page.width - 40,
                        18
                    );

                y += 5;

                const totalNet =
                    rows.reduce(
                        (sum, row) =>
                            sum +
                            num(
                                row.netAmount
                            ),
                        0
                    );

                const totalDed =
                    rows.reduce(
                        (sum, row) =>
                            sum +
                            num(
                                row.totalDeduction
                            ),
                        0
                    );

                const totalGross =
                    rows.reduce(
                        (sum, row) =>
                            sum +
                            num(
                                row.gross
                            ),
                        0
                    );

                const summary = [
                    [
                        "TOTAL EMPLOYEES",
                        rows.length
                    ],

                    [
                        "TOTAL GROSS",
                        money(totalGross)
                    ],

                    [
                        "TOTAL DEDUCTION",
                        money(totalDed)
                    ],

                    [
                        "TOTAL NET SALARY",
                        money(totalNet)
                    ]
                ];

                const availableWidth =
                    doc.page.width - 40;

                const boxWidth =
                    availableWidth /
                    summary.length;

                summary.forEach(
                    (
                        item,
                        index
                    ) => {
                        const xx =
                            startX +
                            (
                                index *
                                boxWidth
                            );

                        drawCell(
                            doc,
                            item[0],
                            xx,
                            y,
                            boxWidth,
                            20,
                            {
                                fontSize: 6,
                                bold: true,
                                align: "center",
                                fill: "#E8E8E8"
                            }
                        );

                        drawCell(
                            doc,
                            item[1],
                            xx,
                            y + 20,
                            boxWidth,
                            25,
                            {
                                fontSize: 7,
                                bold: true,
                                align: "right"
                            }
                        );
                    }
                );

                // =================================================
                // FOOTERS
                // =================================================

                const range =
                    doc.bufferedPageRange();

                for (
                    let i = 0;
                    i < range.count;
                    i++
                ) {
                    doc.switchToPage(i);

                    drawSiteFooter(
                        doc,
                        i + 1,
                        range.count
                    );
                }

                doc.end();

                stream.on(
                    "finish",
                    () => {
                        console.log(
                            "================================="
                        );

                        console.log(
                            "SITE PDF CREATED"
                        );

                        console.log(
                            filePath
                        );

                        console.log(
                            "SITE PDF URL"
                        );

                        console.log(
                            salarySheetUrl
                        );

                        console.log(
                            "================================="
                        );

                        resolve({
                            success: true,

                            filePath,

                            relativePath,

                            salary_slip_url:
                                salarySheetUrl,

                            salary_sheet_url:
                                salarySheetUrl,

                            totalPages:
                                range.count
                        });
                    }
                );

                stream.on(
                    "error",
                    error => {
                        console.error(
                            "SITE PDF STREAM ERROR:",
                            error
                        );

                        reject(error);
                    }
                );
            } catch (error) {
                console.error(
                    "SITE PDF ERROR:",
                    error
                );

                reject(error);
            }
        }
    );
};

// =====================================================
// EXPORT
// =====================================================

module.exports = {
    createDirectories,

    generateEmployeePdf,

    generateSitePdf
};