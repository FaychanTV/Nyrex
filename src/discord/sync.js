const fs = require('fs');
const path = require('path');
const { Events, REST, Routes } = require('discord.js');
const db = require('../data/db');
const { getConfig } = require('../config');
const { slashCommandDefinitions } = require('../handlers/slashCommand');
const { syncEmployeesPresences } = require('../jobs/index');
const { notifyStartup } = require('../utils/notifier');
const logger = require('../utils/logger');

let isSyncCompleted = false;

/**
 * Attend que le client Discord émette l'événement ClientReady
 * @param {import('discord.js').Client} client 
 * @returns {Promise<import('discord.js').Client>}
 */
function waitForClientReady(client) {
    if (client.isReady()) {
        return Promise.resolve(client);
    }
    return new Promise((resolve) => {
        client.once(Events.ClientReady, (readyClient) => {
            resolve(readyClient);
        });
    });
}

/**
 * Exécute l'intégralité de la synchronisation Discord de façon synchrone attendue (Promise)
 * @param {import('discord.js').Client} client 
 */
async function syncDiscord(client) {
    if (isSyncCompleted) return;

    logger.discord(`Client connecté sous ${client.user.tag}. Début de la synchronisation post-connexion...`);

    // 1. Mise en cache des guildes, membres, rôles et salons
    for (const [, guild] of client.guilds.cache) {
        try {
            await guild.members.fetch().catch(() => {});
            await guild.roles.fetch().catch(() => {});
            await guild.channels.fetch().catch(() => {});
        } catch (e) {
            // Ignorer les erreurs d'accès ponctuel
        }
    }
    logger.discord(`Mise en cache achevée : ${client.guilds.cache.size} serveur(s) et ${client.users.cache.size} membre(s) chargés.`);

    // 2. Déploiement automatique des commandes Slash
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        const config = getConfig();
        const mirrorId = config.mirrorGuildId || config.ticketSettings?.mirrorGuildId || '1543570076664467536';
        const GUILD_IDS = [mirrorId, '1456748563148312689'].filter((id, i, arr) => id && arr.indexOf(id) === i);

        // Nettoyage des commandes globales
        await rest.put(Routes.applicationCommands(client.user.id), { body: [] }).catch(() => {});

        for (const guildId of GUILD_IDS) {
            try {
                await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: slashCommandDefinitions });
                logger.discord(`Commandes Slash déployées sur la guilde : ${guildId}`);
            } catch (guildErr) {
                logger.discord(`⚠️ Erreur déploiement Slash sur ${guildId} : ${guildErr.message}`);
            }
        }
    } catch (slashErr) {
        logger.discord(`❌ Erreur lors du déploiement des commandes Slash : ${slashErr.message}`);
    }

    // 3. Migration automatique perm.json -> DB si existant
    const permPath = path.resolve(__dirname, '../../perm.json');
    if (fs.existsSync(permPath)) {
        try {
            const permData = JSON.parse(fs.readFileSync(permPath, 'utf8'));
            for (const [key, value] of Object.entries(permData)) {
                if (key.startsWith('permission_')) {
                    await db.query(
                        'INSERT INTO permissions (perm_id, description, roleid, commands) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE description = ?, roleid = ?, commands = ?',
                        [key, value.description, value.roleid, JSON.stringify(value.commands), value.description, value.roleid, JSON.stringify(value.commands)]
                    );
                } else if (key === 'state') {
                    for (const [cmd, isEnabled] of Object.entries(value)) {
                        await db.query(
                            'INSERT INTO command_states (command_name, is_enabled) VALUES (?, ?) ON DUPLICATE KEY UPDATE is_enabled = ?',
                            [cmd, isEnabled, isEnabled]
                        );
                    }
                }
            }
        } catch (err) {
            logger.database(`Erreur migration perm.json : ${err.message}`);
        }
    }

    // 4. Synchronisation initiale des présences du staff
    await syncEmployeesPresences(client);

    // 5. Chargement des informations du bot & mise en place du statut
    try {
        const [rows] = await db.query('SELECT version, auteur, copyright FROM bot_info WHERE id = 1');
        const botInfo = rows && rows[0];
        if (botInfo) {
            logger.discord(`Métadonnées : v${botInfo.version} | ${botInfo.auteur} | ${botInfo.copyright}`);
            client.user.setPresence({
                activities: [{
                    name: `v${botInfo.version} | ${botInfo.auteur} ${botInfo.copyright}`,
                    type: 3
                }],
                status: 'online'
            });
        } else {
            client.user.setPresence({
                activities: [{ name: `Nyrex V3 | En ligne`, type: 3 }],
                status: 'online'
            });
        }
    } catch (e) {
        client.user.setPresence({
            activities: [{ name: `Nyrex V3 | En ligne`, type: 3 }],
            status: 'online'
        });
    }

    // 6. Notification de démarrage
    try {
        await notifyStartup();
    } catch (e) {
        // Ignorer les erreurs réseau pour les alertes push
    }

    isSyncCompleted = true;
    logger.discord(`Session Discord et synchronisation des données finalisées avec succès.`);
}

module.exports = {
    waitForClientReady,
    syncDiscord
};
