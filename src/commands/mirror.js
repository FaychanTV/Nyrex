// ════════════════════════════════════════════════════════════════════════════
//  COMMANDE : MIRROR — Clone complet d'un serveur Discord (A → Z)
//  Clone les rôles, catégories, salons et leurs permissions
//  dans un serveur cible existant où le bot est déjà présent.
//
//  Utilisation : +mirror <ID_SERVEUR_CIBLE>
//
//  ⚠️  Discord interdit aux bots de créer des serveurs via l'API.
//      Créez le serveur manuellement, invitez-y le bot, puis lancez la commande.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const {
    PermissionsBitField,
    ChannelType,
    OverwriteType,
} = require('discord.js');
const logger = require('../utils/logger');

// ─── Délai anti rate-limit Discord ───────────────────────────────────────
const sleep = (ms) => new Promise(res => setTimeout(res, ms));
const RATE_LIMIT_DELAY = 700; // ms entre chaque création de ressource

// ─── Types de salons supportés ────────────────────────────────────────────
const SUPPORTED_CHANNEL_TYPES = new Set([
    ChannelType.GuildText,
    ChannelType.GuildVoice,
    ChannelType.GuildCategory,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildStageVoice,
    ChannelType.GuildForum,
]);

// ─── Helper : éditer un message de progression ───────────────────────────
async function updateProgress(msg, lines) {
    try {
        await msg.edit({ content: lines.join('\n') });
    } catch (_) { /* silencieux */ }
}

// ─── Helper : construire les permission overwrites ─────────────────────
function buildOverwrites(channel, roleMap) {
    const overwrites = [];
    for (const [id, overwrite] of channel.permissionOverwrites.cache) {
        if (overwrite.type === OverwriteType.Role) {
            const newRoleId = roleMap.get(id);
            if (newRoleId) {
                overwrites.push({
                    id:    newRoleId,
                    type:  OverwriteType.Role,
                    allow: overwrite.allow.toArray(),
                    deny:  overwrite.deny.toArray(),
                });
            }
        }
        // Overwrites membres non clonés (membres non transférés)
    }
    return overwrites;
}

