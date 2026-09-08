// ════════════════════════════════════════════════════════════════════════════
//  FILE LOGGER — Journalisation automatique dans un fichier .log horodaté
//  Inspiré du système de logs de Sentinel — adapté pour Nyrex V3
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const fs   = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');

// S'assurer que le dossier logs/ existe
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * Génère le nom de fichier strictement sous le format : LOGS-jj-mm-aaaa-hh-mm.log
 */
function generateFileName() {
  const now = new Date();
  const day     = String(now.getDate()).padStart(2, '0');
  const month   = String(now.getMonth() + 1).padStart(2, '0');
  const year    = now.getFullYear();
  const hours   = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  return `LOGS-${day}-${month}-${year}-${hours}-${minutes}.log`;
}

const currentFileName = generateFileName();
const currentFilePath = path.join(LOGS_DIR, currentFileName);

// Créer le stream d'écriture en mode append
const logStream = fs.createWriteStream(currentFilePath, { flags: 'a', encoding: 'utf8' });

/**
 * Horodatage précis au format HH:MM:SS
 */
function getTimestamp() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * Formate un tag au milieu d'un crochet de 30 caractères de large : [        TAG        ]
 */
function formatTypeBracket(type, totalWidth = 30, preserveCase = false) {
  const cleanType = preserveCase ? String(type).trim() : String(type).toUpperCase().trim();
  const innerWidth = totalWidth - 2;
  if (cleanType.length >= innerWidth) {
    return `[${cleanType.substring(0, innerWidth)}]`;
  }
  const totalPadding = innerWidth - cleanType.length;
  const padLeft = Math.floor(totalPadding / 2);
  const padRight = totalPadding - padLeft;
  return `[${' '.repeat(padLeft)}${cleanType}${' '.repeat(padRight)}]`;
}

// ════════════════════════════════════════════════════════════════════════════
// CONFIGURATION DES LIBELLÉS DE LOGS MODIFIABLES
// Vous pouvez modifier les valeurs de droite pour personnaliser le texte affiché.
// ════════════════════════════════════════════════════════════════════════════
const LOG_LABEL_MAPPING = {
  'SECURITY':              'SECURITY',
  'NETWORK':               'NETWORK',
  'DATABASE':              'DATABASE',
  'DISCORD':               'DISCORD',
  'MUSIC':                 'MUSIC',
  'JOBS':                  'JOBS',
  'SERVER':                'SERVER',
  'DEBUG':                 'DEBUG',
  'INFO':                  'INFO',
  'SUCCESS':               'SUCCESS',
  'WARN':                  'WARN',
  'ERROR':                 'ERROR',
  'SYSTEM':                'SYSTEM',
  'BOT_ACTION':            'BOT_ACTION',
  'COMMAND':               'COMMAND',
  'COMMAND_SUCCESS':       'COMMAND_SUCCESS',
  'BUTTON':                'BUTTON',
  'BUTTON_SUCCESS':        'BUTTON_SUCCESS',
  'MODAL':                 'MODAL',
  'MODAL_SUCCESS':         'MODAL_SUCCESS',
  'SELECT_MENU':           'SELECT_MENU',
  'SELECT_MENU_SUCCESS':   'SELECT_MENU_SUCCESS',
  'TICKET':                'TICKET',
  'FACTURE':               'FACTURE',
  'INTERACTION_ERROR':     'INTERACTION_ERROR'
};

/**
 * Écrit une ligne formatée dans le fichier de log :
 * [HH:MM:SS] [        TYPE        ] [       SUBTAG       ] Message
 *
 * @param {string} type    - Catégorie ou module (ex: 'SYSTEM', 'COMMAND', 'ERROR')
 * @param {string} message - Message détaillé de l'action
 */
function writeLog(type, message) {
  const label = LOG_LABEL_MAPPING[type] || type;
  const typeBracket = formatTypeBracket(label, 30);

  let subBracket = ' '.repeat(30);
  let finalMessage = String(message);

  const subTagMatch = finalMessage.match(/^\[([^\]]+)\]\s*(.*)$/s);
  if (subTagMatch) {
    const subTag = subTagMatch[1];
    finalMessage = subTagMatch[2];
    subBracket = formatTypeBracket(subTag, 30, true);
  }

  const line = `[${getTimestamp()}] ${typeBracket} ${subBracket} ${finalMessage}\n`;
  try {
    logStream.write(line);
  } catch (err) {
    console.error(`⚠ Impossible d'écrire dans le fichier log : ${err.message}`);
  }
}

// Log d'initialisation immédiat au lancement
writeLog('SYSTEM', `=== DÉMARRAGE DE LA SESSION DE LOGS : ${currentFileName} ===`);

module.exports = {
  writeLog,
  getTimestamp,
  currentFileName,
  currentFilePath,
  LOG_LABEL_MAPPING
};
