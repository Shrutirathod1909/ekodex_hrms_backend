const clientService = require("../services/clientService");
const clientModel = require("../models/clientModel");
const logger = require("../utils/logger");
const { getRelativePathFromApi } = require("../utils/img_path");
const xlsx = require("xlsx");

exports.exportClients = async (req, res) => {
  try {
    const { ids } = req.body; // Receive the IDs
    const clients = await clientModel.exportClients(ids);

    const exportData = clients.map((client) => ({
      Id: client.id,
      Company_Name: client.company_name,
      Contact_No: client.contact_no,
      Client_Email: client.client_email,
      Contact_Person: client.contact_person,
      Client_Address: client.client_add,
      Client_City: client.client_city,
      Client_State: client.client_state,
      Pincode: client.city_pincode,
      GST_State_Code: client.client_gst_state_code,
      GST_No: client.client_gst_no,
      Bank_Name: client.bank_name,
      Account_No: client.client_acc_no,
      IFSC_Code: client.ifsc_code,
      Bank_Branch: client.bank_branch,
      Bank_City: client.bank_city,
      MICR_Code: client.micr_code,
      SAC_Code: client.sac_code,
      Other_Info: client.other_info,
      Terms: client.terms,
      Company_Bank_Name: client.company_bank_name,
      Billing_Company: client.billing_company,
      Billing_Company_Id: client.billing_company_id,
      Client_Code: client.x_client_code,
    }));

    const worksheet = xlsx.utils.json_to_sheet(exportData);

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Clients");

    const excelBuffer = xlsx.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    const fileName = `Clients_${Date.now()}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    return res.send(excelBuffer);
  } catch (err) {
    console.error("Export Clients Error:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.updateSite = async (req, res) => {
  try {
    const siteId = req.params.id;
    const attachment = req.file ? req.file.filename : null;

    // Fetch user info for audit trail (modified_by_name)
    const userDetail = await clientModel.getUserById(req.user.id);
    const userId = req.user.id;
    const userName = userDetail?.first_name || "";

    const result = await clientModel.updateSite(
      siteId,
      req.body,
      attachment,
      userId,
      userName,
    );

    res.status(200).json({
      success: true,
      message: "Site updated successfully",
      data: result,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.updateClient = async (req, res) => {
  try {
    const clientId = parseInt(req.params.clientId);

    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: "Client ID is required",
      });
    }

    const userDetail = await clientModel.getUserById(req.user.id);

    const sites = req.body.sites
      ? typeof req.body.sites === "string"
        ? JSON.parse(req.body.sites)
        : req.body.sites
      : [];

    const attachment = req.file ? getRelativePathFromApi(req.file) : null;

    // Add uploaded file to first site if present
    if (attachment && sites.length > 0) {
      sites[0].c_attachement = attachment;
    }

    const clientData = {
      ...req.body,
      sites,
    };

    // console.log(req.body);
    // console.log(sites[0].rates);

    const result = await clientModel.updateClientAddSite(
      clientId,
      clientData,
      userDetail,
      attachment,
    );

    return res.status(200).json({
      success: true,
      message: "Client updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Update Client Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getClientSites = async (req, res) => {
  try {
    const { clientId } = req.params;

    const data = await clientModel.getClientSites(clientId);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    console.error(err);
    logger.log("GET CLIENTS ERROR =>", error);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// last update - 14/6/26 - file attachment and all columns data into uppercase saving done
exports.createClient = async (req, res) => {
  try {
    const userDetail = await clientModel.getUserById(req.user.id);
    const sites = req.body.sites ? JSON.parse(req.body.sites) : [];
    const rates = sites?.[0]?.rates || [];
    let attachment = "";
    if (req.file) {
      attachment = getRelativePathFromApi(req.file)
        ? getRelativePathFromApi(req.file)
        : null;
    }

    console.log("BODY:", req.body);
    console.log("FILE:", req.file);
    // console.log("USER:", req.user);
    // console.log("PARSED SITES:", sites);
    // console.log("RATES:", rates);
    // console.log(userDetail);
    // console.log("ATTACHMENT:", attachment);

    // save file name into site object
    if (sites.length > 0) {
      sites[0].c_attachement = attachment || "";
    }

    const clientData = {
      ...req.body,
      sites,
    };

    // ==========================
    // SAVE CLIENT
    // ==========================

    const result = await clientModel.createClient(
      clientData,
      userDetail,
      attachment,
    );

    return res.status(201).json({
      success: true,
      message: "Client added successfully",
      clientId: result.clientId,
    });
  } catch (error) {
    console.error("Create Client Error:", error);
    logger.log("GET CLIENTS ERROR =>", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getClientDetailsById = async (req, res) => {
  try {
    const { id } = req.params;
    logger.info("CLIENT ID => " + id);
    const result = await clientModel.getClientDetailsById(id);

    res.status(200).json(result);
  } catch (error) {
    console.error("Get Client Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.addClientSite = async (req, res) => {
  try {
    const result = await clientService.addClientSite(req);

    return res.status(201).json({
      success: true,
      message: "Site added successfully",
      siteId: result.siteId,
      clientCode: result.clientCode,
    });
  } catch (error) {
    logger.log("FULL ERROR =>", error);

    return res.status(500).json({
      success: false,
      message: error.message,
      stack: error.stack,
    });
  }
};

exports.getAllClients = async (req, res) => {
  try {
    console.log("getAllClients");

    const result = await clientModel.getAllClients(req);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.log("GET CLIENTS ERROR =>", error);

    return res.status(500).json({
      success: false,
      message: "Server error fetching clients",
      error: error.message,
    });
  }
};

exports.getClientById = async (req, res) => {
  try {
    const data = await clientModel.getClientById(req);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    logger.log("ðŸ”¥ GET CLIENT BY ID ERROR =>", error);

    return res.status(500).json({
      success: false,
      message: "Server error fetching client details",

      error: error.message,

      stack: error.stack,
    });
  }
};

exports.getSitesByClientId = async (req, res) => {
  try {
    const { clientIds, billing_company_id } = req.query;

    if (!clientIds || !billing_company_id) {
      return res.status(400).json({
        success: false,
        message: "clientIds and billing_company_id are required",
      });
    }

    const idsArray = clientIds.split(",").map((id) => id.trim());

    const sites = await clientModel.getSitesByClientIds(
      idsArray,
      billing_company_id
    );

    return res.status(200).json({
      success: true,
      message: "Sites fetched successfully",
      data: sites,
    });
  } catch (error) {
    logger.error("GET SITES ERROR =>", error);

    return res.status(500).json({
      success: false,
      message: "Error fetching sites",
      error: error.message,
    });
  }
};

exports.getSitesByClientIds = async (req, res) => {
  try {
    const sitesData = await clientModel.getSitesByClientIds(req);

    return res.status(200).json({
      success: true,
      message: "Branches fetched successfully!!",

      data: sitesData,
    });
  } catch (error) {
    logger.error("FETCH SITES BY CLIENT ID FAILED =>", error);

    return res.status(500).json({
      success: false,
      message: "Error fetching sites for client",

      error: error.message,

      stack: error.stack,

      data: [],
    });
  }
};

exports.updateClientDetails = async (req, res) => {
  try {
    const result = await clientModel.updateClientDetails(req);

    return res.status(200).json({
      success: true,
      message: "Client updated successfully",

      rowsAffected: result.rowsAffected,
    });
  } catch (error) {
    logger.log("UPDATE CLIENT ERROR =>", error);

    return res.status(500).json({
      success: false,
      error: error.message,

      stack: error.stack,
    });
  }
};

exports.updateClientBankDetails = async (req, res) => {
  try {
    logger.log("REQ BODY =>", req.body);
    const result = await clientModel.updateClientBankDetails(req);

    return res.status(200).json({
      success: true,
      message: "Bank details updated successfully",

      rowsAffected: result.rowsAffected,
    });
  } catch (error) {
    logger.log("UPDATE BANK DETAILS ERROR =>", error);

    return res.status(500).json({
      success: false,
      error: error.message,

      stack: error.stack,
    });
  }
};

exports.updateClientSiteDetails = async (req, res) => {
  try {
    const result = await clientModel.updateClientSiteDetails(req);

    return res.status(200).json({
      success: true,
      message: "Site updated successfully",

      rowsAffected: result.rowsAffected,
    });
  } catch (error) {
    logger.log("FULL UPDATE ERROR =>", error);

    return res.status(500).json({
      success: false,
      message: error.message,

      stack: error.stack,
    });
  }
};

exports.deleteClient = async (req, res) => {
  try {
    // Fetch user name for audit trail (disabled_by_name)
    const userDetail = await clientModel.getUserById(req.user.id);
    req.disabledByName = userDetail?.first_name || "";

    const result = await clientModel.deleteClient(req);

    return res.status(200).json({
      success: true,
      message: "Client deleted successfully",
    });
  } catch (error) {
    logger.error("DELETE CLIENT FAILED:", error);

    if (error.message === "Client not found") {
      return res.status(404).json({
        success: false,
        message: "Client not found",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while deleting client",

      error: error.message,
    });
  }
};

exports.restoreClient = async (req, res) => {
  try {
    const userDetail = await clientModel.getUserById(req.user.id);
    req.modifiedByName = userDetail?.first_name || "";

    const result = await clientModel.restoreClient(req);

    return res.status(200).json({
      success: true,
      message: "Client restored successfully",
    });
  } catch (error) {
    logger.error("RESTORE CLIENT FAILED:", error);

    if (error.message === "Client not found or already active") {
      return res.status(404).json({
        success: false,
        message: "Client not found or already active",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while restoring client",
      error: error.message,
    });
  }
};

// =====================================
// GET COMPANY BANKS
// =====================================

exports.getCompanyBanks = async (req, res) => {
  try {
    const data = await clientModel.getCompanyBanks(req.params.companyId);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    logger.log("GET COMPANY BANKS ERROR =>", error);

    if (error.message === "companyId is required") {
      return res.status(400).json({
        success: false,
        message: "companyId is required",

        data: [],
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error fetching company banks",

      error: error.message,
    });
  }
};

// =====================================
// DELETE CLIENT SITE
// =====================================


exports.deleteClientSite = async (req, res) => {
  try {
    // Fetch user details for audit trail
    const userDetail = await clientModel.getUserById(req.user.id);

    req.disabledByName = userDetail?.first_name || "";

    await clientModel.deleteClientSite(req);

    return res.status(200).json({
      success: true,
      message: "Site deleted successfully",
    });
  } catch (error) {
    logger.log("DELETE SITE ERROR =>", error);

    if (error.message === "Invalid site id") {
      return res.status(400).json({
        success: false,
        message: "Invalid site id",
      });
    }

    if (error.message === "Site not found") {
      return res.status(404).json({
        success: false,
        message: "Site not found",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while deleting site",
      error: error.message,
    });
  }
};


// =====================================
// EXPORT CLIENTS TO EXCEL
// =====================================

exports.exportClientsToExcel = async (req, res) => {
  try {
    const buffer = await clientModel.exportClientsToExcel(req);

    const fileName = `ClientSites_${Date.now()}.xlsx`;

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    return res.send(buffer);
  } catch (error) {
    logger.error("EXPORT CLIENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate report",

      error: error.message,
    });
  }
};

// =====================================
// GET WO RATES
// =====================================

exports.getWORates = async (req, res) => {
  try {
    const data = await clientModel.getWORates(req.params.siteId);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error("GET WO RATES FAILED:", error);

    return res.status(500).json({
      success: false,
      message: "Server error fetching WO Rates",

      error: error.message,
    });
  }
};

// =====================================
// ADD WO RATES
// =====================================

exports.addWORates = async (req, res) => {
  try {
    const result = await clientModel.addWORates(req);

    return res.status(200).json({
      success: true,
      message: "Work order rates saved successfully!",

      data: result,
    });
  } catch (error) {
    logger.error("WO RATE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Error adding WO Rates",

      error: error.message,
    });
  }
};

// =====================================
// GET SITE BY SITE ID
// =====================================

exports.getSiteBySiteId = async (req, res) => {
  try {
    const data = await clientModel.getSiteBySiteId(req.params.id);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error("GET SITE BY ID FAILED:", error);

    if (error.message === "Site not found") {
      return res.status(404).json({
        success: false,
        message: "Site not found",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error fetching site details",

      error: error.message,
    });
  }
};

// =====================================
// UPDATE WAGES SETTINGS
// =====================================

exports.updateWagesSettings = async (req, res) => {
  try {
    const data = await clientModel.updateWagesSettings(req);

    return res.status(200).json({
      success: true,
      message: "Wages settings updated successfully",

      site: data,
    });
  } catch (error) {
    logger.error("UPDATE WAGES SETTINGS ERROR:", error);

    if (error.message === "Client ID and Site ID are required") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message === "Site not found") {
      return res.status(404).json({
        success: false,
        message: "Site not found",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error",

      error: error.message,
    });
  }
};

// =====================================
// Nitin
// =====================================

// =============================
// CLIENTS
// =============================
exports.getDropDownData = async (req, res) => {
  try {
    const data = await clientModel.getClients(req.user);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("getDropDownData Error:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =============================
// SITES
// =============================
exports.getSitesDropDownData = async (req, res) => {
  try {
    const client_id = req.query.client_id;
    console.log("getSitesDropDownData", client_id);

    if (!client_id) {
      return res.status(400).json({
        success: false,
        message: "client_id is required",
      });
    }

    const data = await clientModel.getSitesByClient(client_id);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("getSitesDropDownData Error:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =============================
// EMPLOYEES
// =============================
exports.getEmployeesBySiteDropDown = async (req, res) => {
  try {
    const { site_id, client_id } = req.query;
    console.log(site_id, client_id);
    if (!site_id) {
      return res.status(400).json({
        success: false,
        message: "site_id is required",
      });
    }

    const data = await clientModel.getEmployeesBySite(
      site_id,
      client_id || null,
    );

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("getEmployeesBySiteDropDown Error:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.updateClientData = async (req, res) => {
  try {
    const userDetail = await clientModel.getUserById(req.user.id);
    const result = await clientModel.updateClientData(
      req.params.id,
      req.body,
      userDetail,
    );

    return res.status(200).json({
      success: true,
      message: "Client updated successfully",
      data: result,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.updateBankDetails = async (req, res) => {
  try {
    // console.log("updateBankDetails");
    const userDetail = await clientModel.getUserById(req.user.id);
    await clientModel.updateBankDetails(req.params.id, req.body, userDetail);
    res.status(200).json({
      success: true,
      message: "Bank details updated successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
