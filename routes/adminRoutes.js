const express = require('express');
const router = express.Router();
const db = require('../config/db');
const fs = require('fs');
const path = require('path');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// --- BOOTSTRAP (TEMPORARY FOR SHELL-RESTRICTED ENVIRONMENTS) ---

// POST /api/admin/bootstrap - Promote user to first admin if none exist
router.post('/bootstrap', authMiddleware, async (req, res) => {
    try {
        const existingAdmin = await db.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");

        if (existingAdmin.rows.length > 0) {
            return res.status(403).json({
                success: false,
                message: 'Admin already exists'
            });
        }

        await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [req.user.id]);

        res.json({ success: true });
    } catch (error) {
        console.error('[ADMIN] Bootstrap error:', error);
        res.status(500).json({ success: false, message: 'Internal server error during bootstrap' });
    }
});

// PROTECT ALL OTHER ADMIN ROUTES
router.use(authMiddleware, adminMiddleware);

// --- USER MANAGEMENT ---

// GET /api/admin/users - List all users
router.get('/users', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT id, name, email, role, is_suspended, created_at,
            (SELECT COUNT(*) FROM user_uploads WHERE user_id = users.id) as upload_count
            FROM users ORDER BY created_at DESC
        `);
        res.json({ success: true, users: result.rows });
    } catch (error) {
        console.error('[ADMIN] Fetch Users error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
});

// DELETE /api/admin/users/:id - Delete user and ALL their content
router.delete('/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;

        // 1. Get all uploads to clean up files
        const uploads = await db.query('SELECT file_url FROM user_uploads WHERE user_id = $1', [userId]);

        // 2. Cleanup files
        for (const upload of uploads.rows) {
            const relativePath = upload.file_url;
            if (relativePath.startsWith('/uploads/')) {
                const fullPath = path.join(__dirname, '..', relativePath);
                // Check if it's a file or directory (tools are dirs)
                if (fs.existsSync(fullPath)) {
                    if (fs.lstatSync(fullPath).isDirectory()) {
                        fs.rmSync(fullPath, { recursive: true, force: true });
                    } else {
                        fs.unlinkSync(fullPath);
                    }
                }
            }
        }

        // 3. Delete from DB (on cascade handles user_uploads and resumes)
        await db.query('DELETE FROM users WHERE id = $1', [userId]);

        res.json({ success: true, message: 'User and all associated content deleted permanently.' });
    } catch (error) {
        console.error('[ADMIN] Delete User error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete user' });
    }
});

// PATCH /api/admin/users/:id/suspend - Toggle suspension
router.patch('/users/:id/suspend', async (req, res) => {
    try {
        const { is_suspended } = req.body;
        const userId = req.params.id;
        await db.query('UPDATE users SET is_suspended = $1 WHERE id = $2', [is_suspended, userId]);
        res.json({ success: true, message: `User ${is_suspended ? 'suspended' : 'activated'} successfully.` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update user status' });
    }
});

// --- CONTENT MANAGEMENT ---

// GET /api/admin/uploads - List all uploads for moderation
router.get('/uploads', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT u.*, users.name as author, users.email as author_email, c.name as category_name
            FROM user_uploads u
            JOIN users ON u.user_id = users.id
            LEFT JOIN categories c ON u.category_id = c.id
            ORDER BY u.created_at DESC
        `);
        res.json({ success: true, uploads: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch uploads' });
    }
});

// DELETE /api/admin/uploads/:id - Delete specific content
router.delete('/uploads/:id', async (req, res) => {
    try {
        const uploadId = req.params.id;
        const uploadRes = await db.query('SELECT file_url FROM user_uploads WHERE id = $1', [uploadId]);

        if (uploadRes.rows.length === 0) return res.status(404).json({ message: 'Upload not found' });

        const file_url = uploadRes.rows[0].file_url;
        const fullPath = path.join(__dirname, '..', file_url);

        if (fs.existsSync(fullPath)) {
            if (fs.lstatSync(fullPath).isDirectory()) {
                fs.rmSync(fullPath, { recursive: true, force: true });
            } else {
                fs.unlinkSync(fullPath);
            }
        }

        await db.query('DELETE FROM user_uploads WHERE id = $1', [uploadId]);
        res.json({ success: true, message: 'Content deleted successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Deletion failed' });
    }
});

// --- CATEGORY MANAGEMENT ---

// POST /api/admin/categories - Create Category
router.post('/categories', async (req, res) => {
    try {
        const { name, slug, type } = req.body;
        const result = await db.query(
            'INSERT INTO categories (name, slug, type) VALUES ($1, $2, $3) RETURNING *',
            [name, slug, type]
        );
        res.status(201).json({ success: true, category: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create category' });
    }
});

// DELETE /api/admin/categories/:id - Delete Category
router.delete('/categories/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Category deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete category' });
    }
});

module.exports = router;
