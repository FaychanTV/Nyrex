const { AttachmentBuilder } = require('discord.js');
const db = require('../data/db');
const fs = require('fs');
const path = require('path');
const { getConfig } = require('../config');

// Stockage en mémoire : Map<messageId, Array<{ label: string, content: string, timestamp: number }>>
const messageEditsMap = new Map();

/**
 * Enregistre le message initial lors de son envoi dans un ticket.
 * @param {import('discord.js').Message} message 
 */
function recordCreatedMessage(message) {
    if (!message || !message.id || !message.channelId) return;
    if (message.author?.bot) return;

    const content = message.content || (message.attachments.size > 0 ? '[Fichier sans texte]' : '');
    if (!content) return;

    if (!messageEditsMap.has(message.id)) {
        messageEditsMap.set(message.id, [{
            label: 'a',
            content: content,
            timestamp: message.createdTimestamp || Date.now()
        }]);
    }

    // Sauvegarde asynchrone dans la table ticket_messages
    try {
        const authorAvatar = message.author?.avatar || '';
        const attachmentsStr = message.attachments?.size > 0 
            ? JSON.stringify(Array.from(message.attachments.values()).map(att => att.url))
            : '[]';

        db.query(
            'INSERT INTO ticket_messages (channel_id, author_id, author_name, author_avatar, content, attachments, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                message.channel.id,
                message.author.id,
                message.member?.displayName || message.author.username,
                authorAvatar,
                content,
                attachmentsStr,
                message.createdTimestamp || Date.now()
            ]
        ).catch(() => {});
    } catch (e) {}

    // Nettoyage régulier si la Map grandit trop
    if (messageEditsMap.size > 10000) {
        const firstKey = messageEditsMap.keys().next().value;
        messageEditsMap.delete(firstKey);
    }
}

/**
 * Enregistre silencieusement chaque modification d'un message (a, b, c, d...).
 * N'envoie AUCUN message dans le salon Discord pour ne pas polluer le chat.
 * @param {import('discord.js').Message} oldMessage 
 * @param {import('discord.js').Message} newMessage 
 */
function recordEditedMessage(oldMessage, newMessage) {
    if (!newMessage || !newMessage.id || !newMessage.channelId) return;
    if (newMessage.author?.bot) return;

    const newContent = newMessage.content || '';
    if (!newContent) return;

    let history = messageEditsMap.get(newMessage.id);
    if (!history) {
        history = [];
        const oldContent = oldMessage?.content;
        if (oldContent && oldContent.trim().length > 0) {
            history.push({
                label: 'a',
                content: oldContent,
                timestamp: oldMessage.createdTimestamp || (Date.now() - 5000)
            });
        } else {
            history.push({
                label: 'a',
                content: '[Message initial]',
                timestamp: newMessage.createdTimestamp || (Date.now() - 5000)
            });
        }
    }

    // Vérifier si le contenu a réellement changé par rapport à la dernière version
    const lastVersion = history[history.length - 1];
    if (lastVersion && lastVersion.content === newContent) return;

    // Calcul de la lettre suivante : 0 -> a, 1 -> b, 2 -> c, 3 -> d...
    const nextIndex = history.length;
    const nextLetter = String.fromCharCode(97 + (nextIndex % 26)); // 'a', 'b', 'c', 'd', 'e'...

    history.push({
        label: nextLetter,
        content: newContent,
        timestamp: Date.now()
    });

    messageEditsMap.set(newMessage.id, history);
}

/**
 * Formate un timestamp Unix en date française lisible.
 * @param {number|Date} ts 
 * @returns {string}
 */
