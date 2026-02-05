const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');
const {
    validateImageFile,
    processUploadedImage
} = require('../utils/imageUtils');

// Multer configuration for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const tempDir = path.join(__dirname, '../uploads/temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        cb(null, tempDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `img-${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        try {
            validateImageFile(file);
            cb(null, true);
        } catch (error) {
            cb(error);
        }
    }
});

// Auto-detect category from title and description
function detectImageCategory(title, description = '') {
    const keywords = {
        'space': ['planet', 'galaxy', 'star', 'nebula', 'cosmos', 'astronomy', 'universe', 'moon'],
        'india': ['temple', 'taj', 'india', 'hindi', 'delhi', 'mumbai', 'indian', 'ganga', 'himalaya'],
        'nature': ['nature', 'forest', 'mountain', 'ocean', 'landscape', 'wildlife', 'tree', 'river', 'sunset'],
        'tech': ['ai', 'tech', 'robot', 'code', 'digital', 'cyber', 'computer', 'software', 'algorithm'],
        'abstract': ['abstract', 'pattern', 'geometric', 'minimal', 'design', 'art'],
        'people': ['person', 'portrait', 'people', 'human', 'face', 'smile', 'family'],
        'food': ['food', 'recipe', 'cooking', 'dish', 'meal', 'cuisine', 'restaurant'],
        'architecture': ['building', 'architecture', 'city', 'urban', 'skyscraper', 'bridge'],
        'animals': ['animal', 'pet', 'dog', 'cat', 'bird', 'wildlife', 'zoo'],
        'travel': ['travel', 'vacation', 'destination', 'tourism', 'adventure', 'explore']
    };

    const text = (title + ' ' + description).toLowerCase();

    for (const [category, words] of Object.entries(keywords)) {
        if (words.some(word => text.includes(word))) {
            return category;
        }
    }

    return 'general';
}

// Generate unique slug
function generateSlug(title) {
    const baseSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50);

    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `${baseSlug}-${randomSuffix}`;
}

// POST /api/images/upload - Upload new image
router.post('/upload', authMiddleware, upload.single('image'), async (req, res) => {
    try {
        // RATE LIMITING: Check daily upload limit
        const MAX_DAILY_UPLOADS = parseInt(process.env.MAX_DAILY_IMAGE_UPLOADS) || 10;

        // Count user's uploads in the last 24 hours
        const limitCheck = await db.query(`
            SELECT COUNT(*) as count 
            FROM community_images 
            WHERE uploader_id = $1 
            AND created_at > NOW() - INTERVAL '24 hours'
        `, [req.user.id]);

        const dailyCount = parseInt(limitCheck.rows[0].count);

        if (dailyCount >= MAX_DAILY_UPLOADS) {
            // Delete the uploaded file since we're rejecting the request
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            return res.status(429).json({
                success: false,
                message: `Daily upload limit reached (${MAX_DAILY_UPLOADS} images/day). Please try again tomorrow.`
            });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No image file uploaded' });
        }

        const { title, description, category: userCategory } = req.body;

        if (!title || title.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Title is required' });
        }

        // Generate UUID for storage
        const uuid = uuidv4();

        // Process image (EXIF strip, thumbnail, metadata)
        const baseDir = path.join(__dirname, '..');
        const processedData = await processUploadedImage(req.file.path, uuid, baseDir);

        // Auto-detect category if not provided
        const detectedCategory = userCategory || detectImageCategory(title, description);

        // Generate slug
        const slug = generateSlug(title);

        // Get user info
        const userResult = await db.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
        const creatorName = userResult.rows[0]?.name || 'Anonymous';

        // Insert into database
        const result = await db.query(`
            INSERT INTO community_images (
                title, description, image_path, thumbnail_path, category, slug,
                uploader_id, creator_name, width, height, file_size,
                orientation, dominant_color, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id, slug
        `, [
            title.trim(),
            description?.trim() || null,
            processedData.imagePath,
            processedData.thumbnailPath,
            detectedCategory,
            slug,
            req.user.id,
            creatorName,
            processedData.width,
            processedData.height,
            processedData.fileSize,
            processedData.orientation,
            processedData.dominantColor,
            'pending' // All uploads start as pending
        ]);

        console.log(`[IMAGE_UPLOAD] User ${req.user.id} uploaded image: ${title} (${slug})`);

        res.json({
            success: true,
            message: 'Image uploaded successfully. Pending admin approval.',
            image: {
                id: result.rows[0].id,
                slug: result.rows[0].slug,
                status: 'pending'
            }
        });

    } catch (error) {
        console.error('[IMAGE_UPLOAD] Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to upload image'
        });
    }
});

