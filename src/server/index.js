const http = require('http');
const logger = require('../utils/logger');
const { getConfig } = require('../config');

let httpServer = null;
let isServerRunning = false;

/**
 * Initialise le serveur web / API / Dashboard / Webhooks
 */
async function initServer(options = {}) {
    if (isServerRunning) {
        return { status: 'already_running', server: httpServer };
    }

    const config = getConfig();
    const port = process.env.PORT || process.env.API_PORT || config.server?.port || null;
    const enabled = process.env.ENABLE_SERVER === 'true' || config.server?.enabled === true;

    if (!port && !enabled) {
        isServerRunning = true;
        logger.server('Serveur Web / API en veille (aucun port d\'écoute configuré).');
        return { status: 'standby' };
    }

    const listenPort = parseInt(port, 10) || 3000;

    return new Promise((resolve, reject) => {
        try {
            httpServer = http.createServer((req, res) => {
                if (req.url === '/health' || req.url === '/api/health') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
                    return;
                }

                res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Nyrex V3 Bot API Server Online');
            });

            httpServer.listen(listenPort, () => {
                isServerRunning = true;
                logger.server(`Serveur Web/API actif et à l'écoute sur le port ${listenPort}.`);
                resolve({ status: 'running', port: listenPort, server: httpServer });
            });

            httpServer.on('error', (err) => {
                logger.server(`❌ Erreur sur le serveur Web/API : ${err.message}`);
                reject(err);
            });
        } catch (err) {
            logger.server(`❌ Exception lors du démarrage du serveur Web : ${err.message}`);
            reject(err);
        }
    });
}

/**
 * Arrête proprement le serveur HTTP si actif
 */
async function stopServer() {
    if (httpServer) {
        return new Promise((resolve) => {
            httpServer.close(() => {
                isServerRunning = false;
                logger.server('Serveur Web/API arrêté.');
                resolve();
            });
        });
    }
}

module.exports = {
    initServer,
    stopServer
};
