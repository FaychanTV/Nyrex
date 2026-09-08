const tickets = require('../commands/tickets');
const notifications = require('../commands/notifications');
const rc = require('../commands/rc');

async function handleSelectMenu(interaction, client) {
    const customId = interaction.customId;

    if (customId === 'admin_panel_menu') {
        if (interaction.values[0] === 'none') {
            return interaction.deferUpdate().catch(() => {});
        } else if (interaction.values[0] === 'admin_perms') {
            const cmd = client.commands.get('perme');
            if (cmd && cmd.executeButton) await cmd.executeButton(interaction, client);
        } else if (interaction.values[0] === 'admin_ticketconfig') {
            const cmd = client.commands.get('ticketconfig');
            if (cmd && cmd.executeButton) await cmd.executeButton(interaction);
        } else if (interaction.values[0] === 'admin_notif') {
            await interaction.reply(notifications.generateNotifPanel());
        }
    } else if (customId.startsWith('menu_')) {
        await tickets.handleConfigMenu(interaction);
    } else if (customId.startsWith('select_')) {
        await tickets.handleConfigRoleSelect(interaction);
    } else if (customId.startsWith('notif_')) {
        await notifications.handleNotifInteraction(interaction);
    } else if (customId.startsWith('rc_')) {
        await rc.handleRcInteraction(interaction);
    } else {
        console.log(`[DEBUG] Menu déroulant non géré sélectionné : ${customId}`);
    }
}

module.exports = { handleSelectMenu };
