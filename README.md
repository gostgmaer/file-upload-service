# File Upload Service

A production-ready,microservice for file upload and management with multi-tenant support, RBAC, and multiple cloud storage backends.

## Features

✅ **Multi-Cloud Storage** - S3, Azure Blob, Google Cloud Storage, Cloudflare R2, Local  
✅ **Multi-Tenancy** - Complete tenant isolation at database and storage level  
✅ **RBAC** - Role-based access control integrated with API Gateway  
✅ **Security** - HMAC signature verification, magic byte validation, file sanitization  
✅ **Scalable** - Cluster mode, Redis-based rate limiting, connection pooling  
✅ **Production Ready** - Health checks, retry logic, comprehensive error handling  
✅ **API Gateway Integration** - JWT validation handled upstream  

---

## Quick Start

### Prerequisites

- **Node.js** >= 20
- **MongoDB** >= 6.0 (or MongoDB Atlas)
- **pnpm** (or npm/yarn)
- **Redis** (optional, for distributed rate limiting)

### Installation

```bash
# Clone repository
git clone <repository-url>
cd file-upload-service

# Install dependencies
pnpm install

# Copy environment template
cp .env.example env

# Configure environment variables (see Configuration section)
nano env

# Start MongoDB (if using Docker)
docker-compose up -d mongo redis

# Run the service
pnpm start

# Development mode with auto-reload
pnpm dev
```

### Docker Deployment

```bash
# Build and run all services
docker-compose up -d

# View logs
docker-compose logs -f file-service

# Stop services
docker-compose down
```

---

## Configuration

### Environment Variables

Create an `env` file from `.env.example` and configure:

#### Server
```env
PORT=4001
NODE_ENV=production
```

#### API Gateway Integration (REQUIRED)
```bash
# Generate with: openssl rand -hex 32
GATEWAY_INTERNAL_SECRET=your-64-char-hex-string
```

#### MongoDB
```env
MONGO_URI=mongodb://localhost:27017/file_service_db
```

#### Multi-Tenancy
```env
TENANCY_ENABLED=true
TENANCY_MODE=shared           # shared | per-db
DEFAULT_TENANT_ID=default
```

#### Storage Backend
```env
STORAGE_TYPE=azure             # local | s3 | gcs | azure | r2

# For Azure Blob Storage
AZURE_ACCOUNT=your-storage-account
AZURE_ACCESS_KEY=your-access-key
AZURE_CONNECTION_STRING=DefaultEndpointsProtocol=https;...
AZURE_CONTAINER=files

# For AWS S3
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_S3_BUCKET=your-bucket
AWS_REGION=us-east-1

# For Google Cloud Storage
GCS_PROJECT_ID=your-project
GCS_BUCKET=your-bucket
GCS_KEY_FILE=path/to/service-account.json

# For Cloudflare R2
R2_ENDPOINT=https://your-account.r2.cloudflarestorage.com
R2_ACCESS_KEY=your-access-key
R2_SECRET=your-secret
R2_BUCKET=your-bucket
```

#### Security & Limits
```env
MAX_FILE_SIZE=10485760                                    # 10MB
ALLOWED_MIME_TYPES=image/jpeg,image/png,application/pdf
UPLOAD_RATE_LIMIT=10                                      # 10 uploads per window
UPLOAD_RATE_WINDOW=900000                                 # 15 minutes
CORS_ORIGIN=https://yourdomain.com
```

#### Scaling
```env
CLUSTER_WORKERS=0              # 0 = auto (one per CPU core)
REQUEST_TIMEOUT_MS=30000       # 30 seconds
ENABLE_COMPRESSION=true
```

#### Redis (Optional)
```env
REDIS_URL=redis://:password@localhost:6379
```

---

## API Documentation

### Authentication

All non-health requests must include signed identity headers from API Gateway when `GATEWAY_AUTH_REQUIRED=true`:

```
X-User-Id: user-identifier
X-User-Email: user@example.com
X-User-Role: anonymous | user | admin
X-Tenant-Id: tenant-slug
X-Gateway-HMAC: signature
```

**Note:** The API Gateway handles JWT validation and forwards user context via these headers.

### Roles & Permissions

| Role | Permissions |
|------|-------------|
| `anonymous` | No file API access |
| `user` | Upload, view, download, list, update, rename, replace files |
| `admin` | All user + delete files, bulk operations |

### Endpoints

#### Upload Files
```http
POST /api/files/upload
Content-Type: multipart/form-data
X-User-Role: user

files: <file1>, <file2>, ...
description: Optional description
tags: tag1,tag2,tag3
```

#### List Files
```http
GET /api/files?page=1&limit=20&search=query&status=active
X-User-Role: user
```

#### Get File Metadata
```http
GET /api/files/:id
X-User-Role: user
```

#### Download File
```http
GET /api/files/:id/download
X-User-Role: user
```

