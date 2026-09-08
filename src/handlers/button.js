const tickets = require('../commands/tickets');
const notifications = require('../commands/notifications');
const rc = require('../commands/rc');

async function handleButton(interaction, client) {
    const customId = interaction.customId;

    if (customId === 'profil_facture') {
        const cmd = client.commands.get('facture');
        if (cmd && cmd.executeButton) {
            await cmd.executeButton(interaction);
        }
    } else if (customId === 'admin_perms') {
        const cmd = client.commands.get('perme');
        if (cmd && cmd.executeButton) {
            await cmd.executeButton(interaction, client);
        }
    } else if (customId.startsWith('config_') || customId.startsWith('btn_')) {
        await tickets.handleConfigButtons(interaction);
    } else if (customId.startsWith('create_ticket_') || customId.startsWith('cgu_') || customId.startsWith('cgu_accept_')) {
        console.log(`[DEBUG] Bouton ticket détecté dans button.js: ${customId}`);
        await tickets.handleTicketCreation(interaction);
    } else if (customId === 'ticket_close') {
        await tickets.handleTicketClose(interaction);
    } else if (customId === 'ticket_claim') {
        await tickets.handleTicketClaim(interaction);
    } else if (customId === 'ticket_rename') {
        await tickets.handleTicketRenameBtn(interaction);
    } else if (customId.startsWith('userinfo_btn_')) {
        await tickets.handleUserInfoInteraction(interaction);
    } else if (customId.startsWith('notif_')) {
        await notifications.handleNotifInteraction(interaction);
    } else if (customId.startsWith('rc_')) {
        await rc.handleRcInteraction(interaction);
    } else {
        console.log(`[DEBUG] Bouton non géré cliqué : ${customId}`);
    }
}

module.exports = { handleButton };
