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

// ─── Upload ──────────────────────────────────────────────────────────────────
router.post(
  '/upload',
  uploadRateLimiter,
  upload.array('files', 10),
  validateFile,
  validateUpload,
  uploadFiles
);

// ─── Bulk operations (must be before /:id routes to avoid param conflicts) ───
// Bulk soft-delete by array of IDs
router.post('/bulk/delete', validateBulkDelete, bulkDelete);

// Bulk permanent-delete by array of IDs
router.post('/bulk/permanent-delete', validateBulkDelete, bulkDelete);

// Bulk metadata update — apply the same patch to multiple files
router.patch('/bulk/metadata', validateBulkMetadata, bulkUpdateMetadata);

// Bulk signed URL generation
router.post('/bulk/signed-urls', validateBulkSignedUrls, bulkGetSignedUrls);

// ─── Single-file CRUD ─────────────────────────────────────────────────────────
// List files with filtering and pagination
router.get('/', validateQuery, getFiles);

// Get single file metadata
router.get('/:id', getFileById);

// Download file
router.get('/:id/download', downloadFile);

// Rename file
router.patch('/:id/rename', validateRename, renameFile);

// Update file metadata
router.patch('/:id', validateUpdate, updateFileMetadata);

// Replace file content
router.put(
  '/:id/replace',
  uploadRateLimiter,
  upload.single('file'),
  validateFile,
  replaceFileContent
);

// Soft delete
router.delete('/:id', deleteFile);

// Permanent delete
router.delete('/:id/permanent', deleteFile);

// Get file transaction history
router.get('/:id/transactions', getFileTransactions);

module.exports = router;
