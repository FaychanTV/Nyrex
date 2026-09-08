const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getConfig } = require('../../config');
const { closeMirrorChannel, getMirrorChannel } = require('./mirror');
const { generateTextTranscript } = require('../../utils/ticketHistory');
const ticketStore = require('../../data/tickets.db');

/**
 * Envoie le transcript et l'embed récapitulatif vers un salon ou un serveur Discord cible.
 * @param {import('discord.js').Client} client 
 * @param {string} targetId ID du salon ou du serveur
 * @param {EmbedBuilder} embed 
 * @param {any} attachment 
 */
async function sendTranscriptToTarget(client, targetId, embed, attachment) {
    if (!targetId || !client) return;

    try {
        // 1. Tenter de récupérer directement comme un salon textuel
        let channel = client.channels.cache.get(targetId) || await client.channels.fetch(targetId).catch(() => null);

        // 2. Si non trouvé comme salon, tenter de le récupérer comme un serveur (Guild)
        if (!channel) {
            const guild = client.guilds.cache.get(targetId) || await client.guilds.fetch(targetId).catch(() => null);
            if (guild) {
                await guild.channels.fetch().catch(() => {});
                channel = guild.channels.cache.find(c => 
                    c.type === ChannelType.GuildText && 
                    (c.name.includes('transcript') || c.name.includes('log') || c.name.includes('archive'))
                ) || guild.channels.cache.find(c => 
                    c.type === ChannelType.GuildText && 
                    c.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages)
                );
            }
        }

        // 3. Envoi du transcript (.txt)
        if (channel && channel.isTextBased()) {
            const files = attachment ? [attachment] : [];
            await channel.send({ embeds: [embed], files });
            console.log(`[Transcript TXT] Envoyé avec succès vers #${channel.name} (${channel.id})`);
        }
    } catch (error) {
        console.error(`[Transcript TXT] Erreur lors de l'envoi vers la cible ${targetId} :`, error);
    }
}

/**
 * Ferme un ticket : retire le créateur, génère le transcript texte brut avec historique a) b) c)..., déplace dans les archives.
 * @param {import('discord.js').ButtonInteraction | import('discord.js').ChatInputCommandInteraction | import('discord.js').Message} interaction 
 */
