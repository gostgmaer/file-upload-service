# File Upload Service — API Routes

Base URL: `{HOST}` · API prefix: `/api/files` (unless noted otherwise)

**Auth (current state):** Gateway HMAC is disabled for all of `/api/files`. All routes are
publicly reachable. Routes marked **Admin** still call `requireAdmin`, but since HMAC
verification no longer backs the `X-User-Role` header, that header is client-supplied and
not actually trustworthy — treat those routes as **not securely protected** until a real
auth mechanism (API key / JWT) is added.

All successful responses are wrapped as:
```json
{ "success": true, "data": { ... }, "message": "...", "statusCode": 200, "status": "success", "timestamp": "...", "requestId": "..." }
```
Errors: `{ "success": false, "message": "...", "statusCode": ..., ... }`

---

## Health / Ops

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Legacy general health check — DB connection + memory stats. |
| GET | `/health/live` | Liveness probe (k8s). Always 200 if process is up. |
| GET | `/health/ready` | Readiness probe — checks MongoDB, Redis (if configured), and the active storage adapter. Returns 503 if any critical dependency is down. |
| GET | `/metrics` | Prometheus scrape endpoint. |
| GET | `/` | Root — service info + endpoint index. |

---

## File CRUD

### `POST /api/files/upload`
Upload one or more files (multipart/form-data).
- **Form fields:** `files` (up to 10, field name `files`), plus optional metadata fields: `category`, `description`, `tags` (string or array), `custom` (JSON string), `title`, `altText`, `author`, `source`, `language`, `expiresAt` (ISO date, must be future), `isPublic` (bool), `linkedEntityType`, `linkedEntityId`.
- File size/mime type are constrained by `storage.maxFileSize` / `storage.allowedMimeTypes` config; also runs a ClamAV scan (`validateFile`) before accepting.
- Rate-limited (`uploadRateLimiter`).
- **Response:** `data` = array of uploaded file objects.

### `GET /api/files`
List files for the current tenant, with filtering/pagination.
- **Query params:** `page`, `limit` (max 100), `sort` (`createdAt`/`updatedAt`/`size`/`originalName`, prefix `-` for desc), `uploader`, `mimeType`, `category`, `tags`, `dateFrom`/`dateTo` (ISO), `search`, `isPublic`, `language`, `linkedEntityType`, `linkedEntityId`.

### `GET /api/files/:id`
Get metadata for a single file by ID.

### `GET /api/files/:id/download`
Download or stream a file.
- **Query params:** `inline=1` → `Content-Disposition: inline` instead of `attachment`; `signed=1` → instead of streaming, respond with a `302` redirect to a short-lived signed URL for the file (useful for cloud adapters where you want the client to fetch directly from storage).

### `PATCH /api/files/:id`
Update file metadata.
- **Body:** any of `originalName`, `category`, `metadata.{description,tags,custom,title,altText,author,source,language,expiresAt,isPublic,linkedTo.{entityType,entityId}}` — at least one field required.

### `PATCH /api/files/:id/rename`
Rename a file.
- **Body:** `{ "name": "new-filename.ext" }` (required).

### `PUT /api/files/:id/replace`
Replace a file's content (keeps the same file ID/metadata record).
- **Form field:** `file` (single, multipart/form-data). Runs the same scan/type checks as upload.

### `DELETE /api/files/:id` — **Admin**
Soft delete (marks file deleted, recoverable).

### `DELETE /api/files/:id/permanent` — **Admin**
Permanently delete a file (removes storage object + record).

### `GET /api/files/:id/transactions` — **Admin**
Get the audit/transaction history for a file (uploads, renames, deletes, etc.).

---

## Bulk Operations (all **Admin**)

### `POST /api/files/bulk/delete`
Soft-delete multiple files.
- **Body:** `{ "ids": ["id1", "id2", ...] }` (1–100 ids).

### `POST /api/files/bulk/permanent-delete`
Same as above but permanent. Same body shape.

### `PATCH /api/files/bulk/metadata`
Update metadata on multiple files at once.
- **Body:** `{ "ids": [...], "updates": { "category": "...", "metadata": { ... } } }` (same `metadata` shape as single-file update).

### `POST /api/files/bulk/signed-urls`
Generate signed download URLs for multiple files.
- **Body:** `{ "ids": [...], "expiry": 3600 }` (`expiry` optional, seconds, 60–604800; default set by adapter).

---

## Presigned Upload (client → cloud storage directly)

Supported on S3, R2, GCS, Azure (single-part only for Azure).

### `POST /api/files/upload/presign`
Step 1 — request a presigned PUT URL for a single-part upload.
- **Body:** `filename` (required), `contentType` (required), `size` (bytes, required), `expiresIn` (seconds, 60–604800, default 3600), plus the same optional metadata fields as `/upload`.
- **Response:** presigned PUT URL + a pending file record ID. Client PUTs the file bytes directly to that URL.

### `POST /api/files/upload/presign/:id/confirm`
Step 2 — call after the client's PUT to the presigned URL succeeds, to mark the upload complete and finalize the file record.

---

## Multipart Upload (S3 / R2 — recommended for files > 100 MB)

### `POST /api/files/upload/multipart/initiate`
Step 1 — start a multipart upload session.
- **Body:** `filename`, `contentType`, `size` (all required) + optional metadata fields.
- **Response:** `fileId` + `uploadId` for subsequent steps.

### `POST /api/files/upload/multipart/:id/parts`
Step 2 — get presigned PUT URLs for one or more parts (5 MB minimum per part except the last).
- **Body:** `{ "partNumbers": [1, 2, 3, ...] }` (1–1000 numbers, each 1–10000).

### `POST /api/files/upload/multipart/:id/complete`
Step 3 — finalize the upload once all parts have been PUT to storage.
- **Body:** `{ "parts": [ { "partNumber": 1, "etag": "..." }, ... ] }` (etag comes from each part's PUT response).

### `DELETE /api/files/upload/multipart/:id/abort`
Cancel an in-progress multipart upload and clean up the pending session/record.

---

## Signed Local Download (local storage adapter only)

### `GET /api/files/local-download`
Serves a file via a pre-signed local URL (HMAC + expiry embedded in the query string itself — this *is* the access grant, no other auth needed or checked).
- **Query params:** `path`, `expires`, `signature` (all required — normally you don't build this URL by hand, it's returned by the `signed=1` download flow or `bulk/signed-urls` when the local adapter is active).
