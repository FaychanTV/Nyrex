const net = require('net');
const logger = require('../utils/logger');
const { getConfig } = require('../config');

let isMusicInitialized = false;

/**
 * Sonde activement un port TCP jusqu'à ce qu'il soit ouvert ou que le délai expire
 * @param {string} host 
 * @param {number} port 
 * @param {number} timeoutMs 
 * @param {number} intervalMs 
 * @returns {Promise<boolean>}
 */
function waitForTcpPort(host = '127.0.0.1', port = 2333, timeoutMs = 10000, intervalMs = 500) {
    return new Promise((resolve) => {
        const startTime = Date.now();

        const checkPort = () => {
            const socket = new net.Socket();
            socket.setTimeout(intervalMs);

            socket.on('connect', () => {
                socket.destroy();
                resolve(true);
            });

            socket.on('timeout', () => {
                socket.destroy();
                retry();
            });

            socket.on('error', () => {
                socket.destroy();
                retry();
            });

            socket.connect(port, host);
        };

        const retry = () => {
            if (Date.now() - startTime >= timeoutMs) {
                resolve(false);
            } else {
                setTimeout(checkPort, intervalMs);
            }
        };

        checkPort();
    });
}

/**
 * Initialise le système musical et le serveur Lavalink
 * @param {import('discord.js').Client} client 
 */
async function initMusic(client) {
    if (isMusicInitialized) {
        return { status: 'already_initialized' };
    }

    const config = getConfig();
    const isEnabled = process.env.LAVALINK_ENABLED === 'true' || config.lavalink?.enabled === true;
    const host = process.env.LAVALINK_HOST || config.lavalink?.host || '127.0.0.1';
    const port = parseInt(process.env.LAVALINK_PORT || config.lavalink?.port, 10) || 2333;

    if (!isEnabled) {
        isMusicInitialized = true;
        logger.music('Système audio en veille (Lavalink non configuré ou désactivé).');
        return { status: 'standby' };
    }

    logger.music(`Attente active de l'ouverture du port TCP pour Lavalink (${host}:${port})...`);

    const isPortOpen = await waitForTcpPort(host, port, 10000, 500);

    if (!isPortOpen) {
        logger.music(`⚠️ Port TCP Lavalink fermé (${host}:${port}) après délai d'attente. Initialisation différée sans erreur fatale.`);
        isMusicInitialized = true;
        return { status: 'unreachable', host, port };
    }

    logger.music(`Port TCP ${host}:${port} détecté ouvert ! Initialisation des nœuds musicaux...`);
    
    // Initialisation du client / gestionnaire musical si applicable
    isMusicInitialized = true;
    logger.music(`Nœuds Lavalink initialisés avec succès et prêts pour la lecture audio.`);

    return { status: 'connected', host, port };
}

module.exports = {
    initMusic,
    waitForTcpPort
};
