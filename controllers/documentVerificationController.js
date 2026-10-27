const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const fs = require("fs");
const logger = require("../utils/logger");
const documentVerificationModel = require("../models/documentVerificationModel");

const DIGILOCKER_API = "https://dg-sandbox.setu.co/api/digilocker";
const AADHAAR_OCR_API = "https://dg-sandbox.setu.co/api/sync/aadhaar/ocr";
const PAN_OCR_API = "https://dg-sandbox.setu.co/api/sync/pan/ocr";
const PAN_API = "https://dg-sandbox.setu.co/api/sync/pan/plus";
const VOTER_ID_OCR_API = "https://dg-sandbox.setu.co/api/sync/voter-id/ocr";
const VOTER_ID_API = "https://dg-sandbox.setu.co/api/sync/voter-id/verify";
const DRIVING_LICENSE_OCR_API = "https://dg-sandbox.setu.co/api/sync/dl/ocr";
const DRIVING_LICENSE_API = "https://dg-sandbox.setu.co/api/sync/dl/verify";

class VerificationError extends Error {
  constructor(message, statusCode = 422) {
    super(message);
    this.statusCode = statusCode;
  }
}

const sanitizeOcrText = (text) =>
  String(text || "")
    .replace(/\b[A-Z]{5}\s*[0-9]{4}\s*[A-Z]\b/gi, "[PAN REDACTED]")
    .replace(/\b[A-Z]{3}\d{7}\b/gi, "[VOTER ID REDACTED]")
    .replace(/[xX*]{4,}[\s/-]*(?:[xX*]{4}[\s/-]*)?\d{4}/g, "[AADHAAR REDACTED]")
    .replace(/\d(?:[\s/-]*\d){11}/g, "[AADHAAR REDACTED]")
    .replace(/\b\d{10}\b/g, "[NUMBER REDACTED]")
    .replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, "[DATE REDACTED]")
    .replace(
      /\b([a-z_]*name|license[_ -]?number|dob|date[_ -]?of[_ -]?birth|address|phone|mobile|email|gender|care[_ -]?of|father|husband)\s*[:\-]?\s*[^\r\n]*/gi,
      "$1: [DETAILS REDACTED]",
    )
    .slice(0, 4000);

const logParserOutput = (document, source, text) => {
  logger.info("EMPLOYEE DOCUMENT PARSER OUTPUT", {
    documentId: document.id,
    documentType: document.doc_type,
    source,
    characterCount: String(text || "").length,
    parsedText: sanitizeOcrText(text),
  });
};

const getSetuHeaders = (credentialPrefix, contentType = "application/json") => {
  const clientId = process.env[`${credentialPrefix}_X_CLIENT_ID`];
  const clientSecret = process.env[`${credentialPrefix}_X_CLIENT_SECRET`];
  const productInstanceId = process.env[`${credentialPrefix}_X_PRODUCT_INSTANCE_ID`];

  if (!clientId || !clientSecret || !productInstanceId) {
    throw new VerificationError(
      `Setu ${credentialPrefix === "AADHAAR" ? "Aadhaar" : "document"} credentials are not configured`,
      500,
    );
  }

  const headers = {
    "x-client-id": clientId,
    "x-client-secret": clientSecret,
    "x-product-instance-id": productInstanceId,
    Accept: "application/json",
  };
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
};

