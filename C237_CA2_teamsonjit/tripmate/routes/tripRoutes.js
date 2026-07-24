// ============================================
// Trip Routes
// Owners: Students B, C, D, E, F
// ============================================
const express = require('express');
const router = express.Router();
const { db } = require('../app');
const { isLoggedIn } = require('./authRoutes');
const { getTripAccess } = require('../utils/tripAccess');

// ============================================
// Student C - View trips (dashboard + detail)
// ============================================
// Dashboard shows trips the user owns AND trips shared with them as a
// collaborator (previously owned-only, so a shared trip never appeared
// here — collaborators had to know to use the "Shared with me" search
// filter to find it at all).
router.get('/', isLoggedIn, (req, res) => {
    const userId = req.session.user.id;
    const sql = `
        SELECT DISTINCT t.*,
            CASE WHEN t.user_id = ? THEN 'owner' ELSE tc.permission END AS access_level
        FROM trips t
        LEFT JOIN trip_collaborators tc ON tc.trip_id = t.trip_id AND tc.user_id = ?
        WHERE t.user_id = ? OR tc.user_id = ?
        ORDER BY t.start_date ASC
    `;
    db.query(sql, [userId, userId, userId, userId], (err, trips) => {
        if (err) return res.send('Error loading trips.');
        res.render('trips/index', {
            trips,
            filters: { keyword: '', access: 'all', status: 'all', sort: 'date_asc', min_budget: '', max_budget: '' },
            searchErrors: [],
            searchPerformed: false
        });
    });
});

// Trip detail is visible to the owner, any collaborator the trip has been
// shared with (view or edit permission), and admins (who can view/delete
// any trip even without an explicit share — same override the delete
// route already has).
router.get('/:id', isLoggedIn, (req, res) => {
    const itemsSql = 'SELECT * FROM itinerary_items WHERE trip_id = ? ORDER BY item_date, item_time';

    function renderTrip(trip) {
        db.query(itemsSql, [trip.trip_id], (err2, items) => {
            if (err2) return res.send('Error loading itinerary items.');
            res.render('trips/view', { trip, items });
        });
    }

    getTripAccess(req.params.id, req.session.user.id, (err, trip) => {
        if (err) return res.send('Error loading trip.');
        if (trip) return renderTrip(trip);

        if (req.session.user.role !== 'admin') {
            return res.status(403).send('Trip not found or access denied.');
        }

        db.query('SELECT * FROM trips WHERE trip_id = ?', [req.params.id], (err2, results) => {
            if (err2 || results.length === 0) return res.status(404).send('Trip not found.');
            renderTrip({ ...results[0], access_level: 'admin' });
        });
    });
});

// ============================================
// Noel - Create trip (forms + validation)
// ============================================

// Helper: re-render the create-trip form with the destinations dropdown populated
function renderCreateTripForm(res, viewData) {
    const destSql = 'SELECT * FROM destinations ORDER BY name';
    db.query(destSql, (err, destinations) => {
        res.render('trips/create', { ...viewData, destinations: err ? [] : destinations });
    });
}

router.get('/create/new', isLoggedIn, (req, res) => {
    renderCreateTripForm(res, { errors: [], formData: {} });
});

router.post('/create', isLoggedIn, (req, res) => {
    const {
        destination_id, trip_name, start_date, end_date, budget, notes,
        custom_destination_name, custom_destination_country
    } = req.body;
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
    if (destination_id === 'other' && (!custom_destination_name || custom_destination_name.trim() === '')) {
        errors.push('Please enter a name for the custom destination.');
    }

    const formData = {
        destination_id, trip_name, start_date, end_date, budget, notes,
        custom_destination_name, custom_destination_country
    };

    if (errors.length > 0) {
        return renderCreateTripForm(res, { errors, formData });
    }

    function insertTrip(finalDestinationId) {
        const sql = `INSERT INTO trips (user_id, destination_id, trip_name, start_date, end_date, budget, notes)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`;

        db.query(sql, [req.session.user.id, finalDestinationId, trip_name.trim(), start_date, end_date, budget || 0, notes], (err) => {
            if (err) {
                console.error(err);
                return renderCreateTripForm(res, {
                    errors: ['Something went wrong creating your trip. Please try again.'],
                    formData
                });
            }
            req.flash('success', `"${trip_name.trim()}" was created.`);
            res.redirect('/trips');
        });
    }

    if (destination_id === 'other') {
        // New custom destination: name is required (validated above), country
        // falls back to '' rather than NULL since the column is NOT NULL.
        const destSql = 'INSERT INTO destinations (name, country, description) VALUES (?, ?, NULL)';
        db.query(destSql, [custom_destination_name.trim(), (custom_destination_country || '').trim()], (destErr, destResult) => {
            if (destErr) {
                console.error(destErr);
                return renderCreateTripForm(res, {
                    errors: ['Something went wrong saving the custom destination. Please try again.'],
                    formData
                });
            }
            insertTrip(destResult.insertId);
        });
    } else {
        insertTrip(destination_id || null);
    }
});

