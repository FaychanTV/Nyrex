const { Events } = require('discord.js');
const logger = require('../utils/logger');
const { isLocked, triggerPanicMode } = require('../utils/circuitBreaker');

/**
 * Enregistre l'écouteur pour l'événement GuildCreate.
 * Si le circuit breaker est verrouillé, le bot quitte immédiatement tout serveur
 * qui tenterait de le réintégrer, afin d'éviter toute réinfiltration.
 * @param {import('discord.js').Client} client
 */
function registerGuildCreateEvent(client) {
    client.on(Events.GuildCreate, async (guild) => {
        if (!isLocked()) return;

        logger.security(`🚨 [CIRCUIT BREAKER] Tentative de rejoindre "${guild.name}" (${guild.id}) en mode panique → départ immédiat.`);

        try {
            await guild.leave();
            logger.security(`[CIRCUIT BREAKER] ✅ Bot sorti du serveur "${guild.name}" (${guild.id}).`);
        } catch (err) {
            logger.error(`[CIRCUIT BREAKER] ❌ Impossible de quitter "${guild.name}" (${guild.id}) :`, err.message);
        }
    });
}

module.exports = { registerGuildCreateEvent };
