const { ApplicationCommandOptionType, PermissionsBitField, MessageFlags } = require('discord.js');
const { getConfig } = require('../../config');
const ticketStore = require('../../data/tickets.db');

function getMirrorGuildId() {
    const config = getConfig();
    return config.mirrorGuildId || config.ticketSettings?.mirrorGuildId || '1543570076664467536';
}

/**
 * Vérifie si l'utilisateur est staff (admin, claimRole, viewRole)
 */
async function isStaff(member, channelId) {
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;

    const config = getConfig();
    let staffRoles = [];

    // On cherche la catégorie du ticket pour récupérer les rôles autorisés
    try {
        const ticketData = await ticketStore.getTicket(channelId);
        if (ticketData && ticketData.category && config.ticketCategories?.[ticketData.category]) {
            const cat = config.ticketCategories[ticketData.category];
            const claimRoles = Array.isArray(cat.claimRole) ? cat.claimRole : (cat.claimRole ? [cat.claimRole] : []);
            const viewRoles  = Array.isArray(cat.viewRole)  ? cat.viewRole  : (cat.viewRole  ? [cat.viewRole]  : []);
            staffRoles = [...claimRoles, ...viewRoles];
        }
    } catch (e) { /* ignore */ }

    // Rôles globaux de claim/view en fallback
    if (staffRoles.length === 0 && config.ticketSettings) {
        const cr = config.ticketSettings.claimRole;
        const vr = config.ticketSettings.viewRole;
        staffRoles = [
            ...(Array.isArray(cr) ? cr : (cr ? [cr] : [])),
            ...(Array.isArray(vr) ? vr : (vr ? [vr] : []))
        ];
    }

    return staffRoles.some(roleId => member.roles.cache.has(roleId));
}

const addCommand = {
    name: 'add',
    description: 'Ajoute un utilisateur au ticket actuel.',
    options: [
        {
            name: 'user',
            description: 'L\'utilisateur à ajouter au ticket',
            type: ApplicationCommandOptionType.User,
            required: true
        }
    ],

    async executeSlash(interaction) {
        const targetUser = interaction.options.getUser('user');
        const targetMember = interaction.options.getMember('user');

        if (!targetUser || !targetMember) {
            return interaction.reply({ content: '❌ Utilisateur introuvable sur ce serveur.', flags: MessageFlags.Ephemeral });
        }

        const isMirrorGuild = interaction.guildId === MIRROR_GUILD_ID;

        // Vérification : l'interaction se passe dans un ticket ou sur le serveur miroir
        const ticketData = await ticketStore.getTicket(interaction.channelId).catch(() => null);
        if (!ticketData && !isMirrorGuild) {
            return interaction.reply({ content: '❌ Cette commande doit être utilisée dans un salon de ticket.', flags: MessageFlags.Ephemeral });
        }

        // Vérification des permissions : staff ou propriétaire du ticket
        const isMemberStaff = await isStaff(interaction.member, interaction.channelId);
        const isOwner = ticketData ? ticketData.owner_id === interaction.user.id : false;

        if (!isMemberStaff && !isOwner) {
            return interaction.reply({ content: '❌ Seul le staff ou le propriétaire du ticket peut ajouter des membres.', flags: MessageFlags.Ephemeral });
        }

        try {
            await interaction.channel.permissionOverwrites.edit(targetMember, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            });
            return interaction.reply({ content: `✅ **${targetMember.displayName}** a été ajouté au ticket.` });
        } catch (e) {
            console.error('[/add] Erreur permission overwrite:', e);
            return interaction.reply({ content: `❌ Impossible d'ajouter **${targetMember.displayName}** : vérifiez la hiérarchie des rôles du bot.`, flags: MessageFlags.Ephemeral });
        }
    }
};

const removeCommand = {
    name: 'remove',
    description: 'Retire un utilisateur du ticket actuel.',
    options: [
        {
            name: 'user',
            description: 'L\'utilisateur à retirer du ticket',
            type: ApplicationCommandOptionType.User,
            required: true
        }
    ],

    async executeSlash(interaction) {
        const targetUser = interaction.options.getUser('user');
        const targetMember = interaction.options.getMember('user');

        if (!targetUser || !targetMember) {
            return interaction.reply({ content: '❌ Utilisateur introuvable sur ce serveur.', flags: MessageFlags.Ephemeral });
        }

        const isMirrorGuild = interaction.guildId === MIRROR_GUILD_ID;

        // Vérification : l'interaction se passe dans un ticket ou sur le serveur miroir
        const ticketData = await ticketStore.getTicket(interaction.channelId).catch(() => null);
        if (!ticketData && !isMirrorGuild) {
            return interaction.reply({ content: '❌ Cette commande doit être utilisée dans un salon de ticket.', flags: MessageFlags.Ephemeral });
        }

        // Vérification des permissions : staff uniquement
        const isMemberStaff = await isStaff(interaction.member, interaction.channelId);
        if (!isMemberStaff) {
            return interaction.reply({ content: '❌ Seul le staff peut retirer des membres d\'un ticket.', flags: MessageFlags.Ephemeral });
        }

        // Empêcher de retirer le propriétaire du ticket (si on est dans le ticket original)
        if (ticketData && ticketData.owner_id === targetUser.id) {
            return interaction.reply({ content: '❌ Vous ne pouvez pas retirer le propriétaire du ticket.', flags: MessageFlags.Ephemeral });
        }

        try {
            await interaction.channel.permissionOverwrites.delete(targetMember);
            return interaction.reply({ content: `✅ **${targetMember.displayName}** a été retiré du ticket.` });
        } catch (e) {
            console.error('[/remove] Erreur permission overwrite:', e);
            return interaction.reply({ content: `❌ Impossible de retirer **${targetMember.displayName}** : vérifiez la hiérarchie des rôles du bot.`, flags: MessageFlags.Ephemeral });
        }
    }
};

module.exports = { addCommand, removeCommand };