#### Update File Metadata
```http
PATCH /api/files/:id
X-User-Role: user
Content-Type: application/json

{
  "description": "Updated description",
  "tags": ["tag1", "tag2"]
}
```

#### Rename File
```http
PATCH /api/files/:id/rename
X-User-Role: user
Content-Type: application/json

{
  "newName": "new-filename.jpg"
}
```

#### Replace File Content
```http
PUT /api/files/:id/replace
X-User-Role: user
Content-Type: multipart/form-data

file: <new-file>
```

#### Delete File (Soft Delete)
```http
DELETE /api/files/:id
X-User-Role: admin
```

#### Permanent Delete
```http
DELETE /api/files/:id/permanent
X-User-Role: admin
```

#### Bulk Operations
```http
POST /api/files/bulk/delete
POST /api/files/bulk/permanent-delete
PATCH /api/files/bulk/metadata
POST /api/files/bulk/signed-urls
X-User-Role: admin
```

### Health Checks

```http
GET /                    # API information and documentation
GET /health              # General health with metrics (legacy)
GET /health/live         # Liveness probe (is service running?)
GET /health/ready        # Readiness probe (can accept traffic?)
```

**Example Response (`GET /`):**
```json
{
  "success": true,
  "service": "File Upload Service",
  "version": "1.0.0",
  "description": "Multi-tenant file upload microservice with cloud storage support",
  "status": "running",
  "documentation": {
    "health": {
      "general": "GET /health",
      "liveness": "GET /health/live",
      "readiness": "GET /health/ready"
    },
    "api": {
      "upload": "POST /api/files/upload",
      "list": "GET /api/files",
      "getFile": "GET /api/files/:id",
      "download": "GET /api/files/:id/download"
    }
  },
  "timestamp": "2026-04-09T...",
  "statusCode": 200,
  "requestId": "..."
}
```

**Example Response (`GET /health`):**
```json
{
  "success": true,
  "status": "healthy",
  "service": "file-upload-service",
  "version": "1.0.0",
  "uptime": 3600,
  "environment": "development",
  "database": {
    "status": "connected",
    "state": 1
  },
  "memory": {
    "heapUsedMB": 45,
    "heapTotalMB": 128,
    "rssMB": 150,
    "externalMB": 2
  },
  "process": {
    "pid": 12345,
    "nodeVersion": "v20.11.0"
  }
}
```

**Example Response (`GET /health/ready`):**
```json
{
  "success": true,
  "status": "ready",
  "service": "file-upload-service",
  "version": "1.0.0",
  "checks": {
    "mongodb": "ok",
    "redis": "not_configured",
    "storage": "ok"
  },
  "uptime": 3600
}
```

---

## Architecture

### Components

```
┌─────────────┐         ┌──────────────┐         ┌─────────────────┐
│   Client    │────────▶│ API Gateway  │────────▶│  File Service   │
│             │         │ (JWT Auth)   │         │                 │
└─────────────┘         └──────────────┘         └────────┬────────┘
                                                           │
                              ┌────────────────────────────┤
                              │                            │
                    ┌─────────▼──────┐         ┌──────────▼────────┐
                    │    MongoDB      │         │  Storage Backend  │
                    │ (Tenant-Scoped) │         │ (S3/Azure/GCS/R2) │
                    └─────────────────┘         └───────────────────┘
```

### Storage Adapters

The service uses an adapter pattern for storage backends:

- **LocalAdapter** - Local filesystem (development)
- **S3Adapter** - AWS S3 or S3-compatible
- **AzureAdapter** - Azure Blob Storage
- **GCSAdapter** - Google Cloud Storage
- **R2Adapter** - Cloudflare R2

All adapters implement the same interface: `uploadFile()`, `downloadFile()`, `deleteFile()`, `getSignedUrl()`.

### Multi-Tenancy

Two modes supported:

**Shared DB Mode** (recommended)
- Single MongoDB database
- `tenantId` field on all documents
- Automatic query filtering
- Better resource utilization

**Per-DB Mode**
- Separate database per tenant
- Complete data isolation
- Higher cost, more complex

---

## Security

### File Validation

1. **Magic Byte Validation** - Verifies file content matches declared type
2. **File Size Limits** - Prevents storage exhaustion
3. **MIME Type Whitelist** - Only allowed file types accepted
4. **Filename Sanitization** - Removes dangerous characters
5. **Reserved Name Detection** - Blocks Windows reserved names (CON, PRN, etc.)

### HMAC Signature Verification

All requests are verified using HMAC-SHA256:

```javascript
const hmacPayload = `${userId}:${email}:${role}`;
const signature = crypto.createHmac('sha256', GATEWAY_INTERNAL_SECRET)
  .update(hmacPayload)
  .digest('hex');
```

This prevents header tampering between gateway and service.

### Tenant Isolation

- All database queries automatically filter by `tenantId`
- Cross-tenant access is impossible (even for admins)
- Integration tests verify isolation (see `tests/integration/tenant-isolation.test.js`)

---

## Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage

