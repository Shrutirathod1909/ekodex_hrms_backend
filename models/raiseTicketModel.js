const { sql, poolPromise } = require("../config/db");

async function getAllTickets(user) {
  const pool = await poolPromise;
  // Admin sees ALL tickets; everyone else sees only their own
  const isAdmin = user?.role?.toLowerCase() === 'admin';
  const query = isAdmin
    ? `SELECT * FROM raise_ticket WHERE active = '0' ORDER BY id DESC`
    : `SELECT * FROM raise_ticket WHERE active = '0' AND created_by = '${user?.id}' ORDER BY id DESC`;
  const result = await pool.request().query(query);
  return result.recordset;
}

async function getTicketById(id) {
  const pool = await poolPromise;
  const result = await pool.request()
    .input("id", sql.Int, id)
    .query(`
      SELECT *
      FROM raise_ticket
      WHERE id = @id AND active = '0'
    `);
  return result.recordset[0];
}

async function createTicket(ticketData, user) {
  const pool = await poolPromise;
  
  // Auto-generate highly unique ticketid using timestamp + random numbers to guarantee uniqueness
  const timestampPart = Date.now().toString().slice(-5); 
  const randomPart = Math.floor(100 + Math.random() * 900).toString();
  const ticketid = 'TC' + timestampPart + randomPart;
  
  // raised_by = user's name from token
  const raised_by = user?.name || user?.email || String(user?.id || '');

  const result = await pool.request()
    .input("ticketid", sql.NVarChar(50), ticketid)
    .input("raised_by", sql.NVarChar(255), raised_by)
    .input("ticket_detail", sql.NVarChar(sql.MAX), ticketData.ticket_detail || null)
    .input("docket_no", sql.NVarChar(100), ticketData.docket_no || null)
    .input("image", sql.NVarChar(500), ticketData.image || null)
    .input("video", sql.NVarChar(500), ticketData.video || null)
    .input("subject", sql.NVarChar(255), ticketData.subject || null)
    .input("status", sql.NVarChar(50), 'Open')
    .input("created_by", sql.NVarChar(50), String(user?.id || ''))
    .input("created_by_name", sql.NVarChar(255), user?.name || user?.email || '')
    .input("lock_screen", sql.NVarChar(5), 'N')
    .input("source", sql.NVarChar(100), ticketData.source || null)
    .query(`
      INSERT INTO raise_ticket (
        ticketid, raised_by, ticket_detail, docket_no, image, video, 
        subject, status, created_by, created_by_name, created_on, active, lock_screen, source
      )
      VALUES (
        @ticketid, @raised_by, @ticket_detail, @docket_no, @image, @video, 
        @subject, @status, @created_by, @created_by_name, CONVERT(VARCHAR(19), GETDATE(), 120), '0', @lock_screen, @source
      );

      SELECT SCOPE_IDENTITY() AS id;
    `);

  const newId = result.recordset[0].id;

  const { logAction } = require("../utils/auditLogger");
  await logAction("raise_ticket", newId, "CREATE");

  return { id: newId, ticketid };
}

async function updateTicket(id, ticketData, user) {
  const pool = await poolPromise;

  const result = await pool.request()
    .input("id", sql.Int, id)
    .input("ticketid", sql.NVarChar, ticketData.ticketid || null)
    .input("raised_by", sql.NVarChar, ticketData.raised_by || null)
    .input("ticket_detail", sql.NVarChar, ticketData.ticket_detail || null)
    .input("docket_no", sql.NVarChar, ticketData.docket_no || null)
    .input("image", sql.NVarChar, ticketData.image || null)
    .input("video", sql.NVarChar, ticketData.video || null)
    .input("subject", sql.NVarChar, ticketData.subject || null)
    .input("status", sql.NVarChar, ticketData.status || null)
    .input("modified_by", sql.NVarChar, String(user?.id || ''))
    .input("modified_by_name", sql.NVarChar(255), user?.name || user?.email || '')
    .input("lock_screen", sql.NVarChar, ticketData.lock_screen || 'N')
    .input("source", sql.NVarChar, ticketData.source || null)
    .query(`
      UPDATE raise_ticket
      SET 
        ticketid = COALESCE(@ticketid, ticketid),
        raised_by = COALESCE(@raised_by, raised_by),
        ticket_detail = COALESCE(@ticket_detail, ticket_detail),
        docket_no = COALESCE(@docket_no, docket_no),
        image = COALESCE(@image, image),
        video = COALESCE(@video, video),
        subject = COALESCE(@subject, subject),
        status = COALESCE(@status, status),
        modified_by = @modified_by,
        modified_by_name = @modified_by_name,
        modified_on = CONVERT(VARCHAR(19), GETDATE(), 120),
        lock_screen = COALESCE(@lock_screen, lock_screen),
        source = COALESCE(@source, source)
      WHERE id = @id
    `);

  const { logAction } = require("../utils/auditLogger");
  await logAction("raise_ticket", id, "UPDATE");

  return result.rowsAffected;
}

