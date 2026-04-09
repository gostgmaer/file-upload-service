const express = require('express');
const mongoose = require('mongoose');
const { version } = require('../../package.json');
const { AdapterFactory } = require('../adapters/AdapterFactory');

const router = express.Router();

/**
 * Liveness probe - is the service running?
 * Use for Kubernetes liveness checks
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'alive',
    service: 'file-upload-service',
    version,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    pid: process.pid
  });
});

/**
 * Readiness probe - is the service ready to accept traffic?
 * Checks all critical dependencies
 * Use for Kubernetes readiness checks
 */
router.get('/ready', async (req, res) => {
  const checks = {
    mongodb: 'unknown',
    redis: 'unknown',
    storage: 'unknown',
  };
  let allHealthy = true;

  // 1. MongoDB check
  try {
    const dbState = mongoose.connection.readyState;
    if (dbState === 1) {
      // Verify connection with ping
      await mongoose.connection.db.admin().ping();
      checks.mongodb = 'ok';
    } else {
      checks.mongodb = 'disconnected';
      allHealthy = false;
    }
  } catch (error) {
    checks.mongodb = `error: ${error.message}`;
    allHealthy = false;
  }

  // 2. Redis check (if configured)
  try {
    if (process.env.REDIS_URL) {
      const Redis = require('ioredis');
      const redis = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
      });
      
      await redis.ping();
      checks.redis = 'ok';
      redis.disconnect();
    } else {
      checks.redis = 'not_configured';
    }
  } catch (error) {
    checks.redis = `error: ${error.message}`;
    // Redis is optional for rate limiting, so don't fail health check
  }

  // 3. Storage adapter check
  try {
    const adapter = AdapterFactory.createAdapter();
    // Try to check if adapter is initialized (basic sanity check)
    if (adapter && typeof adapter.uploadFile === 'function') {
      checks.storage = 'ok';
    } else {
      checks.storage = 'invalid_adapter';
      allHealthy = false;
    }
  } catch (error) {
    checks.storage = `error: ${error.message}`;
    allHealthy = false;
  }

  res.status(allHealthy ? 200 : 503).json({
    success: allHealthy,
    status: allHealthy ? 'ready' : 'not_ready',
    service: 'file-upload-service',
    version,
    checks,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  });
});

/**
 * General health check - legacy endpoint
 * Includes basic system metrics
 */
router.get('/', async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const dbStatus = dbState === 1 ? 'connected' : 'disconnected';
    const mem = process.memoryUsage();
    const isHealthy = dbState === 1;

    res.status(isHealthy ? 200 : 503).json({
      success: isHealthy,
      status: isHealthy ? 'healthy' : 'degraded',
      service: 'file-upload-service',
      version,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      database: {
        status: dbStatus,
        state: dbState
      },
      memory: {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
        externalMB: Math.round(mem.external / 1024 / 1024)
      },
      process: {
        pid: process.pid,
        nodeVersion: process.version
      }
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'error',
      service: 'file-upload-service',
      version,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
