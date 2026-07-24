// ============================================
// TripMate - Main Application Entry Point
// ============================================
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const path = require('path');

const app = express();

// =========================
// Multer Configuration
// =========================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/images');
    },

    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const upload = multer({
    storage: storage
});

// =========================
// Database Connection
// =========================
// A pool (not a single createConnection) so serverless invocations survive
// Azure closing an idle connection between requests — each query borrows a
// connection from the pool and reconnects automatically as needed, instead
// of every query failing until the process cold-starts again.
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 5,

    //It tells ur app to talk to ur team's database name
    //a secure, encrypted connection - which Azure
    // requires before it will let you in
    ssl: {
        rejectUnauthorized: false
    }
});

db.query('SELECT 1', (err) => {
    if (err) {
        throw err;
    }
    console.log('Connected to database');
});

// IMPORTANT: export db BEFORE requiring the route files below.
// Route files do require('../app') to get this same connection —
// if this export happened after those requires, db would be
// undefined inside them (Node resolves require() at load-time,
// not later), which is exactly the bug that was here before.
module.exports = app;
app.db = db;

const authRoutes = require('./routes/authRoutes');
const tripRoutes = require('./routes/tripRoutes');
const searchRoutes = require('./routes/bryanRoutes');
const adminRoutes = require('./routes/adminRoutes');

// ---- View engine setup ----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---- Middleware ----
app.use(express.urlencoded({ extended: true })); // parse form data
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // css/js/images

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 2 } // 2 hours
}));

app.use(flash());

// Make logged-in user available in all EJS views (e.g. for navbar)
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.success_msg = req.flash('success');
    res.locals.error_msg = req.flash('error');
    next();
});

// ---- Routes ----
app.get('/', (req, res) => {
    res.redirect('/trips');
});

app.use('/', authRoutes);        // login, register, logout
app.use('/trips', tripRoutes);   // create, view, edit, delete
app.use('/trips', searchRoutes); // search, filter, sort, share
app.use('/admin', adminRoutes);  // admin-only dashboard (all trips)

// ---- 404 handler ----
app.use((req, res) => {
    res.status(404).render('404');
});

// Only bind a port when run directly (`node app.js`) — Vercel imports
// this module as a serverless handler via api/index.js and calls it
// per-request, so listening on a port there would be pointless.
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`TripMate running on http://localhost:${PORT}`);
    });
}