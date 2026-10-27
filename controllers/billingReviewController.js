const billingReviewModel = require("../models/billingReviewModel");

// =====================================================
// GET BILLING FORMAT
// =====================================================

const getBillingFormat = async (req, res) => {
  try {

    const {
      site,
      m,
      y,
      type,
    } = req.query;

    console.log("");
    console.log("========================================");
    console.log("GET BILLING FORMAT");
    console.log("site :", site);
    console.log("month:", m);
    console.log("year :", y);
    console.log("type :", type);
    console.log("========================================");

    if (!site || !m || !y || !type) {

      return res.status(400).json({
        success: false,
        message:
          "site, m, y and type are required",
      });

    }

    const empWages =
      await billingReviewModel.getEmpWagesBySite(
        site,
        m,
        y,
        type
      );

    const siteData =
      await billingReviewModel.getSiteDetail(site);

    if (!siteData || siteData.length === 0) {

      return res.status(404).json({
        success: false,
        message:
          "Site details not found",
      });

    }

    const siteDetail = siteData[0];

    const clientData =
      await billingReviewModel.getClientDetail(
        siteDetail.client_id
      );

    let companyData = [];

    if (
      clientData &&
      clientData.length > 0 &&
      clientData[0].billing_company_id
    ) {

      companyData =
        await billingReviewModel.getCompanyDetail(
          clientData[0].billing_company_id
        );

    }

    return res.status(200).json({

      success: true,

      message:
        "Billing format fetched successfully",

      data: {

        emp_wages:
          empWages || [],

        sitedetail:
          siteData || [],

        clientdetail:
          clientData || [],

        company_detail:
          companyData || [],

      },

    });

  } catch (error) {

    console.error(
      "getBillingFormat ERROR:",
      error
    );

    return res.status(500).json({

      success: false,

      message:
        "Failed to get billing format",

      error:
        error.message,

    });

  }
};


// =====================================================
// REVIEW BILLING
// =====================================================

