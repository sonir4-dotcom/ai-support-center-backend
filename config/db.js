const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';
let pool = null;

// 1. DATABASE CONNECTION RULE: Use ONLY process.env.DATABASE_URL
if (process.env.DATABASE_URL) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: isProduction ? { rejectUnauthorized: false } : false
    });

    // Test the connection (Async check, doesn't block module load)
    pool.connect((err, client, release) => {
        if (err) {
            console.error('❌ PostgreSQL Database connection failed:', err.message);
        } else {
            console.log('✅ Connected to Render/Production Database!');
            release();
        }
    });
} else {
    console.warn('⚠️  DATABASE_URL missing. Skipping Database connection.');
}

module.exports = {
    query: (text, params) => {
        if (!pool) {
            console.error('❌ DB Query failed: No Database connection active.');
            throw new Error('Database not connected');
        }
        return pool.query(text, params);
    },
    pool,
    isConnected: () => !!pool
};
