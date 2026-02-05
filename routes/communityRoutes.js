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

// Helper to find or create category using keyword-based detection
async function findOrCreateCategory(type, title, description = '') {
    // Keyword mapping for intelligent category detection
    const categoryKeywords = {
        'game': ['game', 'play', 'puzzle', 'quiz', 'match', 'racing', 'adventure', 'arcade', 'shooter', 'strategy'],
        'video': ['video', 'tutorial', 'demo', 'guide', 'walkthrough', 'review', 'vlog', 'animation'],
        'tool': ['tool', 'calculator', 'converter', 'generator', 'builder', 'editor', 'utility', 'helper'],
        '3d': ['3d', 'three.js', 'webgl', 'three-dimensional', 'model', 'render'],
        'ai': ['ai', 'artificial intelligence', 'machine learning', 'neural', 'chatbot', 'gpt'],
        'education': ['learn', 'education', 'study', 'course', 'lesson', 'training', 'tutorial'],
        'productivity': ['productivity', 'task', 'todo', 'planner', 'organizer', 'schedule'],
        'entertainment': ['fun', 'entertainment', 'music', 'art', 'creative', 'design'],
        'finance': ['finance', 'money', 'budget', 'tax', 'emi', 'loan', 'investment'],
        'health': ['health', 'fitness', 'bmi', 'workout', 'exercise', 'nutrition']
    };

    // Combine title and description for better detection
    const searchText = `${title} ${description}`.toLowerCase();

    // Find matching category based on keywords
    let detectedCategory = 'general';
    let maxMatches = 0;

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
        const matches = keywords.filter(keyword => searchText.includes(keyword)).length;
        if (matches > maxMatches) {
            maxMatches = matches;
            detectedCategory = category;
        }
    }

    // Capitalize category name
    const categoryName = detectedCategory.charAt(0).toUpperCase() + detectedCategory.slice(1);
    const slug = detectedCategory;

    try {
        // Check if category exists
        let result = await db.query('SELECT id, name FROM categories WHERE slug = $1', [slug]);

        if (result.rows.length === 0) {
            // Auto-create new category
            console.log(`[CATEGORY] Auto-creating category: ${categoryName} (${slug})`);
            result = await db.query(
                'INSERT INTO categories (name, slug, type) VALUES ($1, $2, $3) RETURNING id, name',
                [categoryName, slug, type]
            );
        }

        return { id: result.rows[0].id, name: result.rows[0].name };
    } catch (e) {
        console.error('[CATEGORY ERR]', e);
        return null;
    }
}

