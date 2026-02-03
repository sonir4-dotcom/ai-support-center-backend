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

// Helper to find or create category
async function findOrCreateCategory(type, title) {
    let slug = 'tool';
    let name = 'Tools';
    let ctype = 'tool';

    if (type === 'video') {
        slug = 'video';
        name = 'Videos';
        ctype = 'video';
    } else if (type === 'html') {
        slug = 'game';
        name = 'Games';
        ctype = 'game';
    } else if (title.toLowerCase().includes('tutorial')) {
        slug = 'tutorial';
        name = 'Tutorials';
        ctype = 'tutorial';
    }

    try {
        const res = await db.query('SELECT id FROM categories WHERE slug = $1', [slug]);
        if (res.rows.length > 0) return res.rows[0].id;

        const insert = await db.query('INSERT INTO categories (name, slug, type) VALUES ($1, $2, $3) RETURNING id', [name, slug, ctype]);
        return insert.rows[0].id;
    } catch (e) {
        console.error('[CATEGORY ERR]', e);
        return null;
    }
}

// GET /api/community/categories
router.get('/categories', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM categories ORDER BY id ASC');
        res.json({ success: true, categories: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch categories' });
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
        let categoryName = 'Tool';

        if (req.file) {
            console.log(`[UPLOAD] Processing file: ${req.file.originalname} (${req.file.mimetype})`);
            const ext = path.extname(req.file.originalname).toLowerCase();
            const uniqueName = `community-${Date.now()}`;
            const communityBase = path.resolve(__dirname, '../uploads/community');

            if (ext === '.zip') {
                type = 'html';
                const targetDir = path.join(communityBase, 'tools', uniqueName);
                const zip = new AdmZip(req.file.path);
                const entries = zip.getEntries();
                const fileList = entries.map(e => e.entryName.toLowerCase().replace(/\\/g, '/'));

                if (!fileList.includes('index.html') && !fileList.some(f => f.endsWith('/index.html'))) {
                    return res.status(400).json({ success: false, message: 'ZIP must contain index.html' });
                }

                if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
                zip.extractAllTo(targetDir, true);

                categoryName = fileList.some(name => name.includes('game') || name.includes('canvas')) ? 'Game' : 'Tool';
                let entryPoint = fileList.includes('index.html') ? 'index.html' : fileList.find(f => f.endsWith('/index.html'));
                file_url = `/uploads/community/tools/${uniqueName}/${entryPoint}`;
            } else {
                type = 'video';
                categoryName = 'Tutorial';
                const videoDir = path.join(communityBase, 'videos');
                if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });
                const finalName = `${Date.now()}-${req.file.filename}`;
                fs.renameSync(req.file.path, path.join(videoDir, finalName));
                file_url = `/uploads/community/videos/${finalName}`;
            }

            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        }

        const category_id = await findOrCreateCategory(type, title);

        const result = await db.query(
            `INSERT INTO user_uploads (user_id, title, description, type, category, category_id, file_url, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [user_id, title, description, type, categoryName, category_id, file_url, 'approved']
        );

        res.status(201).json({ success: true, message: 'Published successfully!', item: result.rows[0] });
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/community/list
router.get('/list', async (req, res) => {
    try {
        const { category } = req.query;
        let query = `
            SELECT u.*, users.name as author, c.name as category_name, c.slug as category_slug 
            FROM user_uploads u 
            JOIN users ON u.user_id = users.id 
            LEFT JOIN categories c ON u.category_id = c.id 
            WHERE u.status = $1
        `;
        let params = ['approved'];

        if (category && category !== 'all') {
            query += ' AND (c.slug = $2 OR c.type = $2)';
            params.push(category);
        }

        query += ' ORDER BY u.created_at DESC';
        const result = await db.query(query, params);
        res.json({ success: true, items: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

module.exports = router;
