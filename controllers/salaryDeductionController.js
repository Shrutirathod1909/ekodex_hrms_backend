const salaryDeductionModel = require("../models/salaryDeductionModel");

const salaryDeductionController = {
  // =====================================================
  // GET ALL
  // =====================================================
  getAll: async (req, res) => {
    try {
      const { tmpl_id } = req.query;

      const data = await salaryDeductionModel.getAll(tmpl_id || null);

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      console.error("Salary Deduction GetAll Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch salary deductions",
        error: error.message,
      });
    }
  },

  // =====================================================
  // GET BY ID
  // =====================================================
  getById: async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Deduction ID is required",
        });
      }

      const data = await salaryDeductionModel.getById(id);

      if (!data) {
        return res.status(404).json({
          success: false,
          message: "Salary deduction not found",
        });
      }

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      console.error("Salary Deduction GetById Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch salary deduction",
        error: error.message,
      });
    }
  },

  // =====================================================
  // GET BY TEMPLATE
  // =====================================================
  getByTemplateId: async (req, res) => {
    try {
      const { tmpl_id } = req.params;

      if (!tmpl_id) {
        return res.status(400).json({
          success: false,
          message: "Template ID is required",
        });
      }

      const data = await salaryDeductionModel.getByTemplateId(tmpl_id);

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      console.error("Salary Deduction Template Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch template deductions",
        error: error.message,
      });
    }
  },

  // =====================================================
  // CREATE
  // =====================================================
  create: async (req, res) => {
    try {
      const data = req.body;

      if (!data.tmpl_id) {
        return res.status(400).json({
          success: false,
          message: "Template ID is required",
        });
      }

      if (!data.deduction_name) {
        return res.status(400).json({
          success: false,
          message: "Deduction name is required",
        });
      }

      const result = await salaryDeductionModel.create(data);

      return res.status(201).json({
        success: true,
        message: "Salary deduction created successfully",
        data: result,
      });
    } catch (error) {
      console.error("Salary Deduction Create Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create salary deduction",
        error: error.message,
      });
    }
  },

  // =====================================================
  // UPDATE
  // =====================================================
  update: async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Deduction ID is required",
        });
      }

      const existing = await salaryDeductionModel.getById(id);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Salary deduction not found",
        });
      }

      const result = await salaryDeductionModel.update(id, req.body);

      return res.status(200).json({
        success: true,
        message: "Salary deduction updated successfully",
        data: result,
      });
    } catch (error) {
      console.error("Salary Deduction Update Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update salary deduction",
        error: error.message,
      });
    }
  },

  // =====================================================
  // DELETE
  // =====================================================
  delete: async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Deduction ID is required",
        });
      }

      const existing = await salaryDeductionModel.getById(id);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Salary deduction not found",
        });
      }

      const result = await salaryDeductionModel.delete(id);

      return res.status(200).json({
        success: true,
        message: "Salary deduction deleted successfully",
        data: result,
      });
    } catch (error) {
      console.error("Salary Deduction Delete Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to delete salary deduction",
        error: error.message,
      });
    }
  },

  // =====================================================
  // RESTORE
  // =====================================================
  restore: async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Deduction ID is required",
        });
      }

      const result = await salaryDeductionModel.restore(id);

      if (!result) {
        return res.status(404).json({
          success: false,
          message: "Salary deduction not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Salary deduction restored successfully",
        data: result,
      });
    } catch (error) {
      console.error("Salary Deduction Restore Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to restore salary deduction",
        error: error.message,
      });
    }
  },
};

module.exports = salaryDeductionController;
