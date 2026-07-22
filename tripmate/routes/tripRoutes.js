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
// Noel - Create trip (forms + validation)
// ============================================
router.get('/create/new', isLoggedIn, (req, res) => {
    res.render('trips/create', { errors: [], formData: {} });
});

router.post('/create', isLoggedIn, (req, res) => {
    const { trip_name, start_date, end_date, budget, notes } = req.body;
    const errors = [];

    // ---- Server-side validation (never trust the client) ----
    if (!trip_name || trip_name.trim() === '') {
        errors.push('Trip name is required.');
    }
    if (!start_date) {
        errors.push('Start date is required.');
    }
    if (!end_date) {
        errors.push('End date is required.');
    }
    if (start_date && end_date && new Date(end_date) < new Date(start_date)) {
        errors.push('End date cannot be earlier than the start date.');
    }
    if (budget !== '' && budget !== undefined && (isNaN(budget) || Number(budget) < 0)) {
        errors.push('Budget must be a positive number.');
    }

    if (errors.length > 0) {
        return res.render('trips/create', {
            errors,
            formData: { trip_name, start_date, end_date, budget, notes }
        });
    }

    const sql = `INSERT INTO trips (user_id, trip_name, start_date, end_date, budget, notes)
                 VALUES (?, ?, ?, ?, ?, ?)`;

    db.query(sql, [req.session.user.id, trip_name.trim(), start_date, end_date, budget || 0, notes], (err) => {
        if (err) {
            console.error(err);
            return res.render('trips/create', {
                errors: ['Something went wrong creating your trip. Please try again.'],
                formData: { trip_name, start_date, end_date, budget, notes }
            });
        }
        res.redirect('/trips');
    });
});

// ============================================
// Noel - Add itinerary item (forms + validation)
// ============================================
router.get('/:tripId/items/new', isLoggedIn, (req, res) => {
    const tripSql = 'SELECT * FROM trips WHERE trip_id = ? AND user_id = ?';
    db.query(tripSql, [req.params.tripId, req.session.user.id], (err, tripResults) => {
        if (err) return res.send('Error loading trip.');
        if (tripResults.length === 0) return res.status(403).send('Trip not found or access denied.');

        res.render('trips/add-item', { trip: tripResults[0], errors: [], formData: {} });
    });
});

