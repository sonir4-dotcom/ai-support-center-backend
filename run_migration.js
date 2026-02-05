const fs = require('fs');
const path = require('path');
const db = require('./config/db'); // Use existing DB config

async function runMigration() {
    try {
        const sqlPath = path.join(__dirname, 'migrations/phase_8_creator_schema.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log('Running migration from:', sqlPath);
        await db.query(sql); // Use existing db.query wrapper
        console.log('Migration successful!');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        process.exit();
    }
}

runMigration();
