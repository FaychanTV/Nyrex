const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder, 
  RoleSelectMenuBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  MessageFlags 
} = require('discord.js');
const { getRcConfig, saveRcConfig } = require('../data/rc.db');

function generateConfigPayload(guildConfig) {
  const presetsList = Object.keys(guildConfig.presets).map(p => {
    const preset = guildConfig.presets[p];
    const roleCount = Array.isArray(preset) ? preset.length : (preset.roles?.length || 0);
    const allowedCount = Array.isArray(preset) ? 0 : (preset.allowed?.length || 0);
    return `• **${p}** : ${roleCount} rôle(s) donné(s) | ${allowedCount} rôle(s) requis`;
  }).join('\n') || 'Aucun preset configuré.';

  const embed = new EmbedBuilder()
    .setTitle('⚙️ Configuration RC (Role Config)')
    .setColor('#2b2d31')
    .setDescription('Gérez les presets. Définissez les rôles donnés et les rôles requis pour chaque preset.')
    .addFields(
      { name: '📦 Presets', value: presetsList }
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rc_create_preset').setLabel('Créer Preset').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('rc_edit_preset_menu').setLabel('Modifier Preset').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('rc_delete_preset').setLabel('Supprimer Preset').setStyle(ButtonStyle.Danger)
  );

  return { content: null, embeds: [embed], components: [row1] };
}

