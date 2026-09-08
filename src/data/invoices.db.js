const db = require('./db');

const DEFAULT_CHANNEL_ID = '1456748564817510555';

async function getConfig(guildId) {
    const [rows] = await db.query('SELECT channelId, lastMessageId, lastScan FROM factures_config WHERE guildId = ?', [guildId]);
    if (rows.length > 0) return rows[0];
    return { channelId: DEFAULT_CHANNEL_ID, lastScan: 0, lastMessageId: null };
}

async function updateConfig(guildId, config) {
    await db.query(
        'INSERT INTO factures_config (guildId, channelId, lastMessageId, lastScan) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE channelId = ?, lastMessageId = ?, lastScan = ?', 
        [guildId, config.channelId, config.lastMessageId, config.lastScan, config.channelId, config.lastMessageId, config.lastScan]
    );
}

async function getExistingMessageIds(guildId) {
    const [rows] = await db.query('SELECT msgId FROM factures WHERE guildId = ?', [guildId]);
    return rows.map(r => r.msgId);
}

async function addInvoices(guildId, invoices) {
    if (!invoices || invoices.length === 0) return;
    const values = invoices.map(inv => [
        inv.uniqueId, inv.msgId, new Date(inv.date), inv.totalAmount, inv.preTaxAmount, inv.taxRate, inv.issuerId,
        inv.playerNetId || null, inv.playerName || null, inv.playerCharacter || null, inv.playerId || null,
        inv.jobId || null, inv.jobName || null,
        inv.targetPlayerNetId || null, inv.targetPlayerDiscord || null, inv.targetPlayerName || null, inv.targetPlayerCharacter || null, inv.targetPlayerId || null,
        guildId
    ]);
    await db.query(
        `INSERT IGNORE INTO factures 
        (uniqueId, msgId, date, totalAmount, preTaxAmount, taxRate, issuerId, 
        playerNetId, playerName, playerCharacter, playerId, jobId, jobName, 
        targetPlayerNetId, targetPlayerDiscord, targetPlayerName, targetPlayerCharacter, targetPlayerId, guildId) 
        VALUES ?`, 
        [values]
    );
}

async function getAllInvoices(guildId) {
    const [rows] = await db.query('SELECT * FROM factures WHERE guildId = ?', [guildId]);
    return rows;
}

async function clearInvoices(guildId) {
    await db.query('DELETE FROM factures WHERE guildId = ?', [guildId]);
}

module.exports = {
    getConfig,
    updateConfig,
    getExistingMessageIds,
    addInvoices,
    getAllInvoices,
    clearInvoices,
    DEFAULT_CHANNEL_ID
};
