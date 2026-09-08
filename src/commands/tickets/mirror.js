const { ChannelType, PermissionsBitField, EmbedBuilder } = require('discord.js');
const { getConfig } = require('../../config');

function getMirrorGuildId() {
    const config = getConfig();
    return config.mirrorGuildId || config.ticketSettings?.mirrorGuildId || '1543570076664467536';
}

const ticketStore = require('../../data/tickets.db');

const KNOWN_MIRROR_GUILDS = ['1543570076664467536', '1494698469494095927'];

async function getMirrorChannel(client, originalChannelId) {
    try {
        // 1. Tenter par l'ID exact sauvegardé en base de données
        try {
            const ticketData = await ticketStore.getTicket(originalChannelId);
            if (ticketData?.mirror_channel_id) {
                const directChannel = client.channels.cache.get(ticketData.mirror_channel_id) || 
                                      await client.channels.fetch(ticketData.mirror_channel_id).catch(() => null);
                if (directChannel) return directChannel;
            }
        } catch (dbErr) {}

        // 2. Recherche par topic (MIRROR_OF:ID) sur le serveur miroir actif puis sur l'ancien serveur
        const mirrorGuildId = getMirrorGuildId();
        const guildIdsToSearch = [mirrorGuildId, ...KNOWN_MIRROR_GUILDS.filter(id => id !== mirrorGuildId)];

        for (const guildId of guildIdsToSearch) {
            const mirrorGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
            if (!mirrorGuild) continue;
            await mirrorGuild.channels.fetch().catch(() => {});
            const found = mirrorGuild.channels.cache.find(c => c.topic === `MIRROR_OF:${originalChannelId}`);
            if (found) return found;
        }

        return null;
    } catch (e) {
        return null;
    }
}

async function sendDirectToMirror(mirrorChannel, content, embeds = [], files = []) {
    try {
        const payload = {};
        
        if (content && String(content).trim().length > 0) {
            payload.content = String(content);
        }
        
        if (embeds && embeds.length > 0) {
            payload.embeds = embeds.map(e => (typeof e.toJSON === 'function' ? e.toJSON() : e));
        }
        
        if (files && files.length > 0) {
            const maxSize = 95 * 1024 * 1024; // 95 MB par sécurité
            payload.files = files.filter(f => {
                if (f.size && f.size > maxSize) {
                    console.warn(`[MIRROR] Fichier ignoré - trop volumineux: ${f.name} (${(f.size / 1024 / 1024).toFixed(2)} MB)`);
                    return false;
                }
                return true;
            });
        }
        
        if (!payload.content && (!payload.embeds || payload.embeds.length === 0) && (!payload.files || payload.files.length === 0)) {
            payload.content = "*(Message miroir système)*";
        }
        
        await mirrorChannel.send(payload);
    } catch (e) {
        console.error("[MIRROR] Erreur lors de l'envoi direct:", e.message);
    }
}

async function sendWebhookToMirror(mirrorChannel, username, avatarURL, content, embeds = []) {
    try {
        await sendDirectToMirror(mirrorChannel, content, embeds);
    } catch (e) {
        console.error("[MIRROR] Erreur webhook:", e);
    }
}

async function createMirrorChannel(originalChannel, interaction, ticketName, welcomeTitle, welcomeMsg, userInfo, mentionString) {
    const mirrorGuildId = getMirrorGuildId();
    const mirrorGuild = await interaction.client.guilds.fetch(mirrorGuildId).catch(() => null);
    if (!mirrorGuild) return null;

    const overwrites = [
        { id: mirrorGuild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
    ];

    const config = getConfig();
    const mirrorStaffRoleId = config.mirrorStaffRoleId || config.ticketSettings?.mirrorStaffRoleId || '1494712661097709692';
    if (mirrorGuild.roles.cache.has(mirrorStaffRoleId)) {
        overwrites.push({
            id: mirrorStaffRoleId,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory],
            deny: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AddReactions, PermissionsBitField.Flags.CreatePublicThreads, PermissionsBitField.Flags.CreatePrivateThreads]
        });
    }

    const mirrorChannel = await mirrorGuild.channels.create({
        name: `🔓-${ticketName}`,
        type: ChannelType.GuildText,
        topic: `MIRROR_OF:${originalChannel.id}`,
        permissionOverwrites: overwrites
    });

    const mirrorEmbed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle(welcomeTitle)
        .setDescription(welcomeMsg.replace('{user}', interaction.user.toString()))
        .setThumbnail(interaction.user.displayAvatarURL({ extension: 'png', size: 128 }))
        .addFields(
            { name: '👤 Créateur', value: interaction.user.toString(), inline: true },
            { name: '📂 Catégorie', value: `\`${userInfo?.category || 'support'}\``, inline: true },
            { name: '📅 Date', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        );

    if (userInfo) {
        mirrorEmbed.addFields(
            { name: '📝 Nom & Prénom', value: (userInfo.name || 'Non renseigné').substring(0, 1000), inline: true },
            { name: '📞 Téléphone', value: (userInfo.phone || 'Non renseigné').substring(0, 1000), inline: true }
        );
    }

    await sendDirectToMirror(
        mirrorChannel,
        `${interaction.user} | ${mentionString}`,
        [mirrorEmbed]
    );

    return mirrorChannel;
}

async function closeMirrorChannel(client, channelId) {
    const mirrorChannel = await getMirrorChannel(client, channelId);
    if (mirrorChannel) {
        await sendDirectToMirror(
            mirrorChannel,
            `🔒 **Ticket Fermé**\nLe ticket original a été fermé.`
        );
        const closedMirrorName = mirrorChannel.name.replace('🔓-', '');
        await mirrorChannel.setName(`🔐-${closedMirrorName}`).catch(()=>{});
    }
}

async function claimMirrorChannel(client, channelId, newChannelName) {
    const mirrorChannel = await getMirrorChannel(client, channelId);
    if (mirrorChannel) {
        await mirrorChannel.setName(`🔓-${newChannelName}`).catch(()=>{});
    }
}

async function renameMirrorChannel(client, channelId, newName) {
    const mirrorChannel = await getMirrorChannel(client, channelId);
    if (mirrorChannel) {
        await mirrorChannel.setName(`🔓-${newName}`).catch(()=>{});
    }
}

module.exports = {
    getMirrorChannel,
    sendWebhookToMirror,
    sendDirectToMirror,
    createMirrorChannel,
    closeMirrorChannel,
    claimMirrorChannel,
    renameMirrorChannel
};
