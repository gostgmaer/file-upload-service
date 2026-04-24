const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const StorageAdapter = require('./StorageAdapter');
const { storage } = require('../config');

class LocalAdapter extends StorageAdapter {
  constructor() {
    super();
    this.baseDir = storage.localPath || 'uploads';
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  _resolvePath(destinationPath) {
    const base = path.resolve(this.baseDir);
    const resolved = path.resolve(base, destinationPath);
    // Guard against path traversal (e.g. ../../etc/passwd)
    if (resolved !== base && !resolved.startsWith(base + path.sep)) {
      throw new Error('Path traversal attempt detected');
    }
    return resolved;
  }

  async uploadBuffer(buffer, destinationPath, options = {}) {
    const fullPath = this._resolvePath(destinationPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, buffer);
    return {
      success: true,
      path: destinationPath,
      location: `/${destinationPath}`,
    };
  }

  async uploadStream(stream, destinationPath, options = {}) {
    return new Promise((resolve, reject) => {
      const fullPath = this._resolvePath(destinationPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      const writeStream = fs.createWriteStream(fullPath);
      stream.pipe(writeStream);
      writeStream.on('finish', () =>
        resolve({ success: true, path: destinationPath, location: `/${destinationPath}` })
      );
      writeStream.on('error', reject);
    });
  }

  async getDownloadStream(destinationPath) {
    const fullPath = this._resolvePath(destinationPath);
    if (!fs.existsSync(fullPath)) throw new Error(`File not found: ${destinationPath}`);
    return fs.createReadStream(fullPath);
  }

  async getSignedUrl(destinationPath, options = {}) {
    // Local storage doesn't have real signed URLs — return a direct path
    return `/${destinationPath}`;
  }

  async delete(destinationPath) {
    const fullPath = this._resolvePath(destinationPath);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    return { success: true, path: destinationPath };
  }

  async copy(sourcePath, destPath) {
    const src = this._resolvePath(sourcePath);
    const dest = this._resolvePath(destPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    return { success: true, sourcePath, destPath };
  }

  async getMetadata(destinationPath) {
    const fullPath = this._resolvePath(destinationPath);
    const stat = fs.statSync(fullPath);
    return { size: stat.size, lastModified: stat.mtime };
  }

  async getPresignedUploadUrl() {
    throw new Error('Presigned upload is not supported for local storage.');
  }

  async initiateMultipartUpload() {
    throw new Error('Multipart upload is not supported for local storage.');
  }

  async getPresignedPartUrls() {
    throw new Error('Multipart upload is not supported for local storage.');
  }

  async completeMultipartUpload() {
    throw new Error('Multipart upload is not supported for local storage.');
  }

  async abortMultipartUpload() {
    throw new Error('Multipart upload is not supported for local storage.');
  }
}

module.exports = new LocalAdapter();
