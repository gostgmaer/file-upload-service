class StorageAdapter {
  constructor() {
    if (this.constructor === StorageAdapter) {
      throw new Error('StorageAdapter is an abstract class');
    }
  }

  async uploadBuffer(buffer, destinationPath, options = {}) {
    throw new Error('uploadBuffer method must be implemented');
  }

  async uploadStream(stream, destinationPath, options = {}) {
    throw new Error('uploadStream method must be implemented');
  }

  async getDownloadStream(destinationPath) {
    throw new Error('getDownloadStream method must be implemented');
  }

  async getSignedUrl(destinationPath, options = {}) {
    throw new Error('getSignedUrl method must be implemented');
  }

  async delete(destinationPath) {
    throw new Error('delete method must be implemented');
  }

  async copy(sourcePath, destPath) {
    throw new Error('copy method must be implemented');
  }

  async getMetadata(destinationPath) {
    throw new Error('getMetadata method must be implemented');
  }

  // ─── Presigned upload (single PUT) ────────────────────────────────────────
  async getPresignedUploadUrl(destinationPath, options = {}) {
    throw new Error('getPresignedUploadUrl method must be implemented');
  }

  // ─── Multipart upload (S3/R2 only) ────────────────────────────────────────
  async initiateMultipartUpload(destinationPath, options = {}) {
    throw new Error('initiateMultipartUpload method must be implemented');
  }

  async getPresignedPartUrls(destinationPath, uploadId, partNumbers) {
    throw new Error('getPresignedPartUrls method must be implemented');
  }

  async completeMultipartUpload(destinationPath, uploadId, parts) {
    throw new Error('completeMultipartUpload method must be implemented');
  }

  async abortMultipartUpload(destinationPath, uploadId) {
    throw new Error('abortMultipartUpload method must be implemented');
  }
}

module.exports = StorageAdapter;
