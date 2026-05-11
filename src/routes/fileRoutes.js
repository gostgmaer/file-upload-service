const express = require('express');
const multer = require('multer');
const {
  uploadFiles,
  getFiles,
  getFileById,
  downloadFile,
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
const { requireAuth, requireAdmin } = require('../middleware/rbac');
const { storage } = require('../config');

const router = express.Router();

const multerStorage = multer.memoryStorage();
const upload = multer({
  storage: multerStorage,
  limits: { fileSize: storage.maxFileSize },
  fileFilter: (req, file, cb) => {
    if (storage.allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`), false);
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATED ENDPOINTS (Requires user or admin role)
// File data is never exposed to anonymous callers
// ═══════════════════════════════════════════════════════════════════════════

// Upload files - Authenticated users
router.post(
  '/upload',
  uploadRateLimiter,
  upload.array('files', 10),
  validateFile,
  validateUpload,
  requireAuth,
  uploadFiles
);

// List files - Authenticated users
router.get(
  '/',
  validateQuery,
  requireAuth,
  getFiles
);

// Get file metadata - Authenticated users
router.get(
  '/:id',
  requireAuth,
  getFileById
);

// Download file - Authenticated users
router.get(
  '/:id/download',
  requireAuth,
  downloadFile
);

// Metadata/content mutation endpoints for authenticated users

// Update file metadata - Authenticated users
router.patch(
  '/:id',
  validateUpdate,
  requireAuth,
  updateFileMetadata
);

// Rename file - Authenticated users
router.patch(
  '/:id/rename',
  validateRename,
  requireAuth,
  renameFile
);

// Replace file content - Authenticated users
router.put(
  '/:id/replace',
  uploadRateLimiter,
  upload.single('file'),
  validateFile,
  requireAuth,
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
  requireAuth,
  requestPresignedUpload
);

// Step 2: Confirm the upload completed (client calls after successful PUT)
router.post(
  '/upload/presign/:id/confirm',
  requireAuth,
  confirmPresignedUpload
);

// ─── Multipart upload (S3 / R2 — recommended for files > 100 MB) ──────────

// Step 1: Initiate multipart upload — returns fileId + uploadId
router.post(
  '/upload/multipart/initiate',
  uploadRateLimiter,
  validateInitiateMultipart,
  requireAuth,
  initiateMultipartUpload
);

// Step 2: Get presigned URLs for each part (5 MB minimum per part except last)
router.post(
  '/upload/multipart/:id/parts',
  validateGetPartUrls,
  requireAuth,
  getMultipartPartUrls
);

// Step 3: Complete — assemble all parts on the storage side
router.post(
  '/upload/multipart/:id/complete',
  validateCompleteMultipart,
  requireAuth,
  completeMultipartUpload
);

// Abort — cleans up the multipart session and removes the pending record
router.delete(
  '/upload/multipart/:id/abort',
  requireAuth,
  abortMultipartUpload
);

module.exports = router;
