const fs = require('fs');
const path = require('path');
const db = require('../config/db');

/**
 * Reads a SQL file and executes it via the database connection.
 * @param {string} relativePath - Path relative to backend root (e.g., 'migrations/phase_8.sql')
 */
const runMigration = async (relativePath) => {
    try {
        const sqlPath = path.join(__dirname, '..', relativePath);

        if (!fs.existsSync(sqlPath)) {
            console.warn(`⚠️ Migration file not found: ${relativePath}`);
            return;
        }

        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log(`🔄 Running migration: ${relativePath}...`);

        await db.query(sql);

        console.log(`✅ Migration successful: ${relativePath}`);
    } catch (error) {
        console.error(`❌ Migration failed: ${relativePath}`, error.message);
        throw error; // Propagate error to caller (server.js) so it can decide whether to exit or continue
    }
};

module.exports = runMigration;
