const db = require('./db');

function toSnakeCase(key) {
  return key.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase());
}

async function saveTicket(ticket) {
  const channelId = ticket.channelId;
  const ownerId = ticket.ownerId || null;
  const category = ticket.category || null;
  const createdAt = ticket.createdAt || Date.now();
  const isClosed = ticket.isClosed ? 1 : 0;
  const claimedBy = ticket.claimedBy || null;
  const claimedAt = ticket.claimedAt || null;
  const mirrorChannelId = ticket.mirrorChannelId || null;

  await db.query(
    `INSERT INTO tickets (channel_id, owner_id, category, created_at, is_closed, claimed_by, claimed_at, mirror_channel_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE owner_id = VALUES(owner_id), category = VALUES(category), created_at = VALUES(created_at), is_closed = VALUES(is_closed), claimed_by = VALUES(claimed_by), claimed_at = VALUES(claimed_at), mirror_channel_id = VALUES(mirror_channel_id)`,
    [channelId, ownerId, category, createdAt, isClosed, claimedBy, claimedAt, mirrorChannelId]
  );
}

async function updateTicket(channelId, fields) {
  if (!fields || Object.keys(fields).length === 0) return;
  const sets = [];
  const values = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${toSnakeCase(k)} = ?`);
    if (k === 'isClosed' || k === 'is_closed') values.push(v ? 1 : 0);
    else values.push(v);
  }
  const sql = `UPDATE tickets SET ${sets.join(', ')} WHERE channel_id = ?`;
  await db.query(sql, [...values, channelId]);
}

async function getTicket(channelId) {
  const [rows] = await db.query('SELECT * FROM tickets WHERE channel_id = ?', [channelId]);
  return rows[0];
}

async function getOpenTicketsByOwner(ownerId) {
  const [rows] = await db.query('SELECT * FROM tickets WHERE owner_id = ? AND is_closed = 0', [ownerId]);
  return rows;
}

async function getActiveTicketsByClaimer(claimerId) {
  const [rows] = await db.query('SELECT * FROM tickets WHERE claimed_by = ? AND is_closed = 0', [claimerId]);
  return rows;
}

async function getNextTicketNumber(minValue = 0) {
  const [rows] = await db.query('SELECT value FROM counters WHERE id = ?', ['ticketCount']);
  let current = rows[0] ? Number(rows[0].value) : 0;
  if (minValue > current) current = minValue;
  const next = current + 1;
  await db.query('INSERT INTO counters (id, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?', ['ticketCount', next, next]);
  return next;
}

async function getNextClaimNumber(userId) {
  const [rows] = await db.query('SELECT claim_count FROM claim_counters WHERE user_id = ?', [userId]);
  let current = rows[0] ? Number(rows[0].claim_count) : 0;
  const next = current + 1;
  await db.query('INSERT INTO claim_counters (user_id, claim_count) VALUES (?, ?) ON DUPLICATE KEY UPDATE claim_count = ?', [userId, next, next]);
  return next;
}

async function migrateFromJson(ticketsJson = {}, countersJson = {}) {
  let ticketsCount = 0;
  let countersCount = 0;

  for (const [channelId, ticket] of Object.entries(ticketsJson || {})) {
    try {
      await saveTicket({
        channelId,
        ownerId: ticket.ownerId || null,
        category: ticket.category || null,
        createdAt: ticket.createdAt || Date.now(),
        isClosed: ticket.isClosed ? 1 : 0,
        claimedBy: ticket.claimedBy || null,
        claimedAt: ticket.claimedAt || null
      });
      ticketsCount++;
    } catch (e) {
      console.error(`Erreur migration ticket ${channelId}:`, e);
    }
  }

  if (countersJson && typeof countersJson === 'object') {
    if (countersJson.ticketCount != null) {
      await db.query('INSERT INTO counters (id, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?', ['ticketCount', countersJson.ticketCount, countersJson.ticketCount]);
      countersCount++;
    }
    if (countersJson.claimCounters) {
      for (const [userId, cnt] of Object.entries(countersJson.claimCounters)) {
        await db.query('INSERT INTO claim_counters (user_id, claim_count) VALUES (?, ?) ON DUPLICATE KEY UPDATE claim_count = ?', [userId, cnt, cnt]);
        countersCount++;
      }
    }
  }

  return { tickets: ticketsCount, counters: countersCount };
}

module.exports = {
  saveTicket,
  updateTicket,
  getTicket,
  getOpenTicketsByOwner,
  getActiveTicketsByClaimer,
  getNextTicketNumber,
  getNextClaimNumber,
  migrateFromJson
};
