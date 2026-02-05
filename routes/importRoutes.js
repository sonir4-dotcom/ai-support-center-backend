const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const db = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');
const {
    calculateFolderSize,
    sanitizePath,
    validateStaticFiles,
    detectServerCode,
    countFiles,
    extractIcon
} = require('../utils/fileUtils');
const {
    downloadGitHubRepo,
    fetchUrlAssets,
    generateUniqueFolder
} = require('../utils/importHelpers');

// Multer configuration for ZIP uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/temp');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed') {
            cb(null, true);
        } else {
            cb(new Error('Only ZIP files allowed'));
        }
    }
});

// Helper: Auto-detect category from title and description
function detectCategory(title, description = '', files = []) {
    const text = `${title} ${description}`.toLowerCase();

    const categoryKeywords = {
        'game': ['game', 'play', 'puzzle', 'quiz', 'match', 'racing', 'adventure', 'arcade', 'shooter', 'strategy', 'memory', 'cards'],
        'tool': ['tool', 'calculator', 'converter', 'generator', 'builder', 'editor', 'utility', 'helper'],
        'tutorial': ['tutorial', 'guide', 'demo', 'example', 'walkthrough', 'learn', 'course'],
        'productivity': ['todo', 'notes', 'timer', 'planner', 'organizer', 'tracker']
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
        for (const keyword of keywords) {
            if (text.includes(keyword)) {
                return category;
            }
        }
    }

    return 'general';
}

// Helper: Generate slug
function generateSlug(title, id) {
    const baseSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50);

    const uniqueId = id.toString(36);
    return `${baseSlug}-${uniqueId}`;
}

