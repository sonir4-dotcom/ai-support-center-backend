const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

// Use DATABASE_URL for Render PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : false
});

// Test the connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ PostgreSQL Database connection failed:', err.message);
    } else {
        console.log('✅ Connected to PostgreSQL Database!');
        release();
    }
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool
};
