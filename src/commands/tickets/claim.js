const { PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const { getConfig } = require('../../config');
const { getNextClaimNumber } = require('./counters');
const { claimMirrorChannel } = require('./mirror');
const ticketStore = require('../../data/tickets.db');

const claimingInProgress = new Set();

async function claimTicket(interaction) {
    const channelId = interaction.channelId;

    if (claimingInProgress.has(channelId)) {
        return interaction.reply({ content: '⏳ Une prise en charge est déjà en cours de traitement. Veuillez patienter.', flags: MessageFlags.Ephemeral });
    }
    claimingInProgress.add(channelId);

    try {
        const config = getConfig();
        let ticketData = null;
        try { ticketData = await ticketStore.getTicket(channelId); } catch (e) { console.error("Erreur lecture tickets DB (claim):", e); }

        // Récupération si pas en DB
        if (!ticketData) {
            let ownerId = null;
            const embed = interaction.message?.embeds?.[0];
            if (embed) {
                const creatorField = embed.fields.find(f => f.name === '👤 Créateur');
                if (creatorField) {
                    const mention = creatorField.value;
                    const userIdMatch = mention.match(/<@!?(\d+)>/);
                    if (userIdMatch) ownerId = userIdMatch[1];
                }
            } else {
                try {
                    const rawMessage = await interaction.client.rest.get(`/channels/${interaction.channelId}/messages/${interaction.message?.id}`);
                    if (rawMessage.components && rawMessage.components[0]?.type === 17) {
                        const container = rawMessage.components[0];
                        for (const comp of container.components) {
                            if (comp.type === 10 && comp.content && comp.content.includes('👤 **Créateur:**')) {
                                const userIdMatch = comp.content.match(/👤 \*\*Créateur:\*\* <@!?(\d+)>/);
                                if (userIdMatch) ownerId = userIdMatch[1];
                                break;
                            }
                        }
                    }
                } catch (e) {}
            }

            if (ownerId) {
                const ticketCategoryIds = (config && config.ticketCategories) ? Object.values(config.ticketCategories).map(cat => cat.id).filter(id => id) : [];
                if (interaction.channel && ticketCategoryIds.includes(interaction.channel.parentId)) {
                    for (const [type, cat] of Object.entries(config.ticketCategories || {})) {
                        if (cat.id === interaction.channel.parentId) {
                            try {
                                await ticketStore.saveTicket({ channelId, ownerId, category: type, createdAt: Date.now() });
                                ticketData = await ticketStore.getTicket(channelId);
                                console.log(`[RECOVERY] Ticket ${channelId} récupéré en DB avec ownerId ${ownerId}, category ${type}`);
                            } catch (e) { console.error("Erreur sauvegarde tickets DB (recovery)", e); }
                            break;
                        }
                    }
                }
            }
        }

        if (!ticketData) {
            return interaction.reply({ content: '❌ Ticket introuvable dans la base de données.', flags: MessageFlags.Ephemeral });
        }

        if (ticketData.claimed_by) {
            const claimer = await interaction.guild.members.fetch(ticketData.claimed_by).catch(() => null);
            const claimerName = claimer ? claimer.displayName : 'un membre du staff';
            return interaction.reply({ content: `⚠️ Ce ticket est déjà pris en charge par ${claimerName}.`, flags: MessageFlags.Ephemeral });
        }

        const categoryConfig = (config && config.ticketCategories) ? config.ticketCategories[ticketData.category] : null;
        let configuredClaimRoles = categoryConfig?.claimRole || (config && config.ticketSettings ? config.ticketSettings.claimRole : []) || [];
        if (!Array.isArray(configuredClaimRoles)) configuredClaimRoles = [configuredClaimRoles];
        
        let viewRolesForClaim = categoryConfig?.viewRole || (config && config.ticketSettings ? config.ticketSettings.viewRole : []) || [];
        if (!Array.isArray(viewRolesForClaim)) viewRolesForClaim = [viewRolesForClaim];

        let canClaimRoles = [...configuredClaimRoles, ...viewRolesForClaim, '1456798564230631567'].filter(r => r && typeof r === 'string' && r.trim() !== '');

        const member = interaction.member;
        const hasClaimRole = canClaimRoles.length > 0 && canClaimRoles.some(roleId => member.roles.cache.has(roleId));
        const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);

        if (!isAdmin && !hasClaimRole) {
            return interaction.reply({ content: "❌ Vous n'avez pas la permission de prendre ce ticket en charge.", flags: MessageFlags.Ephemeral });
        }

        const claimerId = interaction.user.id;
        const firstName = interaction.member.displayName.split(' ')[0];

        try { await interaction.deferUpdate(); } 
        catch (e) {
            if (e.code !== 10062 && e.code !== 40060) console.error("Erreur deferUpdate claim:", e);
            if (e.code === 40060) return;
        }

        try { await ticketStore.updateTicket(channelId, { claimedBy: claimerId, claimedAt: Date.now() }); } 
        catch (e) { console.error("Erreur sauvegarde claim DB:", e); }

        const claimNumber = await getNextClaimNumber(claimerId);
        const activeTickets = await ticketStore.getActiveTicketsByClaimer(claimerId);
        const activeTicketsCount = activeTickets.length;

        try { await interaction.channel?.permissionOverwrites?.edit(claimerId, { ViewChannel: true }); } 
        catch (e) {
            const content = `🔴 **Impossible de vous donner l'accès au salon.**\n\n**Cause la plus probable :** La hiérarchie des rôles.\n> Le rôle du bot doit être placé **au-dessus** de votre rôle le plus élevé.\n\n**Erreur brute :** \`${e.message}\``;
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content, flags: MessageFlags.Ephemeral });
            }
            try { await ticketStore.updateTicket(channelId, { claimedBy: null, claimedAt: null }); } catch(eDb) { console.error("Erreur sauvegarde tickets DB (revert claim)", eDb); }
            return;
        }

        // Mise à jour du message
        try {
            const rawMessage = await interaction.client.rest.get(`/channels/${interaction.channelId}/messages/${interaction.message?.id}`);
            if (rawMessage.components && rawMessage.components.length > 0 && rawMessage.components[0].type === 17) {
                const container = rawMessage.components[0];
                container.components.forEach(comp => {
                    if (comp.type === 1) {
                        comp.components.forEach(btn => {
                            if (btn.custom_id === 'ticket_claim') {
                                btn.disabled = true;
                                btn.label = 'Pris en charge';
                                btn.style = 2;
                            }
                        });
                    }
                });
                const rows = container.components.filter(c => c.type === 1);
                const nonRows = container.components.filter(c => c.type !== 1);
                nonRows.push({ type: 14, spacing: 1, divider: true });
                nonRows.push({ type: 10, content: `📌 **Pris en charge par :** ${firstName} (*${activeTicketsCount} en cours | ${claimNumber} au total*)` });
                nonRows.push({ type: 14, spacing: 2 });
                container.components = [...nonRows, ...rows];
                await interaction.editReply({ components: [container], flags: 32768 });
            } else {
                const originalEmbed = interaction.message?.embeds?.[0];
                if (originalEmbed) {
                    const newEmbed = new EmbedBuilder(originalEmbed.toJSON())
                        .addFields({ name: '📌 Pris en charge par', value: `**${firstName}** (*${activeTicketsCount} en cours | ${claimNumber} au total*)`, inline: false });
                    const newComponents = interaction.message.components.map(row => {
                        const newRow = new ActionRowBuilder();
                        row.components.forEach(component => {
                            const newComponent = ButtonBuilder.from(component);
                            if (component.customId === 'ticket_claim') {
                                newComponent.setDisabled(true).setLabel('Pris en charge').setStyle(ButtonStyle.Secondary);
                            }
                            newRow.addComponents(newComponent);
                        });
                        return newRow;
                    });
                    await interaction.editReply({ embeds: [newEmbed], components: newComponents });
                }
            }
        } catch (restErr) {
            console.error("Erreur lors de la mise à jour du message de claim :", restErr);
        }

        let confirmationMessage = `📌 Le ticket a été pris en charge par **${firstName}** (*${activeTicketsCount} ticket(s) en cours | ${claimNumber} au total*).`;

        let newChannelName = `${firstName}-${claimNumber}`;
        newChannelName = newChannelName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').substring(0, 100);
        if (newChannelName.length < 2) newChannelName = `claim-${claimNumber}`;

        try { await interaction.channel?.setName(newChannelName); } 
        catch (e) { console.error(`[Claim] Impossible de renommer le salon :`, e); }

        if (categoryConfig?.privateOnClaim) {
            const rolesToRemove = categoryConfig.removeRoleOnClaim || [];
            if (rolesToRemove.length > 0 && interaction.channel) {
                const permissionPromises = rolesToRemove.map(roleId => interaction.channel.permissionOverwrites.delete(roleId).catch(() => null));
                await Promise.all(permissionPromises);
                const removedRolesString = rolesToRemove.map(r => `<@&${r}>`).join(', ');
                confirmationMessage += `\n🔒 Les rôles suivants n'ont plus accès : ${removedRolesString}.`;
            } else {
                confirmationMessage += `\n⚠️ Le ticket est configuré pour devenir privé, mais aucun rôle à retirer n'a été défini.`;
            }
        }
        
        await interaction.channel?.send(confirmationMessage);
        await claimMirrorChannel(interaction.client, channelId, newChannelName);

    } finally {
        claimingInProgress.delete(channelId);
    }
}

module.exports = { claimTicket };
