const { Events } = require('discord.js');
const logger = require('../utils/logger');
const { initCircuitBreaker } = require('../utils/circuitBreaker');

/**
 * Enregistre l'écouteur pour l'événement ClientReady
 * @param {import('discord.js').Client} client 
 */
function registerReadyEvent(client) {
    client.on(Events.ClientReady, (readyClient) => {
        logger.discord(`Événement ClientReady déclenché pour ${readyClient.user.tag}.`);

        // ── Circuit Breaker : vérification de l'état persistant au démarrage ──
        // Si le bot redémarre (PM2 restart) alors qu'un verrou était actif,
        // il reste en mode panique et refuse toute opération normale.
        const isPanic = initCircuitBreaker();
        if (isPanic) {
            logger.security('⚠️  Le bot est en MODE PANIQUE. Envoyez !unlock en DM pour réarmer.');
        }
    });
}

module.exports = { registerReadyEvent };
