const { poolPromise, sql } = require("../config/db");
const logger = require("../utils/logger");

const getAllRoles = async (userId, userRole) => {
  const pool = await poolPromise;

  const request = pool.request();

  let query = `
    SELECT
      id,
      role_name
    FROM role_master
    WHERE active = 0
  `;

  const normalizedRole = userRole?.trim().toUpperCase();

  // =========================================
  // SUPER ADMIN -> ALL ROLES
  // ADMIN -> ALL ROLES
  // =========================================
  if (
    normalizedRole === "SUPER ADMIN" ||
    normalizedRole === "ADMIN"
  ) {
    logger.log(
      `[PERMISSION ROLE ACCESS] ${normalizedRole} -> ALL ROLES`
    );
  }

  // =========================================
  // OTHER ROLE -> CURRENT USER ROLE ONLY
  // =========================================
  else {
    query += `
      AND UPPER(LTRIM(RTRIM(role_name))) = UPPER(
        LTRIM(RTRIM(
          (
            SELECT role
            FROM users
            WHERE id = @userId
          )
        ))
      )
    `;

    request.input("userId", sql.Int, userId);

    logger.log(
      "[PERMISSION ROLE ACCESS] OTHER ROLE -> CURRENT USER ROLE ONLY"
    );
  }

  query += `
    ORDER BY role_name ASC
  `;

  logger.log("========== GET PERMISSION ROLES SQL ==========");
  logger.log(query);
  logger.log("========== GET PERMISSION ROLES PARAMS ==========");
  logger.log(request.parameters);

  const result = await request.query(query);

  logger.log(
    "[GET PERMISSION ROLES] RESULT COUNT:",
    result.recordset.length
  );

  return result.recordset;
};
// const getAllRoles = async () => {
//   const pool = await poolPromise;

//   const result = await pool.request().query(`
//     SELECT id, role_name
//     FROM role_master
//      WHERE active = 0
//     ORDER BY role_name ASC
//   `);

//   return result.recordset;
// };
const getAllModules = async () => {
  const pool = await poolPromise;

  const result = await pool.request().query(`
    SELECT *
    FROM modules
    WHERE active = 0
    ORDER BY sort_order ASC
  `);

  return result.recordset;
};

// ================= GET PERMISSIONS FOR ROLE =================

// const getPermissionsForRole = async (role) => {
//   try {
//     const pool = await poolPromise;

//     const result = await pool.request().input("role", sql.VarChar, role).query(`

//         SELECT

//           ra.role,

//           ra.module_id,

//           ra.submodule_id,

//           ra.segment,

//           ra.main_module,

//           ra.add_access,

//           ra.edit_access,

//           ra.delete_access,

//           ra.print_access,

//           ra.export_access,

//           ra.active,

//           m.module_name,

//           m.module_url,

//           m.main_module,

//           m.segment,

//           m.sort_order

//         FROM role_access ra

//         LEFT JOIN modules m
//           ON ra.module_id =
//              m.module_id

//         WHERE
//           ra.role = @role
//           AND ra.active = 0

//         ORDER BY
//           m.sort_order ASC
//       `);

//     const assignedModules = [
//       ...new Set(result.recordset.map((item) => Number(item.module_id))),
//     ];

//     const detailedPermissions = result.recordset.map((item) => ({
//       ...item,

//       module_id: Number(item.module_id),

//       submodule_id: Number(item.submodule_id),

//       add_access: Number(item.add_access),

//       edit_access: Number(item.edit_access),

//       delete_access: Number(item.delete_access),

//       print_access: Number(item.print_access),

//       export_access: Number(item.export_access),
//     }));

//     return {
//       success: true,

//       assignedModules,

//       detailedPermissions,
//     };
//   } catch (error) {
//     console.error("GET ROLE PERMISSIONS ERROR:", error);

//     throw error;
//   }
// };

// const getPermissionsForRole = async (role) => {
//   try {
//     // console.log("Role :", role);
//     const pool = await poolPromise;

//     // ===========================
//     // GET ROLE MODULE
//     // ===========================

//     const roleModuleResult = await pool
//       .request()
//       .input("role", sql.VarChar, role).query(`
//         SELECT TOP 1 *
//         FROM role_module
//         WHERE role = @role
//       `);

//     // ===========================
//     // GET ROLE ACCESS
//     // ===========================