// Helper to generate URL-friendly slug
function generateSlug(title, id) {
    const baseSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50); // Limit length

    // Add base36 encoded ID for uniqueness
    const uniqueId = id.toString(36);
    return `${baseSlug}-${uniqueId}`;
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
        const { title, description, external_link, agreementAccepted } = req.body;
        const user_id = req.user.id;

        // LEGAL ENFORCEMENT
        if (agreementAccepted !== true && agreementAccepted !== 'true') {
            return res.status(403).json({
                success: false,
                message: 'You must accept the legal agreement before uploading.'
            });
        }

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

                // PERFORMANCE GUARD: Check bundle size
                const { calculateFolderSize } = require('../utils/fileUtils');
                const bundleSize = calculateFolderSize(targetDir);
                const MAX_BUNDLE_SIZE = 10 * 1024 * 1024; // 10MB

                console.log(`[PERFORMANCE] Bundle size: ${(bundleSize / 1024 / 1024).toFixed(2)}MB`);

                // If bundle exceeds 10MB, mark for manual review
                let uploadStatus = 'approved';
                if (bundleSize > MAX_BUNDLE_SIZE) {
                    uploadStatus = 'pending';
                    console.warn(`[PERFORMANCE] Large bundle detected (${(bundleSize / 1024 / 1024).toFixed(2)}MB) - sending to admin review`);
                }

                categoryName = fileList.some(name => name.includes('game') || name.includes('canvas')) ? 'Game' : 'Tool';
                let entryPoint = fileList.includes('index.html') ? 'index.html' : fileList.find(f => f.endsWith('/index.html'));
                file_url = `/uploads/community/tools/${uniqueName}/${entryPoint}`;

                // Store upload status for later use
                type = 'html';
                // We'll use uploadStatus variable below
            } else {
                // STRICT VIDEO MIME TYPE VALIDATION
                const allowedVideoMimes = [
                    'video/mp4',
                    'video/webm',
                    'video/ogg',
                    'video/x-matroska',
                    'video/quicktime'
                ];

                if (!allowedVideoMimes.includes(req.file.mimetype)) {
                    // Clean up temp file
                    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
                    return res.status(400).json({
                        success: false,
                        message: `Invalid video format. Allowed: MP4, WebM, OGG, MKV, MOV. Received: ${req.file.mimetype}`
                    });
                }

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

        const categoryResult = await findOrCreateCategory(type, title, description || '');
        const category_id = categoryResult ? categoryResult.id : null;
        const detectedCategoryName = categoryResult ? categoryResult.name : 'General';

        // Use uploadStatus if defined (from bundle size check), otherwise default to 'pending'
        const finalStatus = typeof uploadStatus !== 'undefined' ? uploadStatus : 'pending';

        const result = await db.query(
            `INSERT INTO user_uploads (user_id, title, description, type, category, category_id, file_url, status, agreement_accepted, agreement_timestamp) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [user_id, title, description, type, detectedCategoryName, category_id, file_url, finalStatus, true, new Date()]
        );

        res.status(201).json({
            success: true,
            message: finalStatus === 'pending' ? 'Upload submitted for admin review!' : 'Published successfully!',
            item: result.rows[0],
            requiresReview: finalStatus === 'pending'
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

// GET /api/community/app/:slug - Get single app by slug
router.get('/app/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const result = await db.query(
            `SELECT u.*, usr.username as author 
             FROM user_uploads u 
             LEFT JOIN users usr ON u.user_id = usr.id 
             WHERE u.slug = $1 AND u.status = 'approved'`,
            [slug]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Content not found' });
        }

        // Increment play count
        await db.query('UPDATE user_uploads SET play_count = play_count + 1 WHERE slug = $1', [slug]);

        res.json({ success: true, item: result.rows[0] });
    } catch (error) {
        console.error('[COMMUNITY] Error fetching app by slug:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch content' });
    }
});

// POST /api/community/play/:id - Track app play
router.post('/play/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id || null;

        // Increment play count
        await db.query(
            'UPDATE user_uploads SET play_count = play_count + 1 WHERE id = $1',
            [id]
        );

        // Log activity
        await db.query(
            'INSERT INTO app_activity (upload_id, activity_type, user_id) VALUES ($1, $2, $3)',
            [id, 'play', userId]
        );

        res.json({ success: true, message: 'Play tracked' });
    } catch (error) {
        console.error('[COMMUNITY] Error tracking play:', error);
        res.status(500).json({ success: false, message: 'Failed to track play' });
    }
});

// POST /api/community/like/:id - Like an app
router.post('/like/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Check if already liked
        const existingLike = await db.query(
            'SELECT id FROM app_activity WHERE upload_id = $1 AND user_id = $2 AND activity_type = $3',
            [id, userId, 'like']
        );

        if (existingLike.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'Already liked' });
        }

        // Increment likes
        await db.query(
            'UPDATE user_uploads SET likes = likes + 1 WHERE id = $1',
            [id]
        );

        // Log activity
        await db.query(
            'INSERT INTO app_activity (upload_id, activity_type, user_id) VALUES ($1, $2, $3)',
            [id, 'like', userId]
        );

        res.json({ success: true, message: 'Liked successfully' });
    } catch (error) {
        console.error('[COMMUNITY] Error liking app:', error);
        res.status(500).json({ success: false, message: 'Failed to like app' });
    }
});

// GET /api/community/trending - Get trending apps
router.get('/trending', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT * FROM user_uploads 
            WHERE status = 'approved' 
            AND (visible IS NULL OR visible = true)
            ORDER BY trending_score DESC, created_at DESC
            LIMIT 10
        `);

        res.json({ success: true, uploads: result.rows });
    } catch (error) {
        console.error('[COMMUNITY] Error fetching trending:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch trending apps' });
    }
});

module.exports = router;
