const fs = require('fs');
const path = require('path');
const db = require('../config/db');

/**
 * Image Cleanup Utility
 * Scans storage for orphaned image folders and removes them
 */

async function cleanOrphanedImages() {
    console.log('[CLEANUP] Starting image storage cleanup...');
    const storageDir = path.join(__dirname, '../public/community-images');

    if (!fs.existsSync(storageDir)) {
        console.log('[CLEANUP] Storage directory does not exist. Nothing to clean.');
        return { deleted: 0, errors: 0 };
    }

    try {
        // Get all folder names (UUIDs) from storage
        const folders = fs.readdirSync(storageDir).filter(file => {
            return fs.statSync(path.join(storageDir, file)).isDirectory();
        });

        console.log(`[CLEANUP] Found ${folders.length} folders in storage.`);

        if (folders.length === 0) {
            return { deleted: 0, errors: 0 };
        }

        // Get all valid UUIDs from database
        // We use ANY to pass the array of folders effectively, but let's just fetch all valid UUIDs 
        // derived from the image paths in the DB for simplicity and safety

        const dbResult = await db.query('SELECT image_path FROM community_images');
        const validUUIDs = new Set();

        dbResult.rows.forEach(row => {
            // image_path format: /community-images/<uuid>/original.webp
            const parts = row.image_path.split('/');
            // parts[0] is empty, parts[1] is 'community-images', parts[2] is UUID
            if (parts.length >= 3) {
                validUUIDs.add(parts[2]);
            }
        });

        console.log(`[CLEANUP] Found ${validUUIDs.size} valid image records in DB.`);

        let deletedCount = 0;
        let errorCount = 0;

        for (const folder of folders) {
            // If folder UUID is NOT in valid UUIDs list, it's an orphan
            if (!validUUIDs.has(folder)) {
                // Double check it looks like a UUID to avoid deleting system folders by accident
                // Simple regex for basic UUID-like structure (8-4-4-4-12)
                if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(folder)) {
                    const folderPath = path.join(storageDir, folder);
                    try {
                        console.log(`[CLEANUP] Removing orphaned folder: ${folder}`);
                        fs.rmSync(folderPath, { recursive: true, force: true });
                        deletedCount++;
                    } catch (err) {
                        console.error(`[CLEANUP] Failed to remove ${folder}:`, err.message);
                        errorCount++;
                    }
                } else {
                    console.warn(`[CLEANUP] Skipping non-UUID folder: ${folder}`);
                }
            }
        }

        console.log(`[CLEANUP] Complete. Deleted ${deletedCount} orphaned folders. Errors: ${errorCount}`);
        return { deleted: deletedCount, errors: errorCount };

    } catch (error) {
        console.error('[CLEANUP] Critical error during cleanup:', error);
        throw error;
    }
}

// Allow running directly from command line
if (require.main === module) {
    cleanOrphanedImages()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = cleanOrphanedImages;
