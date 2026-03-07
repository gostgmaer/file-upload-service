const rateLimit = require('express-rate-limit');
const { storage, scaling } = require('../config');

// ─── Optional Redis store for distributed rate limiting ───────────────────────
// Install `ioredis` and `rate-limit-redis` when REDIS_URL is set.
// If packages are missing the limiter gracefully falls back to in-memory.
let redisStore = null;
if (scaling.redisUrl) {
  try {
    const { RedisStore } = require('rate-limit-redis');
    const Redis = require('ioredis');
    const client = new Redis(scaling.redisUrl, { lazyConnect: true, enableOfflineQueue: false });
    redisStore = new RedisStore({ sendCommand: (...args) => client.call(...args) });
    console.log('[rateLimit] Redis store enabled for distributed rate limiting');
  } catch {
    console.warn('[rateLimit] REDIS_URL is set but rate-limit-redis/ioredis are not installed — falling back to in-memory store');
  }
}

// ─── Upload rate limiter (configurable via UPLOAD_RATE_LIMIT / UPLOAD_RATE_WINDOW) ──
const uploadRateLimiter = rateLimit({
  windowMs: storage.uploadRateWindow,
  max: storage.uploadRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  ...(redisStore ? { store: redisStore } : {}),
  message: {
    success: false,
    message: 'Too many upload requests, please try again later',
  },
});

// ─── General API rate limiter (all routes, configurable via GENERAL_RATE_LIMIT / GENERAL_RATE_WINDOW) ──
const generalRateLimiter = rateLimit({
  windowMs: scaling.generalRateWindow,
  max: scaling.generalRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  ...(redisStore ? { store: redisStore } : {}),
  message: {
    success: false,
    message: 'Too many requests, please try again later',
  },
});

module.exports = { uploadRateLimiter, generalRateLimiter };
