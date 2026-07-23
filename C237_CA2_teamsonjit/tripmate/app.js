// ============================================
// TripMate - Main Application Entry Point
// ============================================
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
const db = mysql.createConnection({
    host: 'c237-eaint-mysql.mysql.database.azure.com',
    user: 'c237_013',
    password: 'c237013@2026!',
    database: 'c237_013_teamsonjit',

    //It tells ur app to talk to ur team's database name
    //a secure, encrypted connection - which Azure
    // requires before it will let you in
    ssl: {
        rejectUnauthorized: false
    }
});

db.connect((err) => {
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
module.exports.db = db;

const authRoutes = require('./routes/authRoutes');
const tripRoutes = require('./routes/tripRoutes');

// ---- View engine setup ----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---- Middleware ----
app.use(express.urlencoded({ extended: true })); // parse form data
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // css/js/images

app.use(session({
    secret: 'tripmate_secret_key',
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

app.use('/', authRoutes);       // login, register, logout
app.use('/trips', tripRoutes);  // create, view, edit, delete, search

// ---- 404 handler ----
app.use((req, res) => {
    res.status(404).render('404');
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`TripMate running on http://localhost:${PORT}`);
});

const tripRoutes = require('./routes/tripRoutes');
const searchRoutes = require('./routes/bryanRoutes');

app.use('/trips', tripRoutes);
app.use('/trips', searchRoutes);