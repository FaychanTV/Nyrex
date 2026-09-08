// ═══════════════════════════════════════════════════════════════
//  SLASH COMMANDS — Source unique de toutes les commandes slash
//  Ajouter une nouvelle slash command ici ET UNIQUEMENT ICI.
// ═══════════════════════════════════════════════════════════════

const { addCommand, removeCommand } = require('../commands/tickets/addRemove');
const generalCmds = require('../commands/general');

const pingCmd = generalCmds.find(cmd => cmd.name === 'ping');
const linkCmd = generalCmds.find(cmd => cmd.name === 'linksalon');

// ─── Map d'exécution ────────────────────────────────────────────
const commandMap = {
    ping:      (interaction, client) => pingCmd.executeSlash(interaction, client),
    linksalon: (interaction, client) => linkCmd.executeSlash(interaction, client),
    link:      (interaction, client) => linkCmd.executeSlash(interaction, client),
    add:       (interaction)         => addCommand.executeSlash(interaction),
    remove:    (interaction)         => removeCommand.executeSlash(interaction),
};

// ─── Définitions pour le déploiement Discord (utilisé par ready.js) ─
const slashCommandDefinitions = [
    {
        name:        pingCmd.name,
        description: pingCmd.description.substring(0, 100),
        options:     pingCmd.options || []
    },
    {
        name:        'linksalon',
        description: 'Lie un salon Discord à un employé et lui donne accès au salon.',
        options:     linkCmd.options || []
    },
    {
        name:        'link',
        description: 'Lie un salon Discord à un employé et lui donne accès au salon.',
        options:     linkCmd.options || []
    },
    {
        name:        addCommand.name,
        description: addCommand.description.substring(0, 100),
        options:     addCommand.options || []
    },
    {
        name:        removeCommand.name,
        description: removeCommand.description.substring(0, 100),
        options:     removeCommand.options || []
    },
];

// ─── Handler central ────────────────────────────────────────────
async function handleSlashCommand(interaction, client) {
    const handler = commandMap[interaction.commandName];
    if (!handler) return;

    try {
        await handler(interaction, client);
    } catch (error) {
        console.error(`❌ Erreur lors de l'exécution de la slash command ${interaction.commandName}:`, error);
    }
}

module.exports = { handleSlashCommand, slashCommandDefinitions };
