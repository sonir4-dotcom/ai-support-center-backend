const express = require('express');
const router = express.Router();
const db = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');

// GET /api/recommendations - AI-powered recommendations
router.get('/', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        // 1. Get user's recent activity
        const recentActivity = await db.query(`
            SELECT DISTINCT upload_id, activity_type 
            FROM app_activity 
            WHERE user_id = $1 
            ORDER BY created_at DESC 
            LIMIT 10
        `, [userId]);

        // 2. Get categories user has interacted with
        const userCategories = await db.query(`
            SELECT DISTINCT u.category 
            FROM app_activity a
            JOIN user_uploads u ON a.upload_id = u.id
            WHERE a.user_id = $1 AND u.category IS NOT NULL
            LIMIT 5
        `, [userId]);

        const categories = userCategories.rows.map(r => r.category);

        // 3. Recommended For You (same categories + high trending)
        const recommended = await db.query(`
            SELECT * FROM user_uploads
            WHERE status = 'approved' 
            AND (visible IS NULL OR visible = true)
            AND category = ANY($1::text[])
            AND id NOT IN (
                SELECT upload_id FROM app_activity WHERE user_id = $2
            )
            ORDER BY trending_score DESC, created_at DESC
            LIMIT 6
        `, [categories.length > 0 ? categories : ['general'], userId]);

        // 4. Because You Played... (similar to recently played)
        let becauseYouPlayed = [];
        if (recentActivity.rows.length > 0) {
            const recentPlayedIds = recentActivity.rows
                .filter(a => a.activity_type === 'play')
                .map(a => a.upload_id)
                .slice(0, 3);

            if (recentPlayedIds.length > 0) {
                const recentApp = await db.query(
                    'SELECT category FROM user_uploads WHERE id = $1',
                    [recentPlayedIds[0]]
                );

                if (recentApp.rows.length > 0) {
                    const similarApps = await db.query(`
                        SELECT * FROM user_uploads
                        WHERE status = 'approved'
                        AND (visible IS NULL OR visible = true)
                        AND category = $1
                        AND id != ALL($2::int[])
                        ORDER BY trending_score DESC
                        LIMIT 6
                    `, [recentApp.rows[0].category, recentPlayedIds]);

                    becauseYouPlayed = similarApps.rows;
                }
            }
        }

        // 5. Similar Tools (top apps by category)
        const similarByCategory = {};
        for (const category of categories.slice(0, 3)) {
            const apps = await db.query(`
                SELECT * FROM user_uploads
                WHERE status = 'approved'
                AND (visible IS NULL OR visible = true)
                AND category = $1
                ORDER BY trending_score DESC, play_count DESC
                LIMIT 4
            `, [category]);

            if (apps.rows.length > 0) {
                similarByCategory[category] = apps.rows;
            }
        }

        // 6. Fallback: Popular apps if no user activity
        let fallbackPopular = [];
        if (categories.length === 0) {
            const popular = await db.query(`
                SELECT * FROM user_uploads
                WHERE status = 'approved'
                AND (visible IS NULL OR visible = true)
                ORDER BY play_count DESC, likes DESC
                LIMIT 6
            `);
            fallbackPopular = popular.rows;
        }

        res.json({
            success: true,
            recommendations: {
                forYou: recommended.rows.length > 0 ? recommended.rows : fallbackPopular,
                becauseYouPlayed: becauseYouPlayed,
                similarByCategory: similarByCategory,
                hasActivity: recentActivity.rows.length > 0
            }
        });

    } catch (error) {
        console.error('[RECOMMENDATIONS] Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch recommendations' });
    }
});

// GET /api/recommendations/popular - Popular this week
router.get('/popular', async (req, res) => {
    try {
        // Get apps with high activity in last 7 days
        const result = await db.query(`
            SELECT u.*, COUNT(a.id) as recent_activity
            FROM user_uploads u
            LEFT JOIN app_activity a ON u.id = a.upload_id 
                AND a.created_at > NOW() - INTERVAL '7 days'
            WHERE u.status = 'approved'
            AND (u.visible IS NULL OR u.visible = true)
            GROUP BY u.id
            ORDER BY recent_activity DESC, u.trending_score DESC
            LIMIT 12
        `);

        res.json({ success: true, apps: result.rows });
    } catch (error) {
        console.error('[RECOMMENDATIONS] Error fetching popular:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch popular apps' });
    }
});

module.exports = router;
