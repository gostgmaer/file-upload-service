const { BlobServiceClient } = require('@azure/storage-blob');
const StorageAdapter = require('./StorageAdapter');
const { storage } = require('../config');

class AzureAdapter extends StorageAdapter {
  constructor() {
    super();
    this.blobServiceClient = BlobServiceClient.fromConnectionString(storage.azure.connectionString);
    this.containerName = storage.azure.container;
    this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
  }

  async uploadBuffer(buffer, destinationPath, options = {}) {
    try {
      const blobClient = this.containerClient.getBlockBlobClient(destinationPath);

      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: options.contentType || 'application/octet-stream',
        },
      };

      const result = await blobClient.upload(buffer, buffer.length, uploadOptions);

      return {
        success: true,
        path: destinationPath,
        etag: result.etag,
        location: blobClient.url,
      };
    } catch (error) {
      throw new Error(`Azure upload failed: ${error.message}`);
    }
  }

  async uploadStream(stream, destinationPath, options = {}) {
    try {
      const blobClient = this.containerClient.getBlockBlobClient(destinationPath);

      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: options.contentType || 'application/octet-stream',
        },
        metadata: options.metadata || {},
      };

      const result = await blobClient.uploadStream(stream, undefined, undefined, uploadOptions);

      return {
        success: true,
        path: destinationPath,
        etag: result.etag,
        location: blobClient.url,
      };
    } catch (error) {
      throw new Error(`Azure stream upload failed: ${error.message}`);
    }
  }

  async getDownloadStream(destinationPath) {
    try {
      const blobClient = this.containerClient.getBlobClient(destinationPath);
      const response = await blobClient.download();
      return response.readableStreamBody;
    } catch (error) {
      throw new Error(`Azure download failed: ${error.message}`);
    }
  }

  async getSignedUrl(destinationPath, options = {}) {
    try {
      const blobClient = this.containerClient.getBlobClient(destinationPath);
      const expiry = options.expiry || storage.signedUrlExpiry;

      const expiresOn = new Date();
      expiresOn.setSeconds(expiresOn.getSeconds() + expiry);

      const signedUrl = await blobClient.generateSasUrl({
        permissions: 'r',
        expiresOn,
      });

      return signedUrl;
    } catch (error) {
      throw new Error(`Azure signed URL generation failed: ${error.message}`);
    }
  }

  async delete(destinationPath) {
    try {
      const blobClient = this.containerClient.getBlobClient(destinationPath);
      const result = await blobClient.delete();
      return { success: true, path: destinationPath, deleteMarker: result.requestId };
    } catch (error) {
      throw new Error(`Azure delete failed: ${error.message}`);
    }
  }

  async copy(sourcePath, destPath) {
    try {
      const sourceBlobClient = this.containerClient.getBlobClient(sourcePath);
      const destBlobClient = this.containerClient.getBlobClient(destPath);

      const copyResponse = await destBlobClient.startCopyFromURL(sourceBlobClient.url);

      let copyStatus = copyResponse.copyStatus;
      while (copyStatus === 'pending') {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const properties = await destBlobClient.getProperties();
        copyStatus = properties.copyStatus;
      }

      if (copyStatus !== 'success') {
        throw new Error(`Copy operation failed with status: ${copyStatus}`);
      }

      return { success: true, sourcePath, destPath, copyId: copyResponse.copyId };
    } catch (error) {
      throw new Error(`Azure copy failed: ${error.message}`);
    }
  }

  async getMetadata(destinationPath) {
    try {
      const blobClient = this.containerClient.getBlobClient(destinationPath);
      const properties = await blobClient.getProperties();
      return {
        size: properties.contentLength,
        contentType: properties.contentType,
        lastModified: properties.lastModified,
        etag: properties.etag,
        metadata: properties.metadata,
      };
    } catch (error) {
      throw new Error(`Azure metadata fetch failed: ${error.message}`);
    }
  }

  // ─── Presigned single PUT upload (SAS token with write permission) ─────────
  async getPresignedUploadUrl(destinationPath, options = {}) {
    try {
      const expiry = options.expiry || 3600;
      const blobClient = this.containerClient.getBlockBlobClient(destinationPath);
      const expiresOn = new Date(Date.now() + expiry * 1000);

      const url = await blobClient.generateSasUrl({
        permissions: 'cw',
        expiresOn,
        ...(options.contentType && { contentType: options.contentType }),
      });

      return url;
    } catch (error) {
      throw new Error(`Azure presigned upload URL generation failed: ${error.message}`);
    }
  }

  // ─── Multipart upload (not supported for Azure via presigned flow) ─────────
  async initiateMultipartUpload() {
    throw new Error('Multipart presigned upload is not supported for Azure. Use presigned single upload instead.');
  }

  async getPresignedPartUrls() {
    throw new Error('Multipart presigned upload is not supported for Azure. Use presigned single upload instead.');
  }

  async completeMultipartUpload() {
    throw new Error('Multipart presigned upload is not supported for Azure. Use presigned single upload instead.');
  }

  async abortMultipartUpload() {
    throw new Error('Multipart presigned upload is not supported for Azure. Use presigned single upload instead.');
  }
}

module.exports = AzureAdapter;
