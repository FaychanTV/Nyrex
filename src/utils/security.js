const logger = require('./logger');
const { getIsLeader, setIsLeader, INSTANCE_NAME } = require('../shared');
const { notifyCrash } = require('./notifier');
const db = require('../data/db');

let isShuttingDown = false;
let isInitialized = false;

/**
 * Libère le leadership et nettoie le statut de l'instance dans la DB
 */
async function releaseLeadership() {
    try {
        await db.query(`DELETE FROM instances_status WHERE instance_name = ?`, [INSTANCE_NAME]);

        if (getIsLeader()) {
            logger.security(`Libération du statut de leader pour ${INSTANCE_NAME}...`);
            await db.query(`UPDATE leader_election SET is_active = FALSE WHERE id = 1 AND leader_name = ?`, [INSTANCE_NAME]);
            setIsLeader(false);
        }
    } catch (e) {
        logger.security(`Erreur lors de la libération des ressources : ${e.message}`);
    }
}

/**
 * Gestionnaire centralisé d'arrêt propre et de crash
 */
async function handleShutdown(event, code) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    if (typeof event === 'string') {
        logger.security(`Signal de terminaison reçu (${event}). Arrêt propre en cours...`);
    } else {
        logger.security(`Erreur critique non interceptée (${code}) :`, event);
        try {
            await notifyCrash(event, code);
        } catch (notifErr) {
            // Ignorer silencieusement pour éviter une boucle de crash
        }
    }

    await releaseLeadership();

    // Délai court pour laisser les dernières requêtes se clore proprement
    setTimeout(() => {
        process.exit(typeof event === 'string' ? 0 : 1);
    }, 1500);
}

/**
 * Initialise l'anti-crash et les écouteurs de signaux système
 */
function initSecurity() {
    if (isInitialized) return;
    isInitialized = true;

    process.on('uncaughtException', (err) => handleShutdown(err, 'Uncaught Exception'));
    process.on('unhandledRejection', (reason) => handleShutdown(reason, 'Unhandled Rejection'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

    logger.security('Anti-Crash global et gestionnaires de signaux initialisés.');
}

module.exports = {
    initSecurity,
    handleShutdown,
    releaseLeadership
};
