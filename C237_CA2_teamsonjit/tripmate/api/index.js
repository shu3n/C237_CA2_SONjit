// ============================================
// Vercel serverless entrypoint.
// Vercel treats any file under /api as a serverless function; this
// just hands it the same Express app used by `node app.js` locally.
// app.js only calls app.listen() when run directly (require.main ===
// module), so importing it here does not try to bind a port.
// ============================================
module.exports = require('../app');
