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
} = require('../controllers/validation');
const { uploadRateLimiter } = require('../middleware/rateLimit');
const { allowPublic, requireAuth, requireAdmin } = require('../middleware/rbac');
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
// PUBLIC ENDPOINTS (No authentication required - works standalone)
// Anyone can upload, view, download files without authentication
// ═══════════════════════════════════════════════════════════════════════════

// Upload files - PUBLIC
router.post(
  '/upload',
  uploadRateLimiter,
  upload.array('files', 10),
  validateFile,
  validateUpload,
  allowPublic,
  uploadFiles
);

// List files - PUBLIC
router.get(
  '/',
  validateQuery,
  allowPublic,
  getFiles
);

// Get file metadata - PUBLIC
router.get(
  '/:id',
  allowPublic,
  getFileById
);

// Download file - PUBLIC
router.get(
  '/:id/download',
  allowPublic,
  downloadFile
);

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATED ENDPOINTS (Requires user or admin role)
// Pass X-User-Role: user or admin (with gateway or directly)
// ═══════════════════════════════════════════════════════════════════════════

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
// Pass X-User-Role: admin (with gateway or directly)
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

module.exports = router;
