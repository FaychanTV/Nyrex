process.env.DOTENV_CONFIG_QUIET = 'true';
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');

const configPath = path.resolve(__dirname, '../config.json');
let cachedConfig = null;

/**
 * Charge la configuration depuis config.json
 * @returns {object} La configuration parsée
 */
function loadConfig() {
    try {
        if (!fs.existsSync(configPath)) {
            console.error(`[CONFIG] Le fichier ${configPath} est introuvable.`);
            return {};
        }
        const rawData = fs.readFileSync(configPath, 'utf8');
        cachedConfig = JSON.parse(rawData);
        return cachedConfig;
    } catch (error) {
        console.error("[CONFIG] Erreur lors de la lecture ou du parsing de config.json :", error);
        return cachedConfig || {};
    }
}

/**
 * Retourne la configuration courante (utilise le cache si disponible)
 * @returns {object}
 */
function getConfig() {
    if (!cachedConfig) {
        return loadConfig();
    }
    return cachedConfig;
}

/**
 * Sauvegarde de manière synchrone et sécurisée la configuration dans config.json
 * @param {object} newConfig 
 * @returns {boolean} true si succès, false sinon
 */
function saveConfig(newConfig) {
    try {
        cachedConfig = newConfig;
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error("[CONFIG] Erreur lors de la sauvegarde de config.json :", error);
        return false;
    }
}

module.exports = {
    getConfig,
    loadConfig,
    saveConfig
};
