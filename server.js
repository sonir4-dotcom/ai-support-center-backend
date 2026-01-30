const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./config/db');
const authRoutes = require('./routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const path = require('path');

// Routes
app.get("/", (req, res) => {
    res.json({
        status: "OK",
        message: "AI Support Center Backend is running 🚀"
    });
});

app.get("/health", (req, res) => {
    res.json({ status: "healthy" });
});

app.use('/api/auth', authRoutes);
app.use('/api/resume', require('./routes/resumeRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));

// Static folder for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Initialize DB and Start Server
const initDbAndStartServer = async () => {
    try {
        // Create Users Table if not exists
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Users table checked/created');

        // Create Resumes Table if not exists
        await db.query(`
            CREATE TABLE IF NOT EXISTS resumes (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL UNIQUE,
                resume_data JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Resumes table checked/created');

        app.listen(PORT, () => {

            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        process.exit(1);
    }
};

initDbAndStartServer();
