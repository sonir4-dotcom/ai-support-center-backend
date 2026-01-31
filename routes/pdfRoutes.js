const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const authMiddleware = require('../middleware/authMiddleware');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// POST /api/pdf-to-text
router.post('/', authMiddleware, upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No PDF file uploaded' });
        }

        console.log(`Processing PDF: ${req.file.originalname}`);

        const data = await pdfParse(req.file.buffer);

        console.log('Extracted text length:', data.text.length);

        if (!data.text || data.text.trim().length === 0) {
            return res.status(200).json({
                text: '',
                message: 'No text extracted. PDF might be a scanned image.'
            });
        }

        res.status(200).json({
            text: data.text,
            info: data.info,
            numpages: data.numpages
        });

    } catch (error) {
        console.error('PDF Parse Error:', error);
        res.status(500).json({ message: 'Error parsing PDF file' });
    }
});

module.exports = router;
