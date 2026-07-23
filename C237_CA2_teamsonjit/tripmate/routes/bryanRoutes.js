// ============================================
// Bryan (Student F) - Trip organisation features
// Search, filter, sort, and collaborator sharing management
// ============================================
const express = require('express');
const router = express.Router();
const { isLoggedIn } = require('./authRoutes');

// The team's current app exports db at the end of app.js.
// Getting it lazily here avoids the circular-require problem during startup.
function getDb() {
    const { db } = require('../app');
    if (!db) {
        throw new Error('Database connection is not available.');
    }
    return db;
}

function setFlash(req, type, message) {
    if (typeof req.flash === 'function') {
        req.flash(type, message);
    }
}

function getOwnedTrip(tripId, userId, callback) {
    const sql = 'SELECT * FROM trips WHERE trip_id = ? AND user_id = ?';
    getDb().query(sql, [tripId, userId], (err, results) => {
        if (err) return callback(err, null);
        callback(null, results[0] || null);
    });
}

// ============================================
// SEARCH / FILTER / SORT
// GET /trips/search/results
// ============================================
router.get('/search/results', isLoggedIn, (req, res) => {
    const userId = req.session.user.id;
    const keyword = (req.query.keyword || '').trim();
    const access = ['all', 'owned', 'shared'].includes(req.query.access)
        ? req.query.access
        : 'all';
    const status = ['all', 'upcoming', 'ongoing', 'past'].includes(req.query.status)
        ? req.query.status
        : 'all';
    const sort = req.query.sort || 'date_asc';
    const minBudgetRaw = (req.query.min_budget || '').trim();
    const maxBudgetRaw = (req.query.max_budget || '').trim();

    const minBudget = minBudgetRaw === '' ? null : Number(minBudgetRaw);
    const maxBudget = maxBudgetRaw === '' ? null : Number(maxBudgetRaw);

    const errors = [];
    if (minBudget !== null && (!Number.isFinite(minBudget) || minBudget < 0)) {
        errors.push('Minimum budget must be a non-negative number.');
    }
    if (maxBudget !== null && (!Number.isFinite(maxBudget) || maxBudget < 0)) {
        errors.push('Maximum budget must be a non-negative number.');
    }
    if (minBudget !== null && maxBudget !== null && minBudget > maxBudget) {
        errors.push('Minimum budget cannot be greater than maximum budget.');
    }

    const filters = {
        keyword,
        access,
        status,
        sort,
        min_budget: minBudgetRaw,
        max_budget: maxBudgetRaw
    };

    if (errors.length > 0) {
        return res.status(400).render('trips/index', {
            trips: [],
            filters,
            searchErrors: errors,
            searchPerformed: true
        });
    }

    let sql = `
        SELECT DISTINCT
            t.*,
            owner.username AS owner_username,
            CASE
                WHEN t.user_id = ? THEN 'owner'
                ELSE tc.permission
            END AS access_level
        FROM trips t
        INNER JOIN users owner ON owner.user_id = t.user_id
        LEFT JOIN trip_collaborators tc
            ON tc.trip_id = t.trip_id AND tc.user_id = ?
        WHERE (t.user_id = ? OR tc.user_id = ?)
    `;
    const params = [userId, userId, userId, userId];

    if (keyword) {
        sql += ' AND (t.trip_name LIKE ? OR COALESCE(t.notes, \'\') LIKE ? OR owner.username LIKE ?)';
        const searchValue = `%${keyword}%`;
        params.push(searchValue, searchValue, searchValue);
    }

    if (access === 'owned') {
        sql += ' AND t.user_id = ?';
        params.push(userId);
    } else if (access === 'shared') {
        sql += ' AND t.user_id <> ? AND tc.user_id = ?';
        params.push(userId, userId);
    }

    if (status === 'upcoming') {
        sql += ' AND t.start_date > CURDATE()';
    } else if (status === 'ongoing') {
        sql += ' AND t.start_date <= CURDATE() AND t.end_date >= CURDATE()';
    } else if (status === 'past') {
        sql += ' AND t.end_date < CURDATE()';
    }

    if (minBudget !== null) {
        sql += ' AND t.budget >= ?';
        params.push(minBudget);
    }
    if (maxBudget !== null) {
        sql += ' AND t.budget <= ?';
        params.push(maxBudget);
    }

    const sortOptions = {
        date_asc: 't.start_date ASC, t.trip_name ASC',
        date_desc: 't.start_date DESC, t.trip_name ASC',
        budget_asc: 't.budget ASC, t.trip_name ASC',
        budget_desc: 't.budget DESC, t.trip_name ASC',
        name_asc: 't.trip_name ASC',
        name_desc: 't.trip_name DESC',
        newest: 't.created_at DESC'
    };
    sql += ` ORDER BY ${sortOptions[sort] || sortOptions.date_asc}`;

    getDb().query(sql, params, (err, trips) => {
        if (err) {
            console.error('[BRYAN SEARCH ERROR]', err);
            return res.status(500).send('Error searching trips.');
        }

        res.render('trips/index', {
            trips,
            filters,
            searchErrors: [],
            searchPerformed: true
        });
    });
});

