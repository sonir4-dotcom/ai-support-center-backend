require('dotenv').config();
const { Pool } = require('pg');

console.log('--- Environment Debug ---');
console.log('Current Directory:', process.cwd());
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DATABASE_URL defined:', !!process.env.DATABASE_URL);

if (!process.env.DATABASE_URL && !process.env.DB_USER) {
    console.log('⚠️  No database configuration found in environment.');
} else {
    console.log('✅ Configuration found.');
}

const dbConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'ai_support_center',
        password: process.env.DB_PASSWORD || 'admin',
        port: process.env.DB_PORT || 5432,
    };

console.log('Attempting connection with config:', {
    ...dbConfig,
    password: dbConfig.password ? '****' : undefined
});

const pool = new Pool(dbConfig);
pool.connect().then(client => {
    console.log('✅ Connection Successful!');
    client.release();
    process.exit(0);
}).catch(err => {
    console.error('❌ Connection Failed:', err.message);
    process.exit(1);
});