async function actionTicket(id, status, admin_comment, user) {
  const pool = await poolPromise;
  const changedByName = user?.name || user?.email || String(user?.id || '');

  const result = await pool.request()
    .input("id", sql.Int, id)
    .input("status", sql.NVarChar(50), status)
    .input("admin_comment", sql.NVarChar(sql.MAX), admin_comment || null)
    .input("modified_by", sql.NVarChar(50), String(user?.id || ''))
    .input("modified_by_name", sql.NVarChar(255), changedByName)
    .input("status_changed_by", sql.NVarChar(255), changedByName)
    .query(`
      UPDATE raise_ticket
      SET 
        status = @status,
        admin_comment = @admin_comment,
        modified_by = @modified_by,
        modified_by_name = @modified_by_name,
        modified_on = CONVERT(VARCHAR(19), GETDATE(), 120),
        status_changed_by = @status_changed_by,
        status_changed_on = CONVERT(VARCHAR(19), GETDATE(), 120)
      WHERE id = @id
    `);

  const { logAction } = require("../utils/auditLogger");
  await logAction("raise_ticket", id, "UPDATE");

  // Also add the comment to the reply thread if provided
  if (admin_comment && admin_comment.trim() !== "") {
    await addTicketReply(id, admin_comment.trim(), user);
  }

  return result.rowsAffected;
}

async function deleteTicket(id, user) {
  const pool = await poolPromise;

  const result = await pool.request()
    .input("id", sql.Int, id)
    .input("disabled_by", sql.NVarChar, String(user?.id || ''))
    .input("disabled_by_name", sql.NVarChar(255), user?.name || user?.email || '')
    .query(`
      UPDATE raise_ticket
      SET 
        active = '1',
        disabled_on = CONVERT(VARCHAR(19), GETDATE(), 120),
        disabled_by = @disabled_by,
        disabled_by_name = @disabled_by_name
      WHERE id = @id;
    `);

  const { logAction } = require("../utils/auditLogger");
  await logAction("raise_ticket", id, "DELETE");

  return result.rowsAffected;
}

// =============================================
// REPLIES — get all replies for a ticket
// =============================================
async function getTicketReplies(ticket_id) {
  const pool = await poolPromise;
  const result = await pool.request()
    .input("ticket_id", sql.Int, ticket_id)
    .query(`
      SELECT * FROM raise_ticket_replies
      WHERE ticket_id = @ticket_id
      ORDER BY id ASC
    `);
  return result.recordset;
}

// =============================================
// REPLIES — add a new reply
// =============================================
async function addTicketReply(ticket_id, message, user) {
  const pool = await poolPromise;
  const result = await pool.request()
    .input("ticket_id", sql.Int, ticket_id)
    .input("message", sql.NVarChar(sql.MAX), message)
    .input("reply_by_id", sql.NVarChar(50), String(user?.id || ''))
    .input("reply_by_name", sql.NVarChar(255), user?.name || user?.email || '')
    .input("reply_role", sql.NVarChar(50), user?.role || 'User')
    .query(`
      INSERT INTO raise_ticket_replies
        (ticket_id, message, reply_by_id, reply_by_name, reply_role, created_on)
      VALUES
        (@ticket_id, @message, @reply_by_id, @reply_by_name, @reply_role,
         CONVERT(VARCHAR(19), GETDATE(), 120));
      SELECT SCOPE_IDENTITY() AS id;
    `);
  return result.recordset[0].id;
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
