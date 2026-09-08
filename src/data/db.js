process.env.DOTENV_CONFIG_QUIET = 'true';
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'BOT',
  password: process.env.DB_PASSWORD || 'BOT_159',
  database: process.env.DB_NAME || 'Nyrex Creative',
  waitForConnections: true,
  connectionLimit: 10
});

/**
 * Teste la connexion au pool MySQL / MariaDB
 * @returns {Promise<boolean>}
 */
async function testDatabaseConnection() {
    try {
        const connection = await pool.getConnection();
        logger.database(`Connexion MySQL établie avec succès (Hôte: ${process.env.DB_HOST || 'localhost'}, Base: ${process.env.DB_NAME || 'Nyrex Creative'}).`);
        connection.release();
        return true;
    } catch (err) {
        logger.database(`❌ Échec de la connexion à la base de données : ${err.message}`);
        throw err;
    }
}

pool.testDatabaseConnection = testDatabaseConnection;

module.exports = pool;
