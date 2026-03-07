// Re-export storage config from central config — keeps backward-compat imports.
const { storage } = require('./index');
module.exports = { storage };
