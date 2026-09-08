const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const db = require('../data/db');
const { getConfig } = require('../config');
const { getIsLeader, setIsLeader, INSTANCE_NAME } = require('../shared');
const { 
    notifyHeartbeat, 
    notifyDbError, 
    notifyNewLeader 
} = require('../utils/notifier');
const logger = require('../utils/logger');

let isJobsRunning = false;

/**
 * Synchronise les statuts des employés dans presences.json
 */
async function syncEmployeesPresences(client) {
    try {
        const config = getConfig();
        const roleId = config.employeeRoleId || config.staffRoleId;
        if (!roleId) return;

        const guildId = config.mainGuildId || '1456748563148312689';
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;

        await guild.members.fetch().catch(() => {});

        const role = guild.roles.cache.get(roleId);
        if (!role) return;

        const statusMap = {};
        role.members.forEach(member => {
            statusMap[member.id] = member.presence ? member.presence.status : 'offline';
        });

        fs.writeFileSync(
            path.resolve(__dirname, '../../presences.json'),
            JSON.stringify(statusMap, null, 2)
        );
    } catch (e) {
        // Ignorer silencieusement pour ne pas encombrer les logs
    }
}

/**
 * Exécute un heartbeat du système et vérifie la DB
 */
async function runHeartbeat() {
    const ramUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
    let dbStatus = "OK";
    
    try {
        await db.query('SELECT 1');
    } catch (error) {
        dbStatus = "ERREUR";
        await notifyDbError(error);
    }

    await notifyHeartbeat(ramUsage, dbStatus);
}

/**
 * Planifie le heartbeat système toutes les 15 minutes (:00, :15, :30, :45)
 */
function scheduleHeartbeat() {
    const now = new Date();
    const delay = 15 * 60 * 1000 - (now.getTime() % (15 * 60 * 1000));
    setTimeout(() => {
        runHeartbeat();
        setInterval(runHeartbeat, 15 * 60 * 1000);
    }, delay);
}

/**
 * Boucle d'élection de leader haute disponibilité
 */
function startLeaderElectionLoop() {
    setInterval(async () => {
        try {
            const currentLeader = getIsLeader();
            await db.query(`
                INSERT INTO instances_status (instance_name, status, started_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE status = ?, last_heartbeat = CURRENT_TIMESTAMP
            `, [INSTANCE_NAME, currentLeader ? 'LEADER' : 'STANDBY', currentLeader ? 'LEADER' : 'STANDBY']);

            if (currentLeader) {
                const [result] = await db.query(`
                    UPDATE leader_election
                    SET last_heartbeat = CURRENT_TIMESTAMP
                    WHERE id = 1 AND leader_name = ? AND is_active = TRUE
                `, [INSTANCE_NAME]);
                
                if (result.affectedRows === 0) {
                    logger.jobs(`⚠️ [LEADER] Perte du leadership ! Une autre instance a pris le relais.`);
                    setIsLeader(false);
                }
            } else {
                const jitterDelayMs = Math.floor(Math.random() * (5000 - 2000 + 1)) + 2000;
                
                setTimeout(async () => {
                    try {
                        const [result] = await db.query(`
                            UPDATE leader_election
                            SET 
                                leader_name = ?,
                                last_heartbeat = CURRENT_TIMESTAMP,
                                is_active = TRUE
                            WHERE 
                                id = 1 
                                AND (is_active = FALSE OR last_heartbeat < NOW() - INTERVAL 30 SECOND)
                        `, [INSTANCE_NAME]);
                        
                        if (result.affectedRows === 1) {
                            setIsLeader(true);
                            logger.jobs(`👑 [LEADER] L'instance ${INSTANCE_NAME} est désormais le LEADER actif.`);
                            await notifyNewLeader(INSTANCE_NAME, jitterDelayMs / 1000);
                        }
                    } catch (err) {
                        logger.jobs(`❌ [ELECTION] Erreur lors de la tentative d'élection : ${err.message}`);
                    }
                }, jitterDelayMs);
            }
        } catch (error) {
            logger.jobs(`❌ [LEADER] Erreur dans la boucle d'élection : ${error.message}`);
        }
    }, 10000);
}

/**
 * Boucle de vérification des rappels de l'agenda
 */
function startAgendaLoop(client) {
    setInterval(async () => {
        if (!getIsLeader()) return;
        try {
            const [rows] = await db.query(
                'SELECT * FROM agenda_events WHERE reminder_sent = 0 AND reminder_channel_id IS NOT NULL AND reminder_channel_id != ""'
            );
            if (rows.length === 0) return;

            const now = Date.now();
            const fifteenMinutesFromNow = now + 15 * 60 * 1000;

            for (const e of rows) {
                const startTime = new Date(e.start_date).getTime();
                if (startTime <= fifteenMinutesFromNow && startTime >= now - 60 * 60 * 1000) {
                    try {
                        const channel = client.channels.cache.get(e.reminder_channel_id) || await client.channels.fetch(e.reminder_channel_id).catch(() => null);
                        if (channel) {
                            const embed = new EmbedBuilder()
                                .setTitle(`⏰ Rappel d'événement : ${e.title}`)
                                .setDescription(e.description || 'Aucune description fournie.')
                                .setColor(e.color || '#5865F2')
                                .addFields(
                                    { name: '📅 Date & Heure de début', value: `${new Date(e.start_date).toLocaleString('fr-FR')}` },
                                    { name: '👤 Créé par', value: `@${e.created_by}` }
                                )
                                .setFooter({ text: 'Nyrex V2 Agenda' })
                                .setTimestamp();

                            const mentionStr = e.reminder_user_id ? `<@${e.reminder_user_id}>` : '';
                            await channel.send({ content: mentionStr, embeds: [embed] });
                            
                            await db.query('UPDATE agenda_events SET reminder_sent = 1 WHERE id = ?', [e.id]);
                            logger.jobs(`Rappel envoyé pour l'événement #${e.id} dans le salon <#${e.reminder_channel_id}>.`);
                        } else {
                            await db.query('UPDATE agenda_events SET reminder_sent = 1 WHERE id = ?', [e.id]);
                        }
                    } catch (sendErr) {
                        logger.jobs(`Erreur d'envoi du rappel #${e.id} : ${sendErr.message}`);
                    }
                }
            }
        } catch (error) {
            logger.jobs(`Erreur dans la boucle agenda : ${error.message}`);
        }
    }, 30000);
}

/**
 * Initialise l'ensemble des crons et tâches de fond
 */
async function initBackgroundJobs(client) {
    if (isJobsRunning) return;
    isJobsRunning = true;

    // 1. Tâche de présence du personnel (15s)
    setInterval(() => syncEmployeesPresences(client), 15000);

    // 2. Heartbeat toutes les 15 minutes
    scheduleHeartbeat();

    // 3. Boucle d'élection de leader (10s)
    startLeaderElectionLoop();

    // 4. Boucle agenda (30s)
    startAgendaLoop(client);

    logger.jobs('Tâches de fond et crons périodiques initialisés (Election: 10s, Agenda: 30s, Presences: 15s, Heartbeat: 15m).');
}

module.exports = {
    initBackgroundJobs,
    syncEmployeesPresences
};
