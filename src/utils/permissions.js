const db = require('../data/db');
const { PermissionsBitField } = require('discord.js');

/**
 * Vérifie si un membre a la permission d'exécuter une commande.
 * L'administrateur Discord a toujours toutes les permissions.
 * Sinon, vérifie dans la base de données si l'un de ses rôles l'autorise.
 * 
 * @param {GuildMember} member - Le membre Discord
 * @param {string} commandName - Le nom de la commande (ex: 'nuke', 'panelemp')
 * @returns {Promise<boolean>} true si autorisé, false sinon
 */
async function hasCommandPermission(member, commandName) {
    if (!member) return false;
    
    // Un administrateur Discord a tous les droits par défaut
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return true;
    }
    
    try {
        const [permRows] = await db.query('SELECT roleid, commands FROM permissions');
        for (const p of permRows) {
            if (p.roleid && member.roles.cache.has(p.roleid)) {
                let cmds = [];
                try {
                    cmds = JSON.parse(p.commands);
                } catch (e) {
                    // Ignorer les erreurs de parsing JSON
                }
                
                if (cmds.includes('*') || cmds.includes(commandName)) {
                    return true;
                }
            }
        }
    } catch (e) {
        console.error(`[PERMISSIONS] Erreur lors de la vérification des permissions pour la commande "${commandName}" :`, e);
    }
    
    return false;
}

module.exports = {
    hasCommandPermission
};