// Helper: Process and validate extracted files
async function processImport(extractPath, title, description, userId, importMethod, sourceUrl = null) {
    try {
        // 0. Check for duplicate imports
        if (sourceUrl) {
            const duplicateCheck = await db.query(
                'SELECT id, title, slug FROM user_uploads WHERE source_url = $1 LIMIT 1',
                [sourceUrl]
            );

            if (duplicateCheck.rows.length > 0) {
                const existing = duplicateCheck.rows[0];
                throw new Error(`This source has already been imported as "${existing.title}" (slug: ${existing.slug})`);
            }
        }

        // 1. Get all files
        const allFiles = [];
        function getAllFiles(dir, baseDir = dir) {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const filePath = path.join(dir, file);
                const stats = fs.statSync(filePath);
                if (stats.isDirectory()) {
                    getAllFiles(filePath, baseDir);
                } else {
                    allFiles.push(path.relative(baseDir, filePath));
                }
            }
        }
        getAllFiles(extractPath);

        console.log(`[IMPORT] Found ${allFiles.length} files`);

        // 2. Validate static files
        const validation = validateStaticFiles(allFiles);
        if (!validation.valid) {
            throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
        }

        // 3. Check for index.html
        const hasIndex = allFiles.some(f => f.toLowerCase() === 'index.html' || f.toLowerCase().endsWith('/index.html'));
        if (!hasIndex) {
            throw new Error('index.html not found in uploaded files');
        }

        // 4. Check file count
        const fileCount = countFiles(extractPath);
        if (fileCount > 500) {
            throw new Error(`Too many files (${fileCount}). Maximum 500 files allowed.`);
        }

        // 5. Check for server code in JS files
        for (const file of allFiles) {
            if (file.endsWith('.js')) {
                const filePath = path.join(extractPath, file);
                if (detectServerCode(filePath)) {
                    throw new Error(`Server-side code detected in ${file}. Only static HTML/CSS/JS allowed.`);
                }
            }
        }

        // 6. Performance guard - check bundle size
        const bundleSize = calculateFolderSize(extractPath);
        const MAX_SIZE = 20 * 1024 * 1024; // 20MB hard limit
        const REVIEW_SIZE = 10 * 1024 * 1024; // 10MB review threshold

        console.log(`[IMPORT] Bundle size: ${(bundleSize / 1024 / 1024).toFixed(2)}MB`);

        if (bundleSize > MAX_SIZE) {
            throw new Error(`Bundle too large (${(bundleSize / 1024 / 1024).toFixed(2)}MB). Maximum 20MB allowed.`);
        }

        // 7. Determine status based on size
        let status = 'approved';
        if (bundleSize > REVIEW_SIZE) {
            status = 'pending';
            console.warn(`[IMPORT] Large bundle (${(bundleSize / 1024 / 1024).toFixed(2)}MB) - sending to manual review`);
        }

        // 8. Extract icon
        const iconPath = extractIcon(extractPath);
        console.log(`[IMPORT] Icon found: ${iconPath || 'none'}`);

        // 9. Detect category
        const autoCategory = detectCategory(title, description, allFiles);
        console.log(`[IMPORT] Auto-detected category: ${autoCategory}`);

        // 10. Generate placeholder thumbnail
        const thumbnailPath = generatePlaceholderThumbnail(autoCategory);
        console.log(`[IMPORT] Thumbnail: ${thumbnailPath}`);

        // 11. Find entry point
        let entryPoint = 'index.html';
        if (!allFiles.includes('index.html')) {
            entryPoint = allFiles.find(f => f.endsWith('/index.html')) || 'index.html';
        }

        // 12. Create database record
        const result = await db.query(
            `INSERT INTO user_uploads 
            (user_id, title, description, type, category, file_url, status, import_method, source_url, icon_path, thumbnail_path, auto_category, agreement_accepted, agreement_timestamp) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
            RETURNING *`,
            [
                userId,
                title,
                description,
                'html',
                autoCategory,
                `/uploads/community-apps/${path.basename(extractPath)}/${entryPoint}`,
                status,
                importMethod,
                sourceUrl,
                iconPath ? `/uploads/community-apps/${path.basename(extractPath)}/${iconPath}` : null,
                thumbnailPath,
                autoCategory,
                true,
                new Date()
            ]
        );

        // 13. Generate and update slug
        const uploadId = result.rows[0].id;
        const slug = generateSlug(title, uploadId);
        await db.query('UPDATE user_uploads SET slug = $1 WHERE id = $2', [slug, uploadId]);
        result.rows[0].slug = slug;

        return {
            success: true,
            item: result.rows[0],
            requiresReview: status === 'pending',
            bundleSize: (bundleSize / 1024 / 1024).toFixed(2) + 'MB'
        };

    } catch (error) {
        // Cleanup on error
        if (fs.existsSync(extractPath)) {
            fs.rmSync(extractPath, { recursive: true, force: true });
        }
        throw error;
    }
}

// ============================================
// POST /api/import/zip - ZIP Upload (Enhanced)
// ============================================
router.post('/zip', authMiddleware, (req, res, next) => {
    upload.single('file')(req, res, async (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
        } else if (err) {
            return res.status(400).json({ success: false, message: err.message });
        }

        try {
            const { title, description } = req.body;
            const user_id = req.user.id;

            if (!title) {
                return res.status(400).json({ success: false, message: 'Title required' });
            }

            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No file uploaded' });
            }

            // Generate unique folder
            const uniqueName = generateUniqueFolder();
            const communityBase = path.join(__dirname, '../public/uploads/community-apps');
            const targetDir = path.join(communityBase, uniqueName);

            // Extract ZIP
            const zip = new AdmZip(req.file.path);
            if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
            zip.extractAllTo(targetDir, true);

            // Process import
            const result = await processImport(targetDir, title, description, user_id, 'zip');

            // Cleanup temp file
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

            res.status(201).json({
                success: true,
                message: result.requiresReview ? 'Upload submitted for admin review!' : 'Published successfully!',
                item: result.item,
                requiresReview: result.requiresReview,
                bundleSize: result.bundleSize
            });

        } catch (error) {
            console.error('[IMPORT ZIP] Error:', error);
            if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            res.status(500).json({ success: false, message: error.message || 'Import failed' });
        }
    });
});

