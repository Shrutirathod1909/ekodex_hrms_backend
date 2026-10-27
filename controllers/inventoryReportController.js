// ======================================================
// controllers/inventoryReportController.js
// ======================================================

const { Parser } = require("json2csv");

const InventoryReportModel =
  require("../models/inventoryReportModel");

// ======================================================
// COMMON CALCULATION FUNCTION
// ======================================================

const generateInventoryData = async () => {

  const logs =
    await InventoryReportModel
      .getInventoryReport();

  let fifoQueue = {};

  let movingAverage = {};

  let weightedAverage = {};

  let previousClosing = {};

  let finalData = [];

  for (const item of logs) {

    const sku = item.sku_code;

    const price =
      Number(item.purchase_price || 0);

    // ======================================================
    // INIT
    // ======================================================

    if (!fifoQueue[sku]) {
      fifoQueue[sku] = [];
    }

    if (!movingAverage[sku]) {

      movingAverage[sku] = {

        totalQty: 0,
        totalValue: 0,
        avg: 0
      };
    }

    if (!weightedAverage[sku]) {

      weightedAverage[sku] = {

        totalQty: 0,
        totalValue: 0,
        avg: 0
      };
    }

    // ======================================================
    // OPENING / IN / OUT
    // ======================================================

    let openingQty =
      previousClosing[sku] || 0;

    let inQty = 0;

    let outQty = 0;

    let fifoCost = 0;

    // ======================================================
    // GOOD RECEIVED
    // ======================================================

    if (
      item.transaction_type ===
      "GOOD_RECEIVED"
    ) {

      inQty = Number(item.qty || 0);

      // FIFO PUSH
      fifoQueue[sku].push({

        qty: Number(item.qty || 0),

        price
      });

      // MOVING AVG
      movingAverage[sku].totalQty +=
        Number(item.qty || 0);

      movingAverage[sku].totalValue +=
        Number(item.qty || 0) * price;

      movingAverage[sku].avg =

        movingAverage[sku].totalValue /

        movingAverage[sku].totalQty;

      // WEIGHTED AVG
      weightedAverage[sku].totalQty +=
        Number(item.qty || 0);

      weightedAverage[sku].totalValue +=
        Number(item.qty || 0) * price;

      weightedAverage[sku].avg =

        weightedAverage[sku].totalValue /

        weightedAverage[sku].totalQty;
    }

    // ======================================================
    // ISSUED
    // ======================================================

    if (
      item.transaction_type ===
      "ISSUED"
    ) {

      outQty = Number(item.qty || 0);

      let issueQty =
        Number(item.qty || 0);

      // FIFO CALCULATION
      while (

        issueQty > 0 &&

        fifoQueue[sku].length > 0

      ) {

        let batch =
          fifoQueue[sku][0];

        // FULL BATCH
        if (
          batch.qty <= issueQty
        ) {

          fifoCost +=
            batch.qty *
            batch.price;

          issueQty -= batch.qty;

          fifoQueue[sku].shift();
        }

        // PARTIAL BATCH
        else {

          fifoCost +=
            issueQty *
            batch.price;

          batch.qty -= issueQty;

          issueQty = 0;
        }
      }
    }

    // ======================================================
    // CLOSING
    // ======================================================

    let closingQty =

      openingQty +
      inQty -
      outQty;

    previousClosing[sku] =
      closingQty;

    // ======================================================
    // METHOD VALUES
    // ======================================================

    const movingAvgRate =
      Number(
        movingAverage[sku].avg || 0
      );

    const weightedAvgRate =
      Number(
        weightedAverage[sku].avg || 0
      );

    const fifoRate =
      outQty > 0
        ? fifoCost / outQty
        : price;

    // ======================================================
    // FINAL DATA
    // ======================================================

    finalData.push({

      id: item.id,

      sku_code: item.sku_code,

      item_name: item.item_name,

      transaction_type:
        item.transaction_type,

      opening_qty:
        openingQty,

      in_qty:
        inQty,

      out_qty:
        outQty,

      closing_qty:
        closingQty,

      purchase_price:
        price.toFixed(2),

      fifo_rate:
        Number(fifoRate).toFixed(2),

      fifo_value:
        (
          closingQty *
          Number(fifoRate)
        ).toFixed(2),

      moving_average:
        movingAvgRate.toFixed(2),

      moving_value:
        (
          closingQty *
          movingAvgRate
        ).toFixed(2),

      weighted_average:
        weightedAvgRate.toFixed(2),

      weighted_value:
        (
          closingQty *
          weightedAvgRate
        ).toFixed(2),

      created_on:
        item.created_on
    });
  }

  return finalData;
};

// ======================================================
// EXPORT JSON
// ======================================================

const exportInventoryJSON =
  async (req, res) => {

    try {

      const finalData =
        await generateInventoryData();

      return res.status(200).json({

        success: true,

        data: finalData
      });

    } catch (error) {

      console.log(error);

      return res.status(500).json({

        success: false,

        message: error.message
      });
    }
  };

// ======================================================
// EXPORT CSV
// ======================================================

const exportInventoryCSV =
  async (req, res) => {

    try {

      const finalData =
        await generateInventoryData();

      // ======================================================
      // CSV FIELDS
      // ======================================================

      const fields = [

        "id",

        "sku_code",

        "item_name",

        "transaction_type",

        "opening_qty",

        "in_qty",

        "out_qty",

        "closing_qty",

        "purchase_price",

        "fifo_rate",

        "fifo_value",

        "moving_average",

        "moving_value",

        "weighted_average",

        "weighted_value",

        "created_on"
      ];

      // ======================================================
      // CSV CREATE
      // ======================================================

      const json2csv =
        new Parser({ fields });

      const csv =
        json2csv.parse(finalData);

      // ======================================================
      // DOWNLOAD
      // ======================================================

      res.header(
        "Content-Type",
        "text/csv"
      );

      res.attachment(
        "inventory_report.csv"
      );

      return res.send(csv);

    } catch (error) {

      console.log(error);

      return res.status(500).json({

        success: false,

        message: error.message
      });
    }
  };

module.exports = {

  exportInventoryCSV,

  exportInventoryJSON
};