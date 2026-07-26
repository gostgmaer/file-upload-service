const express = require('express');
const multer = require('multer');
const {
  uploadFiles,
  getFiles,
  getFileById,
  downloadFile,
  serveLocalSignedDownload,
  renameFile,
  updateFileMetadata,
  replaceFileContent,
  deleteFile,
  getFileTransactions,
  bulkDelete,
  bulkUpdateMetadata,
  bulkGetSignedUrls,
  requestPresignedUpload,
  confirmPresignedUpload,
  initiateMultipartUpload,
  getMultipartPartUrls,
  completeMultipartUpload,
  abortMultipartUpload,
} = require('../controllers/fileController');
const validateFile = require('../controllers/validateFile');
const {
  validateUpload,
  validateUpdate,
  validateQuery,
  validateRename,
  validateBulkDelete,
  validateBulkMetadata,
  validateBulkSignedUrls,
  validatePresignedUpload,
  validateInitiateMultipart,
  validateGetPartUrls,
  validateCompleteMultipart,
} = require('../controllers/validation');
const { uploadRateLimiter } = require('../middleware/rateLimit');
const { allowPublic, requireAdmin } = require('../middleware/rbac');
const { storage } = require('../config');

const router = express.Router();

const multerStorage = multer.memoryStorage();
const upload = multer({
  storage: multerStorage,
  limits: { fileSize: storage.maxFileSize },
  fileFilter: (req, file, cb) => {
    const parts = file.originalname.split('.');
    const ext = parts.length > 1 ? '.' + parts[parts.length - 1].toLowerCase() : '';

    if (!storage.allowedMimeTypes.includes(file.mimetype)) {
      cb(new Error(`File type ${file.mimetype} not allowed`), false);
    } else if (ext && !storage.allowedFileExtensions.includes(ext)) {
      cb(new Error(`File extension ${ext} not allowed`), false);
    } else {
      cb(null, true);
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// SIGNED URL DOWNLOAD (no gateway/tenant auth - the signature + expiry in the
// query string is the access grant; see LocalAdapter.getSignedUrl). Exempted
// from verifyGatewaySignature in app.js for the same reason a cloud-adapter
// presigned URL never reaches this app's middleware at all.
// ═══════════════════════════════════════════════════════════════════════════

router.get('/local-download', serveLocalSignedDownload);

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC ENDPOINTS (no user/admin role required)
// Auth removed per request - only admin/analytics endpoints below stay gated
// ═══════════════════════════════════════════════════════════════════════════

// Upload files - Public
router.post(
  '/upload',
  uploadRateLimiter,
  upload.array('files', 10),
  validateFile,
  validateUpload,
  allowPublic,
  uploadFiles
);

// List files - Public
router.get(
  '/',
  validateQuery,
  allowPublic,
  getFiles
);

// Get file metadata - Public
router.get(
  '/:id',
  allowPublic,
  getFileById
);

// Download file - Public
router.get(
  '/:id/download',
  allowPublic,
  downloadFile
);

// Metadata/content mutation endpoints - Public

// Update file metadata - Public
router.patch(
  '/:id',
  validateUpdate,
  allowPublic,
  updateFileMetadata
);

// Rename file - Public
router.patch(
  '/:id/rename',
  validateRename,
  allowPublic,
  renameFile
);

// Replace file content - Public
router.put(
  '/:id/replace',
  uploadRateLimiter,
  upload.single('file'),
  validateFile,
  allowPublic,
  replaceFileContent
);

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS (Requires admin role)
// Requests must include gateway-signed user headers
// ═══════════════════════════════════════════════════════════════════════════

// Soft delete - ADMIN ONLY
router.delete(
  '/:id',
  requireAdmin,
  deleteFile
);

// Permanent delete - ADMIN ONLY
router.delete(
  '/:id/permanent',
  requireAdmin,
  deleteFile
);

// Get file transaction history - ADMIN ONLY
router.get(
  '/:id/transactions',
  requireAdmin,
  getFileTransactions
);

// Bulk soft-delete - ADMIN ONLY
router.post(
  '/bulk/delete',
  validateBulkDelete,
  requireAdmin,
  bulkDelete
);

// Bulk permanent-delete - ADMIN ONLY
router.post(
  '/bulk/permanent-delete',
  validateBulkDelete,
  requireAdmin,
  bulkDelete
);

// Bulk metadata update - ADMIN ONLY
router.patch(
  '/bulk/metadata',
  validateBulkMetadata,
  requireAdmin,
  bulkUpdateMetadata
);

// Bulk signed URL generation - ADMIN ONLY
router.post(
  '/bulk/signed-urls',
  validateBulkSignedUrls,
  requireAdmin,
  bulkGetSignedUrls
);

// ═══════════════════════════════════════════════════════════════════════════
// PRESIGNED UPLOAD — client uploads directly to cloud storage
// Supported adapters: S3, R2 (multipart + single), GCS, Azure (single only)
// ═══════════════════════════════════════════════════════════════════════════

// Step 1: Request a presigned PUT URL (single upload, any size the adapter supports)
router.post(
  '/upload/presign',
  uploadRateLimiter,
  validatePresignedUpload,
  allowPublic,
  requestPresignedUpload
);

// Step 2: Confirm the upload completed (client calls after successful PUT)
router.post(
  '/upload/presign/:id/confirm',
  allowPublic,
  confirmPresignedUpload
);

// ─── Multipart upload (S3 / R2 — recommended for files > 100 MB) ──────────

// Step 1: Initiate multipart upload — returns fileId + uploadId
router.post(
  '/upload/multipart/initiate',
  uploadRateLimiter,
  validateInitiateMultipart,
  allowPublic,
  initiateMultipartUpload
);

// Step 2: Get presigned URLs for each part (5 MB minimum per part except last)
router.post(
  '/upload/multipart/:id/parts',
  validateGetPartUrls,
  allowPublic,
  getMultipartPartUrls
);

// Step 3: Complete — assemble all parts on the storage side
router.post(
  '/upload/multipart/:id/complete',
  validateCompleteMultipart,
  allowPublic,
  completeMultipartUpload
);

// Abort — cleans up the multipart session and removes the pending record
router.delete(
  '/upload/multipart/:id/abort',
  allowPublic,
  abortMultipartUpload
);

module.exports = router;