// ============================================
// SHARE MANAGEMENT PAGE
// GET /trips/:id/share
// Only the trip owner may manage collaborators.
// ============================================
router.get('/:id/share', isLoggedIn, (req, res) => {
    const tripId = req.params.id;
    const userId = req.session.user.id;

    getOwnedTrip(tripId, userId, (err, trip) => {
        if (err) {
            console.error('[BRYAN SHARE LOAD ERROR]', err);
            return res.status(500).send('Error loading trip.');
        }
        if (!trip) {
            return res.status(403).send('Only the trip owner can manage sharing.');
        }

        const collaboratorSql = `
            SELECT
                tc.collaborator_id,
                tc.permission,
                tc.invited_at,
                u.user_id,
                u.username,
                u.email
            FROM trip_collaborators tc
            INNER JOIN users u ON u.user_id = tc.user_id
            WHERE tc.trip_id = ?
            ORDER BY u.username ASC
        `;

        getDb().query(collaboratorSql, [tripId], (err2, collaborators) => {
            if (err2) {
                console.error('[BRYAN COLLABORATOR LOAD ERROR]', err2);
                return res.status(500).send('Error loading collaborators.');
            }

            res.render('trips/share', {
                trip,
                collaborators,
                formData: { email: '', permission: 'view' }
            });
        });
    });
});

// ============================================
// INVITE OR CHANGE ACCESS
// POST /trips/:id/share
// ============================================
router.post('/:id/share', isLoggedIn, (req, res) => {
    const tripId = req.params.id;
    const ownerId = req.session.user.id;
    const email = (req.body.email || '').trim().toLowerCase();
    const permission = req.body.permission;

    if (!email || !['view', 'edit'].includes(permission)) {
        setFlash(req, 'error', 'Enter a valid user email and select view or edit access.');
        return res.redirect(`/trips/${tripId}/share`);
    }

    getOwnedTrip(tripId, ownerId, (err, trip) => {
        if (err) {
            console.error('[BRYAN SHARE OWNER CHECK ERROR]', err);
            return res.status(500).send('Error checking trip ownership.');
        }
        if (!trip) {
            return res.status(403).send('Only the trip owner can invite collaborators.');
        }

        const userSql = 'SELECT user_id, username, email FROM users WHERE LOWER(email) = ?';
        getDb().query(userSql, [email], (err2, users) => {
            if (err2) {
                console.error('[BRYAN USER LOOKUP ERROR]', err2);
                return res.status(500).send('Error finding user.');
            }
            if (users.length === 0) {
                setFlash(req, 'error', 'No registered TripMate user was found with that email.');
                return res.redirect(`/trips/${tripId}/share`);
            }

            const invitedUser = users[0];
            if (Number(invitedUser.user_id) === Number(ownerId)) {
                setFlash(req, 'error', 'You are already the owner of this trip.');
                return res.redirect(`/trips/${tripId}/share`);
            }

            const shareSql = `
                INSERT INTO trip_collaborators (trip_id, user_id, permission)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE permission = VALUES(permission)
            `;

            getDb().query(shareSql, [tripId, invitedUser.user_id, permission], (err3) => {
                if (err3) {
                    console.error('[BRYAN SHARE SAVE ERROR]', err3);
                    return res.status(500).send('Error saving collaborator access.');
                }

                setFlash(
                    req,
                    'success',
                    `${invitedUser.username} now has ${permission} access to ${trip.trip_name}.`
                );
                res.redirect(`/trips/${tripId}/share`);
            });
        });
    });
});

// ============================================
// UPDATE COLLABORATOR PERMISSION
// POST /trips/:id/share/:collaboratorId/update
// ============================================
router.post('/:id/share/:collaboratorId/update', isLoggedIn, (req, res) => {
    const tripId = req.params.id;
    const collaboratorId = req.params.collaboratorId;
    const ownerId = req.session.user.id;
    const permission = req.body.permission;

    if (!['view', 'edit'].includes(permission)) {
        setFlash(req, 'error', 'Invalid permission selected.');
        return res.redirect(`/trips/${tripId}/share`);
    }

    getOwnedTrip(tripId, ownerId, (err, trip) => {
        if (err) return res.status(500).send('Error checking trip ownership.');
        if (!trip) return res.status(403).send('Only the trip owner can change sharing permissions.');

        const sql = `
            UPDATE trip_collaborators
            SET permission = ?
            WHERE collaborator_id = ? AND trip_id = ?
        `;
        getDb().query(sql, [permission, collaboratorId, tripId], (err2, result) => {
            if (err2) {
                console.error('[BRYAN SHARE UPDATE ERROR]', err2);
                return res.status(500).send('Error updating collaborator permission.');
            }
            if (result.affectedRows === 0) {
                setFlash(req, 'error', 'Collaborator record was not found.');
            } else {
                setFlash(req, 'success', 'Collaborator permission updated.');
            }
            res.redirect(`/trips/${tripId}/share`);
        });
    });
});

// ============================================
// REMOVE COLLABORATOR
// POST /trips/:id/share/:collaboratorId/remove
// ============================================
router.post('/:id/share/:collaboratorId/remove', isLoggedIn, (req, res) => {
    const tripId = req.params.id;
    const collaboratorId = req.params.collaboratorId;
    const ownerId = req.session.user.id;

    getOwnedTrip(tripId, ownerId, (err, trip) => {
        if (err) return res.status(500).send('Error checking trip ownership.');
        if (!trip) return res.status(403).send('Only the trip owner can remove collaborators.');

        const sql = 'DELETE FROM trip_collaborators WHERE collaborator_id = ? AND trip_id = ?';
        getDb().query(sql, [collaboratorId, tripId], (err2, result) => {
            if (err2) {
                console.error('[BRYAN SHARE REMOVE ERROR]', err2);
                return res.status(500).send('Error removing collaborator.');
            }
            if (result.affectedRows === 0) {
                setFlash(req, 'error', 'Collaborator record was not found.');
            } else {
                setFlash(req, 'success', 'Collaborator removed from the trip.');
            }
            res.redirect(`/trips/${tripId}/share`);
        });
    });
});

module.exports = router;
