require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const db = require('./src/data/db');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessages] });

const CHANNEL_ID = '1456748564817510560';

async function parseEmbedAndSave(embed, timestamp) {
    if (!embed.description) return false;
    
    let discordId = null;
    let charName = null;
    let action = null;
    let grade = null;
    
    let inGameId = null;
    
    // Convertir la date du message en format MySQL DATETIME
    const msgDate = new Date(timestamp);
    const dateStr = msgDate.toISOString().slice(0, 19).replace('T', ' ');

    const fields = embed.fields || [];
    function getField(name) {
        const f = fields.find(f => f.name && f.name.toLowerCase() === name.toLowerCase());
        return f ? f.value : null;
    }

    const desc = embed.description.toLowerCase();

    if (desc.includes("a été renvoyé")) {
        action = 'fired';
        discordId = getField('targetPlayerDiscord');
        charName = getField('targetPlayerCharacter');
        inGameId = getField('targetPlayerId');
    } else if (desc.includes("a quitté")) {
        action = 'quit';
        // Sur le screen "John Scarlett a quitté", il n'y a pas de targetPlayerDiscord, c'est playerDiscord
        discordId = getField('playerDiscord');
        charName = getField('playerCharacter');
        inGameId = getField('playerId');
    } else if (desc.includes("recrutement de")) {
        action = 'hired';
        discordId = getField('targetPlayerDiscord');
        charName = getField('targetPlayerCharacter');
        inGameId = getField('targetPlayerId');
    } else if (desc.includes("modification du grade")) {
        action = 'promotion';
        discordId = getField('targetPlayerDiscord');
        charName = getField('targetPlayerCharacter');
        inGameId = getField('targetPlayerId');
        
        // Extraire le grade: "Modification du grade de Catalina Mendoza: Photographe Junior"
        const parts = embed.description.split(':');
        if (parts.length > 1) {
            grade = parts[1].trim();
        }
    }

    if (action && discordId && charName) {
        // Enregistrer en BDD
        const rawData = JSON.stringify(fields);
        await db.query(
            'INSERT INTO employment_history (discord_id, in_game_id, character_name, action, grade, raw_data, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [discordId, inGameId, charName, action, grade, rawData, dateStr]
        );
        return true;
    }
    return false;
}

client.once('ready', async () => {
    console.log(`Connecté en tant que ${client.user.tag}... Lancement de l'analyse des recrutements.`);
    
    try {
        const channel = await client.channels.fetch(CHANNEL_ID);
        if (!channel) {
            console.error("❌ Salon de recrutements introuvable.");
            process.exit(1);
        }

        // Initialize schema if not exist
        await require('./src/data/schema').initializeDatabase();

        // Nettoyer la table existante pour éviter les doublons en cas de relances multiples
        await db.query('DELETE FROM employment_history');
        // Réinitialiser l'auto_increment s'il a les droits (sinon, ce n'est pas grave)
        try { await db.query('ALTER TABLE employment_history AUTO_INCREMENT = 1'); } catch(e) {}

        let lastId = null;
        let count = 0;
        let fetched = 0;

        console.log("Lecture de l'historique du salon...");

        while (true) {
            const options = { limit: 100 };
            if (lastId) options.before = lastId;

            const messages = await channel.messages.fetch(options);
            if (messages.size === 0) break;

            for (const [id, msg] of messages) {
                if (msg.embeds && msg.embeds.length > 0) {
                    for (const embed of msg.embeds) {
                        const saved = await parseEmbedAndSave(embed, msg.createdTimestamp);
                        if (saved) count++;
                    }
                }
                lastId = id;
            }
            fetched += messages.size;
            console.log(`${fetched} messages scannés...`);
        }

        console.log(`\n✅ Scan terminé ! ${count} événements de recrutement/licenciement ont été ajoutés à la base de données.`);
    } catch (e) {
        console.error("❌ Erreur pendant le scan :", e);
    }
    
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
