const db = require('../config/db');

// Save or Update Resume
exports.saveResume = async (req, res) => {
    const userId = req.user.id;
    const resumeData = JSON.stringify(req.body); // Ensure it's stringified for TEXT/JSON column

    if (!resumeData) {
        return res.status(400).json({ message: 'Resume data is required' });
    }

    try {
        // Upsert (Insert or Update if exists) using ON DUPLICATE KEY
        // Assuming user_id is UNIQUE in resumes table
        const query = `
            INSERT INTO resumes (user_id, resume_data) 
            VALUES (?, ?) 
            ON DUPLICATE KEY UPDATE resume_data = VALUES(resume_data)
        `;

        await db.query(query, [userId, resumeData]);

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
        const [rows] = await db.query('SELECT resume_data FROM resumes WHERE user_id = ?', [userId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Resume not found' });
        }

        // Return the JSON object directly
        res.json(rows[0].resume_data);

    } catch (error) {
        console.error('Error fetching resume:', error);
        res.status(500).json({ message: 'Server error fetching resume' });
    }
};