function formatTimestamp(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Génère le transcript complet en fichier texte brut (.txt) avec l'historique complet des modifications.
 * @param {import('discord.js').TextChannel} channel 
 * @param {object} ticketData 
 * @param {string} closedByName 
 * @returns {Promise<{ attachment: AttachmentBuilder, localPath: string, textContent: string }>}
 */
async function generateTextTranscript(channel, ticketData, closedByName, mirrorChannelId = null) {
    // 1. Récupération de tous les messages du salon dans l'ordre chronologique
    let allMessages = [];
    let lastId = null;

    while (true) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;
        const fetched = await channel.messages.fetch(options).catch(() => null);
        if (!fetched || fetched.size === 0) break;
        allMessages.push(...fetched.values());
        lastId = fetched.last()?.id;
        if (fetched.size < 100) break;
    }

    allMessages.reverse(); // Ordre chronologique (du plus ancien au plus récent)

    const mirrorIdStr = mirrorChannelId || ticketData?.mirror_channel_id || ticketData?.mirrorChannelId || 'Aucun';

    // 2. Construction de l'en-tête du fichier texte
    const sep = '='.repeat(80);
    const lines = [
        sep,
        `TRANSCRIPT DE TICKET — NYREX CREATIVE`,
        sep,
        `Nom du salon         : #${channel.name}`,
        `ID du salon          : ${channel.id}`,
        `ID du clone (Miroir) : ${mirrorIdStr}`,
        `Catégorie            : ${ticketData?.category || 'Non spécifiée'}`,
        `Créateur du ticket   : ${ticketData?.owner_id ? `<@${ticketData.owner_id}> (${ticketData.owner_id})` : 'Inconnu'}`,
        `Fermé par            : ${closedByName}`,
        `Date d'archivage     : ${formatTimestamp(Date.now())}`,
        `Total de messages    : ${allMessages.length}`,
        sep,
        ''
    ];

    // 3. Traitement et mise en forme de chaque message
    for (const msg of allMessages) {
        const dateStr = formatTimestamp(msg.createdTimestamp);
        const authorTag = msg.author ? `${msg.author.tag || msg.author.username} (${msg.author.id})` : 'Auteur Inconnu';
        const isBot = msg.author?.bot ? ' [BOT]' : '';

        // Vérifier si le message possède un historique de modifications
        const history = messageEditsMap.get(msg.id);

        if (history && history.length > 1) {
            // Message ayant été modifié (a, b, c, d...)
            lines.push(`[${dateStr}] ${authorTag}${isBot} [MODIFIÉ ${history.length - 1}x] :`);
            
            history.forEach((version, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === history.length - 1;
                const vTime = formatTimestamp(version.timestamp);
                
                let desc = '';
                if (isFirst) desc = 'Message originel';
                else if (isLast) desc = `Dernière modification [Actuel]`;
                else desc = `Modification #${idx}`;

                lines.push(`  ${version.label}) ${desc} (${vTime}) : ${version.content}`);
            });
        } else {
            // Message normal non modifié
            const content = msg.content || '';
            if (content.trim().length > 0) {
                lines.push(`[${dateStr}] ${authorTag}${isBot} : ${content}`);
            }
        }

        // Fichiers joints / Images
        if (msg.attachments.size > 0) {
            const attUrls = Array.from(msg.attachments.values()).map(a => `${a.name} (${a.url})`).join(', ');
            lines.push(`  └─ Fichiers joints : ${attUrls}`);
        }

        // Embeds envoyés par le bot ou les webhooks
        if (msg.embeds.length > 0) {
            for (const emb of msg.embeds) {
                const embParts = [];
                if (emb.title) embParts.push(`Titre: ${emb.title}`);
                if (emb.description) embParts.push(`Description: ${emb.description.replace(/\n/g, ' ')}`);
                if (emb.fields && emb.fields.length > 0) {
                    const fieldsStr = emb.fields.map(f => `${f.name}: ${f.value.replace(/\n/g, ' ')}`).join(' | ');
                    embParts.push(`Champs: ${fieldsStr}`);
                }
                if (embParts.length > 0) {
                    lines.push(`  └─ [Embed] ${embParts.join(' | ')}`);
                }
            }
        }
    }

    lines.push('');
    lines.push(sep);
    lines.push(`FIN DU TRANSCRIPT`);
    lines.push(sep);

    const fullText = lines.join('\r\n');
    const fileName = `transcript-${channel.name}.txt`;

    // 4. Sauvegarde locale sur le disque du VPS (F:\ROOT\transcript\)
    const config = getConfig();
    const localRootDir = config.ticketSettings?.transcriptLocalPath || 'F:\\ROOT\\transcript';
    let savedPath = path.join(localRootDir, fileName);

    try {
        if (!fs.existsSync(localRootDir)) {
            fs.mkdirSync(localRootDir, { recursive: true });
        }
        fs.writeFileSync(savedPath, fullText, 'utf8');
        console.log(`[Transcript TXT] Sauvegardé en local avec succès : ${savedPath}`);
    } catch (fsErr) {
        console.error(`[Transcript TXT] Erreur sauvegarde locale sur ${localRootDir} :`, fsErr);
    }

    // 5. Création de l'attachement Discord au format .txt
    const attachment = new AttachmentBuilder(Buffer.from(fullText, 'utf8'), { name: fileName });

    return {
        attachment,
        localPath: savedPath,
        textContent: fullText
    };
}

module.exports = {
    recordCreatedMessage,
    recordEditedMessage,
    generateTextTranscript
};
