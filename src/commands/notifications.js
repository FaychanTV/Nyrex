const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const { getCustomNotifs, saveCustomNotifs } = require('../data/customNotifs.db');
const { sendNotif } = require('../utils/notifier');

function generateNotifPanel() {
    const notifs = getCustomNotifs();
    const container = { type: 17, components: [] };

    container.components.push({ type: 10, content: "**🔔 Panel de Test & Gestion des Notifications**" });
    container.components.push({ type: 14, spacing: 1, divider: true });
    container.components.push({ type: 10, content: "Simulez les alertes système ou créez/gérez vos notifications personnalisées via ntfy.sh." });
    container.components.push({ type: 14, spacing: 2 });

    container.components.push({ type: 10, content: "**🛠️ Tests Système**" });
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('notif_sim_startup').setLabel('Démarrage').setStyle(ButtonStyle.Primary).setEmoji('🚀'),
        new ButtonBuilder().setCustomId('notif_sim_heartbeat').setLabel('Heartbeat').setStyle(ButtonStyle.Secondary).setEmoji('💓'),
        new ButtonBuilder().setCustomId('notif_sim_db').setLabel('Erreur DB').setStyle(ButtonStyle.Danger).setEmoji('🚨'),
        new ButtonBuilder().setCustomId('notif_sim_crash').setLabel('Crash').setStyle(ButtonStyle.Danger).setEmoji('💀')
    );
    container.components.push(row1.toJSON());
    container.components.push({ type: 14, spacing: 2 });

    container.components.push({ type: 10, content: "**✏️ Notifications Personnalisées**" });
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('notif_create_btn').setLabel('➕ Ajouter').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('notif_delete_btn').setLabel('➖ Supprimer').setStyle(ButtonStyle.Danger)
    );
    container.components.push(row2.toJSON());

    const customKeys = Object.keys(notifs);
    if (customKeys.length > 0) {
        const options = customKeys.slice(0, 25).map(k => ({
            label: notifs[k].title.substring(0, 100),
            description: `Prio: ${notifs[k].priority} | Tags: ${notifs[k].tags || 'Aucun'}`,
            value: k
        }));
        const row3 = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('notif_select_send')
                .setPlaceholder('📢 Choisir une notification personnalisée à envoyer...')
                .addOptions(options)
        );
        container.components.push({ type: 14, spacing: 1 });
        container.components.push(row3.toJSON());
    }

    return { content: "", embeds: [], components: [container], flags: 32768 | MessageFlags.Ephemeral };
}

function generateDeletePanel() {
    const notifs = getCustomNotifs();
    const customKeys = Object.keys(notifs);
    const container = { type: 17, components: [] };
    
    container.components.push({ type: 10, content: "**🗑️ Supprimer une notification**\nSélectionnez la notification à retirer :" });
    container.components.push({ type: 14, spacing: 1, divider: true });

    if (customKeys.length === 0) {
        container.components.push({ type: 10, content: "*Aucune notification personnalisée trouvée.*" });
    } else {
        const options = customKeys.slice(0, 25).map(k => ({ label: notifs[k].title.substring(0, 100), value: k }));
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('notif_select_delete').setPlaceholder('Choisir la notification à supprimer...').addOptions(options));
        container.components.push(row.toJSON());
    }

    const backRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('notif_back_main').setLabel('🔙 Retour').setStyle(ButtonStyle.Secondary));
    container.components.push({ type: 14, spacing: 1 });
    container.components.push(backRow.toJSON());

    return { content: "", embeds: [], components: [container], flags: 32768 | MessageFlags.Ephemeral };
}

async function handleNotifInteraction(interaction) {
    if (interaction.isButton()) {
        switch (interaction.customId) {
            case 'notif_sim_startup': 
                await sendNotif('Nyrex V2 - Système', `🚀 Démarrage réussi. Node.js ${process.version} en ligne.`, 3, 'rocket,white_check_mark'); 
                return interaction.reply({ content: '✅ Test "Démarrage" envoyé !', flags: MessageFlags.Ephemeral });
            case 'notif_sim_heartbeat': 
                await sendNotif('Nyrex V2 - Heartbeat', `💓 Statut : Opérationnel | RAM: 128.00MB | DB: OK (Simulation)`, 2, 'green_heart,computer'); 
                return interaction.reply({ content: '✅ Test "Heartbeat" envoyé !', flags: MessageFlags.Ephemeral });
            case 'notif_sim_db': 
                await sendNotif('🚨 ALERTE MARIA DB', `Impossible de joindre la base de données sur le port 3306. Tentative de reconnexion...\nErreur: Simulation`, 4, 'floppy_disk,warning,red_circle'); 
                return interaction.reply({ content: '✅ Test "Erreur DB" envoyé !', flags: MessageFlags.Ephemeral });
            case 'notif_sim_crash': 
                await sendNotif('💀 CRASH DU BOT', `Erreur fatale : Test de crash simulé via le panel`, 5, 'skull,fire,x'); 
                return interaction.reply({ content: '✅ Test "Crash" envoyé !', flags: MessageFlags.Ephemeral });
            case 'notif_create_btn':
                const modal = new ModalBuilder().setCustomId('notif_modal_create').setTitle('Nouvelle Notification');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n_id').setLabel('ID Unique (ex: rappel)').setStyle(TextInputStyle.Short).setRequired(true)), 
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n_title').setLabel('Titre').setStyle(TextInputStyle.Short).setRequired(true)), 
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n_message').setLabel('Message').setStyle(TextInputStyle.Paragraph).setRequired(true)), 
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n_priority').setLabel('Priorité (1 = Min, 5 = Max)').setStyle(TextInputStyle.Short).setRequired(true).setValue('3')), 
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n_tags').setLabel('Tags (séparés par virgule)').setStyle(TextInputStyle.Short).setRequired(false))
                );
                return interaction.showModal(modal);
            case 'notif_delete_btn': 
                return interaction.update(generateDeletePanel());
            case 'notif_back_main': 
                return interaction.update(generateNotifPanel());
        }
    } else if (interaction.isModalSubmit() && interaction.customId === 'notif_modal_create') {
        const id = interaction.fields.getTextInputValue('n_id').replace(/[^a-zA-Z0-9_-]/g, '');
        const notifs = getCustomNotifs();
        notifs[id] = { 
            title: interaction.fields.getTextInputValue('n_title'), 
            message: interaction.fields.getTextInputValue('n_message'), 
            priority: parseInt(interaction.fields.getTextInputValue('n_priority')) || 3, 
            tags: interaction.fields.getTextInputValue('n_tags') || '' 
        };
        saveCustomNotifs(notifs);
        await interaction.update(generateNotifPanel());
    } else if (interaction.isStringSelectMenu() && interaction.customId === 'notif_select_send') {
        const id = interaction.values[0];
        const notifs = getCustomNotifs();
        if (notifs[id]) { 
            await sendNotif(notifs[id].title, notifs[id].message, notifs[id].priority, notifs[id].tags); 
            await interaction.reply({ content: `✅ Notification **${notifs[id].title}** envoyée !`, flags: MessageFlags.Ephemeral }); 
        }
    } else if (interaction.isStringSelectMenu() && interaction.customId === 'notif_select_delete') {
        const id = interaction.values[0];
        const notifs = getCustomNotifs();
        if (notifs[id]) { 
            delete notifs[id]; 
            saveCustomNotifs(notifs); 
        }
        await interaction.update(generateNotifPanel());
    }
}

module.exports = {
    generateNotifPanel,
    handleNotifInteraction
};