# Run only integration tests
pnpm test tests/integration
```

### Critical Tests

**Tenant Isolation** (`tests/integration/tenant-isolation.test.js`)
- Verifies tenants cannot access each other's data
- Tests all CRUD operations with real MongoDB
- **MUST PASS** before production deployment

---

## Deployment

### Production Checklist

Before deploying to production:

- [ ] Rotate all credentials (MongoDB, Azure, etc.)
- [ ] Generate strong `GATEWAY_INTERNAL_SECRET` (32+ chars)
- [ ] Remove `env` from git repository
- [ ] Set `NODE_ENV=production`
- [ ] Configure `CLUSTER_WORKERS=0` (auto-scale)
- [ ] Set up MongoDB connection pooling
- [ ] Configure Redis for distributed rate limiting
- [ ] Enable compression (`ENABLE_COMPRESSION=true`)
- [ ] Set appropriate CORS origins
- [ ] Run integration tests with production-like data
- [ ] Configure health check endpoints in load balancer
- [ ] Set up monitoring and alerting
- [ ] Document backup/restore procedures

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: file-service
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: file-service
        image: your-registry/file-service:latest
        ports:
        - containerPort: 4001
        env:
        - name: NODE_ENV
          value: "production"
        - name: GATEWAY_INTERNAL_SECRET
          valueFrom:
            secretKeyRef:
              name: file-service-secrets
              key: gateway-secret
        livenessProbe:
          httpGet:
            path: /health/live
            port: 4001
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 4001
          initialDelaySeconds: 10
          periodSeconds: 5
```

### Environment-Specific Configs

**Development**
```env
NODE_ENV=development
STORAGE_TYPE=local
CLUSTER_WORKERS=1
```

**Staging**
```env
NODE_ENV=staging
STORAGE_TYPE=azure
CLUSTER_WORKERS=2
```

**Production**
```env
NODE_ENV=production
STORAGE_TYPE=azure
CLUSTER_WORKERS=0  # Auto-scale
```

---

## Monitoring

### Health Endpoints

- `/health/live` - Basic liveness (200 if process running)
- `/health/ready` - Readiness check (MongoDB, Redis, Storage)
- `/health` - Detailed health with memory metrics

### Metrics

Monitor these key metrics:

- Request latency (p50, p95, p99)
- Upload success/failure rate
- Database connection pool usage
- Storage backend latency
- Memory usage (heap)
- Error rates by endpoint

### Logging

All errors include:
- Request ID for correlation
- Tenant ID
- User ID
- Timestamp
- Stack trace (development only)

---

## Troubleshooting

### Common Issues

**"Invalid gateway signature"**
- Verify `GATEWAY_INTERNAL_SECRET` matches between gateway and service
- Check header values for extra whitespace
- Ensure HMAC payload order: `userId:email:role`

**"MongoDB connection failed"**
- Verify `MONGO_URI` is correct
- Check network connectivity
- Ensure MongoDB is running
- Review connection pooling settings

**"File type not allowed"**
- Add MIME type to `ALLOWED_MIME_TYPES`
- Install `file-type` package for magic byte validation
- Check if file is corrupted

**Rate limiting not working across replicas**
- Configure Redis with `REDIS_URL`
- Verify Redis connectivity
- Check rate limiter middleware logs

---

## Development

### Project Structure

```
file-upload-service/
├── src/
│   ├── adapters/          # Storage backend adapters
│   ├── config/            # Configuration and validation
│   ├── controllers/       # Request handlers
│   ├── middleware/        # RBAC, rate limiting, error handling
│   ├── models/            # Mongoose schemas
│   ├── routes/            # API routes
│   ├── services/          # Business logic
│   └── utils/             # Helper functions
├── tests/
│   ├── integration/       # Integration tests (real DB)
│   └── *.test.js          # Unit tests
├── docs/                  # Documentation
├── app.js                 # Express app setup
├── server.js              # Server entry point
└── package.json
```

### Adding a New Storage Backend

1. Create adapter in `src/adapters/YourAdapter.js`
2. Extend `StorageAdapter` base class
3. Implement required methods: `uploadFile`, `downloadFile`, `deleteFile`, `getSignedUrl`
4. Register in `AdapterFactory.js`
5. Add configuration to `src/config/storage.js`
6. Add environment variables to `.env.example`
7. Test with integration tests

---

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Coding Standards

- Use ESLint + Prettier (TODO: add configuration)
- Write tests for new features
- Update documentation
- Follow semantic versioning

---

## Related Documentation

- [RBAC Guide](docs/RBAC_GUIDE.md) - Role-based access control details
- [Integration Guide](docs/INTEGRATION_GUIDE.md) - API usage examples
- [Postman Collection](docs/FileUploadService.postman_collection.json) - API testing

---

## License

MIT

---

## Support

- Documentation: `/docs`
- Issues: GitHub Issues
- Email: support@yourdomain.com

---

**Built with ❤️ for production workloads**
