const db = require('./db');
const logger = require('../utils/logger');

async function initializeDatabase() {
    logger.database('Initialisation du schéma et vérification des tables...');

    // Tables générales (factures, etc.)
    await db.query(`
        CREATE TABLE IF NOT EXISTS factures_config (
            guildId VARCHAR(255) PRIMARY KEY,
            channelId VARCHAR(255),
            lastMessageId VARCHAR(255),
            lastScan BIGINT
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS factures (
            uniqueId VARCHAR(255) PRIMARY KEY,
            msgId VARCHAR(255),
            date DATETIME,
            totalAmount FLOAT,
            preTaxAmount FLOAT,
            taxRate FLOAT,
            issuerId VARCHAR(255),
            playerNetId VARCHAR(255),
            playerName VARCHAR(255),
            playerCharacter VARCHAR(255),
            playerId VARCHAR(255),
            jobId VARCHAR(255),
            jobName VARCHAR(255),
            targetPlayerNetId VARCHAR(255),
            targetPlayerDiscord VARCHAR(255),
            targetPlayerName VARCHAR(255),
            targetPlayerCharacter VARCHAR(255),
            targetPlayerId VARCHAR(255),
            guildId VARCHAR(255)
        )
    `);

    // Indexation pour optimiser les requêtes de stats et éviter la surcharge du VPS
    try {
        // Drop the old prefix index if it exists, to re-create it as a full-column index
        try {
            await db.query(`DROP INDEX idx_factures_char ON factures`);
        } catch (e) {
            // Ignore if index doesn't exist
        }
        await db.query(`CREATE INDEX IF NOT EXISTS idx_factures_date ON factures (date)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_factures_char ON factures (playerCharacter)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_factures_job ON factures (jobName)`);
    } catch (indexErr) {
        logger.database(`Impossible de créer les index (déjà existants ou non supportés) : ${indexErr.message}`);
    }

    // Tables de permissions et d'états
    await db.query(`
        CREATE TABLE IF NOT EXISTS permissions (
            perm_id VARCHAR(50) PRIMARY KEY,
            description VARCHAR(255),
            roleid VARCHAR(255),
            commands TEXT
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS role_limits (
            role_id VARCHAR(64) PRIMARY KEY,
            guild_id VARCHAR(64) NOT NULL,
            max_members INT NOT NULL
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS command_states (
            command_name VARCHAR(50) PRIMARY KEY,
            is_enabled BOOLEAN
        )
    `);

    // Tables pour le système de Leader Election
    await db.query(`
        CREATE TABLE IF NOT EXISTS leader_election (
            id INT PRIMARY KEY,
            leader_name VARCHAR(255) NOT NULL,
            last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_active BOOLEAN DEFAULT FALSE
        )
    `);
    await db.query(`
        INSERT IGNORE INTO leader_election (id, leader_name, last_heartbeat, is_active)
        VALUES (1, 'none', '1970-01-01 00:00:00', FALSE)
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS instances_status (
            instance_name VARCHAR(255) PRIMARY KEY,
            status VARCHAR(50),
            last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
    try {
        await db.query(`ALTER TABLE instances_status ADD COLUMN started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    } catch (e) {}

    // Tables pour le système de tickets (précédemment dans tickets_db.js)
    await db.query(`CREATE TABLE IF NOT EXISTS tickets ( channel_id VARCHAR(64) PRIMARY KEY, owner_id VARCHAR(64), category VARCHAR(255), created_at BIGINT, is_closed TINYINT(1) DEFAULT 0, claimed_by VARCHAR(64), claimed_at BIGINT, mirror_channel_id VARCHAR(64) )`);
    
    try {
        await db.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS mirror_channel_id VARCHAR(64)`);
    } catch (e) {}
    
    // Indexation de la table tickets pour optimiser les performances des stats et listes
    try {
        await db.query(`CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets (created_at)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_tickets_owner_id ON tickets (owner_id)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_tickets_claimed_by ON tickets (claimed_by)`);
    } catch (indexErr) {
        console.warn('⚠️ [DATABASE] Impossible de créer les index sur la table tickets :', indexErr.message);
    }

    await db.query(`CREATE TABLE IF NOT EXISTS claim_counters ( user_id VARCHAR(64) PRIMARY KEY, claim_count INT DEFAULT 0 )`);
    await db.query(`CREATE TABLE IF NOT EXISTS counters ( id VARCHAR(64) PRIMARY KEY, value BIGINT )`);

    // Table pour les utilisateurs du dashboard web
    await db.query(`
        CREATE TABLE IF NOT EXISTS dashboard_users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(100) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(50) DEFAULT 'admin',
            access_overview TINYINT(1) DEFAULT 1,
            access_tickets TINYINT(1) DEFAULT 1,
            access_permissions TINYINT(1) DEFAULT 1,
            access_commands TINYINT(1) DEFAULT 1,
            access_factures TINYINT(1) DEFAULT 1,
            access_config TINYINT(1) DEFAULT 1,
            access_users TINYINT(1) DEFAULT 1,
            access_infos_bot TINYINT(1) DEFAULT 1,
            access_actions_bot TINYINT(1) DEFAULT 1,
            access_employees TINYINT(1) DEFAULT 1,
            access_agenda TINYINT(1) DEFAULT 1,
            write_overview TINYINT(1) DEFAULT 1,
            write_tickets TINYINT(1) DEFAULT 1,
            write_permissions TINYINT(1) DEFAULT 1,
            write_commands TINYINT(1) DEFAULT 1,
            write_factures TINYINT(1) DEFAULT 1,
            write_config TINYINT(1) DEFAULT 1,
            write_users TINYINT(1) DEFAULT 1,
            write_infos_bot TINYINT(1) DEFAULT 1,
            write_actions_bot TINYINT(1) DEFAULT 1,
            write_employees TINYINT(1) DEFAULT 1,
            write_agenda TINYINT(1) DEFAULT 1,
            can_write TINYINT(1) DEFAULT 1,
            discord_id VARCHAR(64) UNIQUE,
            login_code VARCHAR(255) UNIQUE,
            preferences TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Migration des colonnes de permission et d'OAuth2 pour les utilisateurs existants
    try {
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS access_overview TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS access_tickets TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS access_permissions TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS access_commands TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS access_factures TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS access_config TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS access_users TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS access_infos_bot TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS access_actions_bot TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS access_employees TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS discord_id VARCHAR(64) UNIQUE`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS login_code VARCHAR(255) UNIQUE`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP NULL`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(45) NULL`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS last_login_method VARCHAR(50) NULL`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS access_agenda TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS can_write TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS write_overview TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS write_tickets TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS write_permissions TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS write_commands TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS write_factures TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS write_config TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS write_users TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS write_infos_bot TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS write_actions_bot TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS write_employees TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS write_agenda TINYINT(1) DEFAULT 1`);
        await db.query(`ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS preferences TEXT NULL`);
    } catch (e) {
        // Fallback pour les anciennes versions qui ne supportent pas ADD COLUMN IF NOT EXISTS
        const cols = [
            'access_overview', 'access_tickets', 'access_permissions', 'access_commands', 'access_factures', 'access_config', 'access_users', 'access_infos_bot', 'access_actions_bot', 'access_employees', 'access_agenda', 'can_write',
            'write_overview', 'write_tickets', 'write_permissions', 'write_commands', 'write_factures', 'write_config', 'write_users', 'write_infos_bot', 'write_actions_bot', 'write_employees', 'write_agenda'
        ];
        for (const col of cols) {
            try {
                await db.query(`ALTER TABLE dashboard_users ADD COLUMN ${col} TINYINT(1) DEFAULT 1`);
            } catch (e2) {}
        }
        try {
            await db.query(`ALTER TABLE dashboard_users ADD COLUMN discord_id VARCHAR(64) UNIQUE`);
        } catch (e2) {}
        try {
            await db.query(`ALTER TABLE dashboard_users ADD COLUMN login_code VARCHAR(255) UNIQUE`);
        } catch (e2) {}
        try {
            await db.query(`ALTER TABLE dashboard_users ADD COLUMN last_login_at TIMESTAMP NULL`);
        } catch (e2) {}
        try {
            await db.query(`ALTER TABLE dashboard_users ADD COLUMN last_login_ip VARCHAR(45) NULL`);
        } catch (e2) {}
        try {
            await db.query(`ALTER TABLE dashboard_users ADD COLUMN last_login_method VARCHAR(50) NULL`);
        } catch (e2) {}
        try {
            await db.query(`ALTER TABLE dashboard_users ADD COLUMN access_agenda TINYINT(1) DEFAULT 1`);
        } catch (e2) {}
        try {
            await db.query(`ALTER TABLE dashboard_users ADD COLUMN preferences TEXT NULL`);
        } catch (e2) {}
    }

    // Initialiser les codes de connexion manquants
    try {
        const [usersWithoutCode] = await db.query('SELECT id FROM dashboard_users WHERE login_code IS NULL OR login_code = ""');
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        for (const u of usersWithoutCode) {
            let code = 'NX-';
            for (let i = 0; i < 6; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            await db.query('UPDATE dashboard_users SET login_code = ? WHERE id = ?', [code, u.id]);
        }
    } catch (codeErr) {
        console.warn('⚠️ [DATABASE] Impossible d\'initialiser les codes de connexion :', codeErr.message);
    }

    // Table pour enregistrer les conversations des tickets
    await db.query(`
        CREATE TABLE IF NOT EXISTS ticket_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            channel_id VARCHAR(64) NOT NULL,
            author_id VARCHAR(64) NOT NULL,
            author_name VARCHAR(255) NOT NULL,
            author_avatar VARCHAR(255),
            content TEXT,
            attachments TEXT,
            created_at BIGINT,
            KEY channel_id_idx (channel_id)
        )
    `);

    // Table pour les informations du bot (version, auteur, copyright)
    await db.query(`
        CREATE TABLE IF NOT EXISTS bot_info (
            id INT PRIMARY KEY DEFAULT 1,
            version VARCHAR(50) NOT NULL,
            auteur VARCHAR(255) NOT NULL,
            copyright VARCHAR(255),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);

    // Insertion des valeurs par défaut si non existantes
    await db.query(`
        INSERT IGNORE INTO bot_info (id, version, auteur, copyright)
        VALUES (1, '2.0.0', 'Nyrex', '© 2024-2026 Nyrex. Tous droits réservés.')
    `);

    // Table pour les événements d'agenda
    await db.query(`
        CREATE TABLE IF NOT EXISTS agenda_events (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT NULL,
            start_date DATETIME NOT NULL,
            end_date DATETIME NOT NULL,
            color VARCHAR(7) DEFAULT '#5865F2',
            created_by VARCHAR(100) NOT NULL,
            reminder_channel_id VARCHAR(64) NULL,
            reminder_user_id VARCHAR(64) NULL,
            reminder_sent TINYINT(1) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Table pour l'historique des emplois (recrutements, renvois, etc)
    await db.query(`
        CREATE TABLE IF NOT EXISTS employment_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            discord_id VARCHAR(64) NOT NULL,
            in_game_id VARCHAR(64),
            character_name VARCHAR(255) NOT NULL,
            action VARCHAR(50) NOT NULL,
            grade VARCHAR(255),
            raw_data JSON,
            date DATETIME NOT NULL,
            KEY discord_id_idx (discord_id),
            KEY in_game_id_idx (in_game_id)
        )
    `);

    try {
        await db.query(`ALTER TABLE employment_history ADD COLUMN IF NOT EXISTS in_game_id VARCHAR(64)`);
        await db.query(`ALTER TABLE employment_history ADD INDEX IF NOT EXISTS in_game_id_idx (in_game_id)`);
        await db.query(`ALTER TABLE employment_history ADD COLUMN IF NOT EXISTS raw_data JSON`);
    } catch (e) {
        // Fallback for older MariaDB versions
        try { await db.query(`ALTER TABLE employment_history ADD COLUMN in_game_id VARCHAR(64)`); } catch (e2) {}
        try { await db.query(`ALTER TABLE employment_history ADD INDEX in_game_id_idx (in_game_id)`); } catch (e2) {}
        try { await db.query(`ALTER TABLE employment_history ADD COLUMN raw_data JSON`); } catch (e2) {}
    }

    // Migration des colonnes de rappel pour agenda_events
    try {
        await db.query(`ALTER TABLE agenda_events ADD COLUMN IF NOT EXISTS reminder_channel_id VARCHAR(64) NULL`);
        await db.query(`ALTER TABLE agenda_events ADD COLUMN IF NOT EXISTS reminder_user_id VARCHAR(64) NULL`);
        await db.query(`ALTER TABLE agenda_events ADD COLUMN IF NOT EXISTS reminder_sent TINYINT(1) DEFAULT 0`);
    } catch (e) {
        try {
            await db.query(`ALTER TABLE agenda_events ADD COLUMN reminder_channel_id VARCHAR(64) NULL`);
        } catch (e2) {}
        try {
            await db.query(`ALTER TABLE agenda_events ADD COLUMN reminder_user_id VARCHAR(64) NULL`);
        } catch (e2) {}
        try {
            await db.query(`ALTER TABLE agenda_events ADD COLUMN reminder_sent TINYINT(1) DEFAULT 0`);
        } catch (e2) {}
    }

    logger.database('Schéma initialisé et tables prêtes.');
}

module.exports = { initializeDatabase };
