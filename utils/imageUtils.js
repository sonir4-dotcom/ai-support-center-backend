const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * Image utility functions for Image Marketplace
 * Handles EXIF stripping, thumbnail generation, and metadata extraction
 */

/**
 * Strip EXIF data and process image
 * @param {string} inputPath - Path to original image
 * @param {string} outputPath - Path to save processed image
 * @returns {Promise<object>} Image metadata
 */
async function stripExifAndProcess(inputPath, outputPath) {
    try {
        const image = sharp(inputPath);
        const metadata = await image.metadata();

        // Strip EXIF data and save
        await image
            .rotate() // Auto-rotate based on EXIF orientation
            .withMetadata({ exif: {} }) // Remove EXIF data
            .toFile(outputPath);

        return {
            width: metadata.width,
            height: metadata.height,
            format: metadata.format,
            size: metadata.size
        };
    } catch (error) {
        console.error('[IMAGE_UTILS] Error stripping EXIF:', error);
        throw error;
    }
}

/**
 * Generate thumbnail from image
 * @param {string} inputPath - Path to original image
 * @param {string} outputPath - Path to save thumbnail
 * @param {number} size - Thumbnail size (default 400px)
 * @returns {Promise<void>}
 */
async function generateThumbnail(inputPath, outputPath, size = 400) {
    try {
        await sharp(inputPath)
            .resize(size, size, {
                fit: 'cover',
                position: 'center'
            })
            .webp({ quality: 80 })
            .toFile(outputPath);
    } catch (error) {
        console.error('[IMAGE_UTILS] Error generating thumbnail:', error);
        throw error;
    }
}

/**
 * Detect image orientation
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {string} 'portrait', 'landscape', or 'square'
 */
function detectOrientation(width, height) {
    const ratio = width / height;

    if (Math.abs(ratio - 1) < 0.1) {
        return 'square';
    } else if (ratio > 1) {
        return 'landscape';
    } else {
        return 'portrait';
    }
}

/**
 * Extract dominant color from image
 * @param {string} imagePath - Path to image
 * @returns {Promise<string>} Hex color code
 */
async function extractDominantColor(imagePath) {
    try {
        const { dominant } = await sharp(imagePath)
            .resize(1, 1, { fit: 'cover' })
            .raw()
            .toBuffer({ resolveWithObject: true });

        const r = dominant.data[0];
        const g = dominant.data[1];
        const b = dominant.data[2];

        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
    } catch (error) {
        console.error('[IMAGE_UTILS] Error extracting color:', error);
        return '#808080'; // Default gray
    }
}

/**
 * Validate image file
 * @param {object} file - Multer file object
 * @returns {boolean} True if valid
 * @throws {Error} If validation fails
 */
function validateImageFile(file) {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    // Check MIME type
    if (!allowedMimes.includes(file.mimetype)) {
        throw new Error('Invalid file type. Only JPG, PNG, and WebP allowed.');
    }

    // Check extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExts.includes(ext)) {
        throw new Error('Invalid file extension.');
    }

    // Block SVG (security risk)
    if (file.mimetype === 'image/svg+xml' || ext === '.svg') {
        throw new Error('SVG files not allowed for security reasons.');
    }

    // Check file size
    if (file.size > maxSize) {
        throw new Error('File size exceeds 5MB limit.');
    }

    return true;
}

/**
 * Sanitize image filename
 * @param {string} filename - Original filename
 * @returns {string} Sanitized filename
 */
function sanitizeImageFilename(filename) {
    const ext = path.extname(filename).toLowerCase();
    const name = path.basename(filename, ext);

    return name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 50) + ext;
}

/**
 * Process uploaded image (complete workflow)
 * @param {string} uploadedPath - Path to uploaded file
 * @param {string} uuid - UUID for folder
 * @param {string} baseDir - Base directory for storage
 * @returns {Promise<object>} Processing results
 */
async function processUploadedImage(uploadedPath, uuid, baseDir) {
    try {
        // Create UUID folder
        const imageDir = path.join(baseDir, 'public', 'community-images', uuid);
        if (!fs.existsSync(imageDir)) {
            fs.mkdirSync(imageDir, { recursive: true });
        }

        // Define paths (always use .webp for consistency)
        const originalPath = path.join(imageDir, 'original.webp');
        const thumbnailPath = path.join(imageDir, 'thumb.webp');

        // Strip EXIF and get metadata
        const metadata = await stripExifAndProcess(uploadedPath, originalPath);

        // Generate thumbnail
        await generateThumbnail(originalPath, thumbnailPath);

        // Detect orientation
        const orientation = detectOrientation(metadata.width, metadata.height);

        // Extract dominant color
        const dominantColor = await extractDominantColor(originalPath);

        // Delete uploaded temp file
        if (fs.existsSync(uploadedPath)) {
            fs.unlinkSync(uploadedPath);
        }

        return {
            imagePath: `/community-images/${uuid}/original.webp`,
            thumbnailPath: `/community-images/${uuid}/thumb.webp`,
            width: metadata.width,
            height: metadata.height,
            fileSize: metadata.size,
            orientation,
            dominantColor
        };
    } catch (error) {
        console.error('[IMAGE_UTILS] Error processing image:', error);
        throw error;
    }
}

module.exports = {
    stripExifAndProcess,
    generateThumbnail,
    detectOrientation,
    extractDominantColor,
    validateImageFile,
    sanitizeImageFilename,
    processUploadedImage
};
