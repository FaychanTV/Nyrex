const { Events } = require('discord.js');
const { getIsLeader } = require('../shared');
const { handleSlashCommand } = require('../handlers/slashCommand');
const { handleButton } = require('../handlers/button');
const { handleSelectMenu } = require('../handlers/selectMenu');
const { handleModal } = require('../handlers/modal');

function registerInteractionCreateEvent(client) {
    client.on(Events.InteractionCreate, async interaction => {
        // Seul le leader traite les interactions (évite les actions en double)
        if (!getIsLeader()) return;

        if (interaction.isChatInputCommand()) {
            await handleSlashCommand(interaction, client);
        } else if (interaction.isButton()) {
            await handleButton(interaction, client);
        } else if (interaction.isStringSelectMenu() || interaction.isRoleSelectMenu()) {
            await handleSelectMenu(interaction, client);
        } else if (interaction.isModalSubmit()) {
            await handleModal(interaction, client);
        }
    });
}

module.exports = { registerInteractionCreateEvent };
