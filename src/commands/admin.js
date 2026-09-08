const { 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  RoleSelectMenuBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle,
  PermissionsBitField,
  MessageFlags
} = require('discord.js');
const db = require('../data/db');
const { hasCommandPermission } = require('../utils/permissions');

// --- Helper Database Permissions pour la commande perme ---
async function getPermsFromDB() {
  const perms = {};
  try {
    const [rows] = await db.query('SELECT * FROM permissions');
    for (const row of rows) {
      perms[row.perm_id] = {
        description: row.description,
        roleid: row.roleid,
        commands: row.commands ? JSON.parse(row.commands) : []
      };
    }
  } catch (e) {
    console.error("Erreur lecture permissions DB:", e);
  }
  return perms;
}

async function savePermToDB(perm_id, p) {
  await db.query(
    'INSERT INTO permissions (perm_id, description, roleid, commands) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE description = ?, roleid = ?, commands = ?',
    [perm_id, p.description || '', p.roleid || null, JSON.stringify(p.commands || []), p.description || '', p.roleid || null, JSON.stringify(p.commands || [])]
  );
}

function generateMainMenu(guild, perms) {
  const options = [];
  for (let i = 1; i <= 9; i++) {
    const p = perms[`permission_${i}`] || { description: 'Non configuré', roleid: null, commands: [] };
    const role = guild.roles.cache.get(p.roleid);
    const roleName = role ? role.name : (p.roleid ? 'ID Inconnu' : 'Aucun rôle');
    
    options.push({
      label: `Permission ${i}`,
      description: `Rôle: ${roleName} | ${(p.description || '').substring(0, 50)}`,
      value: `permission_${i}`
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('perm_select_level')
      .setPlaceholder('Choisir un niveau de permission à modifier')
      .addOptions(options)
  );

  const container = { type: 17, components: [] };
  
  container.components.push({
    type: 10,
    content: '**🛡️ Configuration des Permissions**\nSélectionnez un niveau ci-dessous pour modifier son rôle, sa description ou ses commandes.'
  });

  container.components.push({ type: 14, spacing: 2, divider: true });

  container.components.push({
    type: 10,
    content: '*Permission 9 est le niveau administrateur par défaut.*'
  });

  container.components.push(row.toJSON());

  return { content: "", embeds: [], components: [container], flags: 32768 };
}

function generateDetailView(guild, levelName, p) {
  const role = guild.roles.cache.get(p.roleid);
  const container = { type: 17, components: [] };
  
  container.components.push({ type: 10, content: `**🔧 Config : ${levelName}**` });
  
  container.components.push({ type: 14, spacing: 2, divider: true });

  container.components.push({ type: 10, content: `**📝 Description**\n${p.description || 'Aucune'}` });
  container.components.push({ type: 10, content: `**👥 Rôle**\n${role ? `<@&${role.id}>` : (p.roleid ? `ID: ${p.roleid}` : 'Aucun')}` });
  container.components.push({ type: 10, content: `**💻 Commandes**\n${p.commands.length ? p.commands.join(', ') : 'Aucune'}` });

  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('perm_edit_desc').setLabel('Description').setStyle(ButtonStyle.Secondary).setEmoji('📝'),
    new ButtonBuilder().setCustomId('perm_edit_role').setLabel('Rôle').setStyle(ButtonStyle.Primary).setEmoji('👥'),
    new ButtonBuilder().setCustomId('perm_edit_cmds').setLabel('Commandes').setStyle(ButtonStyle.Success).setEmoji('💻'),
    new ButtonBuilder().setCustomId('perm_back_main').setLabel('Retour Menu').setStyle(ButtonStyle.Danger).setEmoji('↩️')
  );

  container.components.push(actions.toJSON());

  return { content: "", embeds: [], components: [container], flags: 32768 };
}

module.exports = [
  // --- COMMANDE : PANELADMIN ---
  {
    name: 'paneladmin',
    description: 'Affiche le panel d\'administration central.',
    async execute(message) {
      const allowed = await hasCommandPermission(message.member, 'paneladmin');
      if (!allowed) {
        return message.reply("❌ Vous n'avez pas la permission d'afficher ce panel d'administration.");
      }

      const container = { type: 17, components: [] };
      container.components.push({ type: 10, content: "**🛠️ Espace Administration**" });
      container.components.push({ type: 14, spacing: 1, divider: true });
      container.components.push({ type: 10, content: "Bienvenue sur le panel d'administration central.\nCliquez sur le bouton ci-dessous pour configurer les permissions du bot de manière sécurisée." });
      container.components.push({ type: 14, spacing: 2 });
      
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('admin_panel_menu')
          .setPlaceholder('🔧 Sélectionnez un module à configurer...')
          .addOptions([
            {
              label: '--- Réinitialiser la sélection ---',
              description: 'Cliquez ici pour pouvoir re-sélectionner un module',
              value: 'none'
            },
            {
              label: 'Gérer les Permissions',
              emoji: '🛡️',
              value: 'admin_perms'
            },
            {
              label: 'Configuration Tickets',
              emoji: '🎫',
              value: 'admin_ticketconfig'
            },
            {
              label: 'Gérer les Notifications',
              emoji: '🔔',
              value: 'admin_notif'
            }
          ])
      );

      container.components.push(row.toJSON());

      await message.channel.send({ content: "", embeds: [], components: [container], flags: 32768 });
      await message.delete().catch(() => {});
    }
  },

  // --- COMMANDE : NUKE ---
  {
    name: 'nuke',
    description: 'Recrée le salon actuel à neuf (supprime tous les messages).',
    async execute(message) {
      const allowed = await hasCommandPermission(message.member, 'nuke');
      if (!allowed) {
        return message.reply("❌ Vous n'avez pas la permission d'utiliser cette commande.");
      }

      try {
        const newChannel = await message.channel.clone();
        await newChannel.setPosition(message.channel.position);
        await message.channel.delete();
        await newChannel.send("💥 **BOUUM !** Le salon a été nettoyé et recréé avec succès !");
      } catch (error) {
        console.error("Erreur lors de l'exécution de la commande nuke :", error);
        message.author.send("❌ Une erreur est survenue lors de la recréation du salon. Le bot n'a peut-être pas la permission de gérer les salons.").catch(() => {});
      }
    }
  },

  // --- COMMANDE : PERME ---
  {
    name: 'perme',
    description: 'Gérer les permissions du bot',
    async execute(message, args, client) {
      let perms = await getPermsFromDB();

      const msg = await message.channel.send(generateMainMenu(message.guild, perms));

      const collector = msg.createMessageComponentCollector({ 
        filter: i => i.user.id === message.author.id, 
        time: 300000 
      });

      let currentLevel = null;

      collector.on('collect', async i => {
        perms = await getPermsFromDB();

        try {
          if (i.customId === 'perm_select_level') {
            currentLevel = i.values[0];
          } 
          else if (i.customId === 'perm_back_main') {
            currentLevel = null;
            await i.update(generateMainMenu(message.guild, perms));
            return;
          }

          if (currentLevel) {
            const p = perms[currentLevel] || { description: '', roleid: null, commands: [] };
            
            if (i.customId === 'perm_select_role_input') {
              p.roleid = i.values[0];
              await savePermToDB(currentLevel, p);
              perms = await getPermsFromDB();
            }

            if (i.customId === 'perm_select_cmds_input') {
              p.commands = i.values;
              await savePermToDB(currentLevel, p);
              perms = await getPermsFromDB();
            }

            if (i.customId === 'perm_edit_desc') {
              const modal = new ModalBuilder()
                .setCustomId('perm_modal_desc')
                .setTitle(`Description : ${currentLevel}`);
              
              const input = new TextInputBuilder()
                .setCustomId('desc_input')
                .setLabel('Nouvelle description')
                .setStyle(TextInputStyle.Short)
                .setValue(p.description || '');
              
              modal.addComponents(new ActionRowBuilder().addComponents(input));
              await i.showModal(modal);
              
              const submitted = await i.awaitModalSubmit({ time: 60000, filter: s => s.user.id === i.user.id }).catch(() => null);
              if (submitted) {
                p.description = submitted.fields.getTextInputValue('desc_input');
                await savePermToDB(currentLevel, p);
                perms = await getPermsFromDB();
                
                await submitted.update(generateDetailView(message.guild, currentLevel, p));
                return; 
              }
              return;
            }

            if (i.customId === 'perm_edit_role') {
              const roleRow = new ActionRowBuilder().addComponents(
                new RoleSelectMenuBuilder()
                  .setCustomId('perm_select_role_input')
                  .setPlaceholder('Sélectionner le rôle pour ce niveau')
              );
              const backRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('perm_cancel_edit').setLabel('Annuler').setStyle(ButtonStyle.Secondary)
              );
              
              const container = { type: 17, components: [] };
              container.components.push({ type: 10, content: `**Modification du rôle pour ${currentLevel}**` });
              container.components.push({ type: 14, spacing: 2, divider: true });
              container.components.push(roleRow.toJSON());
              container.components.push(backRow.toJSON());
              
              await i.update({ content: "", embeds: [], components: [container], flags: 32768 });
              return;
            }

            if (i.customId === 'perm_edit_cmds') {
              const allCmds = ['*', 'facture', 'panelemp', 'perme', 'ping', 'help', 'ctr', 'nuke', 'paneladmin', 'ticket', 'ticketconfig'];
              
              const options = allCmds.slice(0, 25).map(c => ({
                label: c.substring(0, 100),
                value: c.substring(0, 100),
                default: p.commands.includes(c)
              }));

              const cmdRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId('perm_select_cmds_input')
                  .setPlaceholder('Sélectionner les commandes autorisées')
                  .setMinValues(0)
                  .setMaxValues(options.length)
                  .addOptions(options)
              );
              const backRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('perm_cancel_edit').setLabel('Annuler').setStyle(ButtonStyle.Secondary)
              );
              
              const container = { type: 17, components: [] };
              container.components.push({ type: 10, content: `**Modification des commandes pour ${currentLevel}**` });
              container.components.push({ type: 14, spacing: 2, divider: true });
              container.components.push(cmdRow.toJSON());
              container.components.push(backRow.toJSON());
              
              await i.update({ content: "", embeds: [], components: [container], flags: 32768 });
              return;
            }

            if (!i.replied && !i.deferred) {
              await i.update(generateDetailView(message.guild, currentLevel, p));
            }
          }
        } catch (error) {
          console.error("Erreur interaction perm:", error);
          if (!i.replied) await i.reply({ content: "❌ Une erreur est survenue.", ephemeral: true });
        }
      });

      collector.on('end', () => {
        msg.edit({ components: [] }).catch(() => {});
      });
    },

    async executeButton(interaction, client) {
      const fakeMessage = {
        author: interaction.user,
        member: interaction.member,
        guild: interaction.guild,
        channel: {
          send: async (payload) => {
            const finalPayload = { ...payload };
            finalPayload.flags = finalPayload.flags ? (finalPayload.flags | MessageFlags.Ephemeral) : MessageFlags.Ephemeral;
            await interaction.reply(finalPayload);
            const replyMsg = await interaction.fetchReply();
            replyMsg.edit = async (editPayload) => interaction.editReply(editPayload);
            return replyMsg;
          }
        }
      };

      return this.execute(fakeMessage, [], client);
    }
  }
];
