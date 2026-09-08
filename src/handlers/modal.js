const tickets = require('../commands/tickets');
const notifications = require('../commands/notifications');
const rc = require('../commands/rc');

async function handleModal(interaction, client) {
    const customId = interaction.customId;

    if (customId.startsWith('modal_config_')) {
        await tickets.handleConfigModals(interaction);
    } else if (customId.startsWith('userinfo_modal_')) {
        await tickets.handleUserInfoInteraction(interaction);
    } else if (customId === 'modal_ticket_rename') {
        await tickets.handleTicketRenameModal(interaction);
    } else if (customId.startsWith('notif_')) {
        await notifications.handleNotifInteraction(interaction);
    } else if (customId.startsWith('rc_')) {
        await rc.handleRcInteraction(interaction);
    } else {
        console.log(`[DEBUG] Modal non géré soumis : ${customId}`);
    }
}

module.exports = { handleModal };