async function closeTicket(interaction) {
    const channel = interaction.channel || (interaction.guild && await interaction.guild.channels.fetch(interaction.channelId).catch(() => null));
    if (!channel || channel.type !== ChannelType.GuildText) return;

    const client = interaction.client;
    const user = interaction.user || interaction.author;
    const guild = interaction.guild;
    const config = getConfig();

    // 1. Différer la réponse si c'est une interaction
    try {
        if (interaction.deferReply) {
            await interaction.deferReply().catch(() => {});
        }
    } catch (e) {}

    // 2. Récupération des données du ticket depuis la base de données
    let ticketData = null;
    try { 
        ticketData = await ticketStore.getTicket(channel.id); 
    } catch (e) { 
        console.error("[CloseTicket] Erreur lecture tickets DB :", e); 
    }

    // Récupération de secours si non présent en base de données
    if (!ticketData) {
        let ownerId = null;
        let recoveredCategory = 'unknown';
        const embed = interaction.message?.embeds?.[0];
        if (embed) {
            const creatorField = embed.fields?.find(f => f.name === '👤 Créateur');
            if (creatorField) {
                const mention = creatorField.value;
                const userIdMatch = mention.match(/<@!?(\d+)>/);
                if (userIdMatch) ownerId = userIdMatch[1];
                const categoryField = embed.fields.find(f => f.name === '📂 Catégorie');
                if (categoryField) recoveredCategory = categoryField.value.replace(/`/g, '');
            }
        } else {
            try {
                const rawMessage = await interaction.client.rest.get(`/channels/${channel.id}/messages/${interaction.message?.id}`);
                if (rawMessage.components && rawMessage.components[0]?.type === 17) {
                    const container = rawMessage.components[0];
                    for (const comp of container.components) {
                        if (comp.type === 10 && comp.content && comp.content.includes('👤 **Créateur:**')) {
                            const userIdMatch = comp.content.match(/👤 \*\*Créateur:\*\* <@!?(\d+)>/);
                            if (userIdMatch) ownerId = userIdMatch[1];
                            const categoryMatch = comp.content.match(/📂 \*\*Catégorie:\*\* `([^`]+)`/);
                            if (categoryMatch) recoveredCategory = categoryMatch[1];
                            break;
                        }
                    }
                }
            } catch (e) {}
        }

        if (ownerId) {
            try {
                await ticketStore.saveTicket({ channelId: channel.id, ownerId, category: recoveredCategory, createdAt: Date.now() });
                ticketData = await ticketStore.getTicket(channel.id);
                console.log(`[CloseTicket] Ticket ${channel.id} récupéré en DB avec ownerId ${ownerId}, category ${recoveredCategory}`);
            } catch (e) { 
                console.error("[CloseTicket] Erreur sauvegarde DB (recovery) :", e); 
            }
        }
    }

    const cat = (ticketData && config && config.ticketCategories) ? config.ticketCategories[ticketData.category] : null;

    // 3. Retrait des accès du créateur du ticket et du staff ayant claim
    if (ticketData) {
        try {
            if (ticketData.owner_id) await channel.permissionOverwrites.delete(ticketData.owner_id).catch(() => {});
            if (ticketData.claimed_by) await channel.permissionOverwrites.delete(ticketData.claimed_by).catch(() => {});
        } catch (e) {}
    }

    // Retrait des rôles configurés à la fermeture
    const rolesToRemoveOnClose = cat?.removeRoleOnClose || [];
    if (Array.isArray(rolesToRemoveOnClose)) {
        for (const roleId of rolesToRemoveOnClose) {
            if (!roleId) continue;
            try { 
                await channel.permissionOverwrites.delete(roleId); 
            } catch (e) { 
                console.error(`[CloseTicket] Erreur retrait rôle ${roleId} :`, e.message); 
            }
        }
    }

    // 4. Message sobre de fermeture : 🔒 **Nom** a fermé le ticket.
    const member = interaction.member || (guild && user ? guild.members.cache.get(user.id) : null);
    const closedByName = member ? member.displayName : (user ? user.username : 'Staff');
    const closeMsg = `🔒 **${closedByName}** a fermé le ticket.`;

    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: closeMsg });
        } else if (interaction.reply) {
            await interaction.reply({ content: closeMsg });
        } else {
            await channel.send(closeMsg);
        }
    } catch (e) {
        try { await channel.send(closeMsg); } catch (err) {}
    }

    // 5. Déplacement du ticket vers la catégorie d'archives (1457471820893782026)
    const archiveCategory = config.ticketSettings?.closeCategory || '1457471820893782026';
    if (archiveCategory) {
        try {
            await channel.setParent(archiveCategory, { lockPermissions: false });
        } catch (catErr) {
            console.error("[CloseTicket] Erreur lors du déplacement vers la catégorie archives :", catErr);
        }
    }

    // 6. Récupération de l'ID du clone miroir et génération du transcript en format TEXTE BRUT (.txt)
    let transcriptResult = null;
    let mirrorId = ticketData?.mirror_channel_id || null;
    try {
        const mirrorChannel = await getMirrorChannel(client, channel.id);
        if (mirrorChannel) mirrorId = mirrorChannel.id;
        transcriptResult = await generateTextTranscript(channel, ticketData, closedByName, mirrorId);
    } catch (transcriptError) {
        console.error(`[CloseTicket] Erreur génération transcript texte pour #${channel.name} :`, transcriptError);
    }

    // 7. Préparation et envoi de l'embed récapitulatif dans les logs Discord avec le fichier .txt
    const logEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📑 Ticket Archivé & Fermé')
        .addFields(
            { name: 'Nom du ticket', value: `\`#${channel.name}\``, inline: true },
            { name: 'Fermé par', value: `${user ? `<@${user.id}>` : closedByName}`, inline: true },
            { name: 'Catégorie', value: `\`${ticketData?.category || 'Inconnue'}\``, inline: true },
            { name: 'Créateur', value: ticketData?.owner_id ? `<@${ticketData.owner_id}>` : '`Inconnu`', inline: true },
            { name: 'ID Salon', value: `\`${channel.id}\``, inline: true },
            { name: 'ID Clone (Miroir)', value: `\`${mirrorId || 'Aucun'}\``, inline: true },
            { name: 'Date de fermeture', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
        )
        .setFooter({ text: `ID Salon : ${channel.id}` })
        .setTimestamp();

    // Envoi vers le serveur / salon cible (1543570076664467536)
    const targetServerOrChannelId = config.ticketSettings?.transcriptTargetServerId || '1543570076664467536';
    if (targetServerOrChannelId) {
        await sendTranscriptToTarget(client, targetServerOrChannelId, logEmbed, transcriptResult?.attachment);
    }

    // 8. Mise à jour de la base de données (marqué comme fermé)
    if (ticketData) {
        try { 
            await ticketStore.updateTicket(channel.id, { isClosed: 1 }); 
        } catch (e) { 
            console.error("[CloseTicket] Erreur mise à jour DB :", e); 
        }
    }

    // 9. Fermeture du canal miroir si actif
    try {
        await closeMirrorChannel(interaction.client, channel.id);
    } catch (e) {
        console.error("[CloseTicket] Erreur fermeture salon miroir :", e);
    }
}

module.exports = { closeTicket };
