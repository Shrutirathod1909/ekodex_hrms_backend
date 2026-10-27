const express = require("express");
const router = express.Router();
const {
  createInvoice,
  generateFinal,
  billingIndex,
  searchBills,
  resetSearchBills,
  printInvoice,
  downloadWagesTemplate,
  removeBilling,
  getBillByAutoNo,
  updateBill,
  generateBill,
  generateTransportBill,
  getTransportBillById,
  updateTransportBill,
  receivePayment,
    getPaymentHistory,
    changeInvoice,
    downloadBillingExcel,
    searchSuggestions
} = require("../controllers/invoiceController");
const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");
// POST /invoice/create?site=&m=&y=&type=
// Body: { no_ofdays_billing: 'WithSunday' | 'AsPerBillingContract' | 'WorkingDays' }

router.use(authMiddleware);
router.post("/create", authMiddleware, createInvoice);

router.post(
  "/generate-final",
  upload.any(),
  (req, res, next) => {
    console.log(req.files);
    next();
  },
  generateFinal,
);

router.post(
  "/update-transport-bill/:autoNo",
  authMiddleware,
  updateTransportBill
);
router.post(
    "/receive-payment",
    authMiddleware,
    receivePayment
);
router.get(
"/search-suggestions",
authMiddleware,
searchSuggestions
);
router.post("/generate-bill", authMiddleware, generateBill);

router.post("/generate-transport-bill", authMiddleware, generateTransportBill);
router.get(
  "/get-transport-bill/:id",
  authMiddleware,
 getTransportBillById
);
router.get(
"/download-excel",
authMiddleware,
downloadBillingExcel
);
router.get("/", billingIndex);
router.get(
  "/get-bill/:autoNo",
  authMiddleware,
getBillByAutoNo
);

router.get(

    "/payment-history",

    authMiddleware,

    getPaymentHistory

);
// Update bill
router.post(
  "/update-bill/:autoNo",
  authMiddleware,
 updateBill
);

router.post(
  "/change-invoice",
  authMiddleware,
  changeInvoice
);
router.post("/search", searchBills);

router.get("/reset", resetSearchBills);

router.get("/print-invoice/:autoNo", authMiddleware, printInvoice);

router.get("/download-template", authMiddleware, downloadWagesTemplate);

router.delete("/remove", authMiddleware, removeBilling);

module.exports = router;
// const express =
//   require("express");

// const router =
//   express.Router();

// const invoiceController =
//   require(
//     "../controllers/invoiceController"
//   );


// /*
//   CREATE INVOICE

//   POST

//   /api/invoice/create?site=1&m=8&y=2026&type=Regular
// */

// router.post(
//   "/create",
//   invoiceController.createInvoice
// );


// /*
//   GENERATE SALARY

//   POST

//   /api/invoice/generate-salary
// */

// router.post(
//   "/generate-salary",
//   invoiceController.generateSalary
// );


// module.exports =
//   router;