const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { v4: uuidv4 } = require('uuid');

/**
 * Download GitHub repository as ZIP
 * Supports: https://github.com/user/repo
 */
async function downloadGitHubRepo(githubUrl, destPath) {
    try {
        // Parse GitHub URL
        const match = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) {
            throw new Error('Invalid GitHub URL format');
        }

        const [, owner, repo] = match;
        const cleanRepo = repo.replace(/\.git$/, '');

        // GitHub API endpoint for downloading repo as ZIP
        const zipUrl = `https://github.com/${owner}/${cleanRepo}/archive/refs/heads/main.zip`;

        console.log(`[GITHUB] Downloading: ${zipUrl}`);

        const response = await axios({
            method: 'GET',
            url: zipUrl,
            responseType: 'stream',
            timeout: 60000, // 60 second timeout
            maxContentLength: 20 * 1024 * 1024 // 20MB max
        });

        const writer = fs.createWriteStream(destPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(destPath));
            writer.on('error', reject);
        });
    } catch (error) {
        // Try 'master' branch if 'main' fails
        if (error.response?.status === 404) {
            const match = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
            const [, owner, repo] = match;
            const cleanRepo = repo.replace(/\.git$/, '');
            const zipUrl = `https://github.com/${owner}/${cleanRepo}/archive/refs/heads/master.zip`;

            console.log(`[GITHUB] Retrying with master branch: ${zipUrl}`);

            const response = await axios({
                method: 'GET',
                url: zipUrl,
                responseType: 'stream',
                timeout: 60000,
                maxContentLength: 20 * 1024 * 1024
            });

            const writer = fs.createWriteStream(destPath);
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(destPath));
                writer.on('error', reject);
            });
        }
        throw error;
    }
}

/**
 * Fetch HTML and download all referenced assets
 */
async function fetchUrlAssets(url, destDir) {
    try {
        console.log(`[URL IMPORT] Fetching: ${url}`);

        // Fetch main HTML
        const response = await axios.get(url, {
            timeout: 30000,
            maxContentLength: 5 * 1024 * 1024 // 5MB for HTML
        });

        const html = response.data;
        const $ = cheerio.load(html);
        const baseUrl = new URL(url);
        const downloadedAssets = [];

        // Create destination directory
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        // Save main HTML as index.html
        const indexPath = path.join(destDir, 'index.html');
        fs.writeFileSync(indexPath, html);
        downloadedAssets.push('index.html');

        // Download CSS files
        const cssLinks = $('link[rel="stylesheet"]');
        for (let i = 0; i < cssLinks.length; i++) {
            const href = $(cssLinks[i]).attr('href');
            if (href) {
                await downloadAsset(href, baseUrl, destDir, downloadedAssets);
            }
        }

        // Download JS files
        const scripts = $('script[src]');
        for (let i = 0; i < scripts.length; i++) {
            const src = $(scripts[i]).attr('src');
            if (src) {
                await downloadAsset(src, baseUrl, destDir, downloadedAssets);
            }
        }

        // Download images
        const images = $('img[src]');
        for (let i = 0; i < images.length; i++) {
            const src = $(images[i]).attr('src');
            if (src) {
                await downloadAsset(src, baseUrl, destDir, downloadedAssets);
            }
        }

        console.log(`[URL IMPORT] Downloaded ${downloadedAssets.length} files`);
        return downloadedAssets;

    } catch (error) {
        console.error('[URL IMPORT] Error:', error.message);
        throw new Error(`Failed to fetch URL: ${error.message}`);
    }
}

/**
 * Helper to download individual asset
 */
async function downloadAsset(assetUrl, baseUrl, destDir, downloadedAssets) {
    try {
        // Skip data URLs and external CDN links (too risky)
        if (assetUrl.startsWith('data:') ||
            assetUrl.includes('cdn.') ||
            assetUrl.includes('googleapis.com') ||
            assetUrl.includes('cloudflare.com')) {
            console.log(`[URL IMPORT] Skipping external/data URL: ${assetUrl}`);
            return;
        }

        // Resolve relative URLs
        const fullUrl = new URL(assetUrl, baseUrl.origin + baseUrl.pathname).href;

        // Only download from same domain (security)
        const assetDomain = new URL(fullUrl).hostname;
        if (assetDomain !== baseUrl.hostname) {
            console.log(`[URL IMPORT] Skipping cross-domain asset: ${fullUrl}`);
            return;
        }

        // Download asset
        const response = await axios.get(fullUrl, {
            responseType: 'arraybuffer',
            timeout: 15000,
            maxContentLength: 2 * 1024 * 1024 // 2MB per asset
        });

        // Determine save path
        const urlPath = new URL(fullUrl).pathname;
        const fileName = path.basename(urlPath) || 'asset';
        const savePath = path.join(destDir, fileName);

        // Save file
        fs.writeFileSync(savePath, response.data);
        downloadedAssets.push(fileName);

        console.log(`[URL IMPORT] Downloaded: ${fileName}`);

    } catch (error) {
        console.error(`[URL IMPORT] Failed to download asset ${assetUrl}:`, error.message);
        // Continue with other assets even if one fails
    }
}

/**
 * Generate unique folder name
 */
function generateUniqueFolder() {
    return uuidv4();
}

module.exports = {
    downloadGitHubRepo,
    fetchUrlAssets,
    generateUniqueFolder
};
