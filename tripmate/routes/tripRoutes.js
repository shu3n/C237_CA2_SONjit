// ============================================
// Trip Routes
// Owners: Students B, C, D, E, F
// ============================================
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { isLoggedIn } = require('./authRoutes');

// ============================================
// Student C - View trips (dashboard + detail)
// ============================================
router.get('/', isLoggedIn, (req, res) => {
    const sql = 'SELECT * FROM trips WHERE user_id = ?';
    db.query(sql, [req.session.user.id], (err, trips) => {
        if (err) return res.send('Error loading trips.');
        res.render('trips/index', { trips });
    });
});

router.get('/:id', isLoggedIn, (req, res) => {
    const tripSql = 'SELECT * FROM trips WHERE trip_id = ? AND user_id = ?';
    const itemsSql = 'SELECT * FROM itinerary_items WHERE trip_id = ? ORDER BY item_date, item_time';

    db.query(tripSql, [req.params.id, req.session.user.id], (err, tripResults) => {
        if (err || tripResults.length === 0) return res.send('Trip not found.');

        db.query(itemsSql, [req.params.id], (err2, items) => {
            if (err2) return res.send('Error loading itinerary items.');
            res.render('trips/view', { trip: tripResults[0], items });
        });
    });
});

// ============================================
// Student B - Create trip
// ============================================
router.get('/create/new', isLoggedIn, (req, res) => {
    res.render('trips/create');
});

router.post('/create', isLoggedIn, (req, res) => {
    const { trip_name, start_date, end_date, budget, notes } = req.body;
    const sql = `INSERT INTO trips (user_id, trip_name, start_date, end_date, budget, notes)
                 VALUES (?, ?, ?, ?, ?, ?)`;

    db.query(sql, [req.session.user.id, trip_name, start_date, end_date, budget, notes], (err) => {
        if (err) return res.send('Error creating trip.');
        res.redirect('/trips');
    });
});

// ============================================
// Student D - Edit trip
// ============================================
router.get('/:id/edit', isLoggedIn, (req, res) => {
    const sql = 'SELECT * FROM trips WHERE trip_id = ? AND user_id = ?';
    db.query(sql, [req.params.id, req.session.user.id], (err, results) => {
        if (err || results.length === 0) return res.send('Trip not found.');
        res.render('trips/edit', { trip: results[0] });
    });
});

router.post('/:id/edit', isLoggedIn, (req, res) => {
    const { trip_name, start_date, end_date, budget, notes } = req.body;
    const sql = `UPDATE trips SET trip_name = ?, start_date = ?, end_date = ?, budget = ?, notes = ?
                 WHERE trip_id = ? AND user_id = ?`;

    db.query(sql, [trip_name, start_date, end_date, budget, notes, req.params.id, req.session.user.id], (err) => {
        if (err) return res.send('Error updating trip.');
        res.redirect('/trips/' + req.params.id);
    });
});

// ============================================
// Student E - Delete trip
// ============================================
router.post('/:id/delete', isLoggedIn, (req, res) => {
    const sql = 'DELETE FROM trips WHERE trip_id = ? AND user_id = ?';
    db.query(sql, [req.params.id, req.session.user.id], (err) => {
        if (err) return res.send('Error deleting trip.');
        res.redirect('/trips');
    });
});

// ============================================
// Student F - Search / filter / sort trips
// ============================================
router.get('/search/results', isLoggedIn, (req, res) => {
    const { keyword, sort } = req.query;
    let sql = 'SELECT * FROM trips WHERE user_id = ?';
    const params = [req.session.user.id];

    if (keyword) {
        sql += ' AND trip_name LIKE ?';
        params.push(`%${keyword}%`);
    }

    if (sort === 'budget') {
        sql += ' ORDER BY budget DESC';
    } else if (sort === 'date') {
        sql += ' ORDER BY start_date ASC';
    }

    db.query(sql, params, (err, trips) => {
        if (err) return res.send('Error searching trips.');
        res.render('trips/index', { trips });
    });
});

module.exports = router;
