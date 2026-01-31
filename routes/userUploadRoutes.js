const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const db = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');

// Log security events from client
router.post('/log-security', (req, res) => {
    const { event, details } = req.body;
    console.warn(`[SECURITY EVENT] ${event}:`, details);
    res.status(204).send();
});

// Storage for temp ZIP uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const tempDir = path.resolve(__dirname, '../uploads/temp/');
        console.log(`[STORAGE] Using temp directory: ${tempDir}`);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        cb(null, tempDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `upload-${Date.now()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
    fileFilter: (req, file, cb) => {
        const allowedExts = ['.zip', '.mp4', '.mov'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExts.includes(ext)) {
            return cb(null, true);
        }
        cb(new Error('Only ZIP files and Video files are allowed!'));
    }
});

// POST /api/user-uploads/submit
router.post('/submit', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        const { title, description, external_link } = req.body;
        const user_id = req.user.id;

        if (!req.file && !external_link) {
            return res.status(400).json({ message: 'Missing file or external link' });
        }

        let type = 'link';
        let file_url = external_link || '';
        let category = 'Tool'; // Default

        if (req.file) {
            console.log(`[UPLOAD] Processing file: ${req.file.originalname} (${req.file.mimetype})`);
            const ext = path.extname(req.file.originalname).toLowerCase();
            const uniqueName = `community-${Date.now()}`;

            // Base directory for community uploads
            const communityBase = path.resolve(__dirname, '../uploads/community');
            if (!fs.existsSync(communityBase)) {
                fs.mkdirSync(communityBase, { recursive: true });
            }

            if (ext === '.zip') {
                type = 'html';
                const targetDir = path.join(communityBase, uniqueName);
                console.log(`[UPLOAD] Extracting ZIP to: ${targetDir}`);

                // Extract ZIP
                const zip = new AdmZip(req.file.path);
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }
                zip.extractAllTo(targetDir, true);

                // Auto-categorization
                const entries = zip.getEntries();
                const fileList = entries.map(e => e.entryName.toLowerCase());

                if (fileList.some(name => name.includes('game') || name.includes('canvas'))) category = 'Game';
                else category = 'Tool';

                let entryPoint = 'index.html';
                if (!fileList.includes('index.html')) {
                    const htmlFiles = fileList.filter(f => f.endsWith('.html'));
                    if (htmlFiles.length > 0) entryPoint = htmlFiles[0];
                }

                file_url = `/uploads/community/${uniqueName}/${entryPoint}`;
                console.log(`[UPLOAD] HTML Tool ready at: ${file_url}`);
            } else {
                // Video upload
                type = 'video';
                category = 'Tutorial';
                const videoDir = path.join(communityBase, 'videos');
                if (!fs.existsSync(videoDir)) {
                    fs.mkdirSync(videoDir, { recursive: true });
                }

                const finalName = `${Date.now()}-${req.file.filename}`;
                const finalPath = path.join(videoDir, finalName);
                console.log(`[UPLOAD] Moving video to: ${finalPath}`);

                fs.renameSync(req.file.path, finalPath);
                file_url = `/uploads/community/videos/${finalName}`;
                console.log(`[UPLOAD] Video ready at: ${file_url}`);
            }

            // Cleanup temp file if it still exists (e.g. after ZIP extraction)
            if (fs.existsSync(req.file.path)) {
                try {
                    fs.unlinkSync(req.file.path);
                } catch (e) {
                    console.warn(`[UPLOAD] Failed to cleanup temp file: ${req.file.path}`, e);
                }
            }
        }

        // Save to DB
        const result = await db.query(
            `INSERT INTO user_uploads (user_id, title, description, type, category, file_url, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [user_id, title, description, type, category, file_url, 'approved']
        );
        const item = result.rows[0];
        console.log(`[SECURITY] Community upload successful: ID ${item.id} | Author: ${req.user.name || 'Anonymous'} | Type: ${type}`);

        res.status(201).json({
            success: true,
            message: 'Content uploaded and published successfully!',
            item: item
        });

    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/user-uploads
router.get('/', async (req, res) => {
    try {
        const { category } = req.query;
        let query = 'SELECT u.*, users.name as author FROM user_uploads u JOIN users ON u.user_id = users.id WHERE u.status = $1';
        let params = ['approved'];

        if (category) {
            query += ' AND u.category = $2';
            params.push(category);
        }

        query += ' ORDER BY u.created_at DESC';
        const result = await db.query(query, params);
        res.json({ success: true, items: result.rows });
    } catch (error) {
        console.error('[DATABASE] Fetch Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch community items. Database error.' });
    }
});

module.exports = router;
