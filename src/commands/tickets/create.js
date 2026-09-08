const { ChannelType, PermissionsBitField, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getConfig } = require('../../config');
const { getNextTicketNumber } = require('./counters');
const { createMirrorChannel } = require('./mirror');
const ticketStore = require('../../data/tickets.db');

async function createTicketChannel(interaction, type, userInfo = null) {
    const config = getConfig();
    const cleanType = type?.trim();
    const categoryConfig = config.ticketCategories?.[cleanType];
    
    console.log(`[DEBUG] ticketCreate.js - Catégorie cible: "${cleanType}" | Trouvée: ${!!categoryConfig} | UserInfo:`, userInfo);
    
    let categoryId = config.ticketSettings.globalCategory;
    if (!categoryId || categoryId.trim() === '') {
        categoryId = categoryConfig?.id || null;
    }

    if (!categoryId) {
        console.error(`[DEBUG] Erreur: Aucune catégorie ID trouvée pour le type "${type}".`);
        const isV2 = interaction.message && interaction.message.flags && interaction.message.flags.has(32768);
        const msg = '❌ Catégorie invalide.';
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply(isV2 ? { components: [{ type: 17, components: [{ type: 10, content: msg }] }] } : { content: msg });
            } else {
                await interaction.reply(isV2 ? { components: [{ type: 17, components: [{ type: 10, content: msg }] }], flags: MessageFlags.Ephemeral | 32768 } : { content: msg, flags: MessageFlags.Ephemeral });
            }
        } catch (e) {
            if (e.code !== 10062) console.error(e);
        }
        return;
    }

    let viewRoles = categoryConfig?.viewRole || config.ticketSettings.viewRole || config.staffRoleId;
    if (!Array.isArray(viewRoles)) viewRoles = [viewRoles];
    viewRoles = viewRoles.filter(r => r && typeof r === 'string' && r.trim() !== '');

    let mentionRoles = categoryConfig?.mentionRole || config.ticketSettings.mentionRole || config.staffRoleId;
    if (!Array.isArray(mentionRoles)) mentionRoles = [mentionRoles];
    mentionRoles = mentionRoles.filter(r => r && typeof r === 'string' && r.trim() !== '');

    const welcomeTitle = categoryConfig?.customWelcomeTitle || config.ticketSettings.ticketWelcomeTitle;
    const welcomeMsg = categoryConfig?.customWelcomeMessage || config.ticketSettings.ticketWelcomeMessage || "Bienvenue {user}";

    const ticketNumber = await getNextTicketNumber();
    config.ticketSettings.ticketCount = ticketNumber;

    let ticketName = `ticket-${interaction.user.id}-${Math.floor(Math.random() * 1000)}`;
    if (categoryConfig?.ticketName) {
        ticketName = categoryConfig.ticketName
            .replace(/{user}/g, interaction.user.username)
            .replace(/{id}/g, interaction.user.id)
            .replace(/{random}/g, Math.floor(Math.random() * 1000))
            .replace(/{number}/g, ticketNumber);
        ticketName = ticketName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '').substring(0, 99);
    }
    if (!ticketName || ticketName.length < 2) ticketName = `ticket-${ticketNumber}`;

    let channel;
    console.log(`[DEBUG] Tentative création salon "${ticketName}" dans catégorie ${categoryId}`);
    try {
        channel = await interaction.guild.channels.create({
            name: ticketName,
            type: ChannelType.GuildText,
            parent: categoryId,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                { id: interaction.client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                ...viewRoles.map(roleId => ({ id: roleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }))
            ]
        });
    } catch (error) {
        console.error("❌ Erreur lors de la création du salon ticket :", error);
        const isV2 = interaction.message && interaction.message.flags && interaction.message.flags.has(32768);
        const msg = `❌ **Impossible de créer le ticket.**\nErreur technique : \`${error.message}\`\n\n👉 Vérifiez que la **Catégorie Discord** configurée existe toujours (ID: \`${categoryId}\`) et que le bot a la permission "Gérer les salons".`;
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply(isV2 ? { components: [{ type: 17, components: [{ type: 10, content: msg }] }] } : { content: msg });
            } else {
                await interaction.reply(isV2 ? { components: [{ type: 17, components: [{ type: 10, content: msg }] }], flags: MessageFlags.Ephemeral | 32768 } : { content: msg, flags: MessageFlags.Ephemeral });
            }
        } catch (e) {
            if (e.code !== 10062 && e.code !== 40060) console.error(e);
        }
        return;
    }

    const container = { type: 17, components: [] };
    container.components.push({ type: 12, items: [{ media: { url: interaction.user.displayAvatarURL({ extension: 'png', size: 128 }) } }] });
    container.components.push({ type: 10, content: `**${welcomeTitle}**` });
    container.components.push({ type: 14, spacing: 1, divider: true });
    container.components.push({ type: 10, content: welcomeMsg.replace('{user}', interaction.user.toString()) });
    container.components.push({ type: 14, spacing: 2 });
    container.components.push({ type: 10, content: `👤 **Créateur:** ${interaction.user} \n 📂 **Catégorie:** \`${type}\` \n 📅 **Date:** <t:${Math.floor(Date.now() / 1000)}:R>` });

    if (userInfo) {
        container.components.push({ type: 14, spacing: 1, divider: true });
        let safeName = (userInfo.name || 'Non renseigné').toString().trim().substring(0, 1000);
        let userFieldsContent = `📝 **Nom & Prénom:** ${safeName}`;
        const safePhone = (userInfo.phone || '').toString().trim();
        if (safePhone) userFieldsContent += `\n📞 **Téléphone:** ${safePhone.substring(0, 1000)}`;
        container.components.push({ type: 10, content: userFieldsContent });
    }
    container.components.push({ type: 14, spacing: 2 });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close').setLabel('Fermer le ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('ticket_rename').setLabel('Renommer').setStyle(ButtonStyle.Secondary).setEmoji('✏️')
    );
    if (categoryConfig?.claimable) {
        row.addComponents(new ButtonBuilder().setCustomId('ticket_claim').setLabel('Prendre en charge').setStyle(ButtonStyle.Success).setEmoji('📌'));
    }
    container.components.push(row.toJSON());

    const mentionString = mentionRoles.map(r => `<@&${r}>`).join(' ');
    container.components.unshift({ type: 10, content: `${interaction.user} | ${mentionString}` });

    console.log(`[DEBUG] Envoi du message dans le salon ${channel.id}`);
    try {
        const rawMessage = await interaction.client.rest.post(`/channels/${channel.id}/messages`, {
            body: { components: [container], flags: 32768 }
        });
        await interaction.client.rest.put(`/channels/${channel.id}/pins/${rawMessage.id}`);
    } catch (err) {
        console.error("❌ Erreur API REST - Impossible d'envoyer le message V2:", err);
        try {
            const fallbackEmbed = new EmbedBuilder()
                .setTitle(welcomeTitle)
                .setDescription(welcomeMsg.replace('{user}', interaction.user.toString()))
                .addFields({ name: '👤 Créateur', value: `${interaction.user}`, inline: true }, { name: '📂 Catégorie', value: `\`${type}\``, inline: true })
                .setColor('#5865F2');
            const fallbackMsg = await channel.send({ content: `${interaction.user} | ${mentionString}`, embeds: [fallbackEmbed], components: [row] });
            await fallbackMsg.pin();
        } catch (fallbackErr) {
            console.error("❌ Le fallback a également échoué:", fallbackErr);
        }
    }

    const isV2 = interaction.message && interaction.message.flags && interaction.message.flags.has(32768);
    const msg = `✅ Ton ticket a été créé : ${channel}`;
    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply(isV2 ? { components: [{ type: 17, components: [{ type: 10, content: msg }] }] } : { content: msg });
        } else {
            await interaction.reply(isV2 ? { components: [{ type: 17, components: [{ type: 10, content: msg }] }], flags: MessageFlags.Ephemeral | 32768 } : { content: msg, flags: MessageFlags.Ephemeral });
        }
    } catch (err) {
        if (err.code !== 10062 && err.code !== 40060) console.error("❌ Erreur lors de la réponse de confirmation :", err);
    }

    try {
        await ticketStore.saveTicket({ channelId: channel.id, ownerId: interaction.user.id, category: type, createdAt: Date.now(), isClosed: 0 });
    } catch (e) {
        console.error("Erreur sauvegarde tickets DB", e);
    }

    try {
        const mirrorChannel = await createMirrorChannel(channel, interaction, ticketName, welcomeTitle, welcomeMsg, { ...userInfo, category: type }, mentionString);
        if (mirrorChannel) {
            await ticketStore.updateTicket(channel.id, { mirrorChannelId: mirrorChannel.id });
        }
    } catch (err) {
        console.error("[MIRROR] Erreur création salon miroir:", err);
    }

    return channel;
}

module.exports = { createTicketChannel };
