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
        const allowedExts = ['.zip', '.mp4', '.webm', '.ogg', '.mov', '.mkv', '.avi', '.m4v'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExts.includes(ext)) {
            return cb(null, true);
        }
        cb(new Error('Only ZIP files and common Video files are allowed!'));
    }
});

// POST /api/community/upload
router.post('/upload', authMiddleware, (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            console.error('[MULTER ERROR]', err);
            return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
        } else if (err) {
            console.error('[UPLOAD ERROR]', err);
            return res.status(400).json({ success: false, message: err.message });
        }
        next();
    });
}, async (req, res) => {
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
                // Extraction path per requirement: /uploads/community/tools/{uploadId}/
                const targetDir = path.join(communityBase, 'tools', uniqueName);
                console.log(`[UPLOAD] Extracting ZIP to: ${targetDir}`);

                // Extract ZIP
                const zip = new AdmZip(req.file.path);
                const entries = zip.getEntries();
                const fileList = entries.map(e => e.entryName.toLowerCase().replace(/\\/g, '/'));

                // MANDATORY: ZIP must contain index.html
                if (!fileList.includes('index.html') && !fileList.some(f => f.endsWith('/index.html'))) {
                    // Try to find ANY html file as fallback? No, requirement says: "Reject ZIP without index.html"
                    return res.status(400).json({ success: false, message: 'ZIP must contain index.html at root or within a folder.' });
                }

                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }
                zip.extractAllTo(targetDir, true);

                // Auto-categorization
                if (fileList.some(name => name.includes('game') || name.includes('canvas'))) category = 'Game';
                else category = 'Tool';

                let entryPoint = 'index.html';
                if (!fileList.includes('index.html')) {
                    // Find where index.html is
                    const foundIndex = fileList.find(f => f.endsWith('/index.html'));
                    if (foundIndex) entryPoint = foundIndex;
                }

                file_url = `/uploads/community/tools/${uniqueName}/${entryPoint}`;
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

// GET /api/community/list
router.get('/list', async (req, res) => {
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