// ============================================
// POST /api/import/github - GitHub Repo Import
// ============================================
router.post('/github', authMiddleware, async (req, res) => {
    try {
        const { githubUrl, title, description } = req.body;
        const user_id = req.user.id;

        if (!githubUrl || !title) {
            return res.status(400).json({ success: false, message: 'GitHub URL and title required' });
        }

        // Validate GitHub URL format
        if (!githubUrl.includes('github.com')) {
            return res.status(400).json({ success: false, message: 'Invalid GitHub URL' });
        }

        console.log(`[GITHUB IMPORT] Starting: ${githubUrl}`);

        // Generate unique folder
        const uniqueName = generateUniqueFolder();
        const tempZipPath = path.join(__dirname, '../uploads/temp', `${uniqueName}.zip`);
        const communityBase = path.join(__dirname, '../public/uploads/community-apps');
        const targetDir = path.join(communityBase, uniqueName);

        // Download repo as ZIP
        await downloadGitHubRepo(githubUrl, tempZipPath);

        // Extract ZIP
        const zip = new AdmZip(tempZipPath);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        zip.extractAllTo(targetDir, true);

        // GitHub repos extract to a subfolder (repo-name-branch), move contents up
        const extracted = fs.readdirSync(targetDir);
        if (extracted.length === 1 && fs.statSync(path.join(targetDir, extracted[0])).isDirectory()) {
            const subDir = path.join(targetDir, extracted[0]);
            const files = fs.readdirSync(subDir);
            for (const file of files) {
                fs.renameSync(path.join(subDir, file), path.join(targetDir, file));
            }
            fs.rmdirSync(subDir);
        }

        // Process import
        const result = await processImport(targetDir, title, description, user_id, 'github', githubUrl);

        // Cleanup temp ZIP
        if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);

        res.status(201).json({
            success: true,
            message: result.requiresReview ? 'GitHub import submitted for review!' : 'Imported successfully!',
            item: result.item,
            requiresReview: result.requiresReview,
            bundleSize: result.bundleSize
        });

    } catch (error) {
        console.error('[GITHUB IMPORT] Error:', error);
        res.status(500).json({ success: false, message: error.message || 'GitHub import failed' });
    }
});

// ============================================
// POST /api/import/url - Direct URL Import
// ============================================
router.post('/url', authMiddleware, async (req, res) => {
    try {
        const { url, title, description } = req.body;
        const user_id = req.user.id;

        if (!url || !title) {
            return res.status(400).json({ success: false, message: 'URL and title required' });
        }

        // Validate URL format
        try {
            new URL(url);
        } catch {
            return res.status(400).json({ success: false, message: 'Invalid URL format' });
        }

        console.log(`[URL IMPORT] Starting: ${url}`);

        // Generate unique folder
        const uniqueName = generateUniqueFolder();
        const communityBase = path.join(__dirname, '../public/uploads/community-apps');
        const targetDir = path.join(communityBase, uniqueName);

        // Fetch URL and download assets
        await fetchUrlAssets(url, targetDir);

        // Process import
        const result = await processImport(targetDir, title, description, user_id, 'url', url);

        res.status(201).json({
            success: true,
            message: result.requiresReview ? 'URL import submitted for review!' : 'Imported successfully!',
            item: result.item,
            requiresReview: result.requiresReview,
            bundleSize: result.bundleSize
        });

    } catch (error) {
        console.error('[URL IMPORT] Error:', error);
        res.status(500).json({ success: false, message: error.message || 'URL import failed' });
    }
});

