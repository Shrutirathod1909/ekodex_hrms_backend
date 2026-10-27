const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  console.log("\n--- [authMiddleware] Process Started ---");
  // console.log("AUTH HEADER =>", req.headers.authorization);
  try {
    const authHeader = req.headers.authorization;

    // Check authorization header
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("❌ No token found in request");
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    // Extract token
    const token = authHeader.split(" ")[1];

    console.log("✅ Token Found");

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const isSuperAdmin =
      decoded.is_superadmin === true ||
      Number(decoded.id) === 1 ||
      String(decoded.role).trim().toUpperCase() === "SUPERADMIN" ||
      String(decoded.role).trim().toUpperCase() === "SUPER ADMIN";

    // Attach user
    req.user = {
      id: decoded.id,
      role: decoded.role,
      email: decoded.email,
      name: decoded.name,
      company: decoded.company,
      branch: decoded.branch,
      company_id: decoded.company_id,
      branch_id: decoded.branch_id,
      superadmin_status: decoded.superadmin_status || "0",
      is_superadmin: isSuperAdmin,
    };

    console.log("✅ User authenticated:", { id: req.user.id, role: req.user.role, is_superadmin: req.user.is_superadmin });

    next();
  } catch (error) {
    console.log("❌ JWT Error:", error.message);

    // Token expired
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired",
      });
    }

    // Invalid token
    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
};

module.exports = authMiddleware;
