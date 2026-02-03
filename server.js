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
app.use('/api/community', require('./routes/communityRoutes'));
app.use('/api/pdf-to-text', require('./routes/pdfRoutes'));

// Debug Route: List all registered routes and DB status
app.get("/api/debug/info", async (req, res) => {
    const routes = [];
    let dbStatus = "unknown";
    try {
        await db.query("SELECT 1");
        dbStatus = "connected";
    } catch (e) {
        dbStatus = `error: ${e.message}`;
    }

    app._router.stack.forEach(middleware => {
        if (middleware.route) {
            routes.push(`${Object.keys(middleware.route.methods).join(', ').toUpperCase()} ${middleware.route.path}`);
        } else if (middleware.name === 'router') {
            middleware.handle.stack.forEach(handler => {
                if (handler.route) {
                    const path = handler.route.path;
                    const methods = Object.keys(handler.route.methods).join(', ').toUpperCase();
                    routes.push(`${methods} ${path}`);
                }
            });
        }
    });

    res.json({
        dbStatus,
        uploadsDir: path.resolve(__dirname, 'uploads'),
        exists: fs.existsSync(path.resolve(__dirname, 'uploads')),
        routes
    });
});

// Static folder for uploads
app.use('/uploads', express.static(path.resolve(__dirname, 'uploads')));

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

        // Create User Uploads Table if not exists
        await db.query(`
            CREATE TABLE IF NOT EXISTS user_uploads (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                type VARCHAR(50) NOT NULL,
                category VARCHAR(50),
                file_url TEXT,
                thumbnail TEXT,
                status VARCHAR(50) DEFAULT 'approved',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ User Uploads table checked/created');

        app.listen(PORT, () => {

            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        process.exit(1);
    }
};

initDbAndStartServer();
