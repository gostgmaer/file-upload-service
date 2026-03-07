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
}

module.exports = FileService;