//     const permissionResult = await pool
//       .request()
//       .input("role", sql.VarChar, role).query(`
//         SELECT
//           ra.role,
//           ra.module_id,
//           ra.submodule_id,
//           ra.segment,
//           ra.main_module,
//           ra.add_access,
//           ra.edit_access,
//           ra.delete_access,
//           ra.print_access,
//           ra.export_access,
//           ra.active,
//           m.module_name,
//           m.module_url,
//           m.main_module,
//           m.segment,
//           m.sort_order
//         FROM role_access ra
//         LEFT JOIN modules m
//           ON ra.module_id = m.module_id
//         WHERE
//           ra.role = @role
//           AND ra.active = 0
//         ORDER BY
//           m.sort_order ASC
//       `);

//     // ===========================
//     // ASSIGNED MODULES
//     // FROM role_module
//     // ===========================

//     let assignedModules = [];

//     if (
//       roleModuleResult.recordset.length > 0 &&
//       roleModuleResult.recordset[0].submodules
//     ) {
//       assignedModules = roleModuleResult.recordset[0].submodules
//         .split(",")
//         .map((id) => Number(id.trim()))
//         .filter((id) => !isNaN(id));
//     }

//     // ===========================
//     // DETAILED PERMISSIONS
//     // ===========================

//     const detailedPermissions = permissionResult.recordset.map((item) => ({
//       ...item,
//       module_id: Number(item.module_id),
//       submodule_id: Number(item.submodule_id),
//       add_access: Number(item.add_access),
//       edit_access: Number(item.edit_access),
//       delete_access: Number(item.delete_access),
//       print_access: Number(item.print_access),
//       export_access: Number(item.export_access),
//     }));

//     return {
//       success: true,

//       roleModule: roleModuleResult.recordset[0] || null,

//       assignedModules,

//       detailedPermissions,
//     };
//   } catch (error) {
//     console.error("GET ROLE PERMISSIONS ERROR:", error);

//     throw error;
//   }
// };

const getPermissionsForRole = async (role) => {
  try {
    const pool = await poolPromise;

    // =====================================================
    // SUPER ADMIN - FULL ACCESS
    // =====================================================

    if (role?.trim().toUpperCase() === "SUPER ADMIN") {
      const modulesResult = await pool.request().query(`
          SELECT
            module_id,
            segment,
            main_module,
            module_name,
            module_url,
            sort_order
          FROM modules
          WHERE active = '0'
          ORDER BY sort_order ASC
        `);

      const detailedPermissions = modulesResult.recordset.map((item) => ({
        role: "SUPER ADMIN",

        module_id: Number(item.module_id),

        // Your modules table does not have submodule_id
        submodule_id: 0,

        segment: item.segment,
        main_module: item.main_module,

        // =========================================
        // FULL ACCESS
        // =========================================
        add_access: 1,
        edit_access: 1,
        delete_access: 1,
        print_access: 1,
        export_access: 1,

        active: 0,

        module_name: item.module_name,
        module_url: item.module_url,

        sort_order: Number(item.sort_order),
      }));

      const assignedModules = modulesResult.recordset.map((item) =>
        Number(item.module_id),
      );

      return {
        success: true,

        // SUPER ADMIN does not need role_module
        roleModule: null,

        assignedModules,

        detailedPermissions,
      };
    }

    // =====================================================
    // NORMAL ROLE PERMISSION
    // =====================================================

    // ===========================
    // GET ROLE MODULE
    // ===========================

    const roleModuleResult = await pool
      .request()
      .input("role", sql.VarChar, role).query(`
        SELECT TOP 1 *
        FROM role_module
        WHERE role = @role
      `);

    // ===========================
    // GET ROLE ACCESS
    // ===========================

    const permissionResult = await pool
      .request()
      .input("role", sql.VarChar, role).query(`
        SELECT
          ra.role,
          ra.module_id,
          ra.submodule_id,
          ra.segment,
          ra.main_module,
          ra.add_access,
          ra.edit_access,
          ra.delete_access,
          ra.print_access,
          ra.export_access,
          ra.active,
          m.module_name,
          m.module_url,
          m.main_module,
          m.segment,
          m.sort_order
        FROM role_access ra
        LEFT JOIN modules m
          ON ra.module_id = m.module_id
        WHERE
          ra.role = @role
          AND ra.active = 0
        ORDER BY
          m.sort_order ASC
      `);

    // ===========================
    // ASSIGNED MODULES
    // ===========================

    let assignedModules = [];

    if (
      roleModuleResult.recordset.length > 0 &&
      roleModuleResult.recordset[0].submodules
    ) {
      assignedModules = roleModuleResult.recordset[0].submodules
        .split(",")
        .map((id) => Number(id.trim()))
        .filter((id) => !isNaN(id));
    }

    // ===========================
    // DETAILED PERMISSIONS
    // ===========================

    const detailedPermissions = permissionResult.recordset.map((item) => ({
      ...item,

      module_id: Number(item.module_id),
      submodule_id: Number(item.submodule_id),

      add_access: Number(item.add_access),
      edit_access: Number(item.edit_access),
      delete_access: Number(item.delete_access),
      print_access: Number(item.print_access),
      export_access: Number(item.export_access),
    }));

    return {
      success: true,

      roleModule: roleModuleResult.recordset[0] || null,

      assignedModules,

      detailedPermissions,
    };
  } catch (error) {
    console.error("GET ROLE PERMISSIONS ERROR:", error);

    throw error;
  }
};

