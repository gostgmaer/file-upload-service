require('dotenv').config();

// ─── helpers ────────────────────────────────────────────────────────────────
const _int = (v, def) => {
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? def : n;
};
const _bool = (v, def = false) =>
  v === undefined || v === null ? def : v === 'true' || v === '1' || v === true;

// ─── server ─────────────────────────────────────────────────────────────────
const server = {
  port: _int(process.env.PORT, 4001),
  env: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
};

// ─── scaling ─────────────────────────────────────────────────────────────────
const scaling = {
  // 0 = auto (use all CPU cores), 1 = single process (default)
  clusterWorkers: _int(process.env.CLUSTER_WORKERS, 1),
  // Max milliseconds a request can be in-flight before the socket is forcibly closed
  requestTimeoutMs: _int(process.env.REQUEST_TIMEOUT_MS, 72000),
  // General API rate limit applied to ALL routes (per IP)
  generalRateLimit: _int(process.env.GENERAL_RATE_LIMIT, 300),
  generalRateWindow: _int(process.env.GENERAL_RATE_WINDOW, 60000), // 1 min
  // gzip compression of responses
  enableCompression: _bool(process.env.ENABLE_COMPRESSION, true),
  // Optional Redis URL for distributed rate limiting across instances
  redisUrl: process.env.REDIS_URL || '',
};

// ─── database ───────────────────────────────────────────────────────────────
const db = {
  uri: process.env.MONGO_URI || 'mongodb://localhost:27017/file_service_db',
  tenancyMode: process.env.TENANCY_MODE || 'shared', // 'shared' | 'per-db'
};

// ─── storage ────────────────────────────────────────────────────────────────
const storage = {
  type: process.env.STORAGE_TYPE || 'local',
  localPath: process.env.LOCAL_UPLOAD_DIR || 'uploads',

  maxFileSize: _int(process.env.MAX_FILE_SIZE, 10485760), // 10 MB
  allowedMimeTypes: process.env.ALLOWED_MIME_TYPES
    ? process.env.ALLOWED_MIME_TYPES.split(',').map((t) => t.trim())
    : ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
  uploadRateLimit: _int(process.env.UPLOAD_RATE_LIMIT, 10),
  uploadRateWindow: _int(process.env.UPLOAD_RATE_WINDOW, 900000), // 15 min
  signedUrlExpiry: _int(process.env.SIGNED_URL_EXPIRY, 3600), // 1 hr

  // AWS S3
  s3: {
    bucket: process.env.S3_BUCKET || process.env.AWS_S3_BUCKET || '',
    region: process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1',
    accessKey: process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID || '',
    secretKey: process.env.S3_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY || '',
    endpoint: process.env.S3_ENDPOINT || '',
  },

  // Google Cloud Storage
  gcs: {
    bucket: process.env.GCS_BUCKET || process.env.GCS_BUCKET_NAME || '',
    projectId: process.env.GCS_PROJECT_ID || '',
    keyFile: process.env.GCS_KEY_FILE || '',
  },

  // Azure Blob Storage
  azure: {
    container: process.env.AZURE_CONTAINER || process.env.AZURE_CONTAINER_NAME || '',
    connectionString:
      process.env.AZURE_CONNECTION_STRING ||
      process.env.AZURE_STORAGE_CONNECTION_STRING ||
      '',
  },

  // Cloudflare R2
  r2: {
    endpoint: process.env.R2_ENDPOINT || '',
    accessKey: process.env.R2_ACCESS_KEY || '',
    secretKey: process.env.R2_SECRET || '',
    bucket: process.env.R2_BUCKET || '',
    publicDomain: process.env.R2_PUBLIC_DOMAIN || '',
  },
};

module.exports = { server, db, storage, scaling };
