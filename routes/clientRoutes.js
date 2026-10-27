const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const multer = require("multer");
const upload = require("../middleware/upload");

const {
  createClient,
  getAllClients,
  getClientById,
  deleteClient,
  restoreClient,
  updateClientDetails,
  updateClientBankDetails,
  updateClientSiteDetails,
  addClientSite,
  deleteClientSite,
  getSitesByClientIds,
  getSitesByClientId,
  exportClientsToExcel,
  addWORates,
  getWORates,
  updateWagesSettings,
  getSiteBySiteId,
  getSitesClientId,
  getCompanyBanks,
  getDropDownData,
  getSitesDropDownData,
  getEmployeesBySiteDropDown,
  getClientDetailsById,
  getClientSites,
  updateClient,
  updateSite,
  updateClientData,
  updateBankDetails,
  exportClients,
} = require("../controllers/clientController");

// =====================================
// AUTH
// =====================================
router.use(authMiddleware);

// =====================================
// SPECIAL ROUTES FIRST
// =====================================

router.get("/export", exportClientsToExcel);

router.get("/get-sites-by-clients-ids", getSitesByClientId);
router.get("/client/:clientId", getSitesByClientIds);
router.get("/company-banks/:companyId", getCompanyBanks);
router.post("/:clientId/site", addClientSite);

router.put("/updateClient/:id", updateClientDetails);

router.put("/updateClientBank/:id", updateClientBankDetails);

router.put("/updateClientSite/:clientId/:siteId", updateClientSiteDetails);

router.get("/getWagesSettings/:id", getSiteBySiteId);

router.put("/updateWagesSettings/:clientId/:siteId", updateWagesSettings);

router.get("/getWORates/:siteId", getWORates);

router.put("/addWORates/:clientId/:siteId", addWORates);

router.delete("/deleteClientSite/:siteId", deleteClientSite);

// =====================================
// Nitin
// =====================================

router.get("/dropdown", getDropDownData);
router.get("/sites-dropdown", getSitesDropDownData);
router.get("/employee-dropdown", getEmployeesBySiteDropDown);

// =====================================
// MAIN CRUD ROUTES LAST
// =====================================

router
  .route("/")
  .get(getAllClients)
  .post(upload.single("c_attachement"), createClient);

router.route("/:id").get(getClientDetailsById).delete(deleteClient);

router.get("/:clientId/sites", getClientSites);
router.post("/export", exportClients);

router.put(
  "/update-client/:clientId",
  upload.single("c_attachement"),
  updateClient,
);

router.put("/update-sites/:id", upload.single("c_attachement"), updateSite);

router.put("/update-client-data/:id", updateClientData);

router.put("/:id/bank-details-update", updateBankDetails);

router.delete("/delete-client/:clientId", deleteClient);

router.put("/restore/:id", restoreClient);

module.exports = router;
