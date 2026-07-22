// ============================================
// TripMate - Main Application Entry Point
// ============================================
const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const tripRoutes = require('./routes/tripRoutes');

const app = express();

// ---- View engine setup ----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---- Middleware ----
app.use(express.urlencoded({ extended: true })); // parse form data
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // css/js/images

app.use(session({
    secret: process.env.SESSION_SECRET || 'tripmate_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 2 } // 2 hours
}));

// Make logged-in user available in all EJS views (e.g. for navbar)
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`TripMate running on http://localhost:${PORT}`);
});
