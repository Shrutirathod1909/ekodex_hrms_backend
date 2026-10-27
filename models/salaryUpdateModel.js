const sql = require("mssql");
const { poolPromise } = require("../config/db");

const salaryUpdateModel = {

    // =========================================================
    // UPDATE EMPLOYEE SALARY
    // + INSERT FULL EMPLOYEE DATA INTO EMPLOYEE_LOG
    // =========================================================
    updateEmployeeSalary: async (data, userId) => {

        const pool = await poolPromise;

        const transaction =
            new sql.Transaction(pool);

        try {

            // =====================================================
            // START TRANSACTION
            // =====================================================

            await transaction.begin();

            // =====================================================
            // 1. UPDATE EMPLOYEE
            // =====================================================

            const updateRequest =
                new sql.Request(transaction);

            updateRequest

                // -------------------------------------------------
                // EMPLOYEE ID
                // -------------------------------------------------

                .input(
                    "employeeId",
                    sql.BigInt,
                    data.employeeId
                )

                // -------------------------------------------------
                // SALARY TEMPLATE ID
                // -------------------------------------------------

                .input(
                    "salary_template_id",
                    sql.BigInt,
                    data.salary_template_id
                        ? Number(data.salary_template_id)
                        : null
                )

                // -------------------------------------------------
                // SALARY TEMPLATE NAME
                // -------------------------------------------------

                .input(
                    "salary_template",
                    sql.NVarChar(255),
                    data.salary_template || null
                )

                // -------------------------------------------------
                // GROSS SALARY
                // -------------------------------------------------

                .input(
                    "gross_salary",
                    sql.NVarChar(50),
                    data.gross_salary || null
                )

                .input(
                    "gross_salary_type",
                    sql.NVarChar(50),
                    data.gross_salary_type || null
                )

                // -------------------------------------------------
                // BASIC SALARY
                // -------------------------------------------------

                .input(
                    "basic_salary",
                    sql.NVarChar(50),
                    data.basic_salary || null
                )

                .input(
                    "basic_salary_type",
                    sql.NVarChar(50),
                    data.basic_salary_type || null
                )

                // -------------------------------------------------
                // SALARY DATE
                // -------------------------------------------------

                .input(
                    "sal_from_date",
                    sql.NVarChar(50),
                    data.sal_from_date || null
                )

                .input(
                    "sal_to_date",
                    sql.NVarChar(50),
                    data.sal_to_date || null
                )

                // -------------------------------------------------
                // SALARY RULES
                // -------------------------------------------------

                .input(
                    "da_term",
                    sql.NVarChar(50),
                    data.da_term || null
                )

                .input(
                    "basic_term",
                    sql.NVarChar(50),
                    data.basic_term || null
                )

                // -------------------------------------------------
                // PER DAY SALARY
                // -------------------------------------------------

                .input(
                    "perday_salary",
                    sql.NVarChar(50),
                    data.perday_salary || null
                )

                // -------------------------------------------------
                // MODIFIED BY
                // -------------------------------------------------

                .input(
                    "modified_by",
                    sql.BigInt,
                    userId || null
                );


            // =====================================================
            // EXECUTE EMPLOYEE UPDATE
            // =====================================================

            const updateResult =
                await updateRequest.query(`

                    UPDATE employee

                    SET

                        -- =========================================
                        -- SALARY TEMPLATE
                        -- =========================================

                        salary_template_id =
                            @salary_template_id,

                        salary_template =
                            @salary_template,

                        -- =========================================
                        -- GROSS SALARY
                        -- =========================================

                        gross_salary =
                            @gross_salary,

                        gross_salary_type =
                            @gross_salary_type,

                        -- =========================================
                        -- BASIC SALARY
                        -- =========================================

                        basic_salary =
                            @basic_salary,

                        basic_salary_type =
                            @basic_salary_type,

                        -- =========================================
                        -- SALARY DATES
                        -- =========================================

                        sal_from_date =
                            @sal_from_date,

                        sal_to_date =
                            @sal_to_date,

                        -- =========================================
                        -- SALARY RULES
                        -- =========================================

                        da_term =
                            @da_term,

                        basic_term =
                            @basic_term,

                        -- =========================================
                        -- PER DAY SALARY
                        -- =========================================

                        perday_salary =
                            @perday_salary,

                        -- =========================================
                        -- MODIFIED
                        -- =========================================

                        modified_by =
                            @modified_by,

                        modified_on =
                            GETDATE()

                    WHERE id =
                        @employeeId;

                `);


            // =====================================================
            // CHECK EMPLOYEE EXISTS
            // =====================================================

            if (
                updateResult.rowsAffected[0] === 0
            ) {

                throw new Error(
                    "Employee not found"
                );

            }


            // =====================================================
            // 2. INSERT UPDATED EMPLOYEE DATA INTO EMPLOYEE_LOG
            // =====================================================

            const logRequest =
                new sql.Request(transaction);

            logRequest.input(
                "employeeId",
                sql.BigInt,
                data.employeeId
            );


            await logRequest.query(`

                INSERT INTO employee_log
                (

                    employee_code,
                    initial,
                    first_name,
                    middle_name,
                    last_name,
                    gender,
                    dob,
                    date_of_joining,
                    address,
                    city,
                    state,
                    pincode,
                    country,
                    phone1,
                    phone2,
                    email_id,
                    contact_person,
                    contact_mobile,
                    p_address,
                    p_city,
                    p_state,
                    p_pincode,
                    p_country,
                    p_phone1,
                    p_phone2,
                    contact_relation,
                    contact_email,
                    marital_status,
                    mrg_date,
                    cast,
                    category,
                    native_place,
                    blood_group,
                    driving_license,
                    pancard_no,
                    aadhar_no,
                    passport_no,
                    uan_no,
                    passport_valid_date,

                    lang1,
                    lang2,
                    lang3,
                    lang4,
                    lang5,

                    hobby1,
                    hobby2,
                    hobby3,
                    hobby4,

                    bank_name,
                    account_no,
                    bank_address,
                    bank_city,
                    bank_state,
                    bank_ifsc,
                    bank_micr,
                    cancelled_cheque_image,

                    active,
                    branch_id,
                    company_id,
                    created_by,
                    created_on,
                    modified_by,
                    modified_on,
                    disabled_by,
                    disabled_on,

                    rank,
                    department,
                    client_id,
                    site_id,

                    reporting_manager,
                    reporting_user,

                    separation_type,
                    separate_reason,
                    date_of_separation,
                    notice_period,
                    last_working_date_sp,
                    handover_given_to,

                    -- =========================================
                    -- SALARY TEMPLATE
                    -- =========================================

                    salary_template_id,
                    salary_template,

                    -- =========================================
                    -- SALARY
                    -- =========================================

                    gross_salary,
                    gross_salary_type,

                    basic_salary,
                    basic_salary_type,

                    sal_from_date,
                    sal_to_date,

                    pf_no,
                    esis_no,
                    pf_applicable,
                    ac_holder_name,
                    card_no,

                    da_term,
                    basic_term,

                    gang_name,
                    em_status,
                    perday_salary,

                    password,
                    user_id,
                    doc_name,

                    client_code,
                    site_name,
                    client_name,

                    emp_stages,
                    source,

                    resume_img_path,
                    appointment_letter_img_path,

                    Verify_remarks,
                    manager_login,

                    father_name,

                    esis_date,
                    uan_date,

                    emp_full_name,

                    migrant_status,
                    convert_emp,

                    Verify_by,
                    Verify_on,
                    Verify_name,

                    native_address,
                    native_city,
                    native_state,
                    native_pincode,
                    native_country,

                    new_site_id,

                    shift_type,
                    site_hours,

                    login_from_date,
                    login_to_date,

                    emp_duty_remark,
                    emp_duty_status,

                    created_by_name,
                    modified_by_name,

                    -- =========================================
                    -- LOG DETAILS
                    -- =========================================

                    activity_id,
                    activity_remark,

                    reference_relation,
                    reference_mobile,
                    reference_name,

                    offer_letter_img_path,
                    disabled_by_name,

                    offer_letter_issued_on,

                    reg_date,
                    joinee_emp_id,

                    offer_letter_ref_no,

                    emp_id_card,
                    employee_logo

                )

                SELECT

                    employee_code,
                    initial,
                    first_name,
                    middle_name,
                    last_name,
                    gender,
                    dob,
                    date_of_joining,
                    address,
                    city,
                    state,
                    pincode,
                    country,
                    phone1,
                    phone2,
                    email_id,
                    contact_person,
                    contact_mobile,
                    p_address,
                    p_city,
                    p_state,
                    p_pincode,
                    p_country,
                    p_phone1,
                    p_phone2,
                    contact_relation,
                    contact_email,
                    marital_status,
                    mrg_date,
                    cast,
                    category,
                    native_place,
                    blood_group,
                    driving_license,
                    pancard_no,
                    aadhar_no,
                    passport_no,
                    uan_no,
                    passport_valid_date,

                    lang1,
                    lang2,
                    lang3,
                    lang4,
                    lang5,

                    hobby1,
                    hobby2,
                    hobby3,
                    hobby4,

                    bank_name,
                    account_no,
                    bank_address,
                    bank_city,
                    bank_state,
                    bank_ifsc,
                    bank_micr,
                    cancelled_cheque_image,

                    active,
                    branch_id,
                    company_id,
                    created_by,
                    created_on,
                    modified_by,
                    modified_on,
                    disabled_by,
                    disabled_on,

                    rank,
                    department,
                    client_id,
                    site_id,

                    reporting_manager,
                    reporting_user,

                    separation_type,
                    separate_reason,
                    date_of_separation,
                    notice_period,
                    last_working_date_sp,
                    handover_given_to,

                    -- =========================================
                    -- SALARY TEMPLATE
                    -- =========================================

                    salary_template_id,
                    salary_template,

                    -- =========================================
                    -- SALARY
                    -- =========================================

                    gross_salary,
                    gross_salary_type,

                    basic_salary,
                    basic_salary_type,

                    sal_from_date,
                    sal_to_date,

                    pf_no,
                    esis_no,
                    pf_applicable,
                    ac_holder_name,
                    card_no,

                    da_term,
                    basic_term,

                    gang_name,
                    em_status,
                    perday_salary,

                    password,
                    user_id,
                    doc_name,

                    client_code,
                    site_name,
                    client_name,

                    emp_stages,
                    source,

                    resume_img_path,
                    appointment_letter_img_path,

                    Verify_remarks,
                    manager_login,

                    father_name,

                    esis_date,
                    uan_date,

                    emp_full_name,

                    migrant_status,
                    convert_emp,

                    Verify_by,
                    Verify_on,
                    Verify_name,

                    native_address,
                    native_city,
                    native_state,
                    native_pincode,
                    native_country,

                    new_site_id,

                    shift_type,
                    site_hours,

                    login_from_date,
                    login_to_date,

                    emp_duty_remark,
                    emp_duty_status,

                    created_by_name,
                    modified_by_name,

                    -- =========================================
                    -- LOG DETAILS
                    -- =========================================

                    id,
                    'Salary Updated',

                    reference_relation,
                    reference_mobile,
                    reference_name,

                    offer_letter_img_path,
                    disabled_by_name,

                    offer_letter_issued_on,

                    reg_date,
                    joinee_emp_id,

                    offer_letter_ref_no,

                    emp_id_card,
                    employee_logo

                FROM employee

                WHERE id =
                    @employeeId;

            `);


            // =====================================================
            // 3. GET UPDATED EMPLOYEE
            // =====================================================

            const result =
                await new sql.Request(transaction)

                    .input(
                        "employeeId",
                        sql.BigInt,
                        data.employeeId
                    )

                    .query(`

                        SELECT

                            id,
                            employee_code,
                            emp_full_name,

                            -- =================================
                            -- SALARY TEMPLATE
                            -- =================================

                            salary_template_id,
                            salary_template,

                            -- =================================
                            -- SALARY
                            -- =================================

                            gross_salary,
                            gross_salary_type,

                            basic_salary,
                            basic_salary_type,

                            sal_from_date,
                            sal_to_date,

                            da_term,
                            basic_term,

                            perday_salary,

                            modified_by,
                            modified_on

                        FROM employee

                        WHERE id =
                            @employeeId;

                    `);


            // =====================================================
            // 4. COMMIT
            // =====================================================

            await transaction.commit();


            // =====================================================
            // RETURN UPDATED EMPLOYEE
            // =====================================================

            return result.recordset[0];

        } catch (error) {

            // =====================================================
            // ROLLBACK
            // =====================================================

            try {

                await transaction.rollback();

            } catch (rollbackError) {

                console.error(
                    "Rollback Error:",
                    rollbackError
                );

            }


            console.error(
                "Salary Update Model Error:",
                error
            );


            throw error;
        }
    },


    // =========================================================
    // GET EMPLOYEE SALARY
    // =========================================================

    getEmployeeSalary: async (employeeId) => {

        const pool =
            await poolPromise;


        const result =
            await pool
                .request()

                .input(
                    "employeeId",
                    sql.BigInt,
                    employeeId
                )

                .query(`

                    SELECT

                        id,
                        employee_code,
                        emp_full_name,

                        -- =================================
                        -- SALARY TEMPLATE
                        -- =================================

                        salary_template_id,
                        salary_template,

                        -- =================================
                        -- SALARY
                        -- =================================

                        gross_salary,
                        gross_salary_type,

                        basic_salary,
                        basic_salary_type,

                        sal_from_date,
                        sal_to_date,

                        da_term,
                        basic_term,

                        perday_salary,

                        modified_by,
                        modified_on

                    FROM employee

                    WHERE id =
                        @employeeId;

                `);


        return result.recordset[0];
    }

};


module.exports = salaryUpdateModel;