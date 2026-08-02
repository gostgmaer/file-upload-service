const Joi = require('joi');

const envSchema = Joi.object({
  PORT: Joi.number().default(4001),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  MONGO_URI: Joi.string().required(),
  GATEWAY_AUTH_REQUIRED: Joi.boolean().default(true),
  GATEWAY_INTERNAL_SECRET: Joi.string().when('GATEWAY_AUTH_REQUIRED', {
    is: true,
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  // 'per-db' is documented/schema-validated but not actually implemented
  // (getTenantConnection() in src/config/db.js is dead code, never called) --
  // reject it explicitly rather than silently accepting a value that
  // wouldn't do anything, which could mislead an operator into thinking
  // they have real per-tenant DB isolation when they don't.
  TENANCY_MODE: Joi.string().valid('shared').default('shared'),
  // Matches middleware/tenant.js's actual runtime default -- this value is
  // never written back to process.env (validateEnv()'s return is discarded
  // at startup), so keeping the two in sync is purely to avoid a
  // misleading validated-config value; tenant.js's own default is what
  // actually takes effect.
  DEFAULT_TENANT_ID: Joi.string().default('easydev'),
  STORAGE_TYPE: Joi.string().valid('local', 's3', 'gcs', 'azure', 'r2').default('local'),
  LOCAL_UPLOAD_DIR: Joi.string().default('uploads'),
  // Required whenever local storage is active - signs LocalAdapter's download
  // URLs (HMAC + expiry) so they're a real bearer token, not a guessable raw
  // path. Same required-when-active pattern as the cloud adapters' credentials.
  LOCAL_SIGNED_URL_SECRET: Joi.string().when('STORAGE_TYPE', {
    is: 'local',
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().allow('').optional(),
  }),

  // S3
  S3_BUCKET: Joi.string().when('STORAGE_TYPE', { is: 's3', then: Joi.string().required(), otherwise: Joi.string().allow('').optional() }),
  S3_REGION: Joi.string().allow('').optional(),
  S3_ACCESS_KEY: Joi.string().when('STORAGE_TYPE', { is: 's3', then: Joi.string().required(), otherwise: Joi.string().allow('').optional() }),
  S3_SECRET_KEY: Joi.string().when('STORAGE_TYPE', { is: 's3', then: Joi.string().required(), otherwise: Joi.string().allow('').optional() }),
  S3_SSE_ALGORITHM: Joi.string().valid('AES256', 'aws:kms').default('AES256'),
  S3_SSE_KMS_KEY_ID: Joi.string().allow('').optional(),

  // GCS
  GCS_BUCKET: Joi.string().when('STORAGE_TYPE', { is: 'gcs', then: Joi.string().required(), otherwise: Joi.string().allow('').optional() }),
  GCS_PROJECT_ID: Joi.string().allow('').optional(),
  GCS_KEY_FILE: Joi.string().allow('').optional(),

  // Azure
  AZURE_CONNECTION_STRING: Joi.string().when('STORAGE_TYPE', { is: 'azure', then: Joi.string().required(), otherwise: Joi.string().allow('').optional() }),
  AZURE_CONTAINER: Joi.string().when('STORAGE_TYPE', { is: 'azure', then: Joi.string().required(), otherwise: Joi.string().allow('').optional() }),

  // R2
  R2_ENDPOINT: Joi.string().when('STORAGE_TYPE', { is: 'r2', then: Joi.string().required(), otherwise: Joi.string().allow('').optional() }),
  R2_ACCESS_KEY: Joi.string().when('STORAGE_TYPE', { is: 'r2', then: Joi.string().required(), otherwise: Joi.string().allow('').optional() }),
  R2_SECRET: Joi.string().when('STORAGE_TYPE', { is: 'r2', then: Joi.string().required(), otherwise: Joi.string().allow('').optional() }),
  R2_BUCKET: Joi.string().when('STORAGE_TYPE', { is: 'r2', then: Joi.string().required(), otherwise: Joi.string().allow('').optional() }),

  // File limits
  MAX_FILE_SIZE: Joi.number().default(10485760),
  ALLOWED_MIME_TYPES: Joi.string().optional(),
  ALLOWED_FILE_EXTENSIONS: Joi.string().optional(),
  UPLOAD_RATE_LIMIT: Joi.number().default(10),
  UPLOAD_RATE_WINDOW: Joi.number().default(900000),
  SIGNED_URL_EXPIRY: Joi.number().default(3600),

  // Malware scanning - optional. Absence is an accepted, logged state
  // (scanStatus=SKIPPED), not a fail-closed requirement like the storage
  // adapter credentials above.
  CLAMAV_HOST: Joi.string().allow('').optional(),
  CLAMAV_PORT: Joi.number().default(3310),

  // CORS — comma-separated list of allowed origins
  CORS_ORIGIN: Joi.string().default('http://localhost:3000'),

  // ─── Scaling ─────────────────────────────────────────────────────────────
  // 0 = auto (one worker per CPU core), 1 = single process (default)
  CLUSTER_WORKERS: Joi.number().integer().min(0).default(1),
  // Per-request timeout in ms before the socket is forcibly closed (0 = disabled)
  REQUEST_TIMEOUT_MS: Joi.number().integer().min(0).default(30000),
  // Global API rate-limit applied to ALL routes (per IP)
  GENERAL_RATE_LIMIT: Joi.number().integer().min(1).default(300),
  GENERAL_RATE_WINDOW: Joi.number().integer().min(1000).default(60000),
  // Enable gzip compression on responses
  ENABLE_COMPRESSION: Joi.boolean().default(true),
  // Optional Redis connection URL for distributed (multi-instance) rate limiting
  // e.g. redis://user:pass@host:6379  or  rediss://... for TLS
  REDIS_URL: Joi.string().uri().allow('').optional(),
}).unknown(true);

const validateEnv = () => {
  const { error, value } = envSchema.validate(process.env, { abortEarly: false });
  if (error) {
    const details = error.details.map((d) => d.message).join('\n');
    throw new Error(`Environment validation failed:\n${details}`);
  }
  return value;
};

module.exports = { validateEnv };
