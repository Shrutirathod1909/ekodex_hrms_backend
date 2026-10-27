const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
const logger = require("./utils/logger");
dotenv.config();

const app = express();

// ======================
// DATABASE CONNECTION
// ======================
try {
  const { poolPromise } = require("./config/db");

  poolPromise
    .then(() => {
      console.log("✅ Database Connected Successfully");
    })
    .catch((err) => {
      console.log("❌ Database Connection Failed:", err);
    });
} catch (error) {
  console.log("❌ db.js file not found inside config folder");
  console.log(error.message);
}

// ======================
// MIDDLEWARE
// ======================
app.use(
  cors({
    // origin: ["https://hrms.odspspl.com"],
    // origin: ["https://hrms.myapplications.co.in"],
    origin: ["http://localhost:5173"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

// ======================
// GLOBAL API PATH LOGGER (Layer 1)
// Prints every incoming request to terminal for path tracing
// ======================
app.use((req, res, next) => {
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);

  process.stdout.write(
    `\n\x1b[45m [API HIT] \x1b[0m \x1b[32m${req.method}\x1b[0m \x1b[36m${req.originalUrl}\x1b[0m  [${timestamp}]\n`,
  );

  // Log body for write operations
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const bodyCopy = { ...req.body };
    // Mask password if present
    if (bodyCopy.password) bodyCopy.password = "***";
    process.stdout.write(`\x1b[90m[BODY] ${JSON.stringify(bodyCopy)}\x1b[0m\n`);
  }

  next();
});

app.use((req, res, next) => {
  // res.header("Access-Control-Allow-Origin", "https://hrms.odspspl.com");
  // res.header("Access-Control-Allow-Origin", "https://hrms.myapplications.co.in");
  res.header("Access-Control-Allow-Origin", "http://localhost:5173");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept",
  );
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ======================
// STATIC FOLDER
// ======================
// Upload folder is configured via .env:
//   Local:      UPLOAD_FOLDER=uploads       â†’ serves from ./uploads/
//   Production: UPLOAD_FOLDER=profilephoto  â†’ serves from ./profilephoto/
// Both are served at the same URL: /api/uploads/
// ======================
const UPLOAD_FOLDER = process.env.DOC_BASE_URL || "api";
// const uploadFolderPath = path.join(__dirname, UPLOAD_FOLDER);
const fs = require("fs");

// ======================
// ROUTES IMPORT
// ======================
const authRoutes = require("./routes/authRoutes");
const companyRoutes = require("./routes/companyRoutes");
const branchRoutes = require("./routes/branchRoutes");
const permissionRoutes = require("./routes/permissionRoutes");
const roleRoutes = require("./routes/roleRoutes");
const userRoutes = require("./routes/userRoutes");
const clientRoutes = require("./routes/clientRoutes");
const chargesRoutes = require("./routes/chargesRoutes");
const empTypeRoutes = require("./routes/employeeTypeRoutes");
const employeeRoutes = require("./routes/employeeRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const pincodeRoutes = require("./routes/pincodeRoutes");
const attendanceInvoiceRoutes = require("./routes/attendanceInvoiceRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const clientOtherInfoRoutes = require("./routes/clientOtherInfoRoutes");
const clientServiceChargesRoutes = require("./routes/clientServiceChargesRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const productRoutes = require("./routes/productRoutes");
const purchaseOrderRoutes = require("./routes/purchaseOrderRoutes");
const grnRoutes = require("./routes/grnRoutes");
const hsnRoutes = require("./routes/hsnRoutes");
const uomRoutes = require("./routes/unitRoutes");
const holidayRoutes = require("./routes/holidayRoutes");
const frogetRoutes = require("./routes/frogetRoutes");
const equipmentRoutes = require("./routes/equipmentRoutes");
const zoneRoutes = require("./routes/zoneMasterRoutes");
const RaiseTicket = require("./routes/raiseTicketRoutes");
const billingRoutes = require("./routes/billingRoutes");

const salaryWagesRoutes = require("./routes/salary_wages_routes");
const bankTrfSheetRoutes = require("./routes/bank_trf_sheet_routes");

const dashboardRoutes = require("./routes/dashboardRoutes");

// const salaryDeductionRoutes = require("./routes/salaryDeductionRoutes");
// const salaryTemplateRoutes = require("./routes/salaryTemplateRoutes");
// const salaryEarningRoutes = require("./routes/salaryEarningRoutes");

const voucherRoutes = require("./routes/Voucherroutes");
const singlePaySlipRoutes = require("./routes/single_pay_silp_routes");
const pfRoutes = require("./routes/csvPf.routes");
const esicRoutes = require("./routes/esic.routes");
const misRoutes = require("./routes/misRoutes");
const ledgerRoutes = require("./routes/ledger.routes");
const newJoineeRoutes = require("./routes/new_joinee_Routes");
const invoiceCompanyRoutes = require("./routes/invoiceCompanyRoutes");
const salaryUpdateRoutes = require("./routes/salaryUpdateRoutes");
const salaryDeductionRoutes = require("./routes/salaryDeductionRoutes");
const salaryTemplateRoutes = require("./routes/salaryTemplateRoutes");
const salaryEarningRoutes = require("./routes/salaryEarningRoutes");
const clientwiseAttendanceRoutes = require("./routes/clientwise_attendance_routes");
const salaryRoutes = require("./routes/salaryRoutes");
const documentVerificationRoutes = require("./routes/documentVerificationRoute");
//holyday master routes
const holidayMasterRoutes = require("./routes/holidayMasterRoutes");

const employeeSiteRoutes = require("./routes/employeesite.routes");

const employeeLeaveRoutes = require("./routes/employeeLeaveRoutes");

const employeeLeavesRoutes = require("./routes/employeeLeavesRoutes");

const employeeLoginCoordinatesRoutes = require(
  "./routes/employeeLoginCoordinatesRoutes"
);

app.use(
  "/api/employee-login-coordinates",
  employeeLoginCoordinatesRoutes
);

app.use(
  "/salary_slip",
  express.static(path.join(__dirname, "uploads/salary_slip")),
);

const attendanceReportRoutes = require("./routes/attendanceReportRoutes");
app.use("/api/attendance", attendanceReportRoutes);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/products", express.static(path.join(__dirname, "../frontend/api")));
app.use("/api/salary-deduction", salaryDeductionRoutes);
app.use("/api/salary-earning", salaryEarningRoutes);
app.use("/api/salary-templates", salaryTemplateRoutes);
app.use("/api/salary-update", salaryUpdateRoutes);
app.use("/api/clientwise-attendance", clientwiseAttendanceRoutes);

// app.use("/api/employeewise-uniform", employeewiseUniformIssuedRoutes);
// app.use("/api/inventory-report", inventoryReportRoutes);

// app.use("/api/stock", stockRoutes);
// app.use("/api/vouchers", voucherRoutes);
// app.use("/api/grn-payment", grnPaymentRoutes);
// app.use("/api/good-received", goodReceivedRoutes);

// app.use("/api/uniform", uniformIssueRoutes);
// app.use("/api/purchase-orders", purchaseOrderBulkRoutes);

app.use("/api/new-joinee", newJoineeRoutes);
app.use("/api", ledgerRoutes);
app.use("/api", misRoutes);

app.use("/api/esic", esicRoutes);
app.use("/api/pf", pfRoutes);
app.use("/api", bankTrfSheetRoutes);
app.use("/api/document-verification", documentVerificationRoutes);
app.use("/api/payslip", singlePaySlipRoutes);

// ======================
// API ROUTES
// ======================
//-------
app.use("/api/auth", authRoutes);
app.use("/api/hsn-code", hsnRoutes);
app.use("/api/uom", uomRoutes);
app.use("/api", pincodeRoutes);
//-------
app.use("/api/froget", frogetRoutes);
//-------
app.use("/api/invoice-company", invoiceCompanyRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/users", userRoutes);
app.use("/api/zones", zoneRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/charges", chargesRoutes);
app.use("/api/client-other-info", clientOtherInfoRoutes);
app.use("/api/employee-types", empTypeRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/employees-site", employeeSiteRoutes);
app.use("/api/client-service-charges", clientServiceChargesRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/products", productRoutes);
app.use("/api/purchase-orders", purchaseOrderRoutes);
app.use("/api/grn", grnRoutes);
app.use("/api/dashboard", dashboardRoutes);
//-------
// app.use("/api/salary-deduction", salaryDeductionRoutes);
// app.use("/api/salary-earning", salaryEarningRoutes);
// app.use("/api/salary-templates", salaryTemplateRoutes);
//-------

app.use("/api", bankTrfSheetRoutes);
app.use("/api", billingRoutes);

app.use("/api", salaryWagesRoutes);

// app.use("/api/salary-deduction", salaryDeductionRoutes);

app.use("/api/equipment", equipmentRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/billing", invoiceRoutes);
app.use("/api/raise_ticket", RaiseTicket);
app.use("/api/employee-leaves", employeeLeavesRoutes);
app.use("/api/employee-leave", employeeLeaveRoutes);
app.use("/api/vouchers", voucherRoutes);

// holiday master routes
app.use("/api/holiday-master", holidayMasterRoutes);

app.use("/api/salary", salaryRoutes);

app.use("/api", express.static("api"));

// ======================
// DEFAULT ROUTE
// ======================
app.get("/", (req, res) => {
  res.send("🚀 HRMS Backend Running Successfully");
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API Route Not Found",
  });
});

// ======================
// SERVER
// ======================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