// ─── Commande ─────────────────────────────────────────────────────────────
module.exports = [
    {
        name: 'mirror',
        description: 'Clone le serveur actuel (rôles + salons) dans un serveur cible existant. Utilisation : +mirror <ID_SERVEUR_CIBLE>',

        async execute(message, args, client) {

            // ── 1. Vérification des permissions ──────────────────────────
            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return message.reply('❌ Seul un **Administrateur** peut utiliser cette commande.');
            }

            // ── 2. Vérification de l'argument ─────────────────────────────
            const targetGuildId = args[0];
            if (!targetGuildId) {
                return message.reply([
                    '❌ **Argument manquant.**',
                    '',
                    '**Utilisation :** `+mirror <ID_SERVEUR_CIBLE>`',
                    '',
                    '**Étapes pour créer un miroir :**',
                    '1️⃣ Crée un nouveau serveur Discord vide manuellement',
                    '2️⃣ Invite **Nyrex** dans ce nouveau serveur (avec les perms Admin)',
                    '3️⃣ Copie l\'**ID** du nouveau serveur',
                    '4️⃣ Lance `+mirror <ID_DU_NOUVEAU_SERVEUR>` ici',
                ].join('\n'));
            }

            // ── 3. Récupération du serveur cible ──────────────────────────
            const targetGuild = client.guilds.cache.get(targetGuildId);
            if (!targetGuild) {
                return message.reply([
                    `❌ **Serveur introuvable** : \`${targetGuildId}\``,
                    '',
                    '> Assurez-vous que :',
                    '> • L\'ID est correct',
                    '> • Nyrex est bien présent dans ce serveur',
                    '> • Nyrex a la permission **Administrateur** dans ce serveur',
                ].join('\n'));
            }

            // Vérifier que le bot a les permissions admin dans le serveur cible
            const botMemberTarget = targetGuild.members.me;
            if (!botMemberTarget?.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return message.reply(`❌ Nyrex n'a pas la permission **Administrateur** dans **${targetGuild.name}**. Accordez-la puis relancez la commande.`);
            }

            const sourceGuild = message.guild;
            const initiator   = message.author;

            // Empêcher de cloner sur soi-même
            if (sourceGuild.id === targetGuild.id) {
                return message.reply('❌ Le serveur source et le serveur cible ne peuvent pas être le même.');
            }

            logger.system(`[MIRROR] Clonage de "${sourceGuild.name}" → "${targetGuild.name}" par ${initiator.tag}`);

            // ── 4. Message de progression ─────────────────────────────────
            const progressLines = [
                `🔄 **Clonage du serveur en cours…**`,
                ``,
                `📋 Source  : **${sourceGuild.name}** (\`${sourceGuild.id}\`)`,
                `🎯 Cible   : **${targetGuild.name}** (\`${targetGuild.id}\`)`,
                `👤 Lancé par : <@${initiator.id}>`,
                ``,
                `⏳ \`[1/6]\` Préparation du snapshot…`,
            ];
            const progressMsg = await message.channel.send({ content: progressLines.join('\n') });

            try {
                // ── 5. Snapshot du serveur source ─────────────────────────
                await sourceGuild.roles.fetch();
                await sourceGuild.channels.fetch();

                const sourceRoles = [...sourceGuild.roles.cache.values()]
                    .filter(r => !r.managed && r.name !== '@everyone')
                    .sort((a, b) => a.position - b.position);

                const sourceCategories = [...sourceGuild.channels.cache.values()]
                    .filter(c => c.type === ChannelType.GuildCategory)
                    .sort((a, b) => a.position - b.position);

                const sourceChannels = [...sourceGuild.channels.cache.values()]
                    .filter(c => SUPPORTED_CHANNEL_TYPES.has(c.type) && c.type !== ChannelType.GuildCategory)
                    .sort((a, b) => a.position - b.position);

                progressLines[progressLines.length - 1] =
                    `✅ \`[1/6]\` Snapshot — ${sourceRoles.length} rôle(s), ${sourceCategories.length} catégorie(s), ${sourceChannels.length} salon(s).`;
                progressLines.push(`⏳ \`[2/6]\` Nettoyage du serveur cible…`);
                await updateProgress(progressMsg, progressLines);

                // ── 6. Nettoyage du serveur cible ─────────────────────────
                // Supprimer tous les salons existants
                const existingChannels = await targetGuild.channels.fetch();
                for (const [, ch] of existingChannels) {
                    if (ch) await ch.delete().catch(() => {});
                    await sleep(RATE_LIMIT_DELAY);
                }

                // Supprimer tous les rôles non-managés (sauf @everyone)
                const existingRoles = await targetGuild.roles.fetch();
                for (const [, role] of existingRoles) {
                    if (role.name !== '@everyone' && !role.managed) {
                        await role.delete().catch(() => {});
                        await sleep(RATE_LIMIT_DELAY);
                    }
                }

                progressLines[progressLines.length - 1] = `✅ \`[2/6]\` Serveur cible nettoyé.`;
                progressLines.push(`⏳ \`[3/6]\` Modification du serveur cible…`);
                await updateProgress(progressMsg, progressLines);

                // ── 7. Modifier les paramètres du serveur cible ───────────
                try {
                    await targetGuild.edit({
                        name: `[MIROIR] ${sourceGuild.name}`,
                        icon: sourceGuild.iconURL({ size: 512, extension: 'png' }),
                        ...(sourceGuild.splash ? { splash: sourceGuild.splashURL({ size: 512, extension: 'png' }) } : {}),
                    });
                } catch (_) { /* Les features premium peuvent bloquer certains paramètres */ }

                progressLines[progressLines.length - 1] = `✅ \`[3/6]\` Paramètres du serveur mis à jour.`;
                progressLines.push(`⏳ \`[4/6]\` Clonage des rôles (${sourceRoles.length})…`);
                await updateProgress(progressMsg, progressLines);

                // ── 8. Cloner les rôles ───────────────────────────────────
                // Map : sourceRoleId → newRoleId
                const roleMap = new Map();

                // Mapper @everyone → @everyone du miroir
                roleMap.set(sourceGuild.roles.everyone.id, targetGuild.roles.everyone.id);
                await targetGuild.roles.everyone.edit({
                    permissions: sourceGuild.roles.everyone.permissions,
                }).catch(() => {});

                let rolesDone = 0;
                for (const role of sourceRoles) {
                    try {
                        const newRole = await targetGuild.roles.create({
                            name:        role.name,
                            color:       role.color,
                            hoist:       role.hoist,
                            mentionable: role.mentionable,
                            permissions: role.permissions,
                        });
                        // Positionner le rôle après création
                        await newRole.setPosition(role.position).catch(() => {});
                        roleMap.set(role.id, newRole.id);
                        rolesDone++;
                    } catch (err) {
                        logger.warn(`[MIRROR] Rôle "${role.name}" ignoré : ${err.message}`);
                    }
                    await sleep(RATE_LIMIT_DELAY);
                }

                progressLines[progressLines.length - 1] =
                    `✅ \`[4/6]\` ${rolesDone}/${sourceRoles.length} rôle(s) clonés.`;
                progressLines.push(`⏳ \`[5/6]\` Clonage des catégories (${sourceCategories.length})…`);
                await updateProgress(progressMsg, progressLines);

                // ── 9. Cloner les catégories ─────────────────────────────
                const categoryMap = new Map();
                let catsDone = 0;

                for (const cat of sourceCategories) {
                    try {
                        const newCat = await targetGuild.channels.create({
                            name:                 cat.name,
                            type:                 ChannelType.GuildCategory,
                            position:             cat.position,
                            permissionOverwrites: buildOverwrites(cat, roleMap),
                        });
                        categoryMap.set(cat.id, newCat.id);
                        catsDone++;
                    } catch (err) {
                        logger.warn(`[MIRROR] Catégorie "${cat.name}" ignorée : ${err.message}`);
                    }
                    await sleep(RATE_LIMIT_DELAY);
                }

                progressLines[progressLines.length - 1] =
                    `✅ \`[5/6]\` ${catsDone}/${sourceCategories.length} catégorie(s) clonées.`;
                progressLines.push(`⏳ \`[6/6]\` Clonage des salons (${sourceChannels.length})…`);
                await updateProgress(progressMsg, progressLines);

                // ── 10. Cloner les salons ─────────────────────────────────
                let channelsDone = 0;

                for (const ch of sourceChannels) {
                    try {
                        const parentId = ch.parentId ? categoryMap.get(ch.parentId) : null;

                        /** @type {import('discord.js').GuildChannelCreateOptions} */
                        const options = {
                            name:                 ch.name,
                            type:                 ch.type,
                            position:             ch.position,
                            permissionOverwrites: buildOverwrites(ch, roleMap),
                            ...(parentId ? { parent: parentId } : {}),
                        };

                        // Propriétés spécifiques par type de salon
                        if (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement) {
                            if (ch.topic)            options.topic            = ch.topic;
                            if (ch.nsfw)             options.nsfw             = ch.nsfw;
                            if (ch.rateLimitPerUser) options.rateLimitPerUser = ch.rateLimitPerUser;
                        }

                        if (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice) {
                            if (ch.bitrate)   options.bitrate   = Math.min(ch.bitrate, 96000);
                            if (ch.userLimit) options.userLimit = ch.userLimit;
                        }

                        if (ch.type === ChannelType.GuildForum) {
                            if (ch.topic)                 options.topic            = ch.topic;
                            if (ch.rateLimitPerUser)      options.rateLimitPerUser = ch.rateLimitPerUser;
                            if (ch.availableTags?.length) options.availableTags    = ch.availableTags.map(t => ({
                                name: t.name, emoji: t.emoji, moderated: t.moderated
                            }));
                        }

                        await targetGuild.channels.create(options);
                        channelsDone++;
                    } catch (err) {
                        logger.warn(`[MIRROR] Salon "${ch.name}" ignoré : ${err.message}`);
                    }
                    await sleep(RATE_LIMIT_DELAY);
                }

                // ── 11. Message final ─────────────────────────────────────
                progressLines[progressLines.length - 1] =
                    `✅ \`[6/6]\` ${channelsDone}/${sourceChannels.length} salon(s) clonés.`;
                progressLines.push(``);
                progressLines.push(`🎉 **Clonage terminé avec succès !**`);
                progressLines.push(`📌 Serveur miroir : **[MIROIR] ${sourceGuild.name}** (\`${targetGuild.id}\`)`);
                await updateProgress(progressMsg, progressLines);

                logger.system(`[MIRROR] Terminé — "${sourceGuild.name}" → "${targetGuild.name}" (${targetGuild.id})`);
                logger.logAction('BOT_ACTION', `[MIRROR] Clonage de "${sourceGuild.name}" (${sourceGuild.id}) → "${targetGuild.name}" (${targetGuild.id}) par ${initiator.tag}`);

            } catch (err) {
                logger.error('[MIRROR] Erreur critique :', err);
                await progressMsg.edit({
                    content: `❌ **Une erreur est survenue pendant le clonage :**\n\`\`\`${err.message}\`\`\``
                }).catch(() => {});
            }
        }
    }
];
