// ============================================
// Trip Access
// Determines a user's access level to a trip: 'owner', 'edit', 'view',
// 'public-view', or null (no access).
// Used by both viewing and editing routes so collaborators aren't locked out.
//
// 'public-view' means: not the owner, not a collaborator, but the trip's
// visibility is 'public' so read-only viewing is allowed. It must never
// satisfy an 'owner'/'edit' check — callers that gate editing/deleting/
// sharing already compare access_level against those two values
// explicitly, so 'public-view' falls through to "not permitted" there
// with no extra code needed.
// ============================================
const { db } = require('../app');

function getTripAccess(tripId, userId, callback) {
    const sql = `
        SELECT t.*,
            CASE
                WHEN t.user_id = ? THEN 'owner'
                WHEN tc.permission IS NOT NULL THEN tc.permission
                WHEN t.visibility = 'public' THEN 'public-view'
                ELSE NULL
            END AS access_level
        FROM trips t
        LEFT JOIN trip_collaborators tc
            ON tc.trip_id = t.trip_id AND tc.user_id = ?
        WHERE t.trip_id = ?
    `;

    db.query(sql, [userId, userId, tripId], (err, results) => {
        if (err) return callback(err, null);
        if (results.length === 0) return callback(null, null); // trip doesn't exist
        const trip = results[0];
        if (trip.access_level === null) return callback(null, null); // private, no relationship — no access
        callback(null, trip); // access_level: 'owner' | 'edit' | 'view' | 'public-view'
    });
}

module.exports = { getTripAccess };
