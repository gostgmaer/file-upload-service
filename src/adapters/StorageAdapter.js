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
}

module.exports = StorageAdapter;
