const { ApplicationCommandOptionType, EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const { activePings } = require('../shared');
const { hasCommandPermission } = require('../utils/permissions');
const { getConfig } = require('../config');
const db = require('../data/db');

module.exports = [
    // --- COMMANDE : PING ---
    {
        name: 'ping',
        description: 'Surveille un utilisateur pour vous pinger dès sa réponse.',
        options: [
            {
                name: 'user',
                description: 'L\'utilisateur à surveiller',
                type: ApplicationCommandOptionType.User,
                required: true
            }
        ],

        async execute(message, args, client) {
            const target = message.mentions.users.first();

            if (!target) {
                const sent = await message.reply(`❌ Veuillez mentionner un utilisateur à surveiller.`);
                setTimeout(() => {
                    sent.delete().catch(() => {});
                    message.delete().catch(() => {});
                }, 5000);
                return;
            }

            this.addPing(target.id, message.author.id, message.channel.id);
            const sent = await message.reply({
                content: `👀 Surveillance activée pour **${target.username}**. Je vous pingerai dès son prochain message dans ce salon.`,
                allowedMentions: { repliedUser: false }
            });
            setTimeout(() => {
                sent.delete().catch(() => {});
                message.delete().catch(() => {});
            }, 5000);
        },

        async executeSlash(interaction, client) {
            const target = interaction.options.getUser('user');

            this.addPing(target.id, interaction.user.id, interaction.channelId);
            return interaction.reply({
                content: `👀 ${interaction.user} surveillance activée pour **${target.username}**. Vous recevrez un ghost-ping à son prochain message.`,
                ephemeral: true
            });
        },

        addPing(targetId, watcherId, channelId) {
            if (!activePings.has(targetId)) {
                activePings.set(targetId, new Map());
            }
            const key = `${watcherId}:${channelId}`;
            activePings.get(targetId).set(key, { watcherId, channelId });
        }
    },

    // --- COMMANDE : LINKSALON ---
    {
        name: 'linksalon',
        description: 'Lie un salon Discord à un employé et lui donne accès au salon.',
        options: [
            {
                name: 'salon',
                description: 'Le salon Discord à lier',
                type: ApplicationCommandOptionType.Channel,
                required: true
            },
            {
                name: 'employe',
                description: 'L\'employé à associer au salon',
                type: ApplicationCommandOptionType.User,
                required: true
            }
        ],

        async execute(message, args, client) {
            const canUse = await hasCommandPermission(message.member, 'linksalon');
            if (!canUse && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return message.reply('❌ Vous n\'avez pas la permission d\'utiliser cette commande.');
            }

            const channelMention = message.mentions.channels.first();
            const userMention = message.mentions.users.first();

            if (!channelMention || !userMention) {
                return message.reply('❌ Syntaxe incorrecte. Utilisation : `+linksalon #salon @Employé`');
            }

            await this.handleLink(message.guild, channelMention, userMention, (msgData) => message.reply(msgData));
        },

        async executeSlash(interaction, client) {
            const channel = interaction.options.getChannel('salon');
            const user = interaction.options.getUser('employe');

            const canUse = await hasCommandPermission(interaction.member, 'linksalon');
            if (!canUse && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ Vous n\'avez pas la permission d\'utiliser cette commande.', ephemeral: true });
            }

            await this.handleLink(interaction.guild, channel, user, (msgData) => interaction.reply(msgData));
        },

        async handleLink(guild, channel, user, replyFn) {
            try {
                // 1. Créer la table si elle n'existe pas
                await db.query(`
                    CREATE TABLE IF NOT EXISTS employee_channels (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        channel_id VARCHAR(100) NOT NULL,
                        user_id VARCHAR(100) NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY unique_channel_user (channel_id, user_id)
                    )
                `);

                // 2. Enregistrer l'association en BDD
                await db.query(`
                    INSERT INTO employee_channels (channel_id, user_id)
                    VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)
                `, [channel.id, user.id]);

                // 3. Modifier les permissions du salon sur Discord
                if (channel && channel.permissionOverwrites) {
                    await channel.permissionOverwrites.edit(user.id, {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true,
                        AttachFiles: true
                    }).catch(err => console.error("Erreur mise à jour perms salon:", err));
                }

                const embed = new EmbedBuilder()
                    .setTitle('🔗 Salon Lié à un Employé')
                    .setColor('#22c55e')
                    .setDescription(`Le salon ${channel.toString()} a été lié avec succès à l'employé **${user.username}**.`)
                    .addFields(
                        { name: '📌 Salon', value: `${channel.toString()} (\`${channel.id}\`)`, inline: true },
                        { name: '👤 Employé', value: `${user.toString()} (\`${user.id}\`)`, inline: true }
                    )
                    .setFooter({ text: 'Nyrex Bot • Permissions automatiquement mises à jour' })
                    .setTimestamp();

                await replyFn({ embeds: [embed] });
            } catch (error) {
                console.error('Erreur lors du lien du salon à l\'employé :', error);
                await replyFn({ content: '❌ Une erreur est survenue lors du lien du salon à l\'employé.' });
            }
        }
    },

    // --- COMMANDE : HELP ---
    {
        name: 'help',
        description: 'Affiche la liste des commandes disponibles selon vos permissions.',
        async execute(message, args, client) {
            const embed = new EmbedBuilder()
                .setTitle('📚 Centre d\'Aide')
                .setColor('#2b2d31')
                .setDescription('Voici la liste des commandes auxquelles vous avez accès :');

            let commandList = '';

            for (const cmd of client.commands.values()) {
                if (cmd.name) {
                    const canUse = await hasCommandPermission(message.member, cmd.name);
                    if (canUse) {
                        commandList += `**+${cmd.name}**\n> ${cmd.description || 'Aucune description.'}\n\n`;
                    }
                }
            }

            if (!commandList) commandList = "Vous n'avez accès à aucune commande pour le moment.";

            embed.addFields({ name: '🛠️ Commandes Disponibles', value: commandList });

            await message.reply({ embeds: [embed] });
        }
    },

    // --- COMMANDE : CTR ---
    {
        name: 'ctr',
        description: 'Crée un salon privé et affiche le nombre total de salons (limite 500).',
        async execute(message, args, client) {
            const config = getConfig();
            const TARGET_GUILD_ID = config.mirrorGuildId || config.ticketSettings?.mirrorGuildId || '1543570076664467536';

            if (!message.guild || message.guild.id !== TARGET_GUILD_ID) {
                return message.reply(`❌ Cette commande fonctionne uniquement sur le serveur ${TARGET_GUILD_ID}.`);
            }

            const guild = await client.guilds.fetch(TARGET_GUILD_ID).catch(() => null);
            if (!guild) {
                return message.reply('❌ Impossible de récupérer le serveur cible.');
            }

            await guild.channels.fetch();
            const totalChannels = guild.channels.cache.size;
            const channelName = `CHANNEL : ${totalChannels + 1} / 500`;

            try {
                const newChannel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildVoice,
                    permissionOverwrites: [
                        {
                            id: guild.roles.everyone.id,
                            deny: [PermissionsBitField.Flags.ViewChannel]
                        },
                        {
                            id: message.author.id,
                            allow: [
                                PermissionsBitField.Flags.ViewChannel,
                                PermissionsBitField.Flags.Connect,
                                PermissionsBitField.Flags.Speak
                            ]
                        }
                    ],
                    reason: 'Commande ctr : création d un salon vocal privé et comptage des canaux.'
                });

                await message.reply(`✅ Salon vocal privé créé avec succès : ${newChannel.toString()}`);
            } catch (error) {
                console.error('Erreur lors de la création du salon vocal privé ctr :', error);
                return message.reply('❌ Impossible de créer le salon privé. Vérifiez les permissions du bot.');
            }
        }
    }
];