const requestSetu = async (url, options) => {
  let response;

  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    logger.error("Setu verification request could not be completed", {
      endpoint: new URL(url).pathname,
      errorName: error.name,
      detail: String(error.message || "Network request failed").slice(0, 300),
    });
    throw new VerificationError(
      `Could not reach Setu verification service: ${error.message}`,
      502,
    );
  }

  const responseText = await response.text();
  let body = null;
  try {
    body = responseText ? JSON.parse(responseText) : {};
  } catch {
    if (response.ok) {
      throw new VerificationError("Setu returned an invalid response", 502);
    }
  }

  if (!response.ok) {
    const detail =
      body?.error?.detail ||
      body?.error?.message ||
      body?.message ||
      body?.errorMsg ||
      responseText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() ||
      `HTTP ${response.status}`;
    const traceId =
      body?.traceId || body?.error?.traceId || body?.error?.trace_id;
    const errorCode = body?.error?.code || body?.errorCode || body?.code || null;
    const safeDetail = String(detail)
      .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, "[PAN]")
      .replace(/\b\d{12}\b/g, "[AADHAAR]")
      .slice(0, 300);
    logger.error("Setu verification request rejected", {
      endpoint: new URL(url).pathname,
      status: response.status,
      errorCode,
      detail: safeDetail,
      traceId,
    });
    throw new VerificationError(
      `Setu verification request failed (${response.status}): ${safeDetail}${traceId ? ` (traceId: ${traceId})` : ""}`,
      502,
    );
  }

  return body;
};

const getEmployeeDocument = async (documentId, expectedType) => {
  const numericDocumentId = Number(documentId);
  if (!Number.isSafeInteger(numericDocumentId) || numericDocumentId <= 0) {
    throw new VerificationError("Invalid document ID", 400);
  }

  const document =
    await documentVerificationModel.getDocumentForVerification(
      numericDocumentId,
    );
  if (!document) {
    throw new VerificationError("Active employee document not found", 404);
  }

  const normalizedType = String(document.doc_type || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  const acceptedTypes =
    expectedType === "PAN"
      ? ["PAN", "PANCARD"]
      : expectedType === "AADHAAR"
        ? ["AADHAAR", "AADHAARCARD", "AADHARCARD"]
        : expectedType === "VOTER"
          ? ["VOTERID", "VOTERCARD"]
          : [
              "DL",
              "DRIVINGLICENSE",
              "DRIVINGLICENCE",
              "DRIVERSLICENSE",
              "DRIVERLICENSE",
            ];

  if (!acceptedTypes.includes(normalizedType)) {
    throw new VerificationError(
      `This verification is only available for ${expectedType} documents`,
      400,
    );
  }

  const employeeName = String(document.emp_full_name || [
    document.first_name,
    document.middle_name,
    document.last_name,
  ].filter(Boolean).join(" ")).trim();
  if (!employeeName) {
    throw new VerificationError("Employee name is missing from the employee record", 422);
  }

  return { ...document, employeeName };
};

const readUploadedFile = async (document) => {
  const frontendFolder = process.env.FRONTEND_FOLDER;
  if (!frontendFolder) {
    throw new VerificationError("FRONTEND_FOLDER is not configured", 500);
  }

  let storedPath = String(document.doc_name || "").trim();
  if (/^https?:\/\//i.test(storedPath)) {
    try {
      storedPath = new URL(storedPath).pathname;
    } catch {
      throw new VerificationError("Stored document path is invalid", 422);
    }
  }

  const filename = path.basename(storedPath.replace(/\\/g, "/"));
  if (!filename || filename === "." || filename === "..") {
    throw new VerificationError("Uploaded document path is invalid", 422);
  }

  const documentPath = path.resolve(
    frontendFolder,
    "api",
    "emp_docs",
    filename,
  );
  const documentDirectory = path.resolve(frontendFolder, "api", "emp_docs");
  if (path.dirname(documentPath) !== documentDirectory) {
    throw new VerificationError("Uploaded document path is invalid", 422);
  }

  let fileBuffer;
  try {
    fileBuffer = await fs.promises.readFile(documentPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new VerificationError("Uploaded document file could not be found", 404);
    }
    throw error;
  }

  const extension = path.extname(filename).toLowerCase();
  const mimeTypeByExtension = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
  };
  const mimeType = mimeTypeByExtension[extension];
  if (!mimeType) {
    throw new VerificationError(
      "Only JPG, PNG, WEBP images and PDFs can be verified",
      415,
    );
  }

  return { fileBuffer, filename, mimeType };
};

const collectOcrText = (value, chunks = [], key = "") => {
  if (typeof value === "string" || typeof value === "number") {
    chunks.push(key ? `${key}: ${String(value)}` : String(value));
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectOcrText(item, chunks, key));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([childKey, item]) =>
      collectOcrText(item, chunks, childKey),
    );
  }

  return chunks.join("\n");
};

