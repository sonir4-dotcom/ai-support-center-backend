const path = require('path');
const fs = require('fs');

/**
 * Generate placeholder thumbnail based on category
 * Returns path to category-specific placeholder image
 */
function generatePlaceholderThumbnail(category) {
    const placeholders = {
        'game': '/placeholders/game-thumbnail.png',
        'tool': '/placeholders/tool-thumbnail.png',
        'tutorial': '/placeholders/tutorial-thumbnail.png',
        'productivity': '/placeholders/productivity-thumbnail.png',
        'general': '/placeholders/general-thumbnail.png'
    };

    return placeholders[category] || placeholders['general'];
}

/**
 * Copy icon to public icons directory
 * Returns the public path to the icon
 */
function copyIconToPublic(iconSourcePath, uploadId) {
    try {
        const iconsDir = path.join(__dirname, '../public/icons');
        if (!fs.existsSync(iconsDir)) {
            fs.mkdirSync(iconsDir, { recursive: true });
        }

        const ext = path.extname(iconSourcePath);
        const iconFileName = `app-${uploadId}${ext}`;
        const iconDestPath = path.join(iconsDir, iconFileName);

        fs.copyFileSync(iconSourcePath, iconDestPath);

        return `/icons/${iconFileName}`;
    } catch (error) {
        console.error('[ICON COPY] Error:', error);
        return null;
    }
}

/**
 * Get source badge info based on import method
 */
function getSourceBadge(importMethod) {
    const badges = {
        'zip': {
            label: 'ZIP Upload',
            color: 'blue',
            icon: '📦'
        },
        'github': {
            label: 'GitHub',
            color: 'purple',
            icon: '⚡'
        },
        'url': {
            label: 'URL Import',
            color: 'orange',
            icon: '🌐'
        }
    };

    return badges[importMethod] || badges['zip'];
}

module.exports = {
    generatePlaceholderThumbnail,
    copyIconToPublic,
    getSourceBadge
};