// ============================================
// Noel - Add itinerary item (forms + validation)
// ============================================
router.get('/:tripId/items/new', isLoggedIn, (req, res) => {
    getTripAccess(req.params.tripId, req.session.user.id, (err, trip) => {
        if (err) return res.send('Error loading trip.');
        if (!trip) return res.status(403).send('Trip not found or access denied.');
        if (trip.access_level !== 'owner' && trip.access_level !== 'edit') {
            return res.status(403).send('You only have view access to this trip.');
        }

        res.render('trips/add-item', { trip, errors: [], formData: {} });
    });
});

router.post('/:tripId/items/create', isLoggedIn, (req, res) => {
    getTripAccess(req.params.tripId, req.session.user.id, (err, trip) => {
        if (err) return res.send('Error loading trip.');
        if (!trip || (trip.access_level !== 'owner' && trip.access_level !== 'edit')) {
            return res.status(403).send('You do not have permission to add items to this trip.');
        }

        const { item_name, category, item_date, item_time, location, cost, notes } = req.body;
        const errors = [];
        const validCategories = ['flight', 'hotel', 'activity', 'food', 'transport', 'other'];

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
                req.flash('success', `"${item_name.trim()}" was added to the itinerary.`);
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
        res.render('trips/edit', { trip, errors: [] });
    });
});

router.post('/:id/edit', isLoggedIn, (req, res) => {
    getTripAccess(req.params.id, req.session.user.id, (err, trip) => {
        if (err) return res.send('Error loading trip.');
        if (!trip || (trip.access_level !== 'owner' && trip.access_level !== 'edit')) {
            return res.status(403).send('You do not have permission to edit this trip.');
        }

        const { trip_name, start_date, end_date, budget, notes } = req.body;
        const errors = [];

        // ---- Server-side validation (never trust the client) — same rules as create ----
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
            return res.render('trips/edit', {
                trip: { ...trip, trip_name, start_date, end_date, budget, notes },
                errors
            });
        }

        const sql = `UPDATE trips SET trip_name = ?, start_date = ?, end_date = ?, budget = ?, notes = ?
                     WHERE trip_id = ?`;

        db.query(sql, [trip_name.trim(), start_date, end_date, budget || 0, notes, req.params.id], (err2) => {
            if (err2) {
                console.error(err2);
                return res.render('trips/edit', {
                    trip: { ...trip, trip_name, start_date, end_date, budget, notes },
                    errors: ['Something went wrong updating your trip. Please try again.']
                });
            }
            req.flash('success', 'Trip updated.');
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
            res.render('trips/edit-item', { trip, item: itemResults[0], errors: [] });
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
        const errors = [];
        const validCategories = ['flight', 'hotel', 'activity', 'food', 'transport', 'other'];

        // ---- Server-side validation (never trust the client) — same rules as add-item ----
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
            return res.render('trips/edit-item', {
                trip,
                item: { item_id: req.params.itemId, item_name, category, item_date, item_time, location, cost, notes },
                errors
            });
        }

        const updateSql = `UPDATE itinerary_items
                            SET item_name = ?, category = ?, item_date = ?, item_time = ?, location = ?, cost = ?, notes = ?
                            WHERE item_id = ? AND trip_id = ?`;

        db.query(updateSql,
            [item_name.trim(), category, item_date, item_time || null, location, cost || 0, notes, req.params.itemId, req.params.tripId],
            (err2) => {
                if (err2) {
                    console.error(err2);
                    return res.render('trips/edit-item', {
                        trip,
                        item: { item_id: req.params.itemId, item_name, category, item_date, item_time, location, cost, notes },
                        errors: ['Something went wrong updating the item. Please try again.']
                    });
                }
                req.flash('success', 'Itinerary item updated.');
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

                req.flash('success', `"${trip.trip_name}" was deleted.` + (isAdmin && !isOwner ? ' (admin override)' : ''));
                res.redirect('/trips');
            });
        });
    });
});

// ============================================
// Student E - Delete itinerary item
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

            req.flash('success', 'Itinerary item deleted.');
            res.redirect('/trips/' + tripId);
        });
    });
});

// ============================================
// Student F - Search / filter / sort trips in bryanRoutes.js
// ============================================

module.exports = router;