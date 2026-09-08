const { Events } = require('discord.js');
const { recordEditedMessage } = require('../utils/ticketHistory');

/**
 * Écouteur messageUpdate : enregistre silencieusement les modifications de messages pour le transcript texte.
 * N'envoie AUCUN embed ni message dans le salon Discord.
 * @param {import('discord.js').Client} client 
 */
function registerMessageUpdateEvent(client) {
    client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
        try {
            if (oldMessage.partial) {
                try { oldMessage = await oldMessage.fetch(); } catch (e) {}
            }
            if (newMessage.partial) {
                try { newMessage = await newMessage.fetch(); } catch (e) { return; }
            }

            if (!newMessage.guild || newMessage.author?.bot) return;

            // Enregistrer silencieusement la modification (a, b, c, d...)
            recordEditedMessage(oldMessage, newMessage);
        } catch (err) {
            // Ignorer silencieusement
        }
    });
}

module.exports = { registerMessageUpdateEvent };
