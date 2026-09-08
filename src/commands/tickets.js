const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getConfig } = require('../config');
const { hasCommandPermission } = require('../utils/permissions');

// Importations des sous-modules tickets
const { createTicketChannel } = require('./tickets/create');
const { closeTicket } = require('./tickets/close');
const { claimTicket } = require('./tickets/claim');
const { showRenameModal, handleRenameModal } = require('./tickets/rename');
const { getCguContainer, getUserInfoInitPayload } = require('./tickets/options');
const { 
  getUserInfoMenuPayload, 
  updateUserInfoMenu, 
  showUserInfoModal, 
  handleUserInfoSubmit, 
  clearUserInfo, 
  getUserInfo,
  pendingForms 
} = require('./tickets/userInfo');
const { 
  generateMainConfigPayload, 
  handleConfigButtons, 
  handleConfigModals, 
  handleConfigMenu, 
  handleConfigRoleSelect 
} = require('./tickets/configPanel');

// --- WRAPPERS POUR LE CYCLE DE VIE DES TICKETS ---

async function handleTicketCreation(interaction) {
    console.log(`[DEBUG] >>> handleTicketCreation DÉBUT <<<`);
    console.log(`[DEBUG] interaction.customId:`, interaction.customId);
    
    const customId = interaction.customId;
    let type;
    const config = getConfig();

    if (customId.startsWith('create_ticket_')) {
        type = customId.replace('create_ticket_', '');
    } else if (customId.startsWith('cgu_accept_')) {
        type = customId.replace('cgu_accept_', '');
    } else {
        type = config.ticketSettings.defaultCategory || 'default'; 
    }
    
    type = type.trim();
    if (!type) {
        type = config.ticketSettings.defaultCategory || 'default';
        console.log(`[DEBUG] Type vide, défini sur le défaut: "${type}"`);
    }

    const categoryConfig = config.ticketCategories?.[type];
    console.log(`[DEBUG] Catégorie "${type}" config:`, categoryConfig);
    
    if (!categoryConfig) {
        const msg = `❌ Erreur de configuration : La catégorie de ticket "${type}" est introuvable.`;
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ content: msg, flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
            }
        } catch (e) {
            console.error("Erreur lors de la réponse d'erreur de catégorie:", e);
        }
        return;
    }

    const requireUserInfo = categoryConfig.requireUserInfo === true;
    const requireCgu = categoryConfig.requireCgu === true;
    
    // 1. CGU Requises
    if (requireCgu && !customId.startsWith('cgu_accept_')) {
        return await interaction.reply(getCguContainer(type));
    }
    
    // 2. Formulaire UserInfo Requis
    if (requireUserInfo) {
        console.log(`[DEBUG] Affichage du formulaire userInfo pour type "${type}"`);
        const payload = getUserInfoInitPayload(type, interaction.user.id, pendingForms, getUserInfoMenuPayload);
        
        if (customId.startsWith('cgu_accept_')) {
            return await interaction.update(payload);
        }
        return await interaction.reply(payload);
    }
    
    // 3. Création directe si CGU et/ou UserInfo gérés
    if (customId.startsWith('cgu_accept_')) {
        await interaction.update({ 
            components: [{ type: 17, components: [{ type: 10, content: "✅ CGU Acceptées. Création de votre ticket en cours..." }] }] 
        });
    }
    return await createTicketChannel(interaction, type);
}

async function handleUserInfoInteraction(interaction) {
    const customId = interaction.customId;
    const userId = interaction.user.id;

    if (interaction.isModalSubmit() && customId.startsWith('userinfo_modal_')) {
        const field = customId.replace('userinfo_modal_', '');
        const value = interaction.fields.getTextInputValue('input_value');
        
        const pendingInfo = pendingForms.get(userId);
        if (!pendingInfo) return await interaction.reply({ content: '❌ Session expirée. Veuillez recommencer.', flags: MessageFlags.Ephemeral });

        pendingInfo[field] = value;
        return await updateUserInfoMenu(interaction, userId, true);
    }
    
    if (customId === 'userinfo_btn_submit' || customId === 'userinfo_submit') {
        const userInfo = handleUserInfoSubmit(userId);
        if (!userInfo) {
            return await interaction.reply({ content: '❌ Session expirée. Veuillez recommencer.', flags: MessageFlags.Ephemeral });
        }
        
        const pendingInfo = pendingForms.get(userId);
        if (!pendingInfo || !pendingInfo.type) {
            return await interaction.reply({ content: '❌ Session expirée. Veuillez recommencer.', flags: MessageFlags.Ephemeral });
        }
        
        const type = pendingInfo.type;
        clearUserInfo(userId);
        return await createTicketChannel(interaction, type, userInfo);
    }
    
    if (customId.startsWith('userinfo_btn_')) {
        const action = customId.replace('userinfo_btn_', '');
        if (action === 'clear') {
            clearUserInfo(userId);
            return await interaction.reply({ content: '✅ Informations effacées.', flags: MessageFlags.Ephemeral });
        }

        const modal = showUserInfoModal(interaction);
        if (modal) return await interaction.showModal(modal);
        return;
    }
    
    const payload = getUserInfoMenuPayload(userId);
    if (payload.expired) {
        return await interaction.reply(payload.payload);
    }
    return await interaction.update(payload.payload);
}