// GET /api/images/feed - Get image feed with pagination (THUMBNAIL ONLY)
router.get('/feed', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const category = req.query.category;

        let query = `
            SELECT 
                id, title, description, thumbnail_path, category, slug,
                creator_name, likes, downloads, view_count, orientation,
                dominant_color, created_at, width, height
            FROM community_images
            WHERE status = 'approved' AND (visible IS NULL OR visible = true)
        `;

        const params = [];

        if (category && category !== 'all') {
            params.push(category);
            query += ` AND category = $${params.length}`;
        }

        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await db.query(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM community_images WHERE status = \'approved\' AND (visible IS NULL OR visible = true)';
        if (category && category !== 'all') {
            countQuery += ` AND category = '${category}'`;
        }
        const countResult = await db.query(countQuery);
        const total = parseInt(countResult.rows[0].count);

        res.json({
            success: true,
            images: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: (page * limit) < total
            }
        });

    } catch (error) {
        console.error('[IMAGE_FEED] Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch images' });
    }
});

// GET /api/images/:slug - Get single image details (FULL SIZE)
router.get('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;

        const result = await db.query(`
            SELECT * FROM community_images
            WHERE slug = $1 AND status = 'approved' AND (visible IS NULL OR visible = true)
        `, [slug]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Image not found' });
        }

        res.json({ success: true, image: result.rows[0] });

    } catch (error) {
        console.error('[IMAGE_DETAIL] Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch image' });
    }
});

// POST /api/images/:id/view - Track view count
router.post('/:id/view', async (req, res) => {
    try {
        const { id } = req.params;

        await db.query(
            'UPDATE community_images SET view_count = view_count + 1 WHERE id = $1',
            [id]
        );

        res.json({ success: true });

    } catch (error) {
        console.error('[IMAGE_VIEW] Error:', error);
        res.status(500).json({ success: false, message: 'Failed to track view' });
    }
});

// POST /api/images/:id/like - Like image
router.post('/:id/like', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Check for existing like to prevent spam/duplicate XP
        const existingLike = await db.query(
            'SELECT 1 FROM user_image_likes WHERE user_id = $1 AND image_id = $2',
            [req.user.id, id]
        );

        if (existingLike.rows.length > 0) {
            return res.json({ success: true, message: 'Already liked' });
        }

        // 2. Register Like
        await db.query(
            'INSERT INTO user_image_likes (user_id, image_id) VALUES ($1, $2)',
            [req.user.id, id]
        );

        // 3. Increment Image Likes Count
        const result = await db.query(
            'UPDATE community_images SET likes = likes + 1 WHERE id = $1 RETURNING uploader_id',
            [id]
        );

        if (result.rows.length > 0) {
            const uploaderId = result.rows[0].uploader_id;

            // 4. Award XP to Creator (only if not self-like, optional but good practice)
            if (uploaderId !== req.user.id) {
                await db.query(`
                    UPDATE users 
                    SET xp_points = COALESCE(xp_points, 0) + 5, 
                        total_likes = COALESCE(total_likes, 0) + 1,
                        level = FLOOR((COALESCE(xp_points, 0) + 5) / 1000) + 1
                    WHERE id = $1
                `, [uploaderId]);
            }
        }

        res.json({ success: true, message: 'Image liked' });

    } catch (error) {
        console.error('[IMAGE_LIKE] Error:', error);
        res.status(500).json({ success: false, message: 'Failed to like image' });
    }
});

// POST /api/images/:id/download - Track download
router.post('/:id/download', async (req, res) => {
    try {
        const { id } = req.params;

        await db.query(
            'UPDATE community_images SET downloads = downloads + 1 WHERE id = $1',
            [id]
        );

        res.json({ success: true });

    } catch (error) {
        console.error('[IMAGE_DOWNLOAD] Error:', error);
        res.status(500).json({ success: false, message: 'Failed to track download' });
    }
});

// GET /api/images/trending - Get trending images
router.get('/api/trending', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                id, title, description, thumbnail_path, category, slug,
                creator_name, likes, downloads, view_count, orientation,
                dominant_color, created_at
            FROM community_images
            WHERE status = 'approved' AND (visible IS NULL OR visible = true)
            ORDER BY (downloads * 3 + likes * 2 + view_count) DESC
            LIMIT 20
        `);

        res.json({ success: true, images: result.rows });

    } catch (error) {
        console.error('[IMAGE_TRENDING] Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch trending images' });
    }
});

// GET /api/images/categories - Get all categories
router.get('/api/categories', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT category, COUNT(*) as count
            FROM community_images
            WHERE status = 'approved' AND (visible IS NULL OR visible = true)
            GROUP BY category
            ORDER BY count DESC
        `);

        res.json({ success: true, categories: result.rows });

    } catch (error) {
        console.error('[IMAGE_CATEGORIES] Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch categories' });
    }
});

module.exports = router;