router.post('/:tripId/items/create', isLoggedIn, (req, res) => {
    const tripSql = 'SELECT * FROM trips WHERE trip_id = ? AND user_id = ?';
    db.query(tripSql, [req.params.tripId, req.session.user.id], (err, tripResults) => {
        if (err) return res.send('Error loading trip.');
        if (tripResults.length === 0) return res.status(403).send('Trip not found or access denied.');

        const trip = tripResults[0];
        const { item_name, category, item_date, item_time, location, cost, notes } = req.body;
        const errors = [];
        const validCategories = ['Flight', 'Accommodation', 'Activity', 'Food', 'Transport', 'Other'];

        // ---- Server-side validation ----
        if (!item_name || item_name.trim() === '') {
            errors.push('Item name is required.');
        }
        if (!category || !validCategories.includes(category)) {
            errors.push('Please select a valid category.');
        }
        if (!item_date) {
            errors.push('Date is required.');
        } else {
            const itemDateObj = new Date(item_date);
            const tripStart = new Date(trip.start_date);
            const tripEnd = new Date(trip.end_date);
            if (itemDateObj < tripStart || itemDateObj > tripEnd) {
                errors.push("Item date must fall within the trip's start and end dates.");
            }
        }
        if (cost !== '' && cost !== undefined && (isNaN(cost) || Number(cost) < 0)) {
            errors.push('Cost must be a positive number.');
        }

        if (errors.length > 0) {
            return res.render('trips/add-item', {
                trip,
                errors,
                formData: { item_name, category, item_date, item_time, location, cost, notes }
            });
        }

        const insertSql = `INSERT INTO itinerary_items (trip_id, item_name, category, item_date, item_time, location, cost, notes)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

        db.query(insertSql,
            [req.params.tripId, item_name.trim(), category, item_date, item_time || null, location, cost || 0, notes],
            (err2) => {
                if (err2) {
                    console.error(err2);
                    return res.render('trips/add-item', {
                        trip,
                        errors: ['Something went wrong adding the item. Please try again.'],
                        formData: { item_name, category, item_date, item_time, location, cost, notes }
                    });
                }
                res.redirect('/trips/' + req.params.tripId);
            }
        );
    });
});

// ============================================
// Student D - Edit trip
// ============================================
router.get('/:id/edit', isLoggedIn, (req, res) => {
    getTripAccess(req.params.id, req.session.user.id, (err, trip) => {
        if (err) return res.send('Error loading trip.');
        if (!trip) return res.status(403).send('Trip not found or access denied.');
        if (trip.access_level !== 'owner' && trip.access_level !== 'edit') {
            return res.status(403).send('You only have view access to this trip.');
        }
        res.render('trips/edit', { trip });
    });
});

router.post('/:id/edit', isLoggedIn, (req, res) => {
    getTripAccess(req.params.id, req.session.user.id, (err, trip) => {
        if (err) return res.send('Error loading trip.');
        if (!trip || (trip.access_level !== 'owner' && trip.access_level !== 'edit')) {
            return res.status(403).send('You do not have permission to edit this trip.');
        }

        const { trip_name, start_date, end_date, budget, notes } = req.body;
        const sql = `UPDATE trips SET trip_name = ?, start_date = ?, end_date = ?, budget = ?, notes = ?
                     WHERE trip_id = ?`;

        db.query(sql, [trip_name, start_date, end_date, budget, notes, req.params.id], (err2) => {
            if (err2) return res.send('Error updating trip.');
            res.redirect('/trips/' + req.params.id);
        });
    });
});

// ============================================
// Student D - Edit itinerary item
// ============================================
router.get('/:tripId/items/:itemId/edit', isLoggedIn, (req, res) => {
    getTripAccess(req.params.tripId, req.session.user.id, (err, trip) => {
        if (err) return res.send('Error loading trip.');
        if (!trip) return res.status(403).send('Trip not found or access denied.');
        if (trip.access_level !== 'owner' && trip.access_level !== 'edit') {
            return res.status(403).send('You only have view access to this trip.');
        }

        const itemSql = 'SELECT * FROM itinerary_items WHERE item_id = ? AND trip_id = ?';
        db.query(itemSql, [req.params.itemId, req.params.tripId], (err2, itemResults) => {
            if (err2 || itemResults.length === 0) return res.send('Itinerary item not found.');
            res.render('trips/edit-item', { trip, item: itemResults[0] });
        });
    });
});

router.post('/:tripId/items/:itemId/edit', isLoggedIn, (req, res) => {
    getTripAccess(req.params.tripId, req.session.user.id, (err, trip) => {
        if (err) return res.send('Error loading trip.');
        if (!trip || (trip.access_level !== 'owner' && trip.access_level !== 'edit')) {
            return res.status(403).send('You do not have permission to edit this item.');
        }

        const { item_name, category, item_date, item_time, location, cost, notes } = req.body;
        const updateSql = `UPDATE itinerary_items
                            SET item_name = ?, category = ?, item_date = ?, item_time = ?, location = ?, cost = ?, notes = ?
                            WHERE item_id = ? AND trip_id = ?`;

        db.query(updateSql,
            [item_name, category, item_date, item_time, location, cost, notes, req.params.itemId, req.params.tripId],
            (err2) => {
                if (err2) return res.send('Error updating itinerary item.');
                res.redirect('/trips/' + req.params.tripId);
            }
        );
    });
});

// ============================================
// Student E - Delete trip (and itinerary items)
// Confirmation happens client-side via confirm() in the EJS view
// (see views/trips/view.ejs and views/trips/index.ejs).
// Admins can delete ANY trip, not just their own.
// ============================================
router.post('/:id/delete', isLoggedIn, (req, res) => {
    const tripId = req.params.id;
    const user = req.session.user;

    // Look up the trip by ID only (no user_id filter here) so we can
    // tell the difference between "doesn't exist" and "not yours" —
    // and so an admin is able to find/delete a trip they don't own.
    const findSql = 'SELECT * FROM trips WHERE trip_id = ?';
    db.query(findSql, [tripId], (err, results) => {
        if (err) {
            console.error(err);
            return res.send('Error loading trip.');
        }
        if (results.length === 0) {
            return res.status(404).send('Trip not found.');
        }

        const trip = results[0];
        const isOwner = trip.user_id === user.id;
        const isAdmin = user.role === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).send('You do not have permission to delete this trip.');
        }

        // Delete itinerary items first — no ON DELETE CASCADE is set up
        // in the schema, so we clean these up manually to avoid orphaned
        // rows / FK errors.
        db.query('DELETE FROM itinerary_items WHERE trip_id = ?', [tripId], (err2) => {
            if (err2) {
                console.error(err2);
                return res.send('Error deleting itinerary items for this trip.');
            }

            db.query('DELETE FROM trips WHERE trip_id = ?', [tripId], (err3) => {
                if (err3) {
                    console.error(err3);
                    return res.send('Error deleting trip.');
                }

                console.log(
                    `[DELETE] Trip ${tripId} ("${trip.trip_name}") deleted by user ${user.id} ` +
                    (isAdmin && !isOwner ? '(ADMIN override)' : '(owner)')
                );

                res.redirect('/trips');
            });
        });
    });
});

// ============================================
// Student E - Delete itinerary item
// Owner of the trip or an admin can delete any item in it.
// NOTE: once Shu En's getTripAccess()/shared-trip logic lands, the
// ownership check below should be widened to also allow 'edit' access
// (i.e. isAdmin || access_level === 'owner' || access_level === 'edit'),
// matching how the edit routes above already work.
// ============================================
router.post('/:tripId/items/:itemId/delete', isLoggedIn, (req, res) => {
    const { tripId, itemId } = req.params;
    const user = req.session.user;

    const tripSql = 'SELECT * FROM trips WHERE trip_id = ?';
    db.query(tripSql, [tripId], (err, tripResults) => {
        if (err) {
            console.error(err);
            return res.send('Error loading trip.');
        }
        if (tripResults.length === 0) {
            return res.status(404).send('Trip not found.');
        }

        const trip = tripResults[0];
        const isOwner = trip.user_id === user.id;
        const isAdmin = user.role === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).send('You do not have permission to delete this item.');
        }

        const deleteSql = 'DELETE FROM itinerary_items WHERE item_id = ? AND trip_id = ?';
        db.query(deleteSql, [itemId, tripId], (err2, result) => {
            if (err2) {
                console.error(err2);
                return res.send('Error deleting itinerary item.');
            }
            if (result.affectedRows === 0) {
                return res.status(404).send('Itinerary item not found.');
            }

            console.log(
                `[DELETE] Item ${itemId} removed from trip ${tripId} by user ${user.id} ` +
                (isAdmin && !isOwner ? '(ADMIN override)' : '(owner)')
            );

            res.redirect('/trips/' + tripId);
        });
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