// --- EXPORT DES COMMANDES TEXTUELLES ---

const commands = [
  // Commande : ticket (Affiche l'embed d'ouverture)
  {
    name: 'ticket',
    description: 'Affiche le bouton pour ouvrir un ticket',
    async execute(message, args) {
      const config = getConfig();
      const embed = new EmbedBuilder()
        .setTitle(config.ticketSettings.panelTitle)
        .setDescription(config.ticketSettings.panelDescription)
        .setColor('#2b2d31')
        .setThumbnail(message.guild.iconURL())
        .setFooter({ text: message.guild.name, iconURL: message.guild.iconURL() });

      const categories = config.ticketCategories || {};
      const orderList  = Array.isArray(config.ticketCategoryOrder) ? config.ticketCategoryOrder : [];
      const existing   = orderList.filter(n => categories[n]);
      const missing    = Object.keys(categories).filter(n => !existing.includes(n));
      const orderedCats = [...existing, ...missing];

      const rows = [];
      let currentRow   = new ActionRowBuilder();
      let currentCount = 0;

      orderedCats.forEach((cat, idx) => {
        const catData = categories[cat];
        if (!catData) return;

        if ((catData.newRow && idx > 0) || currentCount >= 5) {
          if (currentCount > 0) rows.push(currentRow);
          currentRow   = new ActionRowBuilder();
          currentCount = 0;
        }

        const emoji    = catData.emoji || '🎫';
        const styleStr = catData.style || 'Primary';
        const style    = ButtonStyle[styleStr] || ButtonStyle.Primary;

        currentRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`create_ticket_${cat}`)
            .setLabel(cat)
            .setStyle(style)
            .setEmoji(emoji)
        );
        currentCount++;
      });

      if (currentCount > 0) rows.push(currentRow);

      await message.channel.send({ embeds: [embed], components: rows });
    }
  },

  // Commande : ticketconfig (Affiche le menu de configuration)
  {
    name: 'ticketconfig',
    description: 'Configurer le système de tickets via Discord',
    async execute(message, args) {
      const allowed = await hasCommandPermission(message.member, 'ticketconfig');
      if (!allowed) {
        return message.reply("❌ Vous n'avez pas la permission d'utiliser cette commande.");
      }

      const payload = generateMainConfigPayload();
      await message.channel.send(payload);
    },

    async executeButton(interaction) {
      const payload = generateMainConfigPayload();
      payload.flags = payload.flags ? (payload.flags | MessageFlags.Ephemeral) : MessageFlags.Ephemeral;
      await interaction.reply(payload);
    }
  },

  // Commande : close (Fermer un ticket avec transcript)
  {
    name: 'close',
    description: 'Fermer le ticket actuel et générer son transcript',
    async execute(message, args) {
      await closeTicket(message);
    }
  }
];

// On attache les wrappers pour que index.js ou les handlers puissent y accéder facilement
commands.handleTicketCreation = handleTicketCreation;
commands.handleTicketClose = closeTicket;
commands.handleTicketClaim = claimTicket;
commands.handleTicketRenameBtn = showRenameModal;
commands.handleTicketRenameModal = handleRenameModal;
commands.handleUserInfoInteraction = handleUserInfoInteraction;

commands.handleConfigButtons = handleConfigButtons;
commands.handleConfigMenu = handleConfigMenu;
commands.handleConfigRoleSelect = handleConfigRoleSelect;
commands.handleConfigModals = handleConfigModals;

module.exports = commands;