const requestDocumentOcr = async (document, endpoint, fieldName, source) => {
  const { fileBuffer, filename, mimeType } = await readUploadedFile(document);
  const formData = new FormData();
  formData.append(
    fieldName,
    new Blob([fileBuffer], { type: mimeType }),
    filename,
  );

  const result = await requestSetu(endpoint, {
    method: "POST",
    headers: getSetuHeaders("DOC", null),
    body: formData,
  });
  const extractedText = collectOcrText(result).trim();
  logParserOutput(document, source, extractedText);
  if (!extractedText) {
    throw new VerificationError(
      "Setu could not read the uploaded document. Upload a clearer image.",
    );
  }

  return extractedText;
};

const normalizeName = (name) =>
  String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const getOcrField = (text, fieldName) => {
  const escapedField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(text || "").match(
    new RegExp(`(?:^|\\n)\\s*${escapedField}\\s*:\\s*([^\\r\\n]+)`, "i"),
  );
  return match?.[1]?.trim() || "";
};

const getAadhaarNumber = (text, document) => {
  const maskedNumber = text.match(/[xX*]{4,}[\s-]*(?:[xX*]{4}[\s-]*)?(\d{4})/);
  const fullNumbers = text.match(/\d(?:[\s-]*\d){11}/g) || [];
  const aadhaarNumber = fullNumbers
    .map((number) => number.replace(/\D/g, ""))
    .find((number) => number.length === 12);

  logger.info("AADHAAR NUMBER PARSER RESULT", {
    documentId: document.id,
    documentType: document.doc_type,
    aadhaarLabelFound: /\b(?:aadhaar|aadhar)\b/i.test(text),
    maskedPatternFound: Boolean(maskedNumber),
    fullNumberCandidatesFound: fullNumbers.length,
    digitSequenceLengths: (text.match(/\d+/g) || []).map((digits) => digits.length),
    extractedFullNumberFound: Boolean(aadhaarNumber),
  });

  if (!aadhaarNumber) {
    throw new VerificationError(
      "Could not read the full Aadhaar number from the uploaded document",
    );
  }

  return aadhaarNumber;
};

const getVerifier = async (req) => {
  const verifiedById = Number(req.user?.id);
  if (!Number.isSafeInteger(verifiedById) || verifiedById <= 0) {
    throw new VerificationError("Authenticated verifier ID is missing", 401);
  }

  const verifiedByName =
    (await documentVerificationModel.getVerifierName(verifiedById)) ||
    req.user?.name ||
    req.user?.email ||
    String(verifiedById);

  return { verifiedById, verifiedByName };
};

const saveSuccessfulVerification = async (documentId, req) => {
  const verifier = await getVerifier(req);
  return documentVerificationModel.markDocumentVerified({
    documentId,
    ...verifier,
  });
};

const getEmployeeDocuments = async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0) {
      throw new VerificationError("Invalid employee ID", 400);
    }

    const documents =
      await documentVerificationModel.getEmployeeDocuments(employeeId);

    return res.json({ success: true, data: documents });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message,
    });
  }
};

