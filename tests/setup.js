// Global env setup — runs before any module in any test file is loaded.
// Must use process.env assignments (not dotenv) so they apply to the test
// module registry before config/index.js is evaluated.

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://localhost:27017/file_service_test';
process.env.STORAGE_TYPE = 'local';
process.env.CORS_ORIGIN = '*';
process.env.DEFAULT_TENANT_ID = 'test-tenant';

// Raise rate-limit caps so tests never get 429'd
process.env.UPLOAD_RATE_LIMIT  = '10000';
process.env.GENERAL_RATE_LIMIT = '10000';
