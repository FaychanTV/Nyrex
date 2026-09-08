const { Events } = require('discord.js');
const db = require('../data/db');
const { getIsLeader } = require('../shared');

function registerGuildMemberUpdateEvent(client) {
    client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
        // Seul le leader traite cet événement
        if (!getIsLeader()) return;

        try {
            const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
            if (addedRoles.size === 0) return;

            for (const [roleId, role] of addedRoles) {
                const [rows] = await db.query('SELECT max_members FROM role_limits WHERE role_id = ?', [roleId]);
                if (rows.length > 0) {
                    const limit = rows[0].max_members;

                    const membersWithRole = newMember.guild.roles.cache.get(roleId)?.members;
                    const currentCount = membersWithRole ? membersWithRole.size : 0;

                    if (currentCount > limit) {
                        await newMember.roles.remove(roleId, `Limite de membres dépassée pour ce rôle (${limit} max)`);
                        console.log(`[ROLE LIMIT] Rôle "${role.name}" (${roleId}) retiré à ${newMember.user.tag} (Limite: ${limit}, Actuel: ${currentCount}).`);
                    }
                }
            }
        } catch (error) {
            console.error('[ROLE LIMIT] Erreur lors de la vérification de la limite de rôle :', error);
        }
    });
}

module.exports = { registerGuildMemberUpdateEvent };
