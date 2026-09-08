/**
 * Module de notification ntfy.sh
 * Permet d'envoyer des alertes push sur votre iPhone.
 */

const NTFY_TOPIC_URL = 'https://ntfy.sh/Aymerick-tasset-topic-pid-100777';
let notificationQueue = [];

// Fonction interne qui envoie vraiment la notification tout de suite à l'API
async function sendNotifDirect(titre, message, priorite = 3, tags = "") {
    try {
        // Encodage RFC 2047 du titre pour supporter les emojis et caractères spéciaux dans l'en-tête HTTP
        const encodedTitle = `=?UTF-8?B?${Buffer.from(titre).toString('base64')}?=`;

        const response = await fetch(NTFY_TOPIC_URL, {
            method: 'POST',
            body: message,
            headers: {
                'Title': encodedTitle,
                'Priority': priorite.toString(),
                'Tags': tags
            }
        });

        if (!response.ok) {
            console.error(`[NTFY] ❌ Échec de l'envoi de la notification. Code HTTP: ${response.status}`);
        }
    } catch (error) {
        console.error(`[NTFY] 🚨 Exception attrapée lors de l'envoi de la notification:`, error.message);
    }
}

// Système pour vider la file d'attente toutes les 15 minutes (:00, :15, :30, :45)
async function processQueue() {
    if (notificationQueue.length === 0) return;
    
    const toSend = [...notificationQueue];
    notificationQueue = []; // On vide la file d'attente

    for (const notif of toSend) {
        await sendNotifDirect(notif.titre, notif.message, notif.priorite, notif.tags);
        // Petite pause d'une seconde entre chaque envoi pour ne pas spammer et bloquer l'API ntfy
        await new Promise(r => setTimeout(r, 1000));
    }
}

const scheduleNotifQueue = () => {
    const now = new Date();
    const delay = 15 * 60 * 1000 - (now.getTime() % (15 * 60 * 1000)); // Calcul jusqu'à la prochaine tranche horaire
    setTimeout(() => {
        processQueue();
        setInterval(processQueue, 15 * 60 * 1000);
    }, delay);
};
scheduleNotifQueue(); // Lance l'horloge interne de la file d'attente

/**
 * Met une notification en file d'attente, sauf s'il s'agit d'une urgence critique.
 */
async function sendNotif(titre, message, priorite = 3, tags = "") {
    if (priorite >= 5) {
        // CRITIQUE : Les crash (priorité 5) doivent partir TOUT DE SUITE !
        await sendNotifDirect(titre, message, priorite, tags);
    } else {
        // Pour le reste (Heartbeat, Leader, Démarrage...), on stocke en attendant l'heure pile
        notificationQueue.push({ titre, message, priorite, tags });
    }
}

// --- Notifications Système Spécifiques ---

/** Notification de démarrage du bot. */
async function notifyStartup() {
    await sendNotif(
        'Nyrex V2 - Système', 
        `🚀 Démarrage réussi. Node.js ${process.version} en ligne.`, 
        3, 
        'rocket,white_check_mark'
    );
}

/** Notification de statut périodique (heartbeat). */
async function notifyHeartbeat(ramUsage, dbStatus) {
    await sendNotif(
        'Nyrex V2 - Heartbeat', 
        `💓 Statut : Opérationnel | RAM: ${ramUsage}MB | DB: ${dbStatus}`, 
        2, 
        'green_heart,computer'
    );
}

/** Notification d'erreur de connexion à la base de données. */
async function notifyDbError(error) {
    await sendNotif(
        '🚨 ALERTE MARIA DB', 
        `Impossible de joindre la base de données sur le port 3306. Tentative de reconnexion...\nErreur: ${error.message}`, 
        4, 
        'floppy_disk,warning,red_circle'
    );
}

/** Notification de prise de rôle du Leader. */
async function notifyNewLeader(instanceName, delaySeconds) {
    await sendNotif(
        '👑 Nouveau Leader', 
        `L'instance ${instanceName} a pris le relais après avoir patienté ${delaySeconds.toFixed(1)}s.`, 
        3, 
        'crown'
    );
}

/** Notification de crash du processus. */
async function notifyCrash(error, type = 'Uncaught Exception') {
    const title = type === 'Unhandled Rejection' 
        ? '💀 CRASH DU BOT (Unhandled Rejection)' 
        : '💀 CRASH DU BOT';
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    await sendNotif(
        title, 
        `Erreur fatale : ${errorMessage}`, 
        5, 
        'skull,fire,x'
    );
}

module.exports = {
    sendNotif,
    notifyStartup,
    notifyHeartbeat,
    notifyDbError,
    notifyNewLeader,
    notifyCrash
};
