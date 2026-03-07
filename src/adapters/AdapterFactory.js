const S3Adapter = require('./S3Adapter');
const GCSAdapter = require('./GCSAdapter');
const AzureAdapter = require('./AzureAdapter');
const R2Adapter = require('./R2Adapter');
const { storage } = require('../config');

class AdapterFactory {
  static createAdapter(provider = null) {
    // local storage is handled inline (multer memoryStorage + fs write)
    const storageProvider = provider || storage.type;

    if (!storageProvider) {
      throw new Error('STORAGE_TYPE environment variable is required');
    }

    switch (storageProvider.toLowerCase()) {
      case 's3':
        if (!storage.s3.accessKey || !storage.s3.secretKey || !storage.s3.bucket) {
          throw new Error('Missing required S3 environment variables');
        }
        return new S3Adapter();

      case 'gcs':
        if (!storage.gcs.bucket) {
          throw new Error('Missing required GCS environment variables');
        }
        return new GCSAdapter();

      case 'azure':
        if (!storage.azure.connectionString || !storage.azure.container) {
          throw new Error('Missing required Azure environment variables');
        }
        return new AzureAdapter();

      case 'r2':
        return new R2Adapter();

      case 'local':
        return require('./LocalAdapter');

      default:
        throw new Error(
          `Unsupported storage provider: ${storageProvider}. Supported providers: local, s3, gcs, azure, r2`
        );
    }
  }
}

module.exports = AdapterFactory;