function generatePresetEditPayload(guildConfig, presetName) {
  let preset = guildConfig.presets[presetName];
  if (Array.isArray(preset)) {
    preset = { roles: preset, allowed: [] };
  }

  const rolesToGive = (preset.roles && preset.roles.length > 0) ? preset.roles.map(r => `<@&${r}>`).join(', ') : 'Aucun';
  const rolesAllowed = (preset.allowed && preset.allowed.length > 0) ? preset.allowed.map(r => `<@&${r}>`).join(', ') : 'Aucun (⚠️ Admin uniquement)';

  const embed = new EmbedBuilder()
    .setTitle(`🔧 Config Preset : ${presetName}`)
    .setColor('#ffa500')
    .addFields(
      { name: '🎁 Rôles donnés', value: rolesToGive },
      { name: '🔒 Rôles requis', value: rolesAllowed }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rc_btn_edit_roles_${presetName}`).setLabel('Modifier Rôles Donnés').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`rc_btn_edit_allowed_${presetName}`).setLabel('Modifier Rôles Requis').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rc_home').setLabel('Retour').setStyle(ButtonStyle.Danger)
  );

  return { content: null, embeds: [embed], components: [row] };
}

async function handleRcInteraction(interaction) {
  let config = getRcConfig();
  const guildId = interaction.guild.id;
  
  if (!config[guildId]) {
    config[guildId] = { presets: {} };
  }
  const guildConfig = config[guildId];

  // 1. Retour Menu Principal Config
  if (interaction.customId === 'rc_home') {
    await interaction.update(generateConfigPayload(guildConfig));
  }

  // 2. Créer un preset
  else if (interaction.customId === 'rc_create_preset') {
    const modal = new ModalBuilder().setCustomId('rc_modal_create_preset').setTitle('Nouveau Preset');
    const input = new TextInputBuilder().setCustomId('preset_name').setLabel('Nom du preset').setStyle(TextInputStyle.Short);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }

  // 3. Suite création preset
  else if (interaction.customId === 'rc_modal_create_preset') {
    const name = interaction.fields.getTextInputValue('preset_name');
    if (guildConfig.presets[name]) return interaction.reply({ content: 'Ce preset existe déjà.', flags: MessageFlags.Ephemeral });
    
    guildConfig.presets[name] = { roles: [], allowed: [] };
    saveRcConfig(config);
    await interaction.update(generatePresetEditPayload(guildConfig, name));
  }

  // 4. Menu Modifier Preset (Liste)
  else if (interaction.customId === 'rc_edit_preset_menu') {
    const presets = Object.keys(guildConfig.presets);
    if (presets.length === 0) return interaction.reply({ content: 'Aucun preset.', flags: MessageFlags.Ephemeral });

    const options = presets.map(p => ({ label: p, value: p }));
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('rc_select_edit_preset').setPlaceholder('Choisir le preset à modifier').addOptions(options)
    );
    const rowBack = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rc_home').setLabel('Retour').setStyle(ButtonStyle.Secondary));
    await interaction.update({ content: 'Choisir le preset à modifier :', embeds: [], components: [row, rowBack] });
  }

  // 5. Affichage Menu Edition Preset
  else if (interaction.customId === 'rc_select_edit_preset') {
    const presetName = interaction.values[0];
    await interaction.update(generatePresetEditPayload(guildConfig, presetName));
  }

  // 6. Demande modif rôles
  else if (interaction.customId.startsWith('rc_btn_edit_roles_') || interaction.customId.startsWith('rc_btn_edit_allowed_')) {
    const isAllowed = interaction.customId.startsWith('rc_btn_edit_allowed_');
    const presetName = interaction.customId.replace(isAllowed ? 'rc_btn_edit_allowed_' : 'rc_btn_edit_roles_', '');
    
    const customId = isAllowed ? `rc_select_roles_allowed_${presetName}` : `rc_select_roles_give_${presetName}`;
    const placeholder = isAllowed ? 'Choisir les rôles REQUIS (Autorisés)' : 'Choisir les rôles DONNÉS';

    const row = new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).setMinValues(0).setMaxValues(25)
    );
    await interaction.update({ content: `Modification de **${presetName}** :`, embeds: [], components: [row] });
  }

  // 7. Sauvegarde des rôles
  else if (interaction.customId.startsWith('rc_select_roles_give_') || interaction.customId.startsWith('rc_select_roles_allowed_')) {
    const isAllowed = interaction.customId.startsWith('rc_select_roles_allowed_');
    const presetName = interaction.customId.replace(isAllowed ? 'rc_select_roles_allowed_' : 'rc_select_roles_give_', '');

    if (guildConfig.presets[presetName] !== undefined) {
      if (Array.isArray(guildConfig.presets[presetName])) guildConfig.presets[presetName] = { roles: guildConfig.presets[presetName], allowed: [] };

      if (isAllowed) guildConfig.presets[presetName].allowed = interaction.values;
      else guildConfig.presets[presetName].roles = interaction.values;

      saveRcConfig(config);
      await interaction.update(generatePresetEditPayload(guildConfig, presetName));
    } else {
      await interaction.update({ content: '❌ Preset introuvable.', embeds: [], components: [] });
    }
  }

  // 8. Supprimer un preset
  else if (interaction.customId === 'rc_delete_preset') {
    const presets = Object.keys(guildConfig.presets);
    if (presets.length === 0) return interaction.reply({ content: 'Aucun preset.', flags: MessageFlags.Ephemeral });

    const options = presets.map(p => ({ label: p, value: p }));
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('rc_select_delete_preset').setPlaceholder('Supprimer un preset').addOptions(options)
    );
    const rowBack = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rc_home').setLabel('Retour').setStyle(ButtonStyle.Secondary)
    );
    await interaction.update({ content: 'Choisir le preset à supprimer :', embeds: [], components: [row, rowBack] });
  }

  else if (interaction.customId === 'rc_select_delete_preset') {
    const name = interaction.values[0];
    delete guildConfig.presets[name];
    saveRcConfig(config);
    await interaction.update(generateConfigPayload(guildConfig));
  }

  // --- APPLICATION D'UN PRESET ---
  else if (interaction.customId.startsWith('rc_apply_preset_')) {
    const targetId = interaction.customId.replace('rc_apply_preset_', '');
    const presetName = interaction.values[0];
    let preset = guildConfig.presets[presetName];
    if (Array.isArray(preset)) preset = { roles: preset, allowed: [] };

    if (!preset || !preset.roles) return interaction.reply({ content: '❌ Ce preset semble vide ou supprimé.', flags: MessageFlags.Ephemeral });

    let member;
    try {
      member = await interaction.guild.members.fetch(targetId);
    } catch (e) {
      return interaction.reply({ content: '❌ L\'utilisateur cible est introuvable.', flags: MessageFlags.Ephemeral });
    }
    
    try {
      const hasAllRoles = preset.roles.length > 0 && preset.roles.every(r => member.roles.cache.has(r));

      if (hasAllRoles) {
        await member.roles.remove(preset.roles);
        await interaction.reply({ content: `✅ Preset **${presetName}** retiré de **${member.user.tag}** !`, flags: MessageFlags.Ephemeral });
      } else {
        const allManagedRoles = new Set();
        Object.values(guildConfig.presets).forEach(p => {
          const roles = Array.isArray(p) ? p : p.roles;
          if (roles) roles.forEach(r => allManagedRoles.add(r));
        });

        const rolesToRemove = [];
        for (const roleId of allManagedRoles) {
          if (member.roles.cache.has(roleId) && !preset.roles.includes(roleId)) {
            rolesToRemove.push(roleId);
          }
        }

        if (rolesToRemove.length > 0) await member.roles.remove(rolesToRemove);
        await member.roles.add(preset.roles);
        await interaction.reply({ content: `✅ Preset **${presetName}** appliqué à **${member.user.tag}** !`, flags: MessageFlags.Ephemeral });
      }
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: '❌ Erreur : Je n\'ai pas la permission de modifier ces rôles.', flags: MessageFlags.Ephemeral });
    }
  }
}

module.exports = {
  handleRcInteraction,
  generateConfigPayload
};
