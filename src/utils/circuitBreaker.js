// ════════════════════════════════════════════════════════════════════════════
//  CIRCUIT BREAKER — Disjoncteur d'urgence / Panic Mode
//  Détecte les emballements de messages du bot et verrouille le système.
//  Résistant aux restarts PM2 via persistance sur disque (security_lock.json).
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const fs     = require('fs');
const path   = require('path');
const logger = require('./logger');

// ─── Configuration ───────────────────────────────────────────────────────────

/** Ton Discord User ID — seul autorisé à envoyer !unlock / !status */
const OWNER_ID = '1261670689556140054';

/** Nombre max de messages du bot autorisés dans la fenêtre temporelle */
const PANIC_THRESHOLD = 4;

/** Durée de la fenêtre glissante en millisecondes */
const PANIC_WINDOW_MS = 2000;

// ─── Persistance ─────────────────────────────────────────────────────────────

const LOCK_FILE = path.join(__dirname, '..', '..', 'security_lock.json');

/**
 * Structure par défaut du fichier de verrou
 * @returns {{ locked: boolean, lockedAt: string|null, reason: string }}
 */
function defaultLockState() {
    return { locked: false, lockedAt: null, reason: '' };
}

/**
 * Charge l'état du verrou depuis le disque.
 * Si le fichier est absent ou corrompu, retourne l'état par défaut (déverrouillé).
 * @returns {{ locked: boolean, lockedAt: string|null, reason: string }}
 */