const verifyPan = async (req, res) => {
  try {
    const document = await getEmployeeDocument(req.params.documentId, "PAN");
    const documentText = await requestDocumentOcr(
      document,
      PAN_OCR_API,
      "document",
      "Setu PAN OCR",
    );
    const compactText = documentText.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const panMatch = compactText.match(/[A-Z]{5}[0-9]{4}[A-Z]/);
    logger.info("PAN NUMBER PARSER RESULT", {
      documentId: document.id,
      candidateFound: Boolean(panMatch),
      candidateFormat: panMatch ? "AAAAA9999A" : null,
    });

    if (!panMatch) {
      throw new VerificationError("Could not read a valid PAN number from the uploaded document");
    }

    const employeePan = String(document.pancard_no || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (!employeePan || panMatch[0] !== employeePan) {
      throw new VerificationError(
        "PAN number on the uploaded document does not match the employee record. The document was not verified.",
      );
    }

    logger.info("PAN verification credential profile", {
      documentId: document.id,
      credentialProfile: "DOC",
    });
    const result = await requestSetu(PAN_API, {
      method: "POST",
      headers: getSetuHeaders("DOC"),
      body: JSON.stringify({
        consent: "Y",
        pan: employeePan,
      }),
    });

    const panVerificationStatus = String(
      result.verification || result.status || "",
    ).trim().toUpperCase();
    const responseMessage = String(result.message || "").trim();
    const successfulPanPlusMessage =
      !panVerificationStatus &&
      /^pan details fetched successfully[.!]?$/i.test(responseMessage);
    logger.info("Setu PAN Plus response received", {
      documentId: document.id,
      verificationStatus:
        panVerificationStatus || (successfulPanPlusMessage ? "SUCCESS_BY_MESSAGE" : "MISSING"),
      traceId: result.traceId || null,
    });
    if (panVerificationStatus !== "SUCCESS" && !successfulPanPlusMessage) {
      throw new VerificationError(
        responseMessage || `PAN verification failed: ${panVerificationStatus || "unknown status"}`,
      );
    }

    const verification = await saveSuccessfulVerification(
      document.id,
      req,
    );

    return res.json({
      success: true,
      message: responseMessage || "PAN verified successfully",
      verification,
    });
  } catch (error) {
    logger.error("PAN document verification failed", {
      documentId: req.params.documentId,
      statusCode: error.statusCode || 500,
      message: sanitizeOcrText(error.message),
    });
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message,
    });
  }
};

const verifyVoterId = async (req, res) => {
  try {
    const document = await getEmployeeDocument(
      req.params.documentId,
      "VOTER",
    );
    const documentText = await requestDocumentOcr(
      document,
      VOTER_ID_OCR_API,
      "documentFront",
      "Setu Voter ID OCR",
    );
    const epicNumber = getOcrField(documentText, "epicNumber")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const uploadedName = getOcrField(documentText, "name");

    logger.info("VOTER ID OCR PARSER RESULT", {
      documentId: document.id,
      epicNumberFound: Boolean(epicNumber),
      employeeNameMatch: Boolean(
        uploadedName &&
          normalizeName(uploadedName) === normalizeName(document.employeeName),
      ),
    });

    if (!/^[A-Z]{3}\d{7}$/.test(epicNumber)) {
      throw new VerificationError(
        "Could not read a valid EPIC number from the uploaded Voter ID",
      );
    }

    if (
      !uploadedName ||
      normalizeName(uploadedName) !== normalizeName(document.employeeName)
    ) {
      throw new VerificationError(
        "Voter ID name does not match the employee name. The document was not verified.",
      );
    }

    const result = await requestSetu(VOTER_ID_API, {
      method: "POST",
      headers: getSetuHeaders("DOC"),
      body: JSON.stringify({ number: epicNumber }),
    });
    const responseEpicNumber = String(result.data?.epicNumber || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const apiName = String(result.data?.name || "");
    const apiSucceeded =
      result.success === true ||
      String(result.success || "").toLowerCase() === "true" ||
      String(result.verification || result.status || "").toUpperCase() ===
        "SUCCESS";

    logger.info("Setu Voter ID verification response received", {
      documentId: document.id,
      success: apiSucceeded,
      epicNumberMatch:
        Boolean(responseEpicNumber) && responseEpicNumber === epicNumber,
      employeeNameMatch: Boolean(
        apiName && normalizeName(apiName) === normalizeName(document.employeeName),
      ),
      traceId: result.traceId || null,
    });

    if (!apiSucceeded) {
      throw new VerificationError(
        result.message || "Setu could not verify this Voter ID",
      );
    }

    if (!responseEpicNumber || responseEpicNumber !== epicNumber) {
      throw new VerificationError(
        "Voter ID verification response does not match the uploaded EPIC number.",
      );
    }

    if (!apiName || normalizeName(apiName) !== normalizeName(document.employeeName)) {
      throw new VerificationError(
        "Voter ID verification name does not match the employee name. The document was not verified.",
      );
    }

    const verification = await saveSuccessfulVerification(document.id, req);
    return res.json({
      success: true,
      message: result.message || "Voter ID verified successfully",
      verification,
    });
  } catch (error) {
    logger.error("Voter ID document verification failed", {
      documentId: req.params.documentId,
      statusCode: error.statusCode || 500,
      message: sanitizeOcrText(error.message),
    });
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message,
    });
  }
};

