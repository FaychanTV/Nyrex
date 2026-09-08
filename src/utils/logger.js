// ════════════════════════════════════════════════════════════════════════════
//  LOGGER — Console & Fichier log simultanés
//  Système de logs inspiré de Sentinel — adapté pour Nyrex V3
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const util       = require('util');
const fileLogger = require('./fileLogger');

// ─── Détection du mode DEV / PROD ───────────────────────────────────────────
// Démarrage en dev  : node index.js --dev   OU   NODE_ENV=development node index.js
// Démarrage en prod : node index.js          OU   NODE_ENV=production node index.js
const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

// ─── Codes couleurs ANSI ────────────────────────────────────────────────────
const ANSI = {
    reset:         '\x1b[0m',
    bold:          '\x1b[1m',
    dim:           '\x1b[2m',
    black:         '\x1b[30m',
    red:           '\x1b[31m',
    green:         '\x1b[32m',
    yellow:        '\x1b[33m',
    blue:          '\x1b[34m',
    magenta:       '\x1b[35m',
    cyan:          '\x1b[36m',
    white:         '\x1b[37m',
    brightRed:     '\x1b[91m',
    brightGreen:   '\x1b[92m',
    brightYellow:  '\x1b[93m',
    brightBlue:    '\x1b[94m',
    brightMagenta: '\x1b[95m',
    brightCyan:    '\x1b[96m',
    brightWhite:   '\x1b[97m',
    gray:          '\x1b[90m'
};

// ─── Configuration des catégories ───────────────────────────────────────────
const CATEGORIES = {
    system:   { tag: 'SYSTEM',   color: `${ANSI.bold}${ANSI.brightCyan}`    },
    security: { tag: 'SECURITY', color: `${ANSI.bold}${ANSI.brightRed}`     },
    network:  { tag: 'NETWORK',  color: `${ANSI.bold}${ANSI.cyan}`          },
    database: { tag: 'DATABASE', color: `${ANSI.bold}${ANSI.brightBlue}`    },
    jobs:     { tag: 'JOBS',     color: `${ANSI.bold}${ANSI.brightYellow}`  },
    server:   { tag: 'SERVER',   color: `${ANSI.bold}${ANSI.brightGreen}`   },
    discord:  { tag: 'DISCORD',  color: `${ANSI.bold}${ANSI.brightMagenta}` },
    music:    { tag: 'MUSIC',    color: `${ANSI.bold}${ANSI.brightCyan}`    }
};

// ─── Horodatage ─────────────────────────────────────────────────────────────
function getTimestamp() {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/**
 * Formate des arguments hétérogènes en chaîne lisible pour les fichiers texte
 */
function formatArgs(args) {
    return args.map(arg => {
        if (arg instanceof Error) return arg.stack || arg.message;
        if (typeof arg === 'object' && arg !== null) {
            try { return JSON.stringify(arg); } catch { return String(arg); }
        }
        return String(arg);
    }).join(' ');
}

/**
 * Formate les arguments pour la console (avec couleurs et inspect)
 */
function formatArgsConsole(args) {
    return args.map(arg => {
        if (arg instanceof Error) return `${ANSI.brightRed}${arg.stack || arg.message}${ANSI.reset}`;
        if (typeof arg === 'object' && arg !== null) {
            return util.inspect(arg, { colors: true, depth: 3, compact: true });
        }
        return arg;
    });
}

/**
 * Fonction centrale de rendu console + fichier
 */
function logCategory(categoryKey, consoleMethod, ...args) {
    const category = CATEGORIES[categoryKey] || {
        tag: categoryKey.toUpperCase(),
        color: `${ANSI.bold}${ANSI.brightWhite}`
    };

    const timeStr = `${ANSI.gray}[${getTimestamp()}]${ANSI.reset}`;
    const tagStr  = `${category.color}[${category.tag}]${ANSI.reset}`;

    consoleMethod(`${timeStr} ${tagStr}`, ...formatArgsConsole(args));
    fileLogger.writeLog(category.tag, formatArgs(args));
}

// ─── Construction du logger ──────────────────────────────────────────────────
const logger = {
    ANSI,
    isDev,

    // ── 8 catégories principales (console + fichier) ──
    system:   (...args) => logCategory('system',   console.log,   ...args),
    security: (...args) => logCategory('security', console.log,   ...args),
    network:  (...args) => logCategory('network',  console.log,   ...args),
    database: (...args) => logCategory('database', console.log,   ...args),
    jobs:     (...args) => logCategory('jobs',     console.log,   ...args),
    server:   (...args) => logCategory('server',   console.log,   ...args),
    discord:  (...args) => logCategory('discord',  console.log,   ...args),
    music:    (...args) => logCategory('music',    console.log,   ...args),

    // ── Niveaux utilitaires (console + fichier) ──
    info(...args) {
        const timeStr = `${ANSI.gray}[${getTimestamp()}]${ANSI.reset}`;
        const tagStr  = `${ANSI.bold}${ANSI.brightWhite}[INFO]${ANSI.reset}`;
        console.log(`${timeStr} ${tagStr}`, ...formatArgsConsole(args));
        fileLogger.writeLog('INFO', formatArgs(args));
    },

    success(...args) {
        const timeStr = `${ANSI.gray}[${getTimestamp()}]${ANSI.reset}`;
        const tagStr  = `${ANSI.bold}${ANSI.brightGreen}[SUCCESS]${ANSI.reset}`;
        console.log(`${timeStr} ${tagStr}`, ...formatArgsConsole(args));
        fileLogger.writeLog('SUCCESS', formatArgs(args));
    },

    warn(...args) {
        const timeStr = `${ANSI.gray}[${getTimestamp()}]${ANSI.reset}`;
        const tagStr  = `${ANSI.bold}${ANSI.brightYellow}[WARN]${ANSI.reset}`;
        console.warn(`${timeStr} ${tagStr}`, ...formatArgsConsole(args));
        fileLogger.writeLog('WARN', formatArgs(args));
    },

    error(...args) {
        const timeStr = `${ANSI.gray}[${getTimestamp()}]${ANSI.reset}`;
        const tagStr  = `${ANSI.bold}${ANSI.brightRed}[ERROR]${ANSI.reset}`;
        console.error(`${timeStr} ${tagStr}`, ...formatArgsConsole(args));
        fileLogger.writeLog('ERROR', formatArgs(args));
    },

    /**
     * [DEBUG] — Affiché en console UNIQUEMENT en mode développement.
     * Toujours écrit dans le fichier de log.
     */
    debug(...args) {
        if (isDev) {
            const timeStr = `${ANSI.gray}[${getTimestamp()}]${ANSI.reset}`;
            const tagStr  = `${ANSI.gray}[DEBUG]${ANSI.reset}`;
            console.log(`${timeStr} ${tagStr}`, ...formatArgsConsole(args));
        }
        fileLogger.writeLog('DEBUG', formatArgs(args));
    },

    /**
     * Écrit directement un événement typé dans le fichier de log (sans console).
     * Utilisé par les handlers d'interactions, actions bot, etc.
     * @param {string} type    - Type de log (ex: 'COMMAND', 'BUTTON', 'BOT_ACTION')
     * @param {string} message - Message détaillé
     */
    logAction(type, message) {
        fileLogger.writeLog(type, message);
    }
};

module.exports = logger;
