// ============================================
// Auth Routes
// Owner: Student A - Registration, Login, Access Control
// ============================================
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/db');

// ---- GET: show register page ----
router.get('/register', (req, res) => {
    res.render('auth/register');
});

// ---- POST: handle registration ----
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = 'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)';
        db.query(sql, [username, email, hashedPassword, 'user'], (err, result) => {
            if (err) {
                console.error(err);
                return res.send('Registration failed. Username or email may already exist.');
            }
            res.redirect('/login');
        });
    } catch (err) {
        console.error(err);
        res.send('Something went wrong.');
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
            return res.send('Invalid email or password.');
        }

        const user = results[0];
        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.send('Invalid email or password.');
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
