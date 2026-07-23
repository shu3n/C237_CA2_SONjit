// ============================================
// Admin Routes
// Owner: Student A - Access Control (admin-only dashboard)
// ============================================
const express = require('express');
const router = express.Router();
const { db } = require('../app');
const { isLoggedIn, isAdmin } = require('./authRoutes');

// ============================================
// Admin dashboard - view ALL trips in the system
// GET /admin/trips
// Guarded by isLoggedIn (must be authenticated) AND isAdmin
// (must have role 'admin'). Not scoped to the logged-in user.
// ============================================
router.get('/trips', isLoggedIn, isAdmin, (req, res) => {
    const sql = `SELECT t.*, u.username AS owner_username
                 FROM trips t
                 JOIN users u ON u.user_id = t.user_id
                 ORDER BY t.created_at DESC`;

    db.query(sql, (err, trips) => {
        if (err) {
            console.error('[ADMIN TRIPS ERROR]', err);
            return res.send('Error loading trips.');
        }
        res.render('admin/trips', { trips });
    });
});

// ============================================
// Admin stats dashboard
// GET /admin/stats
// Guarded by isLoggedIn AND isAdmin, same as /admin/trips.
//
// NOTE: A "most popular destinations" query (GROUP BY destination_id)
// can be added here later, once trips.destination_id is actually being
// populated by the create/edit forms. Not built yet — skipping for now.
// ============================================
router.get('/stats', isLoggedIn, isAdmin, (req, res) => {
    db.query('SELECT COUNT(*) AS total FROM users', (err, userCountResult) => {
        if (err) {
            console.error('[ADMIN STATS ERROR]', err);
            return res.send('Error loading stats.');
        }

        db.query('SELECT COUNT(*) AS total FROM trips', (err2, tripCountResult) => {
            if (err2) {
                console.error('[ADMIN STATS ERROR]', err2);
                return res.send('Error loading stats.');
            }

            db.query('SELECT COUNT(*) AS total FROM itinerary_items', (err3, itemCountResult) => {
                if (err3) {
                    console.error('[ADMIN STATS ERROR]', err3);
                    return res.send('Error loading stats.');
                }

                const categorySql = `SELECT category, COUNT(*) AS total FROM itinerary_items
                                      GROUP BY category ORDER BY total DESC`;

                db.query(categorySql, (err4, itemsByCategory) => {
                    if (err4) {
                        console.error('[ADMIN STATS ERROR]', err4);
                        return res.send('Error loading stats.');
                    }

                    const monthSql = `SELECT MONTH(start_date) AS month, COUNT(*) AS total FROM trips
                                       GROUP BY MONTH(start_date) ORDER BY month`;

                    db.query(monthSql, (err5, tripsByMonth) => {
                        if (err5) {
                            console.error('[ADMIN STATS ERROR]', err5);
                            return res.send('Error loading stats.');
                        }

                        res.render('admin/stats', {
                            totalUsers: userCountResult[0].total,
                            totalTrips: tripCountResult[0].total,
                            totalItems: itemCountResult[0].total,
                            itemsByCategory,
                            tripsByMonth
                        });
                    });
                });
            });
        });
    });
});

module.exports = router;
