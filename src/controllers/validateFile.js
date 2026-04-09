const mime = require('mime-types');
const { storage } = require('../config/storage');
const AppError = require('../utils/appError');

// NTFS/Windows reserved filenames
const RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;

/**
 * Validate uploaded files for security and compliance
 * - File size limits
 * - MIME type validation (magic bytes if file-type package available)
 * - Filename sanitization and length limits
 * - Reserved filename detection
 */
const validateFile = async (req, res, next) => {
  try {
    const files = req.files || (req.file ? [req.file] : []);

    if (files.length === 0) {
      return next(AppError.badRequest('No files provided'));
    }

    const maxSize = storage.maxFileSize;
    const allowedMimeTypes = storage.allowedMimeTypes;

    for (const file of files) {
      // 1. File size validation
      if (file.size > maxSize) {
        return next(AppError.badRequest(
          `File ${file.originalname} exceeds maximum size of ${(maxSize / 1024 / 1024).toFixed(2)}MB`
        ));
      }

      // 2. Zero-byte file check
      if (file.size === 0) {
        return next(AppError.badRequest(`File ${file.originalname} is empty (0 bytes)`));
      }

      // 3. Filename length validation (max 255 chars for most filesystems)
      if (file.originalname.length > 255) {
        return next(AppError.badRequest(
          `Filename too long (max 255 characters): ${file.originalname.substring(0, 50)}...`
        ));
      }

      // 4. Reserved filename check (Windows NTFS)
      const baseFilename = file.originalname.split('.')[0];
      if (RESERVED_NAMES.test(baseFilename)) {
        return next(AppError.badRequest(
          `Reserved filename not allowed: ${file.originalname}`
        ));
      }

      // 5. Magic byte validation (if file-type package is available)
      let detectedType = null;
      try {
        const { fileTypeFromBuffer } = await import('file-type');
        detectedType = await fileTypeFromBuffer(file.buffer);

        if (detectedType) {
          // Verify detected MIME type matches allowed types
          if (!allowedMimeTypes.includes(detectedType.mime)) {
            return next(AppError.badRequest(
              `Invalid file type detected. File appears to be ${detectedType.mime} but only ${allowedMimeTypes.join(', ')} are allowed`
            ));
          }

          // Warn if client-provided MIME type doesn't match detected type
          if (file.mimetype !== detectedType.mime) {
            console.warn(
              `[Security] MIME type mismatch for ${file.originalname}: ` +
              `client=${file.mimetype}, detected=${detectedType.mime}`
            );
            // Use detected type instead of client-provided
            file.mimetype = detectedType.mime;
          }
        } else {
          // Fallback to client-provided MIME type if magic bytes can't be detected
          if (!allowedMimeTypes.includes(file.mimetype)) {
            return next(AppError.badRequest(
              `File type ${file.mimetype} not allowed for file ${file.originalname}`
            ));
          }
        }
      } catch (importError) {
        // file-type package not installed - fall back to client MIME type validation
        console.warn('[validateFile] file-type package not available - using client MIME type only (less secure)');
        if (!allowedMimeTypes.includes(file.mimetype)) {
          return next(AppError.badRequest(
            `File type ${file.mimetype} not allowed for file ${file.originalname}`
          ));
        }
      }

      // 6. Sanitize filename - remove dangerous characters
      // Allow: alphanumeric, spaces, dots, hyphens, underscores
      file.originalname = file.originalname
        .replace(/[<>:"\/\\|?*\x00-\x1f\x7f]/g, '_')
        .normalize('NFC'); // Normalize Unicode to prevent homograph attacks

      // 7. Ensure filename has an extension
      if (!file.originalname.includes('.')) {
        const ext = mime.extension(file.mimetype);
        if (ext) {
          file.originalname = `${file.originalname}.${ext}`;
        }
      }
    }

    next();
  } catch (error) {
    console.error('[validateFile] Validation error:', error);
    return next(AppError.internalError('File validation failed'));
  }
};

module.exports = validateFile;
