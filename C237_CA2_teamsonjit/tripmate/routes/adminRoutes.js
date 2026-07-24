// ============================================
// Admin Routes
// Owner: Student A - Access Control (admin-only dashboard)
// ============================================
const express = require('express');
const router = express.Router();
const { db } = require('../app');
const { isLoggedIn, isAdmin } = require('./authRoutes');

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];

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
// Shared data-fetching for the stats dashboard, used by both the HTML
// view (GET /admin/stats) and the CSV export (GET /admin/stats/export)
// so the two can never drift out of sync with each other.
// ============================================
function getStatsData(callback) {
    db.query('SELECT COUNT(*) AS total FROM users', (err, userCountResult) => {
        if (err) return callback(err);

        db.query('SELECT COUNT(*) AS total FROM trips', (err2, tripCountResult) => {
            if (err2) return callback(err2);

            db.query('SELECT COUNT(*) AS total FROM itinerary_items', (err3, itemCountResult) => {
                if (err3) return callback(err3);

                const categorySql = `SELECT category, COUNT(*) AS total FROM itinerary_items
                                      GROUP BY category ORDER BY total DESC`;

                db.query(categorySql, (err4, itemsByCategory) => {
                    if (err4) return callback(err4);

                    const monthSql = `SELECT MONTH(start_date) AS month, COUNT(*) AS total FROM trips
                                       GROUP BY MONTH(start_date) ORDER BY month`;

                    db.query(monthSql, (err5, tripsByMonth) => {
                        if (err5) return callback(err5);

                        // Popularity of each destination = how many trips reference it.
                        // LEFT JOIN so destinations with zero trips still show up (at 0),
                        // giving a complete picture of the catalog, not just the ones used.
                        const destinationSql = `
                            SELECT d.destination_id, d.name, d.country, COUNT(t.trip_id) AS total
                            FROM destinations d
                            LEFT JOIN trips t ON t.destination_id = d.destination_id
                            GROUP BY d.destination_id, d.name, d.country
                            ORDER BY total DESC, d.name ASC
                        `;

                        db.query(destinationSql, (err6, destinationPopularity) => {
                            if (err6) return callback(err6);

                            callback(null, {
                                totalUsers: userCountResult[0].total,
                                totalTrips: tripCountResult[0].total,
                                totalItems: itemCountResult[0].total,
                                itemsByCategory,
                                tripsByMonth,
                                destinationPopularity
                            });
                        });
                    });
                });
            });
        });
    });
}

// ============================================
// Admin stats dashboard
// GET /admin/stats
// Guarded by isLoggedIn AND isAdmin, same as /admin/trips.
// ============================================
router.get('/stats', isLoggedIn, isAdmin, (req, res) => {
    getStatsData((err, data) => {
        if (err) {
            console.error('[ADMIN STATS ERROR]', err);
            return res.send('Error loading stats.');
        }
        res.render('admin/stats', data);
    });
});

// ---- CSV field escaping: quote the field if it contains a comma, quote,
// or newline, doubling up any internal quotes (standard CSV escaping). ----
function csvEscape(value) {
    const str = String(value === null || value === undefined ? '' : value);
    if (/[",\n]/.test(str)) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function csvRow(fields) {
    return fields.map(csvEscape).join(',') + '\r\n';
}

// ============================================
// CSV export of the same stats dashboard data
// GET /admin/stats/export
// ============================================
router.get('/stats/export', isLoggedIn, isAdmin, (req, res) => {
    getStatsData((err, data) => {
        if (err) {
            console.error('[ADMIN STATS EXPORT ERROR]', err);
            return res.status(500).send('Error generating export.');
        }

        let csv = '';
        csv += csvRow(['TripMate Admin Stats Export']);
        csv += csvRow(['Generated', new Date().toISOString()]);
        csv += '\r\n';

        csv += csvRow(['Summary']);
        csv += csvRow(['Metric', 'Count']);
        csv += csvRow(['Total Users', data.totalUsers]);
        csv += csvRow(['Total Trips', data.totalTrips]);
        csv += csvRow(['Total Itinerary Items', data.totalItems]);
        csv += '\r\n';

        csv += csvRow(['Destination Popularity']);
        csv += csvRow(['Destination', 'Country', 'Trips']);
        data.destinationPopularity.forEach((d) => {
            csv += csvRow([d.name, d.country, d.total]);
        });
        csv += '\r\n';

        csv += csvRow(['Itinerary Items by Category']);
        csv += csvRow(['Category', 'Total']);
        data.itemsByCategory.forEach((row) => {
            csv += csvRow([row.category, row.total]);
        });
        csv += '\r\n';

        csv += csvRow(['Trips by Month']);
        csv += csvRow(['Month', 'Total']);
        data.tripsByMonth.forEach((row) => {
            csv += csvRow([MONTH_NAMES[row.month], row.total]);
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="tripmate-stats.csv"');
        res.send(csv);
    });
});

module.exports = router;