// ================= SAVE PERMISSIONS FOR ROLE =================
const savePermissionsForRole = async (data) => {
  const pool = await poolPromise;

  const { role, permissions = [] } = data;

  if (!role) {
    throw new Error("Role is required");
  }

  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // =====================================
    // DELETE OLD DATA (SAVE & UPDATE)
    // =====================================

    await new sql.Request(transaction).input("role", sql.VarChar, role).query(`
        DELETE FROM role_access
        WHERE role = @role;

        DELETE FROM role_module
        WHERE role = @role;
      `);

    // =====================================
    // KEEP ONLY CHECKED PERMISSIONS
    // =====================================

    const validPermissions = permissions.filter(
      (item) =>
        Number(item.add_access) === 1 ||
        Number(item.edit_access) === 1 ||
        Number(item.delete_access) === 1 ||
        Number(item.print_access) === 1 ||
        Number(item.export_access) === 1,
    );

    const moduleIds = [];
    const submoduleIds = [];
    const mainModules = [];

    // =====================================
    // INSERT ROLE ACCESS
    // =====================================

    for (const item of validPermissions) {
      moduleIds.push(Number(item.module_id || 0));

      submoduleIds.push(Number(item.submodule_id || item.module_id || 0));

      if (item.main_module) {
        mainModules.push(item.main_module);
      }

      await new sql.Request(transaction)
        .input("role", sql.VarChar, role)
        .input(
          "segment",
          sql.VarChar(255),
          item.segment != null ? String(item.segment) : "",
        )
        .input(
          "main_module",
          sql.VarChar(255),
          item.main_module != null ? String(item.main_module) : "",
        )
        .input(
          "submodule_id",
          sql.Int,
          item.submodule_id || item.module_id || 0,
        )
        .input("module_id", sql.Int, item.module_id || 0)
        .input("add_access", sql.Bit, item.add_access ? 1 : 0)
        .input("edit_access", sql.Bit, item.edit_access ? 1 : 0)
        .input("delete_access", sql.Bit, item.delete_access ? 1 : 0)
        .input("export_access", sql.Bit, item.export_access ? 1 : 0)
        .input("print_access", sql.Bit, item.print_access ? 1 : 0).query(`
          INSERT INTO role_access (
            role,
            segment,
            main_module,
            submodule_id,
            module_id,
            add_access,
            edit_access,
            delete_access,
            export_access,
            print_access,
            active
          )
          VALUES (
            @role,
            @segment,
            @main_module,
            @submodule_id,
            @module_id,
            @add_access,
            @edit_access,
            @delete_access,
            @export_access,
            @print_access,
            0
          )
        `);
    }

    // =====================================
    // INSERT ROLE MODULE
    // =====================================

    if (validPermissions.length > 0) {
      const uniqueMainModules = [...new Set(mainModules)];
      const uniqueSubmoduleIds = [...new Set(submoduleIds)];

      await new sql.Request(transaction)
        .input("role", sql.VarChar, role)
        .input("modules", sql.NVarChar(sql.MAX), uniqueMainModules.join(","))
        .input(
          "submodules",
          sql.NVarChar(sql.MAX),
          uniqueSubmoduleIds.join(","),
        )
        .input("source", sql.VarChar, null).query(`
          INSERT INTO role_module (
            role,
            modules,
            submodules,
            source
          )
          VALUES (
            @role,
            @modules,
            @submodules,
            @source
          )
        `);
    }

    // =====================================
    // COMMIT
    // =====================================

    await transaction.commit();

    return {
      success: true,
      message: "Permissions saved successfully",
    };
  } catch (err) {
    try {
      if (transaction._aborted !== true) {
        await transaction.rollback();
      }
    } catch (rollbackErr) {
      console.error("ROLLBACK ERROR:", rollbackErr);
    }

    console.error("SAVE ROLE ACCESS ERROR:", err);
    throw err;
  }
};

// ================= GET MY MENU =================
// const getMyMenu = async (user) => {
//   const pool = await poolPromise;

//   if (!user || !user.role) {
//     throw new Error("User role not found");
//   }

//   const role = user.role;

