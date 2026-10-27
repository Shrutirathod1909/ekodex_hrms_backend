const fs = require("fs");
const path = require("path");

// ======================================================
// LOG FILE PATH
// ======================================================

const logFilePath = path.join(__dirname, "../logs/app.log");

// ======================================================
// CREATE LOGS FOLDER IF NOT EXISTS
// ======================================================

const logDir = path.dirname(logFilePath);

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, {
    recursive: true,
  });
}

// ======================================================
// FORMAT LOG MESSAGE
// ======================================================

const formatMessage = (type, args) => {
  const time = new Date().toISOString();

  const message = args
    .map((a) => {
      // HANDLE ERRORS FIRST
      if (a instanceof Error) {
        return a.stack || a.message;
      }

      // HANDLE OBJECTS
      if (typeof a === "object" && a !== null) {
        try {
          return JSON.stringify(a, null, 2);
        } catch (err) {
          return "[CANNOT STRINGIFY OBJECT]";
        }
      }

      return String(a);
    })
    .join(" ");

  return `
[${time}] [${type}]
${message}

--------------------------------------------------
`;
};

// ======================================================
// WRITE LOG TO FILE (SYNCHRONOUS - VPS SAFE)
// ======================================================
// FIX: Using appendFileSync instead of appendFile (async)
// Reason: On VPS with PM2, async callbacks may not flush
// before process restart/shutdown — causing partial logs.
// Sync write guarantees every log is persisted immediately.
// ======================================================

const writeToFile = (msg) => {
  try {
    fs.appendFileSync(logFilePath, msg, "utf8");
  } catch (err) {
    process.stderr.write("LOG WRITE ERROR: " + err.message + "\n");
  }
};

// ======================================================
// LOGGER METHODS
// ======================================================

const logger = {
  // ================= LOG =================

  log: (...args) => {
    const msg = formatMessage("LOG", args);

    process.stdout.write(msg);

    writeToFile(msg);
  },

  // ================= INFO =================

  info: (...args) => {
    const msg = formatMessage("INFO", args);

    process.stdout.write(msg);

    writeToFile(msg);
  },

  // ================= ERROR =================

  error: (...args) => {
    const msg = formatMessage("ERROR", args);

    process.stderr.write(msg);

    writeToFile(msg);
  },

  // ================= WARNING =================

  warn: (...args) => {
    const msg = formatMessage("WARN", args);

    process.stdout.write(msg);

    writeToFile(msg);
  },

  // ================= DEBUG =================

  debug: (...args) => {
    const msg = formatMessage("DEBUG", args);

    process.stdout.write(msg); // <-- Ab hamesha terminal me print hoga
    writeToFile(msg); // <-- Ab hamesha file me save hoga
  },

  // ================= SUCCESS =================

  success: (...args) => {
    const msg = formatMessage("SUCCESS", args);

    process.stdout.write(msg);

    writeToFile(msg);
  },

  // ================= SQL RESULT =================
  // Usage: logger.sql("GET COMPANIES", result)
  // Prints how many rows were returned so you know if query found data or not

  sql: (label, result) => {
    const count = result?.recordset?.length ?? "N/A";
    const msg = formatMessage("SQL_RESULT", [
      `${label} | Rows Returned: ${count}`,
    ]);
    process.stdout.write(msg);
    writeToFile(msg);
  },
};

// ======================================================
// EXPORT LOGGER
// ======================================================

module.exports = logger;
