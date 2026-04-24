const FileService = require('../services/FileService');
const { v4: uuidv4 } = require('uuid');
const { sendSuccess, HTTP_STATUS } = require('../utils/responseHelper');
const AppError = require('../utils/appError');
const { catchAsync } = require('../middleware/errorHandler');

const fileService = new FileService();

// ─── Shared response shape ────────────────────────────────────────────────────
// Every adapter stores different URL formats in `publicUrl`.
// This normaliser exposes a consistent shape on every GET/upload response so
// callers always see the same fields regardless of which adapter is active.
//
// publicUrl per adapter:
//   local  → /{storageKey}   (relative path, served by your own server)
//   s3     → https://{bucket}.s3.{region}.amazonaws.com/{storageKey}
//   gcs    → gs://{bucket}/{storageKey}   (not HTTP — use signed URL to download)
//   azure  → https://{account}.blob.core.windows.net/{container}/{storageKey}
//   r2     → {R2_PUBLIC_DOMAIN}/{bucket}/{storageKey}
const formatFile = (file) => ({
  id: file._id,
  tenantId: file.tenantId,
  originalName: file.originalName,
  storageKey: file.storageKey,
  size: file.size,
  mimeType: file.mimeType,
  extension: file.extension,
  uploader: file.uploader,
  category: file.category,
  status: file.status,
  // The URL you can use to access / download the file directly (adapter-dependent)
  url: file.publicUrl,
  metadata: {
    description: file.metadata?.description || '',
    tags: file.metadata?.tags || [],
    custom: file.metadata?.custom || {},
    title: file.metadata?.title || '',
    altText: file.metadata?.altText || '',
    author: file.metadata?.author || '',
    source: file.metadata?.source || '',
    language: file.metadata?.language || '',
    expiresAt: file.metadata?.expiresAt || null,
    isPublic: file.metadata?.isPublic ?? false,
    linkedTo: file.metadata?.linkedTo || {},
  },
  versions: file.versions || [],
  createdAt: file.createdAt,
  updatedAt: file.updatedAt,
});

const uploadFiles = catchAsync(async (req, res) => {
  const requestId = uuidv4();
  const tenantId = req.tenantId;
  const userId = req.headers['x-user-id'] || null;

  if (!req.files || req.files.length === 0) throw AppError.badRequest('No files provided');

  const metadata = {
    category: req.body.category || '',
    description: req.body.description || '',
    tags: req.body.tags
      ? Array.isArray(req.body.tags)
        ? req.body.tags
        : [req.body.tags]
      : [],
    custom: req.body.custom ? JSON.parse(req.body.custom) : {},
    title: req.body.title || '',
    altText: req.body.altText || '',
    author: req.body.author || '',
    source: req.body.source || '',
    language: req.body.language || '',
    expiresAt: req.body.expiresAt || null,
    isPublic: req.body.isPublic === 'true' || req.body.isPublic === true,
    linkedTo: {
      entityType: req.body.linkedEntityType || '',
      entityId: req.body.linkedEntityId || '',
    },
  };

  const uploadedFiles = [];

  for (const file of req.files) {
    const uploadedFile = await fileService.uploadFile(file, userId, tenantId, requestId, metadata);
    uploadedFiles.push(formatFile(uploadedFile));
  }

  return sendSuccess(res, { data: uploadedFiles, message: 'Files uploaded successfully', statusCode: HTTP_STATUS.CREATED });
});

const getFiles = catchAsync(async (req, res) => {
  const tenantId = req.tenantId;

  const filters = {
    uploader: req.query.uploader,
    mimeType: req.query.mimeType,
    category: req.query.category,
    tags: req.query.tags
      ? Array.isArray(req.query.tags)
        ? req.query.tags
        : [req.query.tags]
      : undefined,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
    search: req.query.search,
    isPublic: req.query.isPublic !== undefined ? req.query.isPublic === 'true' : undefined,
    language: req.query.language,
    linkedEntityType: req.query.linkedEntityType,
    linkedEntityId: req.query.linkedEntityId,
  };

  const pagination = {
    page: parseInt(req.query.page) || 1,
    limit: Math.min(parseInt(req.query.limit) || 20, 100),
  };

  const sorting = {
    sortBy: req.query.sort ? req.query.sort.replace('-', '') : 'createdAt',
    sortOrder: req.query.sort && req.query.sort.startsWith('-') ? -1 : 1,
  };

  Object.keys(filters).forEach((key) => {
    if (filters[key] === undefined || filters[key] === '') delete filters[key];
  });

  const result = await fileService.getFiles(tenantId, filters, pagination, sorting);

  return sendSuccess(res, { data: result, message: 'Files retrieved successfully' });
});

const getFileById = catchAsync(async (req, res) => {
  const tenantId = req.tenantId;
  const file = await fileService.getFileById(req.params.id, tenantId);

  if (!file) throw AppError.notFound('File not found');

  return sendSuccess(res, { data: formatFile(file), message: 'File retrieved successfully' });
});

const downloadFile = catchAsync(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId;
  const inline = req.query.inline === '1';
  const useSignedUrl = req.query.signed === '1';

  if (useSignedUrl) {
    const { signedUrl } = await fileService.getSignedDownloadUrl(id, tenantId);
    return res.redirect(signedUrl);
  }

  const { file, stream } = await fileService.getDownloadStream(id, tenantId);

  // Sanitize filename: strip control chars and quotes to prevent header injection
  const safeFilename = file.originalName.replace(/[\x00-\x1f\x7f"\\]/g, '_');

  res.set({
    'Content-Type': file.mimeType,
    'Content-Length': file.size,
    'Content-Disposition': inline
      ? `inline; filename="${safeFilename}"`
      : `attachment; filename="${safeFilename}"`,
  });

  stream.pipe(res);

  stream.on('error', () => {
    if (!res.headersSent) {
      throw AppError.internal('Download failed');
    }
  });
});

const renameFile = catchAsync(async (req, res) => {
  const requestId = uuidv4();
  const { id } = req.params;
  const tenantId = req.tenantId;
  const userId = req.headers['x-user-id'] || null;
  const { name } = req.body;

  const updatedFile = await fileService.renameFile(id, userId, tenantId, name, requestId);

  return sendSuccess(res, { data: { file: updatedFile, requestId }, message: 'File renamed successfully' });
});

const updateFileMetadata = catchAsync(async (req, res) => {
  const requestId = uuidv4();
  const { id } = req.params;
  const tenantId = req.tenantId;
  const userId = req.headers['x-user-id'] || null;

  const updatedFile = await fileService.updateFileMetadata(id, userId, tenantId, req.body, requestId);

  return sendSuccess(res, { data: { file: updatedFile, requestId }, message: 'File metadata updated successfully' });
});

const replaceFileContent = catchAsync(async (req, res) => {
  const requestId = uuidv4();
  const { id } = req.params;
  const tenantId = req.tenantId;
  const userId = req.headers['x-user-id'] || null;

  if (!req.file) throw AppError.badRequest('No file provided');

  const updatedFile = await fileService.replaceFileContent(id, userId, tenantId, req.file, requestId);

  return sendSuccess(res, { data: { file: updatedFile, requestId }, message: 'File content replaced successfully' });
});

const deleteFile = catchAsync(async (req, res) => {
  const requestId = uuidv4();
  const { id } = req.params;
  const tenantId = req.tenantId;
  const userId = req.headers['x-user-id'] || null;
  const permanent = req.path.includes('/permanent');

  const result = await fileService.deleteFile(id, userId, tenantId, requestId, permanent);

  return sendSuccess(res, {
    data: permanent ? { requestId } : { file: result, requestId },
    message: permanent ? 'File permanently deleted' : 'File deleted successfully',
  });
});

const getFileTransactions = catchAsync(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId;
  const userId = req.headers['x-user-id'];

  const transactions = await fileService.getFileTransactions(id, tenantId, userId || null);

  return sendSuccess(res, { data: transactions, message: 'File transactions retrieved successfully' });
});

// ─── Bulk handlers ────────────────────────────────────────────────────────────

const bulkDelete = catchAsync(async (req, res) => {
  const requestId = uuidv4();
  const tenantId = req.tenantId;
  const userId = req.headers['x-user-id'] || null;
  const permanent = req.path.includes('/permanent');
  const { ids } = req.body;

  const result = await fileService.bulkDelete(ids, userId, tenantId, requestId, permanent);

  return sendSuccess(res, {
    data: { ...result, requestId },
    message: permanent
      ? `Bulk permanent delete complete: ${result.succeeded.length} deleted, ${result.failed.length} failed`
      : `Bulk delete complete: ${result.succeeded.length} deleted, ${result.failed.length} failed`,
  });
});

const bulkUpdateMetadata = catchAsync(async (req, res) => {
  const requestId = uuidv4();
  const tenantId = req.tenantId;
  const userId = req.headers['x-user-id'] || null;
  const { ids, updates } = req.body;

  const result = await fileService.bulkUpdateMetadata(ids, userId, tenantId, updates, requestId);

  // Format succeeded files
  result.succeeded = result.succeeded.map((item) => ({
    id: item.id,
    file: formatFile(item.file),
  }));

  return sendSuccess(res, {
    data: { ...result, requestId },
    message: `Bulk metadata update complete: ${result.succeeded.length} updated, ${result.failed.length} failed`,
  });
});

const bulkGetSignedUrls = catchAsync(async (req, res) => {
  const tenantId = req.tenantId;
  const { ids, expiry } = req.body;

  const result = await fileService.bulkGetSignedUrls(ids, tenantId, expiry ? { expiry } : {});

  return sendSuccess(res, {
    data: result,
    message: `Bulk signed URLs: ${result.succeeded.length} generated, ${result.failed.length} failed`,
  });
});

// ─── Presigned upload handlers ────────────────────────────────────────────────

const requestPresignedUpload = catchAsync(async (req, res) => {
  const tenantId = req.tenantId;
  const userId = req.headers['x-user-id'] || null;
  const { filename, contentType, size, expiresIn, ...rest } = req.body;

  const metadata = {
    category: rest.category || '',
    description: rest.description || '',
    tags: rest.tags
      ? Array.isArray(rest.tags)
        ? rest.tags
        : [rest.tags]
      : [],
    custom: rest.custom ? (typeof rest.custom === 'string' ? JSON.parse(rest.custom) : rest.custom) : {},
    title: rest.title || '',
    altText: rest.altText || '',
    author: rest.author || '',
    source: rest.source || '',
    language: rest.language || '',
    expiresAt: rest.expiresAt || null,
    isPublic: rest.isPublic === true || rest.isPublic === 'true',
    linkedTo: {
      entityType: rest.linkedEntityType || '',
      entityId: rest.linkedEntityId || '',
    },
  };

  const result = await fileService.getPresignedUploadUrl(
    filename,
    contentType,
    size,
    userId,
    tenantId,
    metadata,
    expiresIn || 3600
  );

  return sendSuccess(res, { data: result, message: 'Presigned upload URL generated', statusCode: HTTP_STATUS.CREATED });
});

const confirmPresignedUpload = catchAsync(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId;
  const userId = req.headers['x-user-id'] || null;

  const file = await fileService.confirmPresignedUpload(id, tenantId, userId);

  return sendSuccess(res, { data: formatFile(file), message: 'Upload confirmed successfully' });
});

// ─── Multipart upload handlers ────────────────────────────────────────────────

const initiateMultipartUpload = catchAsync(async (req, res) => {
  const tenantId = req.tenantId;
  const userId = req.headers['x-user-id'] || null;
  const { filename, contentType, size, ...rest } = req.body;

  const metadata = {
    category: rest.category || '',
    description: rest.description || '',
    tags: rest.tags
      ? Array.isArray(rest.tags)
        ? rest.tags
        : [rest.tags]
      : [],
    custom: rest.custom ? (typeof rest.custom === 'string' ? JSON.parse(rest.custom) : rest.custom) : {},
    title: rest.title || '',
    altText: rest.altText || '',
    author: rest.author || '',
    source: rest.source || '',
    language: rest.language || '',
    expiresAt: rest.expiresAt || null,
    isPublic: rest.isPublic === true || rest.isPublic === 'true',
    linkedTo: {
      entityType: rest.linkedEntityType || '',
      entityId: rest.linkedEntityId || '',
    },
  };

  const result = await fileService.initiateMultipartUpload(filename, contentType, size, userId, tenantId, metadata);

  return sendSuccess(res, { data: result, message: 'Multipart upload initiated', statusCode: HTTP_STATUS.CREATED });
});

const getMultipartPartUrls = catchAsync(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId;
  const { partNumbers } = req.body;

  const result = await fileService.getPresignedPartUrls(id, tenantId, partNumbers);

  return sendSuccess(res, { data: result, message: 'Part URLs generated' });
});

const completeMultipartUpload = catchAsync(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId;
  const userId = req.headers['x-user-id'] || null;
  const { parts } = req.body;

  const file = await fileService.completeMultipartUpload(id, tenantId, userId, parts);

  return sendSuccess(res, { data: formatFile(file), message: 'Multipart upload completed successfully' });
});

const abortMultipartUpload = catchAsync(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId;
  const userId = req.headers['x-user-id'] || null;

  const result = await fileService.abortMultipartUpload(id, tenantId, userId);

  return sendSuccess(res, { data: result, message: 'Multipart upload aborted' });
});

module.exports = {
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
};
