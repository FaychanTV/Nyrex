const ticketStore = require('../../data/tickets.db');
const { getConfig } = require('../../config');

async function getNextTicketNumber() {
    const config = getConfig();
    const configCount = config.ticketSettings.ticketCount || 0;
    try {
        const next = await ticketStore.getNextTicketNumber(configCount);
        return next;
    } catch (err) {
        console.error("Erreur DB getNextTicketNumber:", err);
        return configCount + 1;
    }
}

async function getNextClaimNumber(claimerId) {
    try {
        return await ticketStore.getNextClaimNumber(claimerId);
    } catch (err) {
        console.error("Erreur DB getNextClaimNumber:", err);
        return 1;
    }
}

async function getUserTicketCount(userId, guild) {
    try {
        const openTickets = await ticketStore.getOpenTicketsByOwner(userId);
        return openTickets.filter(t => guild.channels.cache.has(t.channel_id)).length;
    } catch (e) {
        console.error("Erreur lecture tickets DB:", e);
        return 0;
    }
}

module.exports = {
    getNextTicketNumber,
    getNextClaimNumber,
    getUserTicketCount
};
