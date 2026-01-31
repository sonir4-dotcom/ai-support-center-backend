const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Register User
exports.register = async (req, res) => {
    let { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    // Normalize email
    email = email.trim().toLowerCase();

    try {
        console.log(`[AUTH] Registration attempt for: ${email}`);

        // Check if user exists
        const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (rows.length > 0) {
            console.log(`[AUTH] Registration failed: User ${email} already exists`);
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash password
        console.log(`[AUTH] Hashing password for: ${email}`);
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        console.log(`[AUTH] Password hashed successfully. Hash prefix: ${hashedPassword.substring(0, 7)}`);

        // Insert User
        await db.query('INSERT INTO users (name, email, password) VALUES ($1, $2, $3)', [name, email, hashedPassword]);
        console.log(`[AUTH] User ${email} registered successfully`);

        res.status(201).json({ message: 'User registered successfully' });

    } catch (error) {
        console.error('[AUTH] Registration Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Login User
exports.login = async (req, res) => {
    let { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    // Normalize email
    email = email.trim().toLowerCase();

    try {
        console.log(`[AUTH] Login attempt for: ${email}`);

        // Find User
        const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (rows.length === 0) {
            console.log(`[AUTH] Login failed: User ${email} not found`);
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const user = rows[0];
        console.log(`[AUTH] User ${email} found in DB. Comparing passwords...`);

        // Check Password
        const isMatch = await bcrypt.compare(password, user.password);
        console.log(`[AUTH] Password comparison result for ${email}: ${isMatch}`);

        if (!isMatch) {
            console.log(`[AUTH] Login failed: Password mismatch for ${email}`);
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Generate JWT
        console.log(`[AUTH] Generating JWT for: ${email}`);
        const payload = {
            user: { id: user.id }
        };

        const secret = process.env.JWT_SECRET || 'fallback_secret_for_debug';
        if (!process.env.JWT_SECRET) {
            console.warn('[AUTH] WARNING: JWT_SECRET not found in environment, using fallback');
        }

        jwt.sign(
            payload,
            secret,
            { expiresIn: '1h' },
            (err, token) => {
                if (err) {
                    console.error('[AUTH] JWT Signing Error:', err);
                    throw err;
                }
                console.log(`[AUTH] Login successful for: ${email}`);
                res.json({
                    message: 'Login successful',
                    token,
                    user: { id: user.id, name: user.name, email: user.email }
                });
            }
        );

    } catch (error) {
        console.error('[AUTH] Login Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
