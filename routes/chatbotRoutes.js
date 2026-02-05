const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { chatbotSearchLimiter, chatbotIntentLimiter } = require('../middleware/rateLimiters');

// POST /api/chatbot/search-community - Search community apps for chatbot
router.post('/search-community', chatbotSearchLimiter, async (req, res) => {
    try {
        const { query } = req.body;

        if (!query || query.trim().length < 2) {
            return res.json({ success: true, results: [] });
        }

        const searchTerm = query.toLowerCase().trim();

        // Search approved apps by title, description, or category
        const result = await db.query(`
            SELECT id, title, description, category, slug, icon_path, import_method
            FROM user_uploads
            WHERE status = 'approved'
            AND (visible IS NULL OR visible = true)
            AND (
                LOWER(title) LIKE $1
                OR LOWER(description) LIKE $1
                OR LOWER(category) LIKE $1
            )
            ORDER BY 
                CASE 
                    WHEN LOWER(title) LIKE $1 THEN 1
                    WHEN LOWER(category) LIKE $1 THEN 2
                    ELSE 3
                END,
                trending_score DESC
            LIMIT 5
        `, [`%${searchTerm}%`]);

        res.json({
            success: true,
            results: result.rows.map(app => ({
                id: app.id,
                title: app.title,
                description: app.description,
                category: app.category,
                slug: app.slug,
                url: `/community/app/${app.slug}`,
                icon: app.icon_path,
                source: app.import_method
            }))
        });

    } catch (error) {
        console.error('[CHATBOT] Search error:', error);
        res.status(500).json({ success: false, message: 'Search failed' });
    }
});

// POST /api/chatbot/intent - Detect community app intent
router.post('/intent', chatbotIntentLimiter, async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.json({ success: true, intent: null });
        }

        const msg = message.toLowerCase();

        // Detect intent patterns
        const openPatterns = ['open', 'launch', 'start', 'run', 'play', 'show me'];
        const hasOpenIntent = openPatterns.some(pattern => msg.includes(pattern));

        if (!hasOpenIntent) {
            return res.json({ success: true, intent: null });
        }

        // Extract app name (remove intent words)
        let appQuery = msg;
        openPatterns.forEach(pattern => {
            appQuery = appQuery.replace(pattern, '').trim();
        });

        // Remove common words
        const stopWords = ['the', 'a', 'an', 'app', 'game', 'tool'];
        appQuery = appQuery.split(' ').filter(word => !stopWords.includes(word)).join(' ');

        if (appQuery.length < 2) {
            return res.json({ success: true, intent: null });
        }

        // Search for matching app
        const result = await db.query(`
            SELECT id, title, slug, category, icon_path
            FROM user_uploads
            WHERE status = 'approved'
            AND (visible IS NULL OR visible = true)
            AND (
                LOWER(title) LIKE $1
                OR LOWER(category) LIKE $1
            )
            ORDER BY 
                CASE WHEN LOWER(title) LIKE $1 THEN 1 ELSE 2 END,
                trending_score DESC
            LIMIT 1
        `, [`%${appQuery}%`]);

        if (result.rows.length > 0) {
            const app = result.rows[0];
            return res.json({
                success: true,
                intent: 'open_community_app',
                app: {
                    id: app.id,
                    title: app.title,
                    slug: app.slug,
                    category: app.category,
                    url: `/community/app/${app.slug}`,
                    icon: app.icon_path
                }
            });
        }

        res.json({ success: true, intent: null });

    } catch (error) {
        console.error('[CHATBOT] Intent detection error:', error);
        res.status(500).json({ success: false, message: 'Intent detection failed' });
    }
});

module.exports = router;
