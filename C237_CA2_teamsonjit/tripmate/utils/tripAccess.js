// ============================================
// Trip Access
// Determines a user's access level to a trip: 'owner', 'edit', 'view', or null (no access)
// Used by both viewing and editing routes so collaborators aren't locked out.
// ============================================
const { db } = require('../app');

function getTripAccess(tripId, userId, callback) {
    const sql = `
        SELECT t.*,
            CASE
                WHEN t.user_id = ? THEN 'owner'
                ELSE tc.permission
            END AS access_level
        FROM trips t
        LEFT JOIN trip_collaborators tc
            ON tc.trip_id = t.trip_id AND tc.user_id = ?
        WHERE t.trip_id = ?
          AND (t.user_id = ? OR tc.user_id = ?)
    `;

    db.query(sql, [userId, userId, tripId, userId, userId], (err, results) => {
        if (err) return callback(err, null);
        if (results.length === 0) return callback(null, null); // no access at all
        callback(null, results[0]); // trip row + access_level: 'owner' | 'edit' | 'view'
    });
}

module.exports = { getTripAccess };