const { Events } = require('discord.js');
const db = require('../data/db');
const ticketStore = require('../data/tickets.db');
const { activePings, getIsLeader } = require('../shared');
const { getConfig } = require('../config');
const { getMirrorChannel } = require('../commands/tickets/mirror');
const { recordCreatedMessage } = require('../utils/ticketHistory');
const {
    isLocked,
    recordBotMessage,
    handleOwnerDMCommand
} = require('../utils/circuitBreaker');

function registerMessageCreateEvent(client) {
    client.on(Events.MessageCreate, async message => {
        // Enregistrer la version initiale du message pour le transcript
        recordCreatedMessage(message);

        // ── CIRCUIT BREAKER : Commandes DM propriétaire (!unlock / !status) ──
        // Traitées en priorité absolue, même en mode panique, pour permettre
        // le réarmement sans avoir à redémarrer ou modifier le code.
        if (!message.guild && !message.author.bot) {
            const handled = await handleOwnerDMCommand(message);
            if (handled) return;
        }

        // ── CIRCUIT BREAKER : Détection des messages du bot lui-même ──
        // Fenêtre glissante : si le bot envoie plus de PANIC_THRESHOLD messages
        // en moins de PANIC_WINDOW_MS ms, le mode panique est automatiquement déclenché.
        if (message.author.id === client.user?.id) {
            recordBotMessage(client);
        }

        // ── CIRCUIT BREAKER : Verrou global ──
        // Si le bot est en mode panique, on bloque tout traitement supplémentaire.
        if (isLocked()) return;

        // Seul le leader traite les messages
        if (!getIsLeader()) return;

        // --- SYSTÈME DE GHOST-PING (Surveillance d'utilisateur) ---
        if (activePings && activePings.has(message.author.id)) {
            const watchers = activePings.get(message.author.id);
            if (watchers && watchers.size > 0) {
                for (const [key, { watcherId, channelId }] of watchers) {
                    if (channelId === message.channel.id) {
                        message.channel.send(`<@${watcherId}>`).then(sentMsg => {
                            setTimeout(() => sentMsg.delete().catch(() => {}), 1000);
                        }).catch(() => {});
                        watchers.delete(key);
                    }
                }
                if (watchers.size === 0) activePings.delete(message.author.id);
            }
        }

        // --- SUIVI DES EMPLOYES ---
        if (message.channel.id === '1456748564817510560' && message.embeds.length > 0) {
            for (const embed of message.embeds) {
                if (!embed.description) continue;
                
                let discordId = null;
                let charName = null;
                let action = null;
                let grade = null;
                let inGameId = null;
                
                const msgDate = new Date(message.createdTimestamp);
                const dateStr = msgDate.toISOString().slice(0, 19).replace('T', ' ');

                const fields = embed.fields || [];
                const getField = (name) => {
                    const f = fields.find(f => f.name && f.name.toLowerCase() === name.toLowerCase());
                    return f ? f.value : null;
                };

                const desc = embed.description.toLowerCase();

                if (desc.includes("a été renvoyé")) {
                    action = 'fired';
                    discordId = getField('targetPlayerDiscord');
                    charName = getField('targetPlayerCharacter');
                    inGameId = getField('targetPlayerId');
                } else if (desc.includes("a quitté")) {
                    action = 'quit';
                    discordId = getField('playerDiscord');
                    charName = getField('playerCharacter');
                    inGameId = getField('playerId');
                } else if (desc.includes("recrutement de")) {
                    action = 'hired';
                    discordId = getField('targetPlayerDiscord');
                    charName = getField('targetPlayerCharacter');
                    inGameId = getField('targetPlayerId');
                } else if (desc.includes("modification du grade")) {
                    action = 'promotion';
                    discordId = getField('targetPlayerDiscord');
                    charName = getField('targetPlayerCharacter');
                    inGameId = getField('targetPlayerId');
                    const parts = embed.description.split(':');
                    if (parts.length > 1) {
                        grade = parts[1].trim();
                    }
                }

                if (action && discordId && charName) {
                    try {
                        const rawData = JSON.stringify(fields);
                        await db.query(
                            'INSERT INTO employment_history (discord_id, in_game_id, character_name, action, grade, raw_data, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                            [discordId, inGameId, charName, action, grade, rawData, dateStr]
                        );
                        console.log(`[EMPLOYMENT LOG] Action ${action} enregistrée pour ${charName} (${discordId})`);
                    } catch (e) {
                        console.error("[EMPLOYMENT LOG] Erreur DB:", e);
                    }
                }
            }
        }

        // --- MIROIR DES MESSAGES DE TICKET ---
        try {
            const ticketData = await ticketStore.getTicket(message.channel.id);
            if (ticketData && !ticketData.is_closed) {
                const mirrorChannel = await getMirrorChannel(client, message.channel.id);

                if (mirrorChannel && mirrorChannel.isTextBased()) {
                        const webhooks = await mirrorChannel.fetchWebhooks();
                        let webhook = webhooks.find(wh => wh.token);
                        if (!webhook) {
                            webhook = await mirrorChannel.createWebhook({ name: 'Nyrex Mirror' });
                        }

                        let content = message.content || '';
                        
                        if (message.embeds.length > 0) {
                            message.embeds.forEach(emb => {
                                if (emb.title) content += `\n**${emb.title}**`;
                                if (emb.description) content += `\n${emb.description}`;
                                if (emb.fields) emb.fields.forEach(f => content += `\n**${f.name}:** ${f.value}`);
                            });
                        }

                        if (message.components && message.components.length > 0) {
                            message.components.forEach(comp => {
                                if (comp.type === 17 && comp.components) {
                                    comp.components.forEach(sub => {
                                        if (sub.type === 10 && sub.content) content += `\n${sub.content}`;
                                    });
                                }
                            });
                        }

                        if (message.stickers.size > 0) {
                            content += `\n*[Sticker: ${message.stickers.first().name}]*`;
                        }

                        if (!content.trim()) content = '*(Message sans texte)*';

                        // Sauvegarder dans la base de données
                        try {
                            const authorAvatar = message.author.avatar || '';
                            const attachmentsStr = message.attachments.size > 0 
                                ? JSON.stringify(Array.from(message.attachments.values()).map(att => att.url))
                                : '[]';

                            await db.query(
                                'INSERT INTO ticket_messages (channel_id, author_id, author_name, author_avatar, content, attachments, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                                [
                                    message.channel.id,
                                    message.author.id,
                                    message.member?.displayName || message.author.username,
                                    authorAvatar,
                                    content,
                                    attachmentsStr,
                                    Date.now()
                                ]
                            );
                        } catch (dbErr) {
                            console.error(`[DATABASE LOG] Erreur sauvegarde message ticket ${message.channel.id}:`, dbErr.message);
                        }

                        const payload = {
                            username: message.member?.displayName || message.author.username,
                            avatarURL: message.author.displayAvatarURL(),
                            content: content.substring(0, 2000)
                        };
                        
                        if (message.attachments.size > 0) {
                            payload.files = Array.from(message.attachments.values()).map(att => att.url);
                        }
                        
                        await webhook.send(payload);
                    }
                }
        } catch (error) {
            if (!error.message || !error.message.toLowerCase().includes('not found')) {
                 console.error(`[MIRROR LOG] Erreur lors du traitement du message pour le miroir:`, error);
            }
        }

        // On ignore les messages provenant d'autres bots (après le miroir pour enregistrer les embeds du bot)
        if (message.author.bot) return;

        // --- AUTO-THREAD (Création automatique de fil de discussion) ---
        const autoThreadChannels = ['1492712993082048763', '1482915415796744213'];
        if (autoThreadChannels.includes(message.channel.id)) {
            try {
                const displayName = message.member ? message.member.displayName : message.author.username;
                await message.startThread({
                    name: `Discussion de ${displayName}`,
                    autoArchiveDuration: 1440,
                });
            } catch (error) {
                console.error(`❌ Erreur avec l'auto-thread dans ${message.channel?.name || 'inconnu'} :`, error);
            }
        }

        // On récupère le préfixe depuis le .env
        const prefix = process.env.PREFIX || '+';
        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        const command = client.commands.get(commandName);
        if (!command) return;

        try {
            // Sécurité : On vérifie si la commande a été désactivée
            const [stateRows] = await db.query('SELECT is_enabled FROM command_states WHERE command_name = ?', [command.name]);
            if (stateRows.length > 0 && !stateRows[0].is_enabled) {
                return message.reply("❌ Cette commande est actuellement désactivée.");
            }
            
            await command.execute(message, args, client);
        } catch (error) {
            console.error(`❌ Erreur lors de l'exécution de la commande "${commandName}" :`, error);
        }
    });
}

module.exports = { registerMessageCreateEvent };
