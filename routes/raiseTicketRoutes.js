const express = require("express");
const router = express.Router();
const raiseTicketController = require("../controllers/raiseTicketController");
const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

router.get("/", authMiddleware, raiseTicketController.getAllTickets);
router.get("/replies/:ticket_id", authMiddleware, raiseTicketController.getTicketReplies);
router.post("/reply/:ticket_id", authMiddleware, raiseTicketController.addTicketReply);
router.get("/:id", authMiddleware, raiseTicketController.getTicketById);
router.post(
  "/", 
  authMiddleware, 
  upload.fields([{ name: 'ticket_image', maxCount: 1 }, { name: 'ticket_video', maxCount: 1 }]), 
  raiseTicketController.createTicket
);
router.post(
  "/update/:id", 
  authMiddleware, 
  upload.fields([{ name: 'ticket_image', maxCount: 1 }, { name: 'ticket_video', maxCount: 1 }]), 
  raiseTicketController.updateTicket
);
router.post("/action/:id", authMiddleware, raiseTicketController.actionTicket);
router.delete("/:id", authMiddleware, raiseTicketController.deleteTicket);

module.exports = router;
