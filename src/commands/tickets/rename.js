const { ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, PermissionsBitField, ActionRowBuilder } = require('discord.js');
const { getConfig } = require('../../config');
const { renameMirrorChannel } = require('./mirror');
const ticketStore = require('../../data/tickets.db');

async function showRenameModal(interaction) {
    const config = getConfig();
    let ticketData = null;
    try { ticketData = await ticketStore.getTicket(interaction.channelId); } catch(e) { console.error("Erreur lecture tickets DB (rename):", e); }

    let canRenameRoles = (config && config.ticketSettings) ? (config.ticketSettings.renameRole || []) : [];
    if (ticketData && config && config.ticketCategories && config.ticketCategories[ticketData.category]?.renameRole) {
        canRenameRoles = config.ticketCategories[ticketData.category].renameRole;
    }
    if (!Array.isArray(canRenameRoles)) canRenameRoles = [canRenameRoles];
    canRenameRoles = canRenameRoles.filter(r => r && r.trim() !== '');

    const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
    const hasRole = canRenameRoles.some(r => interaction.member.roles.cache.has(r));

    if (!isAdmin && !hasRole) {
        return interaction.reply({ content: "❌ Vous n'avez pas la permission de renommer ce ticket.", flags: MessageFlags.Ephemeral });
    }

    const modal = new ModalBuilder().setCustomId('modal_ticket_rename').setTitle('Renommer le ticket');
    const nameInput = new TextInputBuilder().setCustomId('new_name').setLabel('Nouveau nom du ticket').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100);
    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
    await interaction.showModal(modal);
}

async function handleRenameModal(interaction) {
    const newName = interaction.fields.getTextInputValue('new_name');
    
    await interaction.reply({ 
        content: `🔄 Tentative de renommage du salon en cours...`, 
        flags: MessageFlags.Ephemeral 
    }).catch(() => {});

    try {
        const safeName = newName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').substring(0, 100);
        
        const channel = interaction.channel || await interaction.guild?.channels.fetch(interaction.channelId).catch(() => null);
        if (!channel) {
            return await interaction.editReply({ content: "❌ Impossible d'accéder au salon." }).catch(() => {});
        }

        await channel.setName(safeName || 'ticket');
        
        await channel.send({ 
            content: `✅ Le ticket a été renommé en \`${safeName || 'ticket'}\` par ${interaction.user}.` 
        }).catch(() => {});
        
        await interaction.editReply({ content: `✅ Salon renommé avec succès.` }).catch(() => {});

        await renameMirrorChannel(interaction.client, interaction.channelId, safeName || 'ticket');
    } catch (error) {
        console.error("Erreur renommage:", error);
        await interaction.editReply({ 
            content: `❌ Erreur lors du renommage : \`${error.message}\` (Discord limite à 2 changements de nom par 10 minutes).` 
        }).catch(() => {});
    }
}

module.exports = { showRenameModal, handleRenameModal };
