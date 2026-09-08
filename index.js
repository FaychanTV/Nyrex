process.env.DOTENV_CONFIG_QUIET = 'true';
require('dotenv').config({ quiet: true });

const client = require('./src/client');
const logger = require('./src/utils/logger');
const { initSecurity } = require('./src/utils/security');
const { initNetworkCheck } = require('./src/utils/network');
const { testDatabaseConnection } = require('./src/data/db');
const { initializeDatabase } = require('./src/data/schema');
const { initBackgroundJobs } = require('./src/jobs/index');
const { initServer } = require('./src/server/index');
const { waitForClientReady, syncDiscord } = require('./src/discord/sync');
const { initMusic } = require('./src/music/index');

// Enregistrement des événements Discord
const { registerReadyEvent } = require('./src/events/ready');
const { registerMessageCreateEvent } = require('./src/events/messageCreate');
const { registerGuildMemberUpdateEvent } = require('./src/events/guildMemberUpdate');
const { registerInteractionCreateEvent } = require('./src/events/interactionCreate');
const { registerMessageUpdateEvent } = require('./src/events/messageUpdate');
const { registerGuildCreateEvent } = require('./src/events/guildCreate');

// Chargement des commandes
const generalCmds = require('./src/commands/general');
const adminCmds = require('./src/commands/admin');
const ticketsCmds = require('./src/commands/tickets');
const factureCmds = require('./src/commands/facture');
const mirrorCmds = require('./src/commands/mirror');

/**
 * Pipeline de démarrage ordonné et asynchrone du bot en 8 étapes
 */
async function bootstrap() {
    // ----------------------------------------------------
    // 1. [SYSTEM]
    // ----------------------------------------------------
    logger.system('Chargement des modules système, du client Discord et des commandes...');
    
    registerReadyEvent(client);
    registerMessageCreateEvent(client);
    registerGuildMemberUpdateEvent(client);
    registerInteractionCreateEvent(client);
    registerMessageUpdateEvent(client);
    registerGuildCreateEvent(client); // Circuit Breaker : blocage réintégration en mode panique

    const allCmds = [...generalCmds, ...adminCmds, ...ticketsCmds, ...factureCmds, ...mirrorCmds];
    let loadedCommandsCount = 0;
    for (const cmd of allCmds) {
        if (cmd.name) {
            client.commands.set(cmd.name, cmd);
            loadedCommandsCount++;
        }
    }
    logger.system(`Client initialisé : ${loadedCommandsCount} commandes prêtes et 5 écouteurs d'événements configurés.`);

    // ----------------------------------------------------
    // 2. [SECURITY]
    // ----------------------------------------------------
    logger.security('Initialisation de l\'Anti-Crash global et gestionnaires de signaux...');
    initSecurity();

    // ----------------------------------------------------
    // 3. [NETWORK]
    // ----------------------------------------------------
    await initNetworkCheck();

    // ----------------------------------------------------
    // 4. [DATABASE]
    // ----------------------------------------------------
    logger.database('Connexion et vérification des bases de données...');
    await testDatabaseConnection();
    await initializeDatabase();

    // ----------------------------------------------------
    // 5. [JOBS]
    // ----------------------------------------------------
    logger.jobs('Lancement des tâches de fond et crons planifiés...');
    await initBackgroundJobs(client);

    // ----------------------------------------------------
    // 6. [SERVER]
    // ----------------------------------------------------
    logger.server('Initialisation des serveurs web / API...');
    await initServer();

    // ----------------------------------------------------
    // 7. [DISCORD]
    // ----------------------------------------------------
    logger.discord('Connexion au Gateway Discord...');
    await client.login(process.env.DISCORD_TOKEN);
    await waitForClientReady(client);
    await syncDiscord(client);

    // ----------------------------------------------------
    // 8. [MUSIC]
    // ----------------------------------------------------
    logger.music('Vérification du système musical et des nœuds audio...');
    await initMusic(client);

    logger.system('✨ Nyrex V3 est entièrement opérationnel ! Pipeline de démarrage terminé.');
}

// Lancement du bootstrap
bootstrap().catch((err) => {
    logger.security('💥 Échec critique lors du démarrage du bot :', err);
    process.exit(1);
});