const fs = require('fs');
const path = require('path');

/**
 * Calculate total size of a folder recursively
 */
function calculateFolderSize(folderPath) {
    let totalSize = 0;

    function readDirRecursive(dir) {
        const files = fs.readdirSync(dir);

        for (const file of files) {
            const filePath = path.join(dir, file);
            const stats = fs.statSync(filePath);

            if (stats.isDirectory()) {
                readDirRecursive(filePath);
            } else {
                totalSize += stats.size;
            }
        }
    }

    try {
        readDirRecursive(folderPath);
    } catch (error) {
        console.error('[SIZE CALC] Error calculating folder size:', error);
    }

    return totalSize;
}

/**
 * Sanitize file path to prevent directory traversal attacks
 */
function sanitizePath(filePath) {
    // Normalize path and remove any ../ attempts
    const normalized = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');

    // Block absolute paths
    if (path.isAbsolute(normalized)) {
        throw new Error('Absolute paths not allowed');
    }

    // Remove any remaining dangerous patterns
    const sanitized = normalized.replace(/\.\./g, '');

    return sanitized;
}

/**
 * Validate that files are static content only
 */
function validateStaticFiles(files) {
    const ALLOWED_EXTENSIONS = [
        '.html', '.htm',
        '.css',
        '.js', '.mjs',
        '.json', '.txt',
        '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
        '.woff', '.woff2', '.ttf', '.otf', '.eot',
        '.mp3', '.wav', '.ogg',
        '.mp4', '.webm'
    ];

    const BLOCKED_FILES = [
        'package.json',
        'package-lock.json',
        'yarn.lock',
        'composer.json',
        'Gemfile',
        'requirements.txt',
        'server.js',
        'app.js',
        '.env',
        '.git'
    ];

    const BLOCKED_EXTENSIONS = [
        '.php', '.py', '.rb', '.java', '.go', '.rs',
        '.exe', '.dll', '.so', '.dylib',
        '.sh', '.bat', '.cmd', '.ps1',
        '.asp', '.aspx', '.jsp'
    ];

    const BLOCKED_DIRECTORIES = [
        'node_modules',
        '.git',
        '.svn',
        'vendor',
        '__pycache__'
    ];

    const errors = [];

    for (const file of files) {
        const fileName = path.basename(file).toLowerCase();
        const ext = path.extname(file).toLowerCase();
        const dirName = path.dirname(file);

        // Check for blocked directories
        for (const blockedDir of BLOCKED_DIRECTORIES) {
            if (dirName.includes(blockedDir)) {
                errors.push(`Blocked directory detected: ${blockedDir} in ${file}`);
            }
        }

        // Check for blocked files
        if (BLOCKED_FILES.includes(fileName)) {
            errors.push(`Blocked file detected: ${fileName}`);
        }

        // Check for blocked extensions
        if (BLOCKED_EXTENSIONS.includes(ext)) {
            errors.push(`Blocked file type: ${ext} (${file})`);
        }

        // Check if extension is allowed
        if (ext && !ALLOWED_EXTENSIONS.includes(ext)) {
            errors.push(`Unsupported file type: ${ext} (${file})`);
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Check if files contain server-side code patterns
 */
function detectServerCode(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');

        const serverPatterns = [
            /require\s*\(\s*['"]express['"]\s*\)/,
            /require\s*\(\s*['"]http['"]\s*\)/,
            /require\s*\(\s*['"]https['"]\s*\)/,
            /app\.listen\s*\(/,
            /server\.listen\s*\(/,
            /createServer\s*\(/,
            /<\?php/,
            /<%[\s\S]*?%>/,
            /import\s+.*\s+from\s+['"]express['"]/
        ];

        for (const pattern of serverPatterns) {
            if (pattern.test(content)) {
                return true;
            }
        }

        return false;
    } catch (error) {
        // If file can't be read as text, it's likely binary - that's ok
        return false;
    }
}

/**
 * Count total files in directory
 */
function countFiles(dirPath) {
    let count = 0;

    function countRecursive(dir) {
        const files = fs.readdirSync(dir);

        for (const file of files) {
            const filePath = path.join(dir, file);
            const stats = fs.statSync(filePath);

            if (stats.isDirectory()) {
                countRecursive(filePath);
            } else {
                count++;
            }
        }
    }

    try {
        countRecursive(dirPath);
    } catch (error) {
        console.error('[FILE COUNT] Error counting files:', error);
    }

    return count;
}

/**
 * Extract icon from uploaded files
 */
function extractIcon(extractPath) {
    const iconPriority = [
        'favicon.ico',
        'favicon.png',
        'logo.png',
        'icon.png',
        'app-icon.png'
    ];

    for (const iconName of iconPriority) {
        const iconPath = path.join(extractPath, iconName);
        if (fs.existsSync(iconPath)) {
            return iconName;
        }
    }

    // Search in subdirectories (one level deep)
    try {
        const files = fs.readdirSync(extractPath);
        for (const file of files) {
            const filePath = path.join(extractPath, file);
            if (fs.statSync(filePath).isDirectory()) {
                for (const iconName of iconPriority) {
                    const iconPath = path.join(filePath, iconName);
                    if (fs.existsSync(iconPath)) {
                        return path.join(file, iconName);
                    }
                }
            }
        }
    } catch (error) {
        console.error('[ICON EXTRACT] Error searching for icon:', error);
    }

    return null;
}

module.exports = {
    calculateFolderSize,
    sanitizePath,
    validateStaticFiles,
    detectServerCode,
    countFiles,
    extractIcon
};
