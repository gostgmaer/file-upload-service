const { Storage } = require('@google-cloud/storage');
const StorageAdapter = require('./StorageAdapter');
const { storage: storageConfig } = require('../config');

class GCSAdapter extends StorageAdapter {
  constructor() {
    super();
    const storageOptions = {
      projectId: storageConfig.gcs.projectId,
    };

    if (storageConfig.gcs.keyFile) {
      storageOptions.keyFilename = storageConfig.gcs.keyFile;
    }

    this.storage = new Storage(storageOptions);
    this.bucket = this.storage.bucket(storageConfig.gcs.bucket);
  }

  async uploadBuffer(buffer, destinationPath, options = {}) {
    try {
      const file = this.bucket.file(destinationPath);

      const stream = file.createWriteStream({
        metadata: {
          contentType: options.contentType || 'application/octet-stream',
          metadata: options.metadata || {},
        },
      });

      return new Promise((resolve, reject) => {
        stream.on('error', (error) => reject(new Error(`GCS upload failed: ${error.message}`)));
        stream.on('finish', () =>
          resolve({
            success: true,
            path: destinationPath,
            location: `gs://${storageConfig.gcs.bucket}/${destinationPath}`,
          })
        );
        stream.end(buffer);
      });
    } catch (error) {
      throw new Error(`GCS upload failed: ${error.message}`);
    }
  }

  async uploadStream(stream, destinationPath, options = {}) {
    try {
      const file = this.bucket.file(destinationPath);

      const writeStream = file.createWriteStream({
        metadata: {
          contentType: options.contentType || 'application/octet-stream',
          metadata: options.metadata || {},
        },
      });

      return new Promise((resolve, reject) => {
        writeStream.on('error', (error) => reject(new Error(`GCS stream upload failed: ${error.message}`)));
        writeStream.on('finish', () =>
          resolve({
            success: true,
            path: destinationPath,
            location: `gs://${storageConfig.gcs.bucket}/${destinationPath}`,
          })
        );
        stream.pipe(writeStream);
      });
    } catch (error) {
      throw new Error(`GCS stream upload failed: ${error.message}`);
    }
  }

  async getDownloadStream(destinationPath) {
    try {
      const file = this.bucket.file(destinationPath);
      return file.createReadStream();
    } catch (error) {
      throw new Error(`GCS download failed: ${error.message}`);
    }
  }

  async getSignedUrl(destinationPath, options = {}) {
    try {
      const file = this.bucket.file(destinationPath);
      const expiry = options.expiry || storageConfig.signedUrlExpiry;

      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + expiry * 1000,
      });

      return signedUrl;
    } catch (error) {
      throw new Error(`GCS signed URL generation failed: ${error.message}`);
    }
  }

  async delete(destinationPath) {
    try {
      const file = this.bucket.file(destinationPath);
      await file.delete();
      return { success: true, path: destinationPath };
    } catch (error) {
      throw new Error(`GCS delete failed: ${error.message}`);
    }
  }

  async copy(sourcePath, destPath) {
    try {
      const sourceFile = this.bucket.file(sourcePath);
      const destFile = this.bucket.file(destPath);
      await sourceFile.copy(destFile);
      return { success: true, sourcePath, destPath };
    } catch (error) {
      throw new Error(`GCS copy failed: ${error.message}`);
    }
  }

  async getMetadata(destinationPath) {
    try {
      const file = this.bucket.file(destinationPath);
      const [metadata] = await file.getMetadata();
      return {
        size: metadata.size,
        contentType: metadata.contentType,
        lastModified: metadata.updated,
        etag: metadata.etag,
        metadata: metadata.metadata,
      };
    } catch (error) {
      throw new Error(`GCS metadata fetch failed: ${error.message}`);
    }
  }
}

module.exports = GCSAdapter;
