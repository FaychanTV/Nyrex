require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const db = require('./src/data/db');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const MIRROR_GUILD_ID = process.env.MIRROR_GUILD_ID || '1543570076664467536';

client.once('ready', async () => {
    console.log(`Connecté en tant que ${client.user.tag}... Lancement de la récupération des clones.`);
    
    try {
        const mirrorGuild = await client.guilds.fetch(MIRROR_GUILD_ID);
        if (!mirrorGuild) {
            console.error("❌ Guilde miroir non trouvée. Assurez-vous que le bot y est présent.");
            process.exit(1);
        }

        const channels = await mirrorGuild.channels.fetch();
        let count = 0;

        for (const [id, channel] of channels) {
            if (channel.topic && channel.topic.includes('MIRROR_OF:')) {
                const parts = channel.topic.split('MIRROR_OF:');
                if (parts.length > 1) {
                    const originalId = parts[1].trim();
                    
                    if (originalId) {
                        // Met à jour la base de données
                        await db.query(
                            'UPDATE tickets SET mirror_channel_id = ? WHERE channel_id = ?',
                            [channel.id, originalId]
                        );
                        console.log(`✔️ Ticket original ${originalId} lié au clone ${channel.id} (${channel.name})`);
                        count++;
                    }
                }
            }
        }
        console.log(`\n✅ Récupération terminée ! ${count} tickets clones liés avec succès.`);
    } catch (e) {
        console.error("❌ Erreur pendant la récupération :", e);
    }
    
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
