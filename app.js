require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const { server: serverConfig, scaling } = require('./src/config');

const { tenantMiddleware } = require('./src/middleware/tenant');
const { verifyGatewaySignature } = require('./src/middleware/rbac');
const { notFound, globalErrorHandler } = require('./src/middleware/errorHandler');
const { generalRateLimiter } = require('./src/middleware/rateLimit');
const fileRoutes = require('./src/routes/fileRoutes');
const healthRoutes = require('./src/routes/healthRoutes');

const app = express();

// Security headers
app.use(helmet());

// Gzip compression — controlled via ENABLE_COMPRESSION env var
if (scaling.enableCompression) {
  app.use(compression());
}

// CORS — support a comma-separated list of allowed origins
const allowedOrigins = serverConfig.corsOrigin
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server / curl / Postman in dev)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes('*')) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' is not allowed`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-Tenant-Id',
      'X-User-Id',
      'X-User-Email',
      'X-User-Role',
      'X-User-Name',
      'X-Gateway-HMAC',
    ],
  })
);

// Body parsers (only for non-multipart routes)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Request ID + Response envelope ─────────────────────────────────────────────
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || require('crypto').randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  const _json = res.json.bind(res);
  res.json = function (body) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (body !== null && body !== undefined && typeof body === 'object' && !Array.isArray(body)) {
      body.timestamp  = new Date().toISOString();
      body.requestId  = req.requestId;
      body.statusCode = res.statusCode;
      body.status     = res.statusCode < 400 ? 'success' : 'error';
    }
    return _json(_cleanResponse(body));
  };
  next();
});

// ─── Gateway signature verification (HMAC) ────────────────────────────────────
// OPTIONAL: Verifies X-User-* headers if gateway secret is configured
// Works standalone without API Gateway - HMAC is optional
// Skip for health checks
app.use((req, res, next) => {
  if (req.path.startsWith('/health')) {
    return next();
  }
  verifyGatewaySignature(req, res, next);
});

// ─── Tenant & user context ───────────────────────────────────────────────────
app.use(tenantMiddleware);

// Health check — no tenant required, no rate limit
app.use('/health', healthRoutes);

// Global API rate limiter — all /api routes (configurable: GENERAL_RATE_LIMIT / GENERAL_RATE_WINDOW)
app.use('/api', generalRateLimiter);

// API routes
app.use('/api/files', fileRoutes);

// 404 handler
app.use(notFound);

// Global error handler
app.use(globalErrorHandler);

module.exports = app;

// ─── Response transform ───────────────────────────────────────────────────────
function _cleanResponse(val) {
  if (val === null || val === undefined) return undefined;
  if (typeof val !== 'object') return val;
  if (val instanceof Date) return val;
  if (Buffer.isBuffer(val)) return val;
  if (Array.isArray(val)) return val.map(_cleanResponse).filter(v => v !== undefined);
  const src = typeof val.toJSON === 'function' ? val.toJSON() : val;
  if (typeof src !== 'object' || src === null) return src;
  const out = {};
  for (const key of Object.keys(src)) {
    if (key === '__v' || key === '_id' || key === 'id' ||
        key === 'isDeleted' || key === 'deletedAt' ||
        key === 'created_by' || key === 'updated_by' || key === 'deleted_by') continue;
    const v = _cleanResponse(src[key]);
    if (v !== undefined) out[key] = v;
  }
  const rawId = src.id !== undefined ? src.id : src._id;
  if (rawId !== undefined) out.id = String(rawId);
  return out;
}
