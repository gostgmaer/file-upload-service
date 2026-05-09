const express = require('express');
const mongoose = require('mongoose');
const { version } = require('../../package.json');
const AdapterFactory = require('../adapters/AdapterFactory');
const { storage, scaling } = require('../config');

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
    if (scaling.redisUrl) {
      const Redis = require('ioredis');
      const redis = new Redis(scaling.redisUrl, {
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

  // 3. Storage adapter check — verify actual connection
  try {
    const adapter = AdapterFactory.createAdapter();
    
    // Test the actual connection based on storage type
    const storageType = storage.type;
    
    if (storageType.toLowerCase() === 'azure') {
      // For Azure: try to get container properties
      const { BlobServiceClient } = require('@azure/storage-blob');
      const blobServiceClient = BlobServiceClient.fromConnectionString(storage.azure.connectionString);
      const containerClient = blobServiceClient.getContainerClient(storage.azure.container);
      // This will throw if connection/auth fails
      await containerClient.getProperties();
      checks.storage = 'ok';
    } else if (storageType.toLowerCase() === 's3' || storageType.toLowerCase() === 'r2') {
      // For S3/R2: try to list buckets or get bucket location
      const { S3Client, HeadBucketCommand } = require('@aws-sdk/client-s3');
      
      let s3Config = {
        region: storage.s3.region,
      };
      
      if (storageType.toLowerCase() === 'r2') {
        // R2 specific configuration (must match R2Adapter)
        const endpoint = storage.r2.endpoint.startsWith('http')
          ? storage.r2.endpoint
          : `https://${storage.r2.endpoint}`;
        
        s3Config = {
          region: 'auto',
          endpoint,
          credentials: {
            accessKeyId: storage.r2.accessKey,
            secretAccessKey: storage.r2.secretKey,
          },
          forcePathStyle: true,
        };
      } else {
        // S3 configuration
        s3Config.credentials = {
          accessKeyId: storage.s3.accessKey,
          secretAccessKey: storage.s3.secretKey,
        };
      }
      
      const s3Client = new S3Client(s3Config);
      const bucket = storageType.toLowerCase() === 'r2' 
        ? storage.r2.bucket 
        : storage.s3.bucket;
      
      await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
      checks.storage = 'ok';
    } else if (storageType.toLowerCase() === 'gcs') {
      // For GCS: try to get bucket metadata
      const { Storage } = require('@google-cloud/storage');
      const gcsStorage = new Storage({
        projectId: storage.gcs.projectId,
        keyFilename: storage.gcs.keyFile,
      });
      const bucket = gcsStorage.bucket(storage.gcs.bucket);
      await bucket.getMetadata();
      checks.storage = 'ok';
    } else if (storageType.toLowerCase() === 'local') {
      // For local: just check if directory is accessible
      const fs = require('fs');
      fs.accessSync(storage.localPath, fs.constants.W_OK);
      checks.storage = 'ok';
    } else {
      checks.storage = `unsupported_type: ${storageType}`;
      allHealthy = false;
    }
  } catch (error) {
    console.error('[healthRoutes] Storage check error:', error);
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
