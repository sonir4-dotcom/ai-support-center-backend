const db = require('../config/db');
const PDFDocument = require('pdfkit');

// Save or Update Resume
exports.saveResume = async (req, res) => {
    const userId = req.user.id;

    if (!req.body) {
        return res.status(400).json({ message: 'Resume data is required' });
    }

    try {
        const query = `
            INSERT INTO resumes (user_id, resume_data) 
            VALUES ($1, $2) 
            ON CONFLICT (user_id) DO UPDATE 
            SET resume_data = EXCLUDED.resume_data, 
                updated_at = CURRENT_TIMESTAMP
        `;

        await db.query(query, [userId, req.body]);
        console.log(`✅ Resume saved for user ${userId}`);
        res.json({ message: 'Resume saved successfully' });

    } catch (error) {
        console.error('Error saving resume:', error);
        res.status(500).json({ message: 'Server error saving resume' });
    }
};

// Get Resume
exports.getResume = async (req, res) => {
    const userId = req.user.id;

    try {
        const { rows } = await db.query('SELECT resume_data FROM resumes WHERE user_id = $1', [userId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Resume not found' });
        }

        res.json(rows[0].resume_data);

    } catch (error) {
        console.error('Error fetching resume:', error);
        res.status(500).json({ message: 'Server error fetching resume' });
    }
};

// Download Resume as PDF
exports.downloadResume = async (req, res) => {
    const userId = req.user.id;
    try {
        const { rows } = await db.query('SELECT resume_data FROM resumes WHERE user_id = $1', [userId]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Resume not found' });
        }
        const data = rows[0].resume_data;

        const doc = new PDFDocument({ margin: 50 });
        let filename = `resume-${(data.personal?.fullName || 'user').toLowerCase().replace(/\s+/g, '-')}.pdf`;

        res.setHeader('Content-disposition', 'attachment; filename=' + filename);
        res.setHeader('Content-type', 'application/pdf');

        doc.pipe(res);

        // --- Header Section ---
        doc.fontSize(24).font('Helvetica-Bold').text(data.personal?.fullName || 'Full Name', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').text(`${data.personal?.email || ''} | ${data.personal?.phone || ''}`, { align: 'center' });
        doc.text(data.personal?.currentAddress || '', { align: 'center' });
        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        // --- Career Objective ---
        if (data.careerObjective) {
            doc.fontSize(14).font('Helvetica-Bold').text('CAREER OBJECTIVE');
            doc.fontSize(10).font('Helvetica').text(data.careerObjective);
            doc.moveDown();
        }

        // --- Experience ---
        if (data.experience && data.experience.length > 0) {
            doc.fontSize(14).font('Helvetica-Bold').text('EXPERIENCE');
            data.experience.forEach(exp => {
                doc.fontSize(11).font('Helvetica-Bold').text(`${exp.company} - ${exp.role}`);
                doc.fontSize(10).font('Helvetica-Oblique').text(`${exp.duration}`);
                doc.fontSize(10).font('Helvetica').text(exp.description);
                doc.moveDown(0.5);
            });
            doc.moveDown();
        }

        // --- Education ---
        if (data.education && data.education.length > 0) {
            doc.fontSize(14).font('Helvetica-Bold').text('EDUCATION');
            data.education.forEach(edu => {
                doc.fontSize(11).font('Helvetica-Bold').text(`${edu.institution}`);
                doc.fontSize(10).font('Helvetica').text(`${edu.degree} - ${edu.year}`);
                doc.moveDown(0.5);
            });
            doc.moveDown();
        }

        // --- Skills ---
        if (data.skills) {
            doc.fontSize(14).font('Helvetica-Bold').text('SKILLS');
            if (data.skills.technical) doc.fontSize(10).font('Helvetica').text(`Technical: ${data.skills.technical}`);
            if (data.skills.soft) doc.fontSize(10).font('Helvetica').text(`Soft Skills: ${data.skills.soft}`);
            if (data.skills.certifications) doc.fontSize(10).font('Helvetica').text(`Certifications: ${data.skills.certifications}`);
            doc.moveDown();
        }

        // --- Declaration ---
        if (data.declaration) {
            doc.fontSize(14).font('Helvetica-Bold').text('DECLARATION');
            doc.fontSize(10).font('Helvetica').text(data.declaration.text);
            doc.moveDown();
            doc.text(`Place: ${data.declaration.place || ''}`);
            doc.text(`Date: ${data.declaration.date || ''}`);
            doc.moveDown();
            doc.text(`(Signature)`, { align: 'right' });
            doc.text(`${data.declaration.signature || (data.personal?.fullName || '')}`, { align: 'right' });
        }

        doc.end();

    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).json({ message: 'Server error generating PDF' });
    }
};
