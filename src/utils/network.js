const dns = require('dns').promises;
const net = require('net');
const logger = require('./logger');

let networkWatcherInterval = null;
let isNetworkOnline = true;

/**
 * Mesure le temps de résolution DNS pour un domaine donné
 * @param {string} host 
 * @returns {Promise<{ ok: boolean, time: number, ip?: string }>}
 */
async function testDnsResolution(host = 'gateway.discord.gg') {
    const start = Date.now();
    try {
        const res = await dns.lookup(host);
        return { ok: true, time: Date.now() - start, ip: res.address };
    } catch (err) {
        return { ok: false, time: Date.now() - start, error: err.message };
    }
}

/**
 * Mesure la latence TCP vers un hôte et un port donnés
 * @param {string} host 
 * @param {number} port 
 * @param {number} timeoutMs 
 * @returns {Promise<{ ok: boolean, time: number }>}
 */
function testTcpSocket(host = 'gateway.discord.gg', port = 443, timeoutMs = 5000) {
    return new Promise((resolve) => {
        const start = Date.now();
        const socket = new net.Socket();

        socket.setTimeout(timeoutMs);

        socket.on('connect', () => {
            const time = Date.now() - start;
            socket.destroy();
            resolve({ ok: true, time });
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve({ ok: false, time: Date.now() - start, error: 'TIMEOUT' });
        });

        socket.on('error', (err) => {
            socket.destroy();
            resolve({ ok: false, time: Date.now() - start, error: err.message });
        });

        socket.connect(port, host);
    });
}

/**
 * Initialise le test réseau complet et lance le watcher
 */
async function initNetworkCheck(options = {}) {
    const host = options.host || 'gateway.discord.gg';
    const port = options.port || 443;

    logger.network('Vérification de la connectivité Internet & DNS...');

    const dnsResult = await testDnsResolution(host);
    if (!dnsResult.ok) {
        logger.network(`⚠️ Résolution DNS échouée pour ${host} (${dnsResult.error}). Tentative TCP directe...`);
    }

    const tcpResult = await testTcpSocket(host, port, 5000);
    if (!tcpResult.ok) {
        logger.network(`❌ Impossible d'établir une connexion TCP vers ${host}:${port} (${tcpResult.error}).`);
        isNetworkOnline = false;
    } else {
        isNetworkOnline = true;
        logger.network(`Connectivité Internet & Discord validée (DNS: ${dnsResult.time}ms | TCP: ${tcpResult.time}ms | IP: ${dnsResult.ip || 'N/A'}).`);
    }

    // Démarrage du watcher réseau périodique (toutes les 60s)
    if (!networkWatcherInterval && options.enableWatcher !== false) {
        networkWatcherInterval = setInterval(async () => {
            const check = await testTcpSocket(host, port, 4000);
            if (!check.ok && isNetworkOnline) {
                isNetworkOnline = false;
                logger.network(`⚠️ Perte de connectivité réseau détectée ! (${check.error})`);
            } else if (check.ok && !isNetworkOnline) {
                isNetworkOnline = true;
                logger.network(`✅ Rétablissement de la connectivité réseau (Latence: ${check.time}ms).`);
            }
        }, 60000);
    }

    return {
        dns: dnsResult,
        tcp: tcpResult,
        online: isNetworkOnline
    };
}

module.exports = {
    testDnsResolution,
    testTcpSocket,
    initNetworkCheck,
    isOnline: () => isNetworkOnline
};
