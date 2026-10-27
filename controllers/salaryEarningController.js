const salaryEarningModel = require("../models/salaryEarningModel");

const salaryEarningController = {
  // =====================================================
  // GET ALL
  // =====================================================
  getAll: async (req, res) => {
    try {
      const { tmpl_id } = req.query;

      const data = await salaryEarningModel.getAll(tmpl_id || null);

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      console.error("Salary Earning GetAll Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch salary earnings",
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
          message: "Earning ID is required",
        });
      }

      const data = await salaryEarningModel.getById(id);

      if (!data) {
        return res.status(404).json({
          success: false,
          message: "Salary earning not found",
        });
      }

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      console.error("Salary Earning GetById Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch salary earning",
        error: error.message,
      });
    }
  },

  // =====================================================
  // GET BY TEMPLATE ID
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

      const data = await salaryEarningModel.getByTemplateId(tmpl_id);

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      console.error("Salary Earning Template Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch template earnings",
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

      if (!data.earning_name) {
        return res.status(400).json({
          success: false,
          message: "Earning name is required",
        });
      }

      const result = await salaryEarningModel.create(data);

      return res.status(201).json({
        success: true,
        message: "Salary earning created successfully",
        data: result,
      });
    } catch (error) {
      console.error("Salary Earning Create Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create salary earning",
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
          message: "Earning ID is required",
        });
      }

      const existing = await salaryEarningModel.getById(id);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Salary earning not found",
        });
      }

      const result = await salaryEarningModel.update(id, req.body);

      return res.status(200).json({
        success: true,
        message: "Salary earning updated successfully",
        data: result,
      });
    } catch (error) {
      console.error("Salary Earning Update Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update salary earning",
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
          message: "Earning ID is required",
        });
      }

      const existing = await salaryEarningModel.getById(id);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Salary earning not found",
        });
      }

      const result = await salaryEarningModel.delete(id);

      return res.status(200).json({
        success: true,
        message: "Salary earning deleted successfully",
        data: result,
      });
    } catch (error) {
      console.error("Salary Earning Delete Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to delete salary earning",
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
          message: "Earning ID is required",
        });
      }

      const result = await salaryEarningModel.restore(id);

      if (!result) {
        return res.status(404).json({
          success: false,
          message: "Salary earning not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Salary earning restored successfully",
        data: result,
      });
    } catch (error) {
      console.error("Salary Earning Restore Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to restore salary earning",
        error: error.message,
      });
    }
  },
};

module.exports = salaryEarningController;