function loadLockState() {
    try {
        if (!fs.existsSync(LOCK_FILE)) {
            logger.security('[CIRCUIT BREAKER] Fichier de verrou absent → état par défaut : déverrouillé.');
            return defaultLockState();
        }
        const raw = fs.readFileSync(LOCK_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return { ...defaultLockState(), ...parsed };
    } catch (err) {
        logger.error('[CIRCUIT BREAKER] Impossible de lire security_lock.json :', err.message);
        return defaultLockState();
    }
}

/**
 * Sauvegarde l'état du verrou sur disque.
 * @param {boolean} locked   - Nouveau statut
 * @param {string}  [reason] - Raison du verrouillage (optionnel)
 */
function saveLockState(locked, reason = '') {
    try {
        const state = {
            locked,
            lockedAt: locked ? new Date().toISOString() : null,
            reason:   locked ? reason : ''
        };
        fs.writeFileSync(LOCK_FILE, JSON.stringify(state, null, 2), 'utf8');
        logger.security(`[CIRCUIT BREAKER] État persisted → locked=${locked}${reason ? ` (${reason})` : ''}`);
    } catch (err) {
        logger.error('[CIRCUIT BREAKER] Impossible d\'écrire security_lock.json :', err.message);
    }
}

// ─── État en mémoire ──────────────────────────────────────────────────────────

/** Verrou actif en mémoire (synchronisé avec le disque au boot) */
let _locked = false;

/** Timestamps des messages récents du bot pour la fenêtre glissante */
let _recentMessages = [];

/** Évite les déclenchements multiples simultanés */
let _panicTriggered = false;

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Initialise l'état en mémoire depuis le fichier de persistance.
 * À appeler dans l'événement `ready`.
 * @returns {boolean} - true si le bot démarre en mode panique
 */
function initCircuitBreaker() {
    const state = loadLockState();
    _locked = state.locked;

    if (_locked) {
        logger.security('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        logger.security('⚠️  [CIRCUIT BREAKER] BOT DÉMARRÉ EN MODE PANIQUE !');
        logger.security(`    Verrouillé le : ${state.lockedAt || 'inconnu'}`);
        logger.security(`    Raison        : ${state.reason  || 'non spécifiée'}`);
        logger.security('    Envoyez !unlock en DM pour réarmer.');
        logger.security('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } else {
        logger.security('[CIRCUIT BREAKER] Initialisé → état normal.');
    }

    return _locked;
}

/**
 * Retourne true si le bot est actuellement verrouillé.
 * @returns {boolean}
 */
function isLocked() {
    return _locked;
}

/**
 * Enregistre un message envoyé par le bot dans la fenêtre glissante.
 * Si le seuil est dépassé, déclenche le mode panique.
 * À appeler dans `messageCreate` quand `message.author.id === client.user.id`.
 * @param {import('discord.js').Client} client
 */
function recordBotMessage(client) {
    if (_locked || _panicTriggered) return;

    const now = Date.now();

    // Purge les timestamps hors fenêtre
    _recentMessages = _recentMessages.filter(ts => now - ts < PANIC_WINDOW_MS);
    _recentMessages.push(now);

    logger.debug(`[CIRCUIT BREAKER] Fenêtre glissante : ${_recentMessages.length}/${PANIC_THRESHOLD} msg en ${PANIC_WINDOW_MS}ms`);

    if (_recentMessages.length > PANIC_THRESHOLD) {
        logger.security(`🚨 [CIRCUIT BREAKER] Seuil dépassé (${_recentMessages.length} msg en ${PANIC_WINDOW_MS}ms) → PANIC MODE !`);
        triggerPanicMode(client, 'Emballement détecté : fenêtre glissante dépassée');
    }
}

/**
 * Déclenche le mode panique :
 *  1. Verrouille et persiste l'état sur disque
 *  2. Quitte tous les serveurs
 *  3. Envoie un DM d'urgence au propriétaire
 * @param {import('discord.js').Client} client
 * @param {string} [reason] - Raison du déclenchement
 */
async function triggerPanicMode(client, reason = 'Déclenchement manuel') {
    if (_panicTriggered) return;
    _panicTriggered = true;
    _locked = true;

    // 1. Persistance immédiate sur disque
    saveLockState(true, reason);

    logger.security('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.security('🚨 [CIRCUIT BREAKER] PANIC MODE ACTIVÉ');
    logger.security(`    Raison : ${reason}`);
    logger.security('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 2. Ouvrir le canal DM EN PREMIER (avant de quitter les serveurs).
    //    Discord n'autorise les DMs que si bot et user partagent un serveur.
    //    En appelant createDM() maintenant, le canal est mis en cache localement :
    //    même après avoir quitté tous les guilds, owner.send() fonctionnera
    //    via ce canal déjà établi.
    let ownerDMChannel = null;
    try {
        const owner = await client.users.fetch(OWNER_ID);
        ownerDMChannel = await owner.createDM();
        logger.security('[CIRCUIT BREAKER] ✅ Canal DM propriétaire ouvert et mis en cache.');
    } catch (err) {
        logger.error('[CIRCUIT BREAKER] ❌ Impossible d\'ouvrir le canal DM avant les départs :', err.message);
    }

    // 3. Quitter tous les serveurs
    const guilds = [...client.guilds.cache.values()];
    logger.security(`[CIRCUIT BREAKER] Quitter ${guilds.length} serveur(s)...`);

    for (const guild of guilds) {
        try {
            await guild.leave();
            logger.security(`[CIRCUIT BREAKER] ✅ Serveur quitté : ${guild.name} (${guild.id})`);
        } catch (err) {
            logger.error(`[CIRCUIT BREAKER] ❌ Impossible de quitter ${guild.name} (${guild.id}) :`, err.message);
        }
    }

    // 4. Envoyer l'alerte DM via le canal déjà mis en cache
    //    (fonctionne même sans serveur en commun à ce stade)
    if (ownerDMChannel) {
        try {
            await ownerDMChannel.send(
                `🚨 **[NYREX — CIRCUIT BREAKER ACTIVÉ]**\n\n` +
                `**Raison :** ${reason}\n` +
                `**Déclenché le :** ${new Date().toLocaleString('fr-FR')}\n` +
                `**Serveurs quittés :** ${guilds.length}\n\n` +
                `Le bot est maintenant verrouillé. Il refusera de rejoindre tout serveur.\n` +
                `Envoyez \`!unlock\` en DM pour réarmer le système.`
            );
            logger.security('[CIRCUIT BREAKER] ✅ DM d\'urgence envoyé au propriétaire.');
        } catch (err) {
            logger.error('[CIRCUIT BREAKER] ❌ Impossible d\'envoyer le DM au propriétaire :', err.message);
        }
    }
}

/**
 * Gestionnaire des commandes DM propriétaire (!unlock, !status).
 * À brancher dans messageCreate pour les MP uniquement.
 * @param {import('discord.js').Message} message
 * @returns {Promise<boolean>} - true si la commande a été traitée et doit stopper la propagation
 */
async function handleOwnerDMCommand(message) {
    // Uniquement les MP (pas de guild) et uniquement le propriétaire
    if (message.guild)                         return false;
    if (message.author.id !== OWNER_ID)        return false;
    if (message.author.bot)                    return false;

    const content = message.content.trim().toLowerCase();

    // ── !status ──────────────────────────────────────────────────────────────
    if (content === '!status') {
        const state = loadLockState();
        const statusIcon = _locked ? '🔴' : '🟢';
        const statusText = _locked ? 'VERROUILLÉ (Panic Mode)' : 'Normal';

        let reply = `${statusIcon} **Circuit Breaker — Statut actuel : ${statusText}**\n`;
        if (_locked && state.lockedAt) {
            reply += `\n📅 **Verrouillé le :** ${new Date(state.lockedAt).toLocaleString('fr-FR')}`;
            reply += `\n📝 **Raison :** ${state.reason || 'non spécifiée'}`;
            reply += `\n\nEnvoyez \`!unlock\` pour réarmer.`;
        }

        await message.reply(reply);
        logger.security(`[CIRCUIT BREAKER] Commande !status exécutée par le propriétaire.`);
        return true;
    }

    // ── !unlock ───────────────────────────────────────────────────────────────
    if (content === '!unlock') {
        _locked = false;
        _panicTriggered = false;
        _recentMessages = [];
        saveLockState(false);

        await message.reply(
            `✅ **Circuit Breaker désarmé avec succès.**\n\n` +
            `Le bot est de retour en mode normal.\n` +
            `⚠️ Pensez à vérifier la source de l'incident avant de le réinviter sur des serveurs.`
        );
        logger.security('[CIRCUIT BREAKER] Système réarmé via !unlock par le propriétaire.');
        return true;
    }

    return false;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    initCircuitBreaker,
    isLocked,
    recordBotMessage,
    triggerPanicMode,
    handleOwnerDMCommand,
    OWNER_ID
};