//   // ================= GET ROLE MODULE DATA =================
//   const roleModuleResult = await pool.request().input("role", sql.VarChar, role)
//     .query(`
//       SELECT modules, submodules
//       FROM role_module
//       WHERE role = @role
//     `);

//   if (!roleModuleResult.recordset.length) {
//     return [];
//   }

//   const submodulesCsv = roleModuleResult.recordset[0]?.submodules;

//   if (!submodulesCsv) {
//     return [];
//   }

//   // ================= PARSE SUBMODULE IDS =================
//   const allowedSubmodules = submodulesCsv
//     .split(",")
//     .map((s) => parseInt(s.trim()))
//     .filter(Boolean);

//   if (allowedSubmodules.length === 0) {
//     return [];
//   }

//   // ================= SAFE PARAM QUERY (FIXED SQL INJECTION) =================
//   const placeholders = allowedSubmodules.map((_, i) => `@id${i}`).join(",");

//   const request = pool.request();

//   allowedSubmodules.forEach((id, i) => {
//     request.input(`id${i}`, sql.Int, id);
//   });

//   const modulesResult = await request.query(`
//     SELECT module_id, module_name, main_module
//     FROM modules
//     WHERE module_id IN (${placeholders})
//       AND active = 0
//     ORDER BY sort_order ASC
//   `);

//   const moduleRows = modulesResult.recordset;

//   // ================= BUILD MENU =================
//   const menu = [];
//   const moduleMap = {};

//   moduleRows.forEach((row) => {
//     if (!moduleMap[row.main_module]) {
//       moduleMap[row.main_module] = {
//         moduleName: row.main_module,
//         submodules: [],
//       };

//       menu.push(moduleMap[row.main_module]);
//     }

//     moduleMap[row.main_module].submodules.push({
//       moduleId: row.module_id,
//       moduleName: row.module_name,
//     });
//   });

//   return menu;
// };

const getMyMenu = async (user) => {
  const pool = await poolPromise;

  if (!user || !user.role) {
    throw new Error("User role not found");
  }

  const role = user.role;

  // ================= SUPER ADMIN =================
  if (String(role).trim().toUpperCase() === "SUPER ADMIN") {
    const modulesResult = await pool.request().query(`
      SELECT module_id, module_name, main_module
      FROM modules
      WHERE active = 0
      ORDER BY sort_order ASC
    `);

    const moduleRows = modulesResult.recordset;

    const menu = [];
    const moduleMap = {};

    moduleRows.forEach((row) => {
      if (!moduleMap[row.main_module]) {
        moduleMap[row.main_module] = {
          moduleName: row.main_module,
          submodules: [],
        };

        menu.push(moduleMap[row.main_module]);
      }

      moduleMap[row.main_module].submodules.push({
        moduleId: row.module_id,
        moduleName: row.module_name,
      });
    });

    return menu;
  }

  // ================= GET ROLE MODULE DATA =================
  const roleModuleResult = await pool.request().input("role", sql.VarChar, role)
    .query(`
      SELECT modules, submodules
      FROM role_module
      WHERE role = @role
    `);

  if (!roleModuleResult.recordset.length) {
    return [];
  }

  const submodulesCsv = roleModuleResult.recordset[0]?.submodules;

  if (!submodulesCsv) {
    return [];
  }

  // ================= PARSE SUBMODULE IDS =================
  const allowedSubmodules = submodulesCsv
    .split(",")
    .map((s) => parseInt(s.trim()))
    .filter(Boolean);

  if (allowedSubmodules.length === 0) {
    return [];
  }

  // ================= SAFE PARAM QUERY =================
  const placeholders = allowedSubmodules.map((_, i) => `@id${i}`).join(",");

  const request = pool.request();

  allowedSubmodules.forEach((id, i) => {
    request.input(`id${i}`, sql.Int, id);
  });

  const modulesResult = await request.query(`
    SELECT module_id, module_name, main_module
    FROM modules
    WHERE module_id IN (${placeholders})
      AND active = 0
    ORDER BY sort_order ASC
  `);

  const moduleRows = modulesResult.recordset;

  // ================= BUILD MENU =================
  const menu = [];
  const moduleMap = {};

  moduleRows.forEach((row) => {
    if (!moduleMap[row.main_module]) {
      moduleMap[row.main_module] = {
        moduleName: row.main_module,
        submodules: [],
      };

      menu.push(moduleMap[row.main_module]);
    }

    moduleMap[row.main_module].submodules.push({
      moduleId: row.module_id,
      moduleName: row.module_name,
    });
  });

  return menu;
};

module.exports = {
  getAllRoles,
  getAllModules,
  getPermissionsForRole,
  savePermissionsForRole,
  getMyMenu,
};