// ============================================
// POST /api/import/discover - AI Discovery
// ============================================
router.post('/discover', async (req, res) => {
    try {
        const { keywords } = req.body;

        if (!keywords || !keywords.trim()) {
            return res.status(400).json({ success: false, message: 'Keywords required' });
        }

        const searchTerms = keywords.toLowerCase().trim();
        console.log(`[AI DISCOVERY] Searching for: ${searchTerms}`);

        // Search in app_sources using keyword array
        const result = await db.query(`
            SELECT * FROM app_sources
            WHERE keywords && ARRAY[$1]::text[]
            OR LOWER(title) LIKE $2
            OR LOWER(description) LIKE $2
            ORDER BY 
                CASE 
                    WHEN LOWER(title) LIKE $2 THEN 1
                    WHEN keywords && ARRAY[$1]::text[] THEN 2
                    ELSE 3
                END
            LIMIT 10
        `, [searchTerms.split(' '), `%${searchTerms}%`]);

        res.json({
            success: true,
            suggestions: result.rows,
            count: result.rows.length
        });

    } catch (error) {
        console.error('[AI DISCOVERY] Error:', error);
        res.status(500).json({ success: false, message: 'Discovery search failed' });
    }
});

// ============================================
// POST /api/import/discover/import - One-click import from discovery
// ============================================
router.post('/discover/import', authMiddleware, async (req, res) => {
    try {
        const { sourceId, title, description } = req.body;
        const user_id = req.user.id;

        if (!sourceId) {
            return res.status(400).json({ success: false, message: 'Source ID required' });
        }

        // Get app source details
        const sourceResult = await db.query('SELECT * FROM app_sources WHERE id = $1', [sourceId]);

        if (sourceResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'App source not found' });
        }

        const source = sourceResult.rows[0];
        const finalTitle = title || source.title;
        const finalDescription = description || source.description;

        console.log(`[DISCOVERY IMPORT] Importing: ${source.title} from ${source.source_url}`);

        // Route to appropriate import method
        if (source.source_type === 'github') {
            // Use GitHub import logic
            const uniqueName = generateUniqueFolder();
            const tempZipPath = path.join(__dirname, '../uploads/temp', `${uniqueName}.zip`);
            const communityBase = path.join(__dirname, '../public/uploads/community-apps');
            const targetDir = path.join(communityBase, uniqueName);

            await downloadGitHubRepo(source.source_url, tempZipPath);

            const zip = new AdmZip(tempZipPath);
            if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
            zip.extractAllTo(targetDir, true);

            // Move contents from subfolder
            const extracted = fs.readdirSync(targetDir);
            if (extracted.length === 1 && fs.statSync(path.join(targetDir, extracted[0])).isDirectory()) {
                const subDir = path.join(targetDir, extracted[0]);
                const files = fs.readdirSync(subDir);
                for (const file of files) {
                    fs.renameSync(path.join(subDir, file), path.join(targetDir, file));
                }
                fs.rmdirSync(subDir);
            }

            const result = await processImport(targetDir, finalTitle, finalDescription, user_id, 'github', source.source_url);

            if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);

            res.status(201).json({
                success: true,
                message: 'App imported successfully from discovery!',
                item: result.item,
                requiresReview: result.requiresReview
            });

        } else if (source.source_type === 'url') {
            // Use URL import logic
            const uniqueName = generateUniqueFolder();
            const communityBase = path.join(__dirname, '../public/uploads/community-apps');
            const targetDir = path.join(communityBase, uniqueName);

            await fetchUrlAssets(source.source_url, targetDir);

            const result = await processImport(targetDir, finalTitle, finalDescription, user_id, 'url', source.source_url);

            res.status(201).json({
                success: true,
                message: 'App imported successfully from discovery!',
                item: result.item,
                requiresReview: result.requiresReview
            });
        } else {
            return res.status(400).json({ success: false, message: 'Unsupported source type' });
        }

    } catch (error) {
        console.error('[DISCOVERY IMPORT] Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Discovery import failed' });
    }
});

module.exports = router;