const verifyDrivingLicense = async (req, res) => {
  try {
    const document = await getEmployeeDocument(
      req.params.documentId,
      "DRIVING LICENSE",
    );
    const documentText = await requestDocumentOcr(
      document,
      DRIVING_LICENSE_OCR_API,
      "documentFront",
      "Setu Driving License OCR",
    );
    const licenseNumber = getOcrField(documentText, "licenseNumber")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const dateOfBirth = getOcrField(documentText, "dob");
    const uploadedName = getOcrField(documentText, "name");
    const employeeLicense = String(document.driving_license || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

    logger.info("DRIVING LICENSE OCR PARSER RESULT", {
      documentId: document.id,
      licenseNumberFound: Boolean(licenseNumber),
      employeeLicenseMatch:
        Boolean(employeeLicense) && employeeLicense === licenseNumber,
      employeeNameMatch: Boolean(
        uploadedName &&
          normalizeName(uploadedName) === normalizeName(document.employeeName),
      ),
      dateOfBirthFound: Boolean(dateOfBirth),
    });

    if (!licenseNumber) {
      throw new VerificationError(
        "Could not read the license number from the uploaded Driving License",
      );
    }

    if (!employeeLicense || licenseNumber !== employeeLicense) {
      throw new VerificationError(
        "Driving License number does not match the employee record. The document was not verified.",
      );
    }

    if (
      !uploadedName ||
      normalizeName(uploadedName) !== normalizeName(document.employeeName)
    ) {
      throw new VerificationError(
        "Driving License name does not match the employee name. The document was not verified.",
      );
    }

    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateOfBirth)) {
      throw new VerificationError(
        "Could not read a valid date of birth from the uploaded Driving License",
      );
    }

    const result = await requestSetu(DRIVING_LICENSE_API, {
      method: "POST",
      headers: getSetuHeaders("DOC"),
      body: JSON.stringify({
        dob: dateOfBirth,
        licenseNumber,
      }),
    });
    const responseLicenseNumber = String(result.data?.licenseNumber || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const apiName = String(result.data?.name || "");
    const apiSucceeded =
      result.success === true ||
      String(result.success || "").toLowerCase() === "true" ||
      String(result.verification || result.status || "").toUpperCase() ===
        "SUCCESS";

    logger.info("Setu Driving License verification response received", {
      documentId: document.id,
      success: apiSucceeded,
      licenseNumberMatch:
        Boolean(responseLicenseNumber) &&
        responseLicenseNumber === licenseNumber,
      employeeNameMatch: Boolean(
        apiName && normalizeName(apiName) === normalizeName(document.employeeName),
      ),
      traceId: result.traceId || null,
    });

    if (!apiSucceeded) {
      throw new VerificationError(
        result.message || "Setu could not verify this Driving License",
      );
    }

    if (
      !responseLicenseNumber ||
      responseLicenseNumber !== licenseNumber
    ) {
      throw new VerificationError(
        "Driving License verification response does not match the uploaded license number.",
      );
    }

    if (!apiName || normalizeName(apiName) !== normalizeName(document.employeeName)) {
      throw new VerificationError(
        "Driving License verification name does not match the employee name. The document was not verified.",
      );
    }

    const verification = await saveSuccessfulVerification(document.id, req);
    return res.json({
      success: true,
      message: result.message || "Driving License verified successfully",
      verification,
    });
  } catch (error) {
    logger.error("Driving License document verification failed", {
      documentId: req.params.documentId,
      statusCode: error.statusCode || 500,
      message: sanitizeOcrText(error.message),
    });
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message,
    });
  }
};

