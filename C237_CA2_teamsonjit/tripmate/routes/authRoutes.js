// ============================================
// Auth Routes
// Owner: Student A - Registration, Login, Access Control
// ============================================
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { db } = require('../app');

// ---- GET: show register page ----
router.get('/register', (req, res) => {
    res.render('auth/register', { errors: [], formData: {} });
});

// Password policy: at least 8 characters, including 1 special character.
const SPECIAL_CHAR_REGEX = /[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\/;']/;

function getPasswordErrors(password) {
    const errors = [];
    if (!password || password.length < 8) {
        errors.push('Password must be at least 8 characters long.');
    }
    if (!password || !SPECIAL_CHAR_REGEX.test(password)) {
        errors.push('Password must contain at least 1 special character.');
    }
    return errors;
}

// ---- POST: handle registration ----
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    const formData = { username, email };

    const errors = [];
    if (!username || username.trim() === '') {
        errors.push('Username is required.');
    }
    if (!email || email.trim() === '') {
        errors.push('Email is required.');
    }
    errors.push(...getPasswordErrors(password));

    if (errors.length > 0) {
        return res.render('auth/register', { errors, formData });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = 'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)';
        db.query(sql, [username, email, hashedPassword, 'user'], (err, result) => {
            if (err) {
                console.error(err);
                return res.render('auth/register', {
                    errors: ['Registration failed. Username or email may already exist.'],
                    formData
                });
            }
            res.redirect('/login');
        });
    } catch (err) {
        console.error(err);
        res.render('auth/register', {
            errors: ['Something went wrong. Please try again.'],
            formData
        });
    }
});

// ---- GET: show login page ----
router.get('/login', (req, res) => {
    res.render('auth/login');
});

// ---- POST: handle login ----
router.post('/login', (req, res) => {
    const { email, password } = req.body;

    const sql = 'SELECT * FROM users WHERE email = ?';
    db.query(sql, [email], async (err, results) => {
        if (err || results.length === 0) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
        }

        const user = results[0];
        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
        }

        // Store minimal user info in session
        req.session.user = {
            id: user.user_id,
            username: user.username,
            role: user.role
        };

        res.redirect('/trips');
    });
});

// ---- GET: logout ----
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

module.exports = router;

// ============================================
// Middleware helpers (import these in other route files)
// ============================================
function isLoggedIn(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

function isAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send('Access denied. Admins only.');
    }
    next();
}

module.exports.isLoggedIn = isLoggedIn;
module.exports.isAdmin = isAdmin;