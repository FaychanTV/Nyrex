const fs = require('fs');
const path = require('path');
const db = require('./DB/Fasture_db'); // Ton module de connexion vert
const ticketsDb = require('./DB/tickets_db');
const { initializeDatabase } = require('./DB/schema');

async function migrate() {
    try {
        // On s'assure que toutes les tables existent avant de migrer les données
        await initializeDatabase();

        console.log(`📦 Début de la migration des données depuis les fichiers JSON...`);

        // 1. Migrer les permissions et les états depuis perm.json
        const permPath = path.join(__dirname, './perm.json');
        let permsCount = 0;
        let statesCount = 0;

        if (fs.existsSync(permPath)) {
            const permData = JSON.parse(fs.readFileSync(permPath, 'utf8'));
            for (const [key, value] of Object.entries(permData)) {
                if (key.startsWith('permission_')) {
                    await db.query(
                        'INSERT INTO permissions (perm_id, description, roleid, commands) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE description = ?, roleid = ?, commands = ?',
                        [key, value.description || '', value.roleid || null, JSON.stringify(value.commands || []), value.description || '', value.roleid || null, JSON.stringify(value.commands || [])]
                    );
                    permsCount++;
                } else if (key === 'state') {
                    for (const [cmd, isEnabled] of Object.entries(value)) {
                        await db.query(
                            'INSERT INTO command_states (command_name, is_enabled) VALUES (?, ?) ON DUPLICATE KEY UPDATE is_enabled = ?',
                            [cmd, isEnabled, isEnabled]
                        );
                        statesCount++;
                    }
                }
            }
        } else {
            console.log("ℹ️ Le fichier perm.json est introuvable, migration des permissions ignorée.");
        }

        console.log(`✅ Migration permissions terminée.`);
        console.log(`🛡️ ${permsCount} permissions traitées.`);
        console.log(`⚙️ ${statesCount} états de commandes traités.`);

        // --- Migrer tickets.json et counters.json vers la DB ---
        const ticketsPath = path.join(__dirname, './tickets.json');
        const countersPath = path.join(__dirname, './counters.json');
        let ticketsJson = {};
        let countersJson = {};
        let dataToMigrate = false;

        if (fs.existsSync(ticketsPath)) {
            ticketsJson = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
            dataToMigrate = true;
        } else {
            console.log('ℹ️ Aucun fichier tickets.json trouvé, migration tickets ignorée.');
        }

        if (fs.existsSync(countersPath)) {
            countersJson = JSON.parse(fs.readFileSync(countersPath, 'utf8'));
            dataToMigrate = true;
        } else {
            console.log('ℹ️ Aucun fichier counters.json trouvé, migration compteurs ignorée.');
        }

        if (dataToMigrate) {
            try {
                const result = await ticketsDb.migrateFromJson(ticketsJson, countersJson);
                console.log(`📥 ${result.tickets || 0} tickets migrés, ${result.counters || 0} compteurs migrés.`);
            } catch (e) {
                console.error('❌ Erreur migration tickets/compteurs :', e);
            }
        }

        console.log(`✅ Toutes les migrations sont terminées.`);
        await db.end(); // Ferme la connexion MySQL proprement
        process.exit(0);

    } catch (error) {
        console.error("❌ Erreur pendant la migration :", error);
        process.exit(1);
    }
}

migrate();