const reviewBilling = async (req, res) => {

  try {

    // =================================================
    // QUERY PARAMS
    // =================================================

    const siteId =
      req.query.site;

    const month =
      req.query.m;

    const year =
      req.query.y;

    const attType =
      req.query.type;


    // =================================================
    // DEBUG
    // =================================================

    console.log("");
    console.log(
      "========================================"
    );

    console.log(
      "          REVIEW BILLING"
    );

    console.log(
      "========================================"
    );

    console.log(
      "siteId  :",
      siteId
    );

    console.log(
      "month   :",
      month
    );

    console.log(
      "year    :",
      year
    );

    console.log(
      "attType :",
      attType
    );

    console.log(
      "========================================"
    );


    // =================================================
    // VALIDATION
    // =================================================

    if (
      !siteId ||
      !month ||
      !year ||
      !attType
    ) {

      return res.status(400).json({

        success: false,

        message:
          "site, m, y and type are required",

      });

    }


    // =================================================
    // 1. EMP WAGES
    // =================================================

    console.log(
      "STEP 1: Getting emp_wages..."
    );

    const empWages =
      await billingReviewModel.getEmpWagesBySite(
        siteId,
        month,
        year,
        attType
      );

    console.log(
      "empWages count:",
      empWages.length
    );


    // =================================================
    // 2. SITE DETAIL
    // =================================================

    console.log(
      "STEP 2: Getting site detail..."
    );

    const siteData =
      await billingReviewModel.getSiteDetail(
        siteId
      );

    console.log(
      "siteData count:",
      siteData.length
    );


    if (
      !siteData ||
      siteData.length === 0
    ) {

      return res.status(404).json({

        success: false,

        message:
          "Site details not found",

      });

    }


    const siteDetail =
      siteData[0];


    // =================================================
    // 3. CLIENT
    // =================================================

    console.log(
      "STEP 3: Getting client detail..."
    );

    const clientId =
      siteDetail.client_id;

    const clientData =
      await billingReviewModel.getClientDetail(
        clientId
      );

    console.log(
      "clientData count:",
      clientData.length
    );


    // =================================================
    // 4. COMPANY
    // =================================================

    console.log(
      "STEP 4: Getting company detail..."
    );

    let companyData = [];


    if (
      clientData &&
      clientData.length > 0 &&
      clientData[0].billing_company_id
    ) {

      companyData =
        await billingReviewModel.getCompanyDetail(
          clientData[0].billing_company_id
        );

    }

    console.log(
      "companyData count:",
      companyData.length
    );


    // =================================================
    // 5. WAGES HEADER
    // =================================================

    let wagesSection = [];


    if (
      siteDetail.wages_header
    ) {

      wagesSection =
        String(
          siteDetail.wages_header
        )
          .split(",")
          .map(
            (item) =>
              item.trim()
          )
          .filter(Boolean);

    }


    // =================================================
    // 6. MONTH NAME
    // =================================================

    const monthNames = [

      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",

    ];


    const monthNumber =
      Number(month);


    const monthName =
      monthNumber >= 1 &&
      monthNumber <= 12
        ? monthNames[
            monthNumber - 1
          ]
        : "";


    // =================================================
    // DEFAULT BILLING DATA
    // =================================================

    let orderInfo = [];

    let orderInfoPF = [];

    let orderInfoPT = [];

    let orderInfoOT = [];

    let orderInfoESIC = [];

    let orderInfoBonus = [];

    let orderInfoServiceCharges = [];

    let actualCharges = [];


    // =================================================
    // 7. CUSTOMIZE WAGES
    // =================================================

    if (
      attType ===
      "customize_wages"
    ) {

      console.log(
        "STEP 7: customize_wages"
      );


      /*
        Legacy PHP:

        getbilling_setting()
        getcustomize_wagestotal()

        जर तुमच्या DB मध्ये billing_setting
        table/function असेल तर पुढे add करू शकतो.
      */

      orderInfo = [];

    }


    // =================================================
    // 8. NORMAL BILLING
    // =================================================

    else if (
      Number(
        siteDetail.bill_without_rank
      ) === 0
    ) {

      console.log(
        "STEP 8: NORMAL BILLING"
      );


      // ===============================================
      // BILLING TYPE
      // ===============================================

      let billingType = "";


      if (
        empWages &&
        empWages.length > 0
      ) {

        billingType =
          empWages[0]
            .billing_type || "";

      }


      console.log(
        "billingType:",
        billingType
      );


      // ===============================================
      // MAIN ORDER INFO
      // ===============================================

      if (
        billingType ===
        "ROKADA"
      ) {

        console.log(
          "Using ROKADA"
        );

        orderInfo =
          await billingReviewModel
            .getEmpWagesForOrderInfoRokada(
              siteId,
              month,
              year,
              attType
            );

      }

      else {

        console.log(
          "Using NORMAL"
        );

        orderInfo =
          await billingReviewModel
            .getEmpWagesForOrderInfo(
              siteId,
              month,
              year,
              attType
            );

      }


      // ===============================================
      // PF
      // ===============================================

      console.log(
        "Getting PF..."
      );

      orderInfoPF =
        await billingReviewModel.getEmpWagesPF(
          siteId,
          month,
          year,
          attType
        );


      // ===============================================
      // PT
      // ===============================================

      console.log(
        "Getting PT..."
      );

      orderInfoPT =
        await billingReviewModel.getEmpWagesPT(
          siteId,
          month,
          year,
          attType
        );


      // ===============================================
      // OT
      // ===============================================

      console.log(
        "Getting OT..."
      );

      orderInfoOT =
        await billingReviewModel.getEmpWagesOT(
          siteId,
          month,
          year,
          attType
        );


      // ===============================================
      // ESIC
      // ===============================================

      console.log(
        "Getting ESIC..."
      );

      orderInfoESIC =
        await billingReviewModel.getEmpWagesESIC(
          siteId,
          month,
          year,
          attType
        );


      // ===============================================
      // BONUS
      // ===============================================

      console.log(
        "Getting BONUS..."
      );

      orderInfoBonus =
        await billingReviewModel.getEmpWagesBonus(
          siteId,
          month,
          year,
          attType
        );


      // ===============================================
      // SERVICE CHARGES
      // ===============================================

      console.log(
        "Getting SERVICE CHARGES..."
      );

      orderInfoServiceCharges =
        await billingReviewModel
          .getEmpWagesServiceCharges(
            siteId,
            month,
            year,
            attType
          );


      // ===============================================
      // ACTUAL CHARGES
      // ===============================================

      console.log(
        "Getting ACTUAL CHARGES..."
      );

      actualCharges =
        await billingReviewModel
          .getActualChargesBySite(
            siteId,
            month,
            year,
            attType
          );

    }


    // =================================================
    // 9. BILL WITHOUT RANK
    // =================================================

    else {

      console.log(
        "STEP 9: BILL WITHOUT RANK"
      );


      orderInfo =
        await billingReviewModel
          .getEmpWagesForBillingWithoutRank(
            siteId,
            month,
            year,
            attType
          );


      orderInfoServiceCharges =
        await billingReviewModel
          .getEmpWagesServiceCharges(
            siteId,
            month,
            year,
            attType
          );


      actualCharges =
        await billingReviewModel
          .getActualChargesBySite(
            siteId,
            month,
            year,
            attType
          );

    }


    // =================================================
    // 10. RESPONSE DATA
    // =================================================

    const responseData = {

      // Employee wages
      emp_wages:
        empWages || [],


      // Site
      sitedetail:
        siteData || [],


      // Client
      clientdetail:
        clientData || [],


      // Company
      company_detail:
        companyData || [],


      // Wage headers
      wages_section:
        wagesSection,


      // Month
      monthname:
        monthName,

      month:
        month,

      year:
        year,


      // Attendance type
      att_type:
        attType,


      // Main billing
      order_info:
        orderInfo || [],


      // PF
      order_info_pf:
        orderInfoPF || [],


      // PT
      order_info_pt:
        orderInfoPT || [],


      // OT
      order_info_ot:
        orderInfoOT || [],


      // ESIC
      order_info_esic:
        orderInfoESIC || [],


      // Bonus
      order_info_bonus:
        orderInfoBonus || [],


      // Service charges
      order_info_service_charges:
        orderInfoServiceCharges || [],


      // Actual charges
      atactual_charges:
        actualCharges || [],


      // Same data with alternative key
      at_actual_charges:
        actualCharges || [],

    };


    // =================================================
    // DEBUG RESULT
    // =================================================

    console.log("");
    console.log(
      "========================================"
    );

    console.log(
      "       BILLING REVIEW RESULT"
    );

    console.log(
      "========================================"
    );

    console.log(
      "emp_wages:",
      empWages.length
    );

    console.log(
      "order_info:",
      orderInfo.length
    );

    console.log(
      "PF:",
      orderInfoPF
    );

    console.log(
      "PT:",
      orderInfoPT
    );

    console.log(
      "OT:",
      orderInfoOT
    );

    console.log(
      "ESIC:",
      orderInfoESIC
    );

    console.log(
      "BONUS:",
      orderInfoBonus
    );

    console.log(
      "SERVICE:",
      orderInfoServiceCharges
    );

    console.log(
      "ACTUAL CHARGES:",
      actualCharges
    );

    console.log(
      "========================================"
    );


    // =================================================
    // RESPONSE
    // =================================================

    return res.status(200).json({

      success: true,

      message:
        "Billing review fetched successfully",

      data:
        responseData,

    });

  }


  // ===================================================
  // ERROR
  // ===================================================

  catch (error) {

    console.error("");
    console.error(
      "========================================"
    );

    console.error(
      "       REVIEW BILLING ERROR"
    );

    console.error(
      "========================================"
    );

    console.error(
      "Message:",
      error.message
    );

    console.error(
      "Stack:",
      error.stack
    );

    console.error(
      "========================================"
    );


    return res.status(500).json({

      success: false,

      message:
        "Billing review failed",

      error:
        error.message,

    });

  }

};


// =====================================================
// CONTROLLER EXPORT
// =====================================================

console.log(
  "========================================"
);

console.log(
  "billingController.js LOADED"
);

console.log(
  "reviewBilling type:",
  typeof reviewBilling
);

console.log(
  "getBillingFormat type:",
  typeof getBillingFormat
);

console.log(
  "========================================"
);


module.exports = {

  getBillingFormat,

  reviewBilling,

};


console.log(
  "FINAL EXPORT:",
  module.exports
);