const startAadhaarVerification = async (req, res) => {
  try {
    const document = await getEmployeeDocument(
      req.params.documentId,
      "AADHAAR",
    );
    const requestOrigin = req.headers.origin;
    let redirectUrl;
    try {
      redirectUrl = new URL(req.body?.redirectUrl);
    } catch {
      throw new VerificationError("A valid DigiLocker redirectUrl is required", 400);
    }

    if (
      !requestOrigin ||
      redirectUrl.origin !== requestOrigin ||
      redirectUrl.pathname !== "/employee/employee" ||
      redirectUrl.search ||
      redirectUrl.hash
    ) {
      throw new VerificationError(
        "DigiLocker redirectUrl must point to this project’s employee page",
        400,
      );
    }

    const result = await requestSetu(`${DIGILOCKER_API}/`, {
      method: "POST",
      headers: getSetuHeaders("AADHAAR"),
      body: JSON.stringify({ redirectUrl: redirectUrl.toString() }),
    });

    if (
      !result.id ||
      typeof result.url !== "string" ||
      !result.url.startsWith("https://dg-sandbox.setu.co/digilocker/")
    ) {
      throw new VerificationError(
        "Setu did not return a valid DigiLocker authorization link",
        502,
      );
    }

    return res.json({
      success: true,
      documentId: document.id,
      sessionId: result.id,
      url: result.url,
      validUpto: result.validUpto,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message,
    });
  }
};

const checkAadhaarVerification = async (req, res) => {
  try {
    const document = await getEmployeeDocument(
      req.params.documentId,
      "AADHAAR",
    );
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        req.params.sessionId,
      )
    ) {
      throw new VerificationError("Invalid DigiLocker session ID", 400);
    }

    const headers = getSetuHeaders("AADHAAR");
    const session = await requestSetu(
      `${DIGILOCKER_API}/${encodeURIComponent(req.params.sessionId)}/status`,
      { method: "GET", headers },
    );
    const status = String(session.status || "").toLowerCase();

    if (status === "unauthenticated") {
      return res.json({
        success: true,
        verified: false,
        status: session.status,
      });
    }

    const aadhaarResult = await requestSetu(
      `${DIGILOCKER_API}/${encodeURIComponent(req.params.sessionId)}/aadhaar`,
      { method: "GET", headers },
    );
    const aadhaar = aadhaarResult.aadhaar;
    if (!aadhaar || String(aadhaarResult.status || "").toLowerCase() !== "complete") {
      throw new VerificationError(
        "DigiLocker authorization completed, but Aadhaar details are not available",
      );
    }

    const documentText = await requestDocumentOcr(
      document,
      AADHAAR_OCR_API,
      "documentFront",
      "Setu Aadhaar OCR",
    );
    const uploadedAadhaarNumber = getAadhaarNumber(documentText, document);
    const employeeAadhaar = String(document.aadhar_no || "").replace(/\D/g, "");
    if (!employeeAadhaar || uploadedAadhaarNumber !== employeeAadhaar) {
      throw new VerificationError(
        "Aadhaar number on the uploaded document does not match the employee record. The document was not verified.",
      );
    }

    const apiLastFour = String(aadhaar.maskedNumber || "").replace(/\D/g, "").slice(-4);

    if (!apiLastFour || uploadedAadhaarNumber.slice(-4) !== apiLastFour) {
      throw new VerificationError(
        "Aadhaar last four digits do not match. The document was not verified.",
      );
    }

    if (
      !aadhaar.name ||
      normalizeName(aadhaar.name) !== normalizeName(document.employeeName)
    ) {
      throw new VerificationError(
        "Aadhaar name does not match the employee name. The document was not verified.",
      );
    }

    const verification = await saveSuccessfulVerification(
      document.id,
      req,
    );

    return res.json({
      success: true,
      verified: true,
      status: aadhaarResult.status,
      message: "Aadhaar verified successfully",
      verification,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getEmployeeDocuments,
  verifyPan,
  verifyVoterId,
  verifyDrivingLicense,
  startAadhaarVerification,
  checkAadhaarVerification,
};