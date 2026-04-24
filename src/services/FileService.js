const { v4: uuidv4 } = require('uuid');
const path = require('path');
const File = require('../models/File');
const FileTransaction = require('../models/FileTransaction');
const AdapterFactory = require('../adapters/AdapterFactory');
const AppError = require('../utils/appError');

class FileService {
  constructor() {
    this.storageAdapter = AdapterFactory.createAdapter();
  }

  /**
   * Generate a tenant-scoped storage key.
   * Pattern: files/{tenantId}/{userId}/{timestamp}-{uuid}-{sanitizedName}{ext}
   */
  generateStorageKey(originalName, uploaderId, tenantId) {
    const timestamp = Date.now();
    const uuid = uuidv4();
    const extension = path.extname(originalName);
    const sanitizedName = path
      .basename(originalName, extension)
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .substring(0, 50);

    return `files/${tenantId}/${uploaderId}/${timestamp}-${uuid}-${sanitizedName}${extension}`;
  }

  async logTransaction(tenantId, fileId, operation, performedBy, requestId, payload = {}) {
    try {
      const transaction = new FileTransaction({
        tenantId,
        fileId,
        operation,
        performedBy,
        requestId,
        payload,
        status: 'pending',
      });

      await transaction.save();
      return transaction;
    } catch (error) {
      throw error;
    }
  }

  async updateTransaction(transactionId, status, providerResponse = null, error = null) {
    try {
      const update = { status };
      if (providerResponse) update.providerResponse = providerResponse;
      if (error) update.error = error;

      await FileTransaction.findByIdAndUpdate(transactionId, update);
    } catch (error) {
      // Non-critical — swallow to avoid masking original error
    }
  }

  async uploadFile(fileData, uploaderId, tenantId, requestId, metadata = {}) {
    const transaction = await this.logTransaction(
      tenantId,
      null,
      'upload',
      uploaderId,
      requestId,
      { originalName: fileData.originalname, size: fileData.size, mimeType: fileData.mimetype }
    );

    try {
      const storageKey = this.generateStorageKey(fileData.originalname, uploaderId, tenantId);
      const extension = path.extname(fileData.originalname).toLowerCase();

      const uploadResult = await this.storageAdapter.uploadBuffer(fileData.buffer, storageKey, {
        contentType: fileData.mimetype,
        metadata: metadata,
      });

      const file = new File({
        tenantId,
        originalName: fileData.originalname,
        storageKey,
        size: fileData.size,
        mimeType: fileData.mimetype,
        extension,
        uploader: uploaderId || 'anonymous',
        publicUrl: uploadResult.location,
        category: metadata.category || '',
        metadata: {
          description: metadata.description || '',
          tags: metadata.tags || [],
          custom: metadata.custom || {},
          title: metadata.title || '',
          altText: metadata.altText || '',
          author: metadata.author || '',
          source: metadata.source || '',
          language: metadata.language || '',
          expiresAt: metadata.expiresAt || null,
          isPublic: metadata.isPublic || false,
          linkedTo: metadata.linkedTo || {},
        },
      });

      await file.save();

      await this.updateTransaction(transaction._id, 'success', uploadResult);
      transaction.fileId = file._id;
      await transaction.save();

      return file;
    } catch (error) {
      await this.updateTransaction(transaction._id, 'failed', null, error.message);
      throw error;
    }
  }

  async getFileById(fileId, tenantId, userId = null) {
    try {
      const query = { _id: fileId, tenantId, status: 'active' };
      if (userId) query.uploader = userId;

      const file = await File.findOne(query);
      if (!file) throw AppError.notFound('File not found');

      return file;
    } catch (error) {
      throw error;
    }
  }

  async getFiles(tenantId, filters = {}, pagination = {}, sorting = {}) {
    try {
      const { page = 1, limit = 20 } = pagination;
      const { sortBy = 'createdAt', sortOrder = -1 } = sorting;

      const query = { tenantId, status: 'active' };

      if (filters.uploader) query.uploader = filters.uploader;
      if (filters.mimeType) query.mimeType = filters.mimeType;
      if (filters.category) query.category = filters.category;
      if (filters.tags && filters.tags.length > 0) {
        query['metadata.tags'] = { $in: filters.tags };
      }
      if (filters.dateFrom || filters.dateTo) {
        query.createdAt = {};
        if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
        if (filters.dateTo) query.createdAt.$lte = new Date(filters.dateTo);
      }
      if (filters.search) {
        query.$or = [
          { originalName: { $regex: filters.search, $options: 'i' } },
          { 'metadata.description': { $regex: filters.search, $options: 'i' } },
        ];
      }
      if (filters.isPublic !== undefined) query['metadata.isPublic'] = filters.isPublic;
      if (filters.language) query['metadata.language'] = filters.language;
      if (filters.linkedEntityType) query['metadata.linkedTo.entityType'] = filters.linkedEntityType;
      if (filters.linkedEntityId) query['metadata.linkedTo.entityId'] = filters.linkedEntityId;

      const sort = { [sortBy]: sortOrder };
      const skip = (page - 1) * limit;

      const [files, total] = await Promise.all([
        File.find(query).sort(sort).skip(skip).limit(limit),
        File.countDocuments(query),
      ]);

      return {
        files,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async getDownloadStream(fileId, tenantId, userId = null) {
    try {
      const file = await this.getFileById(fileId, tenantId, userId);
      const stream = await this.storageAdapter.getDownloadStream(file.storageKey);
      return { file, stream };
    } catch (error) {
      throw error;
    }
  }

  async getSignedDownloadUrl(fileId, tenantId, userId = null, options = {}) {
    try {
      const file = await this.getFileById(fileId, tenantId, userId);
      const signedUrl = await this.storageAdapter.getSignedUrl(file.storageKey, options);
      return { file, signedUrl };
    } catch (error) {
      throw error;
    }
  }

  async updateFileMetadata(fileId, userId, tenantId, updates, requestId) {
    const transaction = await this.logTransaction(tenantId, fileId, 'update_metadata', userId, requestId, updates);

    try {
      const file = await this.getFileById(fileId, tenantId, userId);

      const allowedUpdates = ['originalName', 'category', 'metadata'];
      const updateData = {};

      Object.keys(updates).forEach((key) => {
        if (allowedUpdates.includes(key)) {
          if (key === 'metadata') {
            if (updates.metadata.description !== undefined)
              updateData['metadata.description'] = updates.metadata.description;
            if (updates.metadata.tags !== undefined)
              updateData['metadata.tags'] = updates.metadata.tags;
            if (updates.metadata.custom !== undefined)
              updateData['metadata.custom'] = updates.metadata.custom;
            if (updates.metadata.title !== undefined)
              updateData['metadata.title'] = updates.metadata.title;
            if (updates.metadata.altText !== undefined)
              updateData['metadata.altText'] = updates.metadata.altText;
            if (updates.metadata.author !== undefined)
              updateData['metadata.author'] = updates.metadata.author;
            if (updates.metadata.source !== undefined)
              updateData['metadata.source'] = updates.metadata.source;
            if (updates.metadata.language !== undefined)
              updateData['metadata.language'] = updates.metadata.language;
            if (updates.metadata.expiresAt !== undefined)
              updateData['metadata.expiresAt'] = updates.metadata.expiresAt;
            if (updates.metadata.isPublic !== undefined)
              updateData['metadata.isPublic'] = updates.metadata.isPublic;
            if (updates.metadata.linkedTo !== undefined)
              updateData['metadata.linkedTo'] = updates.metadata.linkedTo;
          } else {
            updateData[key] = updates[key];
          }
        }
      });

      const updatedFile = await File.findOneAndUpdate(
        { _id: fileId, tenantId },
        updateData,
        { new: true, runValidators: true }
      );

      await this.updateTransaction(transaction._id, 'success');

      return updatedFile;
    } catch (error) {
      await this.updateTransaction(transaction._id, 'failed', null, error.message);
      throw error;
    }
  }

  async replaceFileContent(fileId, userId, tenantId, newFileData, requestId) {
    const transaction = await this.logTransaction(
      tenantId,
      fileId,
      'replace',
      userId,
      requestId,
      { originalName: newFileData.originalname, size: newFileData.size, mimeType: newFileData.mimetype }
    );

    try {
      const file = await this.getFileById(fileId, tenantId, userId);

      const newStorageKey = this.generateStorageKey(newFileData.originalname, userId, tenantId);
      const newExtension = path.extname(newFileData.originalname).toLowerCase();

      const uploadResult = await this.storageAdapter.uploadBuffer(newFileData.buffer, newStorageKey, {
        contentType: newFileData.mimetype,
      });

      const currentVersion = {
        versionId: file.versions.length + 1,
        storageKey: file.storageKey,
        size: file.size,
        mimeType: file.mimeType,
        createdAt: file.updatedAt,
      };

      const updatedFile = await File.findOneAndUpdate(
        { _id: fileId, tenantId },
        {
          $set: {
            originalName: newFileData.originalname,
            storageKey: newStorageKey,
            size: newFileData.size,
            mimeType: newFileData.mimetype,
            extension: newExtension,
            publicUrl: uploadResult.location,
          },
          $push: { versions: currentVersion },
        },
        { new: true, runValidators: true }
      );

      await this.updateTransaction(transaction._id, 'success', uploadResult);

      return updatedFile;
    } catch (error) {
      await this.updateTransaction(transaction._id, 'failed', null, error.message);
      throw error;
    }
  }

  async deleteFile(fileId, userId, tenantId, requestId, permanent = false) {
    const operation = permanent ? 'permanent_delete' : 'delete';
    const transaction = await this.logTransaction(tenantId, fileId, operation, userId, requestId);

    try {
      const file = await this.getFileById(fileId, tenantId, userId);

      if (permanent) {
        await this.storageAdapter.delete(file.storageKey);

        for (const version of file.versions) {
          try {
            await this.storageAdapter.delete(version.storageKey);
          } catch (err) {
            // Log but continue — version cleanup is best-effort
          }
        }

        await File.findOneAndDelete({ _id: fileId, tenantId });

        await this.updateTransaction(transaction._id, 'success');

        return { message: 'File permanently deleted' };
      } else {
        const deletedFile = await File.findOneAndUpdate(
          { _id: fileId, tenantId },
          { status: 'deleted' },
          { new: true }
        );

        await this.updateTransaction(transaction._id, 'success');

        return deletedFile;
      }
    } catch (error) {
      await this.updateTransaction(transaction._id, 'failed', null, error.message);
      throw error;
    }
  }

  async renameFile(fileId, userId, tenantId, newName, requestId) {
    const transaction = await this.logTransaction(
      tenantId,
      fileId,
      'rename',
      userId || 'anonymous',
      requestId,
      { newName }
    );

    try {
      // Verify file exists and is accessible
      await this.getFileById(fileId, tenantId);

      const trimmedName = newName.trim();
      if (!trimmedName) throw new Error('Name cannot be empty');

      const updatedFile = await File.findOneAndUpdate(
        { _id: fileId, tenantId },
        { originalName: trimmedName },
        { new: true, runValidators: true }
      );

      if (!updatedFile) throw new Error('File not found');

      await this.updateTransaction(transaction._id, 'success');

      return updatedFile;
    } catch (error) {
      await this.updateTransaction(transaction._id, 'failed', null, error.message);
      throw error;
    }
  }

  async getFileTransactions(fileId, tenantId, userId = null) {
    try {
      await this.getFileById(fileId, tenantId, userId);

      const transactions = await FileTransaction.find({ fileId, tenantId }).sort({ createdAt: -1 });

      return transactions;
    } catch (error) {
      throw error;
    }
  }

  // ─── Bulk operations ────────────────────────────────────────────────────────

  /**
   * Bulk soft-delete or permanent-delete a list of file IDs.
   * Returns { succeeded: [...], failed: [...] } — never throws for individual failures.
   */
  async bulkDelete(fileIds, userId, tenantId, requestId, permanent = false) {
    const succeeded = [];
    const failed = [];

    await Promise.all(
      fileIds.map(async (fileId) => {
        try {
          await this.deleteFile(fileId, userId, tenantId, requestId, permanent);
          succeeded.push(fileId);
        } catch (err) {
          failed.push({ id: fileId, reason: err.message });
        }
      })
    );

    return { succeeded, failed };
  }

  /**
   * Apply the same metadata patch to a list of file IDs.
   * Returns { succeeded: [...], failed: [...] }.
   */
  async bulkUpdateMetadata(fileIds, userId, tenantId, updates, requestId) {
    const succeeded = [];
    const failed = [];

    await Promise.all(
      fileIds.map(async (fileId) => {
        try {
          const updated = await this.updateFileMetadata(fileId, userId, tenantId, updates, requestId);
          succeeded.push({ id: fileId, file: updated });
        } catch (err) {
          failed.push({ id: fileId, reason: err.message });
        }
      })
    );

    return { succeeded, failed };
  }

  /**
   * Generate signed download URLs for a list of file IDs.
   * Returns { succeeded: [...], failed: [...] }.
   */
  async bulkGetSignedUrls(fileIds, tenantId, options = {}) {
    const succeeded = [];
    const failed = [];

    await Promise.all(
      fileIds.map(async (fileId) => {
        try {
          const { file, signedUrl } = await this.getSignedDownloadUrl(fileId, tenantId, null, options);
          succeeded.push({
            id: fileId,
            originalName: file.originalName,
            mimeType: file.mimeType,
            size: file.size,
            signedUrl,
          });
        } catch (err) {
          failed.push({ id: fileId, reason: err.message });
        }
      })
    );

    return { succeeded, failed };
  }

  // ─── Presigned upload (single PUT) ─────────────────────────────────────────

  /**
   * Generate a presigned PUT URL so the client can upload directly to storage.
   * Creates a File record with status='pending' immediately.
   * Client must call confirmPresignedUpload() after the PUT succeeds.
   */
  async getPresignedUploadUrl(filename, contentType, size, userId, tenantId, metadata = {}, expirySeconds = 3600) {
    const requestId = uuidv4();
    const storageKey = this.generateStorageKey(filename, userId || 'anonymous', tenantId);
    const extension = path.extname(filename).toLowerCase();

    const uploadUrl = await this.storageAdapter.getPresignedUploadUrl(storageKey, {
      contentType,
      contentLength: size,
      expiry: expirySeconds,
    });

    const file = new File({
      tenantId,
      originalName: filename,
      storageKey,
      size,
      mimeType: contentType,
      extension,
      uploader: userId || 'anonymous',
      publicUrl: '',
      category: metadata.category || '',
      metadata: {
        description: metadata.description || '',
        tags: metadata.tags || [],
        custom: metadata.custom || {},
        title: metadata.title || '',
        altText: metadata.altText || '',
        author: metadata.author || '',
        source: metadata.source || '',
        language: metadata.language || '',
        expiresAt: metadata.expiresAt || null,
        isPublic: metadata.isPublic || false,
        linkedTo: metadata.linkedTo || {},
      },
      status: 'pending',
      pendingUpload: {
        expiresAt: new Date(Date.now() + expirySeconds * 1000),
      },
    });

    await file.save();

    await this.logTransaction(tenantId, file._id, 'presign_upload_init', userId, requestId, {
      originalName: filename,
      size,
      mimeType: contentType,
    });

    return {
      fileId: file._id,
      storageKey,
      uploadUrl,
      expiresIn: expirySeconds,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
    };
  }

  /**
   * Confirm that a presigned PUT upload has completed.
   * Verifies the object exists in storage, then marks the file record active.
   */
  async confirmPresignedUpload(fileId, tenantId, userId) {
    const requestId = uuidv4();

    const file = await File.findOne({ _id: fileId, tenantId, status: 'pending' });
    if (!file) throw AppError.notFound('Pending upload not found');

    if (file.pendingUpload?.expiresAt && new Date() > file.pendingUpload.expiresAt) {
      throw AppError.badRequest('Presigned upload URL has expired');
    }

    // Verify the object actually landed in storage
    let storageMetadata;
    try {
      storageMetadata = await this.storageAdapter.getMetadata(file.storageKey);
    } catch {
      throw AppError.badRequest('File not found in storage. Ensure the upload completed before confirming.');
    }

    const publicUrl = this._buildPublicUrl(file.storageKey);

    const updatedFile = await File.findOneAndUpdate(
      { _id: fileId, tenantId },
      {
        status: 'active',
        publicUrl,
        size: storageMetadata.size || file.size,
        $unset: { pendingUpload: '' },
      },
      { new: true }
    );

    await this.logTransaction(tenantId, fileId, 'presign_upload_confirm', userId, requestId, {
      storageKey: file.storageKey,
      size: storageMetadata.size,
    });

    return updatedFile;
  }

  // ─── Multipart presigned upload (S3 / R2 only) ─────────────────────────────

  /**
   * Initiate a multipart upload. Creates a pending File record and starts the
   * S3 multipart session. Returns the uploadId needed for part uploads.
   */
  async initiateMultipartUpload(filename, contentType, size, userId, tenantId, metadata = {}) {
    const requestId = uuidv4();
    const storageKey = this.generateStorageKey(filename, userId || 'anonymous', tenantId);
    const extension = path.extname(filename).toLowerCase();

    const { uploadId } = await this.storageAdapter.initiateMultipartUpload(storageKey, { contentType });

    const file = new File({
      tenantId,
      originalName: filename,
      storageKey,
      size,
      mimeType: contentType,
      extension,
      uploader: userId || 'anonymous',
      publicUrl: '',
      category: metadata.category || '',
      metadata: {
        description: metadata.description || '',
        tags: metadata.tags || [],
        custom: metadata.custom || {},
        title: metadata.title || '',
        altText: metadata.altText || '',
        author: metadata.author || '',
        source: metadata.source || '',
        language: metadata.language || '',
        expiresAt: metadata.expiresAt || null,
        isPublic: metadata.isPublic || false,
        linkedTo: metadata.linkedTo || {},
      },
      status: 'pending',
      pendingUpload: {
        uploadId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24-hour window
      },
    });

    await file.save();

    await this.logTransaction(tenantId, file._id, 'multipart_upload_init', userId, requestId, {
      originalName: filename,
      size,
      mimeType: contentType,
      uploadId,
    });

    return { fileId: file._id, storageKey, uploadId };
  }

  /**
   * Return presigned URLs for the requested part numbers of an in-progress multipart upload.
   */
  async getPresignedPartUrls(fileId, tenantId, partNumbers) {
    const file = await File.findOne({ _id: fileId, tenantId, status: 'pending' });
    if (!file) throw AppError.notFound('Pending multipart upload not found');
    if (!file.pendingUpload?.uploadId) throw AppError.badRequest('No active multipart upload for this file');

    const parts = await this.storageAdapter.getPresignedPartUrls(
      file.storageKey,
      file.pendingUpload.uploadId,
      partNumbers
    );

    return { fileId, storageKey: file.storageKey, uploadId: file.pendingUpload.uploadId, parts };
  }

  /**
   * Complete the multipart upload. Marks the file record as active.
   */
  async completeMultipartUpload(fileId, tenantId, userId, parts) {
    const requestId = uuidv4();

    const file = await File.findOne({ _id: fileId, tenantId, status: 'pending' });
    if (!file) throw AppError.notFound('Pending multipart upload not found');
    if (!file.pendingUpload?.uploadId) throw AppError.badRequest('No active multipart upload for this file');

    const result = await this.storageAdapter.completeMultipartUpload(
      file.storageKey,
      file.pendingUpload.uploadId,
      parts
    );

    const publicUrl = result.location || this._buildPublicUrl(file.storageKey);

    const updatedFile = await File.findOneAndUpdate(
      { _id: fileId, tenantId },
      { status: 'active', publicUrl, $unset: { pendingUpload: '' } },
      { new: true }
    );

    await this.logTransaction(tenantId, fileId, 'multipart_upload_complete', userId, requestId, {
      storageKey: file.storageKey,
      etag: result.etag,
    });

    return updatedFile;
  }

  /**
   * Abort an in-progress multipart upload and remove the pending file record.
   */
  async abortMultipartUpload(fileId, tenantId, userId) {
    const requestId = uuidv4();

    const file = await File.findOne({ _id: fileId, tenantId, status: 'pending' });
    if (!file) throw AppError.notFound('Pending multipart upload not found');

    if (file.pendingUpload?.uploadId) {
      try {
        await this.storageAdapter.abortMultipartUpload(file.storageKey, file.pendingUpload.uploadId);
      } catch {
        // Best-effort: remove the DB record regardless
      }
    }

    await File.findOneAndDelete({ _id: fileId, tenantId });

    await this.logTransaction(tenantId, fileId, 'multipart_upload_abort', userId, requestId, {
      storageKey: file.storageKey,
    });

    return { message: 'Multipart upload aborted' };
  }

  // ─── Internal helpers ───────────────────────────────────────────────────────

  _buildPublicUrl(storageKey) {
    const adapter = process.env.STORAGE_ADAPTER || 'local';
    if (adapter === 's3') {
      const { storage: storageConfig } = require('../config');
      return `https://${storageConfig.s3.bucket}.s3.${storageConfig.s3.region}.amazonaws.com/${storageKey}`;
    }
    if (adapter === 'r2') {
      const { storage: storageConfig } = require('../config');
      return `${storageConfig.r2.publicDomain}/${storageConfig.r2.bucket}/${storageKey}`;
    }
    if (adapter === 'gcs') {
      const { storage: storageConfig } = require('../config');
      return `gs://${storageConfig.gcs.bucket}/${storageKey}`;
    }
    if (adapter === 'azure') {
      const { storage: storageConfig } = require('../config');
      return `https://${storageConfig.azure.connectionString.match(/AccountName=([^;]+)/)?.[1]}.blob.core.windows.net/${storageConfig.azure.container}/${storageKey}`;
    }
    return `/${storageKey}`;
  }
}

module.exports = FileService;
