require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const { server: serverConfig, scaling } = require('./src/config');

const { tenantMiddleware } = require('./src/middleware/tenant');
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
    allowedHeaders: ['Content-Type', 'X-Tenant-Id', 'X-User-Id', 'X-User-Role', 'Authorization'],
  })
);

// Body parsers (only for non-multipart routes)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health check — no tenant required, no rate limit
app.use('/health', healthRoutes);

// Global API rate limiter — all /api routes (configurable: GENERAL_RATE_LIMIT / GENERAL_RATE_WINDOW)
app.use('/api', generalRateLimiter);

// Apply tenant middleware globally to all API routes
app.use('/api', tenantMiddleware);

// API routes
app.use('/api/files', fileRoutes);

// 404 handler
app.use(notFound);

// Global error handler
app.use(globalErrorHandler);

module.exports = app;
