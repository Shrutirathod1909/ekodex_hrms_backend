const mongoose = require('mongoose');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const Module = require('./models/Module');

dotenv.config();

// Helper function to create URL-friendly paths
const createPath = (moduleName, submoduleName) => {
    const modulePath = moduleName.toLowerCase().replace(/ /g, '-');
    const submodulePath = submoduleName.toLowerCase().replace(/[/ ]/g, '-');
    return `/${modulePath}/${submodulePath}`;
};

const seedDatabase = async () => {
    try {
        await connectDB();

        // 1. Clear all previous data to ensure a fresh start
        console.log('Clearing old data...');
        await Permission.deleteMany();
        await Module.deleteMany();
        await Role.deleteMany();
        console.log('Old data cleared.');

        // 2. Create your exact roles
        console.log('Creating roles...');
        const rolesToCreate = [
            { name: "Admin" }, { name: "HR" }, { name: "Client" }, { name: "Employee" }
        ];
        const createdRoles = await Role.insertMany(rolesToCreate);
        console.log('Roles created.');

        // 3. Create your exact modules with auto-generated paths
        console.log('Creating modules...');
        const modulesToCreate = [
            { name: "Master", submodules: ["Companies", "Branches", "Users", "User Access"] },
            { name: "Add New", submodules: ["Client", "Holidays", "Salary Templates", "Charges Type"] },
            { name: "Employee", submodules: ["Employee Types", "Employees"] },
            { name: "Attendance", submodules: ["Attendance by Employee", "Time / Rokada Base Attendance"] },
            { name: "Billing", submodules: [] },
            { name: "Salary", submodules: ["Salary by Employee", "Salary by Site", "Upload Wages Sheet"] },
            { name: "Vouchers", submodules: [] },
            { name: "Reports", submodules: ["MIS", "Ledger"] }
        ];

        const modulesWithPaths = modulesToCreate.map(module => ({
            name: module.name,
            submodules: module.submodules.map(submoduleName => ({
                name: submoduleName,
                path: createPath(module.name, submoduleName)
            }))
        }));
        
        const createdModules = await Module.insertMany(modulesWithPaths);
        console.log('Modules with paths created.');

        // // 4. SET DEFAULT PERMISSIONS FOR ADMIN
        // console.log('Setting default permissions for Admin...');
        // const adminRole = createdRoles.find(role => role.name === 'Admin');
        // if (adminRole) {
        //     // Get all module and submodule IDs
        //     const allModuleIds = createdModules.map(m => m._id);
        //     const allDetailedPermissions = createdModules.flatMap(module => 
        //         module.submodules.map(submodule => ({
        //             submoduleId: submodule._id,
        //             submoduleName: submodule.name,
        //             path: submodule.path,
        //             canAdd: true,
        //             canEdit: true,
        //             canDelete: true,
        //             canPrint: true,
        //             canExport: true
        //         }))
        //     );

        //     // Create the permission document for the Admin
        //     const adminPermissions = new Permission({
        //         roleId: adminRole._id,
        //         assignedModules: allModuleIds,
        //         detailedPermissions: allDetailedPermissions
        //     });
        //     await adminPermissions.save();
        //     console.log('✅ Admin permissions have been set!');
        // }

        // console.log('✅✅✅ Seed process completed successfully!');
        // process.exit();

    } catch (error) {
        console.error('❌❌❌ Error during seed process:', error);
        process.exit(1);
    }
};

seedDatabase();