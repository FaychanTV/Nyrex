const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  MessageFlags
} = require('discord.js');
const { getConfig, saveConfig } = require('../../config');

// Fonction utilitaire pour générer l'embed principal
function generateMainConfigPayload() {
  const config = getConfig();
  const categoriesList = Object.keys(config.ticketCategories).map(k => `• **${k}** : <#${config.ticketCategories[k].id}>`).join('\n') || 'Aucune catégorie configurée.';
  const globalCat = config.ticketSettings.globalCategory ? `<#${config.ticketSettings.globalCategory}>` : '`Par type`';
  const closeCat = config.ticketSettings.closeCategory ? `<#${config.ticketSettings.closeCategory}>` : '`Aucune (Juste permission)`';

  const container = { type: 17, components: [] };
  container.components.push({ type: 10, content: "**⚙️ Configuration Complète**" });
  container.components.push({ type: 14, spacing: 1, divider: true });
  container.components.push({ type: 10, content: "Gérez les textes, les catégories et le rôle staff ici." });
  container.components.push({ type: 14, spacing: 2 });

  container.components.push({ type: 10, content: `**📨 Textes**\nPanel: \`${config.ticketSettings.panelTitle}\`\nTicket: \`${config.ticketSettings.ticketWelcomeTitle}\`` });
  container.components.push({ type: 14, spacing: 1 });

  container.components.push({ type: 10, content: `**⚙️ Options**\nMax Tickets: \`${config.ticketSettings.maxTickets || 1}\`\nCatégorie Global: ${globalCat}\nArchives: ${closeCat}` });
  container.components.push({ type: 14, spacing: 1 });

  container.components.push({ type: 10, content: `**📂 Catégories**\n${categoriesList}` });
  container.components.push({ type: 14, spacing: 2 });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('config_edit_panel').setLabel('📝 Textes Panel').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config_edit_ticket').setLabel('📝 Textes Ticket').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config_set_limit').setLabel('🔢 Limite Tickets').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('config_add_category').setLabel('➕ Ajouter Catégorie').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('config_remove_category').setLabel('➖ Supprimer Catégorie').setStyle(ButtonStyle.Danger)
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('config_set_roles').setLabel('👥 Rôles Globaux').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('config_close_category').setLabel('📁 Archives').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config_set_rename_role').setLabel('✏️ Rôle Renommer').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('config_set_claim_role').setLabel('📌 Rôle Claim').setStyle(ButtonStyle.Primary)
  );
  
  container.components.push(row1.toJSON());
  container.components.push(row2.toJSON());
  container.components.push(row3.toJSON());

  const options = Object.keys(config.ticketCategories).map(k => ({ label: k, value: k }));
  if (options.length > 0) {
    const row4 = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_edit_category').setPlaceholder('🔧 Choisir une catégorie à configurer').addOptions(options.slice(0, 25)));
    container.components.push(row4.toJSON());
  }
  return { components: [container], flags: 32768 };
}

function generateCategoryEditPayload(catName) {
  const config = getConfig();
  const catData = config.ticketCategories[catName];
  if (!catData) return { content: '❌ Catégorie introuvable.', embeds: [], components: [] };

  const formatRoles = (roles, fallback = '`Global`') => {
    if (Array.isArray(roles) && roles.length > 1) return '\n' + roles.map(r => `> <@&${r}>`).join('\n');
    if (Array.isArray(roles) && roles.length === 1) return `<@&${roles[0]}>`;
    return roles ? `<@&${roles}>` : fallback;
  };

  const renameRole = formatRoles(catData.renameRole);
  const claimable = catData.claimable ? '`✅ Activé`' : '`❌ Désactivé`';
  const claimRole = formatRoles(catData.claimRole);
  const privateOnClaim = catData.privateOnClaim ? '`✅ Activé`' : '`❌ Désactivé`';
  const removeRoleOnClaim = formatRoles(catData.removeRoleOnClaim, '`Aucun`');
  const removeRoleOnClose = formatRoles(catData.removeRoleOnClose, '`Aucun`');
  const userInfoRequired = catData.requireUserInfo ? '`✅ Activé`' : '`❌ Désactivé`';
  const styleMap = {
    Primary: 'Bleu (Primary)',
    Secondary: 'Gris (Secondary)',
    Success: 'Vert (Success)',
    Danger: 'Rouge (Danger)'
  };
  const currentStyle = catData.style || 'Primary';

  const container = { type: 17, components: [] };
  container.components.push({ type: 10, content: `**🔧 Configuration : ${catName}**\nModifiez les paramètres spécifiques pour la catégorie.` });
  container.components.push({ type: 14, spacing: 1, divider: true });

  let infoContent = `🆔 ID Catégorie: \`${catData.id}\`\n🏷️ Nom Ticket: \`${catData.ticketName || 'Défaut'}\`\n🎨 Emoji: \`${catData.emoji || '🎫'}\` | Couleur: \`${styleMap[currentStyle] || currentStyle}\``;
  infoContent += `\n\n👀 Rôle Accès: ${formatRoles(catData.viewRole)}\n🔔 Rôle Mention: ${formatRoles(catData.mentionRole)}\n✏️ Rôle Renommer: ${renameRole}\n👤 Infos Requises: ${userInfoRequired}`;
  infoContent += `\n\n📌 Claim: ${claimable} | Rôle Claim: ${claimRole}\n🔒 Privé si Claim: ${privateOnClaim}\n🚷 Retirés si Claim: ${removeRoleOnClaim}\n🚷 Retirés à la Fermeture: ${removeRoleOnClose}`;

  container.components.push({ type: 10, content: infoContent });
  container.components.push({ type: 14, spacing: 2 });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`btn_edit_cat_rename_${catName}`).setLabel('✏️ Renommer').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`btn_edit_cat_ticketname_${catName}`).setLabel('🏷️ Nom Ticket').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`btn_edit_cat_emoji_${catName}`).setLabel('🎨 Emoji').setStyle(ButtonStyle.Secondary)
  );
  const row2_part1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`btn_edit_cat_style_${catName}`).setLabel('🎨 Couleur').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`btn_edit_cat_msg_${catName}`).setLabel('📝 Message').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`btn_edit_cat_id_${catName}`).setLabel('🆔 ID Catégorie').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`btn_toggle_userinfo_${catName}`).setLabel('👤 Infos User').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`btn_toggle_claimable_${catName}`).setLabel('📌 Claim').setStyle(ButtonStyle.Primary)
  );
  const row2_part2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`btn_toggle_claim_privacy_${catName}`).setLabel('🔒 Privé si Claim').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`btn_edit_cat_remove_claim_${catName}`).setLabel('🚷 Retrait Claim').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`btn_edit_cat_remove_close_${catName}`).setLabel('🚷 Retrait Fermeture').setStyle(ButtonStyle.Danger)
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`btn_edit_cat_view_${catName}`).setLabel('👀 Rôle Accès').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`btn_edit_cat_mention_${catName}`).setLabel('🔔 Rôle Mention').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`btn_edit_cat_rename_role_${catName}`).setLabel('✏️ Rôle Renommer').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`btn_edit_cat_claim_role_${catName}`).setLabel('📌 Rôle Claim').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('config_return_main').setLabel('🔙 Retour').setStyle(ButtonStyle.Danger)
  );
  
  container.components.push(row1.toJSON());
  container.components.push(row2_part1.toJSON());
  container.components.push(row2_part2.toJSON());
  container.components.push(row3.toJSON());

  return { components: [container], flags: 32768 };
}

async function handleConfigButtons(interaction) {
  const config = getConfig();
  if (interaction.customId === 'config_edit_panel') {
    const modal = new ModalBuilder().setCustomId('modal_config_panel').setTitle('Configuration du Panel');
    const titleInput = new TextInputBuilder().setCustomId('panelTitle').setLabel('Titre du Panel').setStyle(TextInputStyle.Short).setValue(config.ticketSettings.panelTitle);
    const descInput = new TextInputBuilder().setCustomId('panelDescription').setLabel('Description du Panel').setStyle(TextInputStyle.Paragraph).setValue(config.ticketSettings.panelDescription);
    const btnInput = new TextInputBuilder().setCustomId('buttonLabel').setLabel('Texte du Menu (Placeholder)').setStyle(TextInputStyle.Short).setValue(config.ticketSettings.buttonLabel);
    const limitInput = new TextInputBuilder().setCustomId('maxTickets').setLabel('Limite Max de Tickets (ex: 1)').setStyle(TextInputStyle.Short).setValue(String(config.ticketSettings.maxTickets || 1));
    const globalCatInput = new TextInputBuilder().setCustomId('globalCategory').setLabel('ID Catégorie Unique (Vide = par type)').setStyle(TextInputStyle.Short).setRequired(false).setValue(config.ticketSettings.globalCategory || '');
    
    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(descInput),
      new ActionRowBuilder().addComponents(btnInput),
      new ActionRowBuilder().addComponents(limitInput),
      new ActionRowBuilder().addComponents(globalCatInput)
    );
    await interaction.showModal(modal);
  } else if (interaction.customId === 'config_edit_ticket') {
    const modal = new ModalBuilder().setCustomId('modal_config_ticket').setTitle('Configuration du Ticket');
    const welcomeTitle = new TextInputBuilder().setCustomId('ticketWelcomeTitle').setLabel('Titre Message Bienvenue').setStyle(TextInputStyle.Short).setValue(config.ticketSettings.ticketWelcomeTitle);
    const welcomeMsg = new TextInputBuilder().setCustomId('ticketWelcomeMessage').setLabel('Message de Bienvenue').setStyle(TextInputStyle.Paragraph).setValue(config.ticketSettings.ticketWelcomeMessage);
    modal.addComponents(new ActionRowBuilder().addComponents(welcomeTitle), new ActionRowBuilder().addComponents(welcomeMsg));
    await interaction.showModal(modal);
  }
  else if (interaction.customId === 'config_set_limit') {
    const modal = new ModalBuilder().setCustomId('modal_config_limit').setTitle('Limite de Tickets');
    const limitInput = new TextInputBuilder().setCustomId('maxTickets').setLabel('Max tickets par personne').setStyle(TextInputStyle.Short).setValue(String(config.ticketSettings.maxTickets || 1));
    modal.addComponents(new ActionRowBuilder().addComponents(limitInput));
    await interaction.showModal(modal);
  }
  else if (interaction.customId === 'config_add_category') {
    const modal = new ModalBuilder().setCustomId('modal_config_add_cat').setTitle('Ajouter une catégorie');
    const nameInput = new TextInputBuilder().setCustomId('catName').setLabel('Nom (ex: support)').setStyle(TextInputStyle.Short);
    const idInput = new TextInputBuilder().setCustomId('catId').setLabel('ID de la catégorie Discord').setStyle(TextInputStyle.Short);
    modal.addComponents(new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(idInput));
    await interaction.showModal(modal);
  }
  else if (interaction.customId === 'config_remove_category') {
    const options = Object.keys(config.ticketCategories).map(k => ({ label: k, value: k }));
    if (options.length === 0) return interaction.reply({ content: "Aucune catégorie à supprimer.", flags: MessageFlags.Ephemeral });
    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_remove_category').setPlaceholder('Choisir la catégorie à supprimer').addOptions(options));
    const container = { type: 17, components: [] };
    container.components.push({ type: 10, content: "**🗑️ Supprimer une catégorie**\nSélectionnez la catégorie à supprimer :" });
    container.components.push({ type: 14, spacing: 1, divider: true });
    container.components.push(row.toJSON());
    await interaction.reply({ components: [container], flags: 32768 | MessageFlags.Ephemeral });
  }
  else if (interaction.customId === 'config_modify_category') {
    const options = Object.keys(config.ticketCategories).map(k => ({ label: k, value: k }));
    if (options.length === 0) return interaction.reply({ content: "Aucune catégorie à configurer.", flags: MessageFlags.Ephemeral });
    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_edit_category').setPlaceholder('Choisir la catégorie à modifier').addOptions(options));
    const container = { type: 17, components: [] };
    container.components.push({ type: 10, content: "**🔧 Modifier une catégorie**\nSélectionnez la catégorie à modifier :" });
    container.components.push({ type: 14, spacing: 1, divider: true });
    container.components.push(row.toJSON());
    await interaction.reply({ components: [container], flags: 32768 | MessageFlags.Ephemeral });
  }
  else if (interaction.customId === 'config_set_roles') {
    const row1 = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('select_global_view').setPlaceholder('Global: Rôles qui VOIENT').setMinValues(0).setMaxValues(25));
    const row2 = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('select_global_mention').setPlaceholder('Global: Rôles MENTIONNÉS').setMinValues(0).setMaxValues(25));
    const container = { type: 17, components: [] };
    container.components.push({ type: 10, content: "**👥 Configuration des rôles globaux**" });
    container.components.push({ type: 14, spacing: 1, divider: true });
    container.components.push(row1.toJSON());
    container.components.push(row2.toJSON());
    await interaction.reply({ components: [container], flags: 32768 | MessageFlags.Ephemeral });
  }
  else if (interaction.customId === 'config_set_rename_role') {
    const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('select_global_rename').setPlaceholder('Global: Rôles RENOMMER').setMinValues(0).setMaxValues(25));
    const container = { type: 17, components: [] };
    container.components.push({ type: 10, content: "**✏️ Configuration du rôle global pour renommer**" });
    container.components.push({ type: 14, spacing: 1, divider: true });
    container.components.push(row.toJSON());
    await interaction.reply({ components: [container], flags: 32768 | MessageFlags.Ephemeral });
  }
  else if (interaction.customId === 'config_set_claim_role') {
    const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('select_global_claim').setPlaceholder('Global: Rôles qui peuvent CLAIM').setMinValues(0).setMaxValues(25));
    const container = { type: 17, components: [] };
    container.components.push({ type: 10, content: "**📌 Configuration du rôle global pour claim un ticket**" });
    container.components.push({ type: 14, spacing: 1, divider: true });
    container.components.push(row.toJSON());
    await interaction.reply({ components: [container], flags: 32768 | MessageFlags.Ephemeral });
  }
  else if (interaction.customId === 'config_close_category') {
    const modal = new ModalBuilder().setCustomId('modal_config_close_cat').setTitle('Catégorie Archives (Fermeture)');
    const catInput = new TextInputBuilder().setCustomId('closeCategory').setLabel('ID Catégorie (Vide = désactivé)').setStyle(TextInputStyle.Short).setRequired(false).setValue(config.ticketSettings.closeCategory || '');
    modal.addComponents(new ActionRowBuilder().addComponents(catInput));
    await interaction.showModal(modal);
  }
  else if (interaction.customId.startsWith('btn_edit_cat_view_')) {
    const catName = interaction.customId.replace('btn_edit_cat_view_', '');
    const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(`select_cat_view_${catName}`).setPlaceholder('Choisir le rôle qui VOIT le ticket').setMinValues(0).setMaxValues(25));
    const rowBack = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`btn_back_cat_${catName}`).setLabel('🔙 Retour').setStyle(ButtonStyle.Secondary));
    const container = { type: 17, components: [] };
    container.components.push({ type: 10, content: `**👀 Rôles de vue pour ${catName}**` });
    container.components.push({ type: 14, spacing: 1, divider: true });
    container.components.push(row.toJSON());
    container.components.push(rowBack.toJSON());
    await interaction.update({ components: [container], flags: 32768 });
  }
  else if (interaction.customId.startsWith('btn_edit_cat_mention_')) {
    const catName = interaction.customId.replace('btn_edit_cat_mention_', '');
    const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(`select_cat_mention_${catName}`).setPlaceholder('Choisir le rôle MENTIONNÉ').setMinValues(0).setMaxValues(25));
    const rowBack = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`btn_back_cat_${catName}`).setLabel('🔙 Retour').setStyle(ButtonStyle.Secondary));
    const container = { type: 17, components: [] };
    container.components.push({ type: 10, content: `**🔔 Rôles mentionnés pour ${catName}**` });
    container.components.push({ type: 14, spacing: 1, divider: true });
    container.components.push(row.toJSON());
    container.components.push(rowBack.toJSON());
    await interaction.update({ components: [container], flags: 32768 });
  }
  else if (interaction.customId.startsWith('btn_edit_cat_rename_role_')) {
    const catName = interaction.customId.replace('btn_edit_cat_rename_role_', '');
    const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(`select_cat_rename_${catName}`).setPlaceholder('Choisir le rôle RENOMMER').setMinValues(0).setMaxValues(25));
    const rowBack = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`btn_back_cat_${catName}`).setLabel('🔙 Retour').setStyle(ButtonStyle.Secondary));
    const container = { type: 17, components: [] };
    container.components.push({ type: 10, content: `**✏️ Rôles pour renommer dans ${catName}**` });
    container.components.push({ type: 14, spacing: 1, divider: true });
    container.components.push(row.toJSON());
    container.components.push(rowBack.toJSON());
    await interaction.update({ components: [container], flags: 32768 });
  }
  else if (interaction.customId.startsWith('btn_edit_cat_claim_role_')) {
    const catName = interaction.customId.replace('btn_edit_cat_claim_role_', '');
    const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(`select_cat_claim_${catName}`).setPlaceholder('Choisir les rôles qui peuvent claim').setMinValues(0).setMaxValues(25));
    const rowBack = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`btn_back_cat_${catName}`).setLabel('🔙 Retour').setStyle(ButtonStyle.Secondary));
    const container = { type: 17, components: [] };
    container.components.push({ type: 10, content: `**📌 Rôles pour claim dans ${catName}**` });
    container.components.push({ type: 14, spacing: 1, divider: true });
    container.components.push(row.toJSON());
    container.components.push(rowBack.toJSON());
    await interaction.update({ components: [container], flags: 32768 });
  }
  else if (interaction.customId.startsWith('btn_edit_cat_remove_claim_')) {
    const catName = interaction.customId.replace('btn_edit_cat_remove_claim_', '');
    const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(`select_cat_remove_claim_${catName}`).setPlaceholder('Rôles à retirer lors du claim').setMinValues(0).setMaxValues(25));
    const rowBack = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`btn_back_cat_${catName}`).setLabel('🔙 Retour').setStyle(ButtonStyle.Secondary));
    const container = { type: 17, components: [] };
    container.components.push({ type: 10, content: `**🚷 Rôles à retirer lors d'un claim dans ${catName}**` });
    container.components.push({ type: 14, spacing: 1, divider: true });
    container.components.push(row.toJSON());
    container.components.push(rowBack.toJSON());
    await interaction.update({ components: [container], flags: 32768 });
  }
  else if (interaction.customId.startsWith('btn_edit_cat_remove_close_')) {
    const catName = interaction.customId.replace('btn_edit_cat_remove_close_', '');
    const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(`select_cat_remove_close_${catName}`).setPlaceholder('Rôles à retirer lors de la FERMETURE').setMinValues(0).setMaxValues(25));
    const rowBack = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`btn_back_cat_${catName}`).setLabel('🔙 Retour').setStyle(ButtonStyle.Secondary));
    const container = { type: 17, components: [] };
    container.components.push({ type: 10, content: `**🚷 Rôles à retirer lors de la FERMETURE pour ${catName}**` });
    container.components.push({ type: 14, spacing: 1, divider: true });
    container.components.push(row.toJSON());
    container.components.push(rowBack.toJSON());
    await interaction.update({ components: [container], flags: 32768 });
  }
  else if (interaction.customId.startsWith('btn_edit_cat_msg_')) {
    const catName = interaction.customId.replace('btn_edit_cat_msg_', '');
    const catData = config.ticketCategories[catName];
    const modal = new ModalBuilder().setCustomId(`modal_config_cat_msg_${catName}`).setTitle(`Message : ${catName}`);
    const titleInput = new TextInputBuilder().setCustomId('customWelcomeTitle').setLabel('Titre (vide = défaut)').setStyle(TextInputStyle.Short).setRequired(false).setValue(catData.customWelcomeTitle || '');
    const msgInput = new TextInputBuilder().setCustomId('customWelcomeMessage').setLabel('Message (vide = défaut)').setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(catData.customWelcomeMessage || '');
    modal.addComponents(new ActionRowBuilder().addComponents(titleInput), new ActionRowBuilder().addComponents(msgInput));
    await interaction.showModal(modal);
  }
  else if (interaction.customId.startsWith('btn_edit_cat_ticketname_')) {
    const catName = interaction.customId.replace('btn_edit_cat_ticketname_', '');
    const catData = config.ticketCategories[catName];
    const modal = new ModalBuilder().setCustomId(`modal_config_cat_ticketname_${catName}`).setTitle(`Nom Ticket : ${catName}`);
    const nameInput = new TextInputBuilder().setCustomId('ticketNamePattern').setLabel('Format du nom').setPlaceholder('Ex: ticket-{number}').setStyle(TextInputStyle.Short).setRequired(false).setValue(catData.ticketName || '');
    const helpInput = new TextInputBuilder().setCustomId('helpInfo').setLabel('Variables disponibles (Info)').setStyle(TextInputStyle.Paragraph).setRequired(false).setValue("{user} : Pseudo\n{id} : ID User\n{number} : Compteur (001)\n{random} : Aléatoire");
    modal.addComponents(new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(helpInput));
    await interaction.showModal(modal);
  }
  else if (interaction.customId.startsWith('btn_edit_cat_emoji_')) {
    const catName = interaction.customId.replace('btn_edit_cat_emoji_', '');
    const catData = config.ticketCategories[catName];
    const modal = new ModalBuilder().setCustomId(`modal_config_cat_emoji_${catName}`).setTitle(`Emoji : ${catName}`);
    const emojiInput = new TextInputBuilder().setCustomId('catEmoji').setLabel('Emoji du bouton').setPlaceholder('Ex: 🎫, 👮, 📝').setStyle(TextInputStyle.Short).setRequired(false).setValue(catData.emoji || '🎫');
    modal.addComponents(new ActionRowBuilder().addComponents(emojiInput));
    await interaction.showModal(modal);
  }
  else if (interaction.customId.startsWith('btn_edit_cat_style_')) {
    const catName = interaction.customId.replace('btn_edit_cat_style_', '');

    const container = { type: 17, components: [] };
    container.components.push({ type: 10, content: `**🎨 Choisir la couleur pour ${catName}**\nSélectionnez une des couleurs ci-dessous.` });
    container.components.push({ type: 14, spacing: 1, divider: true });

    const colorRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`btn_set_style_Primary_${catName}`).setLabel('Bleu').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`btn_set_style_Secondary_${catName}`).setLabel('Gris').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`btn_set_style_Success_${catName}`).setLabel('Vert').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`btn_set_style_Danger_${catName}`).setLabel('Rouge').setStyle(ButtonStyle.Danger)
    );
    const rowBack = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`btn_back_cat_${catName}`).setLabel('🔙 Retour').setStyle(ButtonStyle.Secondary));
    
    container.components.push(colorRow.toJSON());
    container.components.push(rowBack.toJSON());
    
    await interaction.update({ components: [container], flags: 32768 });
  }
  else if (interaction.customId.startsWith('btn_set_style_')) {
    const parts = interaction.customId.replace('btn_set_style_', '').split('_');
    const style = parts[0];
    const catName = parts.slice(1).join('_');
    if (config.ticketCategories[catName]) {
      config.ticketCategories[catName].style = style;
      saveConfig(config);
      await interaction.update(generateCategoryEditPayload(catName));
    }
  }
  else if (interaction.customId.startsWith('btn_edit_cat_id_')) {
    const catName = interaction.customId.replace('btn_edit_cat_id_', '');
    const catData = config.ticketCategories[catName];
    const modal = new ModalBuilder().setCustomId(`modal_config_cat_id_${catName}`).setTitle(`ID Catégorie : ${catName}`);
    const idInput = new TextInputBuilder().setCustomId('catId').setLabel('Nouvel ID de catégorie').setStyle(TextInputStyle.Short).setRequired(true).setValue(catData.id || '');
    modal.addComponents(new ActionRowBuilder().addComponents(idInput));
    await interaction.showModal(modal);
  }
  else if (interaction.customId.startsWith('btn_edit_cat_rename_')) {
    const catName = interaction.customId.replace('btn_edit_cat_rename_', '');
    const modal = new ModalBuilder().setCustomId(`modal_config_cat_rename_${catName}`).setTitle(`Renommer : ${catName}`);
    const nameInput = new TextInputBuilder().setCustomId('newCatName').setLabel('Nouveau nom').setStyle(TextInputStyle.Short).setRequired(true).setValue(catName);
    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
    await interaction.showModal(modal);
  }
  else if (interaction.customId.startsWith('btn_toggle_userinfo_')) {
    const catName = interaction.customId.replace('btn_toggle_userinfo_', '');
    if (config.ticketCategories[catName]) {
      config.ticketCategories[catName].requireUserInfo = !config.ticketCategories[catName].requireUserInfo;
      saveConfig(config);
      await interaction.update(generateCategoryEditPayload(catName));
    }
  }
  else if (interaction.customId.startsWith('btn_toggle_claimable_')) {
    const catName = interaction.customId.replace('btn_toggle_claimable_', '');
    if (config.ticketCategories[catName]) {
      config.ticketCategories[catName].claimable = !config.ticketCategories[catName].claimable;
      saveConfig(config);
      await interaction.update(generateCategoryEditPayload(catName));
    }
  }
  else if (interaction.customId.startsWith('btn_toggle_claim_privacy_')) {
    const catName = interaction.customId.replace('btn_toggle_claim_privacy_', '');
    if (config.ticketCategories[catName]) {
      config.ticketCategories[catName].privateOnClaim = !config.ticketCategories[catName].privateOnClaim;
      saveConfig(config);
      await interaction.update(generateCategoryEditPayload(catName));
    }
  }
  else if (interaction.customId.startsWith('btn_back_cat_')) {
    const catName = interaction.customId.replace('btn_back_cat_', '');
    await interaction.update(generateCategoryEditPayload(catName));
  }
  else if (interaction.customId === 'config_return_main') {
    await interaction.update(generateMainConfigPayload());
  }
}

async function handleConfigModals(interaction) {
  const config = getConfig();
  let shouldUpdateMain = false;
  let updateCategoryView = null;

  if (interaction.customId === 'modal_config_panel') {
    config.ticketSettings.panelTitle = interaction.fields.getTextInputValue('panelTitle');
    config.ticketSettings.panelDescription = interaction.fields.getTextInputValue('panelDescription');
    config.ticketSettings.buttonLabel = interaction.fields.getTextInputValue('buttonLabel');
    config.ticketSettings.maxTickets = parseInt(interaction.fields.getTextInputValue('maxTickets')) || 1;
    config.ticketSettings.globalCategory = interaction.fields.getTextInputValue('globalCategory');
    shouldUpdateMain = true;
  } else if (interaction.customId === 'modal_config_ticket') {
    config.ticketSettings.ticketWelcomeTitle = interaction.fields.getTextInputValue('ticketWelcomeTitle');
    config.ticketSettings.ticketWelcomeMessage = interaction.fields.getTextInputValue('ticketWelcomeMessage');
    shouldUpdateMain = true;
  } else if (interaction.customId === 'modal_config_limit') {
    config.ticketSettings.maxTickets = parseInt(interaction.fields.getTextInputValue('maxTickets')) || 1;
    shouldUpdateMain = true;
  } else if (interaction.customId === 'modal_config_add_cat') {
    const name = interaction.fields.getTextInputValue('catName');
    const id = interaction.fields.getTextInputValue('catId');
    config.ticketCategories[name] = {
      id: id,
      viewRole: '',
      mentionRole: '',
      privateOnClaim: false,
      claimable: false,
      requireUserInfo: false,
      ticketName: `${name}-{number}`,
      removeRoleOnClose: []
    };
    shouldUpdateMain = true;
  } else if (interaction.customId === 'modal_config_close_cat') {
    config.ticketSettings.closeCategory = interaction.fields.getTextInputValue('closeCategory');
    shouldUpdateMain = true;
  } else if (interaction.customId.startsWith('modal_config_cat_msg_')) {
    const catName = interaction.customId.replace('modal_config_cat_msg_', '');
    if (config.ticketCategories[catName]) {
      config.ticketCategories[catName].customWelcomeTitle = interaction.fields.getTextInputValue('customWelcomeTitle');
      config.ticketCategories[catName].customWelcomeMessage = interaction.fields.getTextInputValue('customWelcomeMessage');
      updateCategoryView = catName;
    }
  } else if (interaction.customId.startsWith('modal_config_cat_ticketname_')) {
    const catName = interaction.customId.replace('modal_config_cat_ticketname_', '');
    if (config.ticketCategories[catName]) {
      config.ticketCategories[catName].ticketName = interaction.fields.getTextInputValue('ticketNamePattern');
      updateCategoryView = catName;
    }
  } else if (interaction.customId.startsWith('modal_config_cat_emoji_')) {
    const catName = interaction.customId.replace('modal_config_cat_emoji_', '');
    if (config.ticketCategories[catName]) {
      config.ticketCategories[catName].emoji = interaction.fields.getTextInputValue('catEmoji') || '🎫';
      updateCategoryView = catName;
    }
  } else if (interaction.customId.startsWith('modal_config_cat_id_')) {
    const catName = interaction.customId.replace('modal_config_cat_id_', '');
    if (config.ticketCategories[catName]) {
      config.ticketCategories[catName].id = interaction.fields.getTextInputValue('catId');
      updateCategoryView = catName;
    }
  } else if (interaction.customId.startsWith('modal_config_cat_rename_')) {
    const oldName = interaction.customId.replace('modal_config_cat_rename_', '');
    const newName = interaction.fields.getTextInputValue('newCatName');
    
    if (oldName !== newName) {
      if (config.ticketCategories[newName]) return interaction.reply({ content: '❌ Ce nom de catégorie existe déjà.', flags: MessageFlags.Ephemeral });
      if (config.ticketCategories[oldName]) {
        config.ticketCategories[newName] = config.ticketCategories[oldName];
        delete config.ticketCategories[oldName];
        shouldUpdateMain = true;
      }
    } else shouldUpdateMain = true;
  }

  const success = saveConfig(config);
  if (!success) {
    return interaction.reply({ content: '❌ Erreur lors de la sauvegarde.', flags: MessageFlags.Ephemeral });
  }
  
  if (shouldUpdateMain) {
    await interaction.update(generateMainConfigPayload());
  } else if (updateCategoryView) {
    await interaction.update(generateCategoryEditPayload(updateCategoryView));
  } else {
    await interaction.reply({ content: '✅ Configuration mise à jour !', flags: MessageFlags.Ephemeral });
  }
}

async function handleConfigMenu(interaction) {
  const config = getConfig();
  if (interaction.customId === 'menu_remove_category') {
    const toRemove = interaction.values[0];
    delete config.ticketCategories[toRemove];
    saveConfig(config);
    await interaction.update({ 
      components: [{ type: 17, components: [{ type: 10, content: `✅ Catégorie **${toRemove}** supprimée.` }] }] 
    });
  }
  else if (interaction.customId === 'menu_edit_category') {
    const catName = interaction.values[0];
    await interaction.update(generateCategoryEditPayload(catName));
  }
}

async function handleConfigRoleSelect(interaction) {
  const config = getConfig();
  if (interaction.customId.startsWith('select_cat_view_')) {
    const catName = interaction.customId.replace('select_cat_view_', '');
    if (config.ticketCategories[catName]) {
      config.ticketCategories[catName].viewRole = interaction.values;
      saveConfig(config);
      await interaction.update(generateCategoryEditPayload(catName));
    }
  } else if (interaction.customId.startsWith('select_cat_mention_')) {
    const catName = interaction.customId.replace('select_cat_mention_', '');
    if (config.ticketCategories[catName]) {
      config.ticketCategories[catName].mentionRole = interaction.values;
      saveConfig(config);
      await interaction.update(generateCategoryEditPayload(catName));
    }
  } else if (interaction.customId === 'select_global_view') {
    config.ticketSettings.viewRole = interaction.values;
    saveConfig(config);
    await interaction.reply({ content: `✅ Rôles d'accès **Globaux** mis à jour.`, flags: MessageFlags.Ephemeral });
  } else if (interaction.customId === 'select_global_mention') {
    config.ticketSettings.mentionRole = interaction.values;
    saveConfig(config);
    await interaction.reply({ content: `✅ Rôles mentionnés **Globaux** mis à jour.`, flags: MessageFlags.Ephemeral });
  } else if (interaction.customId === 'select_global_rename') {
    config.ticketSettings.renameRole = interaction.values;
    saveConfig(config);
    await interaction.reply({ content: `✅ Rôles renommer **Globaux** mis à jour.`, flags: MessageFlags.Ephemeral });
  } else if (interaction.customId.startsWith('select_cat_rename_')) {
    const catName = interaction.customId.replace('select_cat_rename_', '');
    if (config.ticketCategories[catName]) {
      config.ticketCategories[catName].renameRole = interaction.values;
      saveConfig(config);
      await interaction.update(generateCategoryEditPayload(catName));
    }
  } else if (interaction.customId.startsWith('select_cat_claim_')) {
    const catName = interaction.customId.replace('select_cat_claim_', '');
    if (config.ticketCategories[catName]) {
      config.ticketCategories[catName].claimRole = interaction.values;
      saveConfig(config);
      await interaction.update(generateCategoryEditPayload(catName));
    }
  } else if (interaction.customId === 'select_global_claim') {
    config.ticketSettings.claimRole = interaction.values;
    saveConfig(config);
    await interaction.reply({ content: `✅ Rôles de claim **Globaux** mis à jour.`, flags: MessageFlags.Ephemeral });
  }
  else if (interaction.customId.startsWith('select_cat_remove_claim_')) {
    const catName = interaction.customId.replace('select_cat_remove_claim_', '');
    if (config.ticketCategories[catName]) {
      config.ticketCategories[catName].removeRoleOnClaim = interaction.values;
      saveConfig(config);
      await interaction.update(generateCategoryEditPayload(catName));
    }
  }
  else if (interaction.customId.startsWith('select_cat_remove_close_')) {
    const catName = interaction.customId.replace('select_cat_remove_close_', '');
    if (config.ticketCategories[catName]) {
      config.ticketCategories[catName].removeRoleOnClose = interaction.values;
      saveConfig(config);
      await interaction.update(generateCategoryEditPayload(catName));
    }
  }
}

module.exports = { 
  handleConfigButtons, 
  handleConfigModals, 
  handleConfigMenu, 
  handleConfigRoleSelect, 
  generateMainConfigPayload,
  generateCategoryEditPayload
};
