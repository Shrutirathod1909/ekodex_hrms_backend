const raiseTicketModel = require("../models/raiseTicketModel");
const logger = require("../utils/logger");

async function getAllTickets(req, res) {
  try {
    const tickets = await raiseTicketModel.getAllTickets(req.user);
    res.json(tickets);
  } catch (error) {
    logger.error("Error in getAllTickets", error);
    res.status(500).json({ message: "Failed to retrieve tickets" });
  }
}

async function getTicketReplies(req, res) {
  try {
    const replies = await raiseTicketModel.getTicketReplies(req.params.ticket_id);
    res.json(replies);
  } catch (error) {
    logger.error("Error in getTicketReplies", error);
    res.status(500).json({ message: "Failed to retrieve replies" });
  }
}

async function addTicketReply(req, res) {
  try {
    const { message } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ message: "Message is required" });
    }
    const id = await raiseTicketModel.addTicketReply(
      req.params.ticket_id,
      message,
      req.user
    );
    res.status(201).json({ message: "Reply added", id });
  } catch (error) {
    logger.error("Error in addTicketReply", error);
    res.status(500).json({ message: "Failed to add reply" });
  }
}

async function getTicketById(req, res) {
  try {
    const ticket = await raiseTicketModel.getTicketById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    res.json(ticket);
  } catch (error) {
    logger.error("Error in getTicketById", error);
    res.status(500).json({ message: "Failed to retrieve ticket" });
  }
}

async function createTicket(req, res) {
  try {
    const user = req.user;
    logger.log("[createTicket] req.body:", req.body);
    logger.log("[createTicket] req.files:", req.files);
    logger.log("[createTicket] user:", user);

    let ticketData = { ...req.body };
    
    // Add file paths if uploaded
    if (req.files && req.files['ticket_image']) {
      ticketData.image = `/api/uploads/tickets/${req.files['ticket_image'][0].filename}`;
      logger.log("[createTicket] image path:", ticketData.image);
    }
    if (req.files && req.files['ticket_video']) {
      ticketData.video = `/api/uploads/tickets/${req.files['ticket_video'][0].filename}`;
      logger.log("[createTicket] video path:", ticketData.video);
    }

    logger.log("[createTicket] Final ticketData:", ticketData);
    const result = await raiseTicketModel.createTicket(ticketData, user);
    logger.success("[createTicket] SUCCESS - ticketId:", result.ticketid, "id:", result.id);
    res.status(201).json({ message: "Ticket created successfully", id: result.id, ticketid: result.ticketid });
  } catch (error) {
    logger.error("[createTicket] FULL ERROR:", error);
    res.status(500).json({ message: "Failed to create ticket", error: error.message });
  }
}

async function updateTicket(req, res) {
  try {
    const user = req.user;
    let ticketData = { ...req.body };
    
    // Add file paths if uploaded
    if (req.files && req.files['ticket_image']) {
      ticketData.image = `/api/uploads/tickets/${req.files['ticket_image'][0].filename}`;
    }
    if (req.files && req.files['ticket_video']) {
      ticketData.video = `/api/uploads/tickets/${req.files['ticket_video'][0].filename}`;
    }

    const updated = await raiseTicketModel.updateTicket(req.params.id, ticketData, user);
    if (!updated) return res.status(404).json({ message: "Ticket not found" });
    res.json({ message: "Ticket updated successfully" });
  } catch (error) {
    logger.error("Error in updateTicket", error);
    res.status(500).json({ message: "Failed to update ticket" });
  }
}

async function actionTicket(req, res) {
  try {
    const user = req.user;
    const { status, admin_comment } = req.body;
    
    if (!status) return res.status(400).json({ message: "Status is required" });

    const updated = await raiseTicketModel.actionTicket(req.params.id, status, admin_comment, user);
    if (!updated) return res.status(404).json({ message: "Ticket not found" });
    res.json({ message: "Ticket action applied successfully" });
  } catch (error) {
    logger.error("Error in actionTicket", error);
    res.status(500).json({ message: "Failed to apply ticket action" });
  }
}

async function deleteTicket(req, res) {
  try {
    const user = req.user;
    const deleted = await raiseTicketModel.deleteTicket(req.params.id, user);
    if (!deleted) return res.status(404).json({ message: "Ticket not found" });
    res.json({ message: "Ticket deleted successfully" });
  } catch (error) {
    logger.error("Error in deleteTicket", error);
    res.status(500).json({ message: "Failed to delete ticket" });
  }
}

module.exports = {
  getAllTickets,
  getTicketById,
  createTicket,
  updateTicket,
  actionTicket,
  deleteTicket,
  getTicketReplies,
  addTicketReply,
};
