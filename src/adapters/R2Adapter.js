const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const StorageAdapter = require('./StorageAdapter');
const { storage } = require('../config');

class R2Adapter extends StorageAdapter {
  constructor() {
    super();

    const requiredVars = ['R2_ENDPOINT', 'R2_ACCESS_KEY', 'R2_SECRET', 'R2_BUCKET'];
    const missing = requiredVars.filter((v) => !process.env[v]);
    if (missing.length) {
      throw new Error(`Missing required R2 environment variables: ${missing.join(', ')}`);
    }

    const endpoint = storage.r2.endpoint.startsWith('http')
      ? storage.r2.endpoint
      : `https://${storage.r2.endpoint}`;

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: storage.r2.accessKey,
        secretAccessKey: storage.r2.secretKey,
      },
      forcePathStyle: true,
    });

    this.bucket = storage.r2.bucket;
  }

  sanitizeMetadata(metadata = {}) {
    const safeMeta = {};
    for (const [key, value] of Object.entries(metadata)) {
      safeMeta[key] =
        value === undefined || value === null
          ? ''
          : typeof value === 'string'
          ? value
          : String(value);
    }
    return safeMeta;
  }

  async uploadBuffer(buffer, destinationPath, options = {}) {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: destinationPath,
        Body: buffer,
        ContentType: options.contentType || 'application/octet-stream',
        Metadata: this.sanitizeMetadata(options.metadata),
        ACL: 'public-read',
      });

      const result = await this.s3Client.send(command);
      const publicUrl = `${storage.r2.publicDomain}/${this.bucket}/${destinationPath}`;

      return {
        success: true,
        path: destinationPath,
        etag: result.ETag,
        location: publicUrl,
      };
    } catch (error) {
      throw new Error(`R2 upload failed: ${error.message}`);
    }
  }

  async uploadStream(stream, destinationPath, options = {}) {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: destinationPath,
        Body: stream,
        ContentType: options.contentType || 'application/octet-stream',
        Metadata: this.sanitizeMetadata(options.metadata),
      });

      const result = await this.s3Client.send(command);

      return {
        success: true,
        path: destinationPath,
        etag: result.ETag,
        location: `${storage.r2.endpoint}/${this.bucket}/${destinationPath}`,
      };
    } catch (error) {
      throw new Error(`R2 stream upload failed: ${error.message}`);
    }
  }

  async getDownloadStream(destinationPath) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: destinationPath,
      });

      const result = await this.s3Client.send(command);
      return result.Body;
    } catch (error) {
      throw new Error(`R2 download failed: ${error.message}`);
    }
  }

  async getSignedUrl(destinationPath, options = {}) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: destinationPath,
      });

      const expiry = options.expiry || storage.signedUrlExpiry;
      return await getSignedUrl(this.s3Client, command, { expiresIn: expiry });
    } catch (error) {
      throw new Error(`R2 signed URL generation failed: ${error.message}`);
    }
  }

  async delete(destinationPath) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: destinationPath,
      });

      const result = await this.s3Client.send(command);

      return {
        success: true,
        path: destinationPath,
        deleteMarker: result.DeleteMarker,
      };
    } catch (error) {
      throw new Error(`R2 delete failed: ${error.message}`);
    }
  }

  async copy(sourcePath, destPath) {
    try {
      const command = new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourcePath}`,
        Key: destPath,
      });

      const result = await this.s3Client.send(command);

      return {
        success: true,
        sourcePath,
        destPath,
        etag: result.CopyObjectResult?.ETag,
      };
    } catch (error) {
      throw new Error(`R2 copy failed: ${error.message}`);
    }
  }

  async getMetadata(destinationPath) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: destinationPath,
      });

      const result = await this.s3Client.send(command);

      return {
        size: result.ContentLength,
        contentType: result.ContentType,
        lastModified: result.LastModified,
        etag: result.ETag,
        metadata: result.Metadata,
      };
    } catch (error) {
      throw new Error(`R2 metadata fetch failed: ${error.message}`);
    }
  }

  // ─── Presigned single PUT upload ──────────────────────────────────────────
  async getPresignedUploadUrl(destinationPath, options = {}) {
    try {
      const expiry = options.expiry || 3600;
      const params = {
        Bucket: this.bucket,
        Key: destinationPath,
        ContentType: options.contentType || 'application/octet-stream',
      };
      if (options.contentLength) params.ContentLength = options.contentLength;

      const command = new PutObjectCommand(params);
      const url = await getSignedUrl(this.s3Client, command, { expiresIn: expiry });
      return url;
    } catch (error) {
      throw new Error(`R2 presigned upload URL generation failed: ${error.message}`);
    }
  }

  // ─── Multipart upload ─────────────────────────────────────────────────────
  async initiateMultipartUpload(destinationPath, options = {}) {
    try {
      const command = new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: destinationPath,
        ContentType: options.contentType || 'application/octet-stream',
        Metadata: this.sanitizeMetadata(options.metadata || {}),
      });
      const result = await this.s3Client.send(command);
      return { uploadId: result.UploadId };
    } catch (error) {
      throw new Error(`R2 multipart initiation failed: ${error.message}`);
    }
  }

  async getPresignedPartUrls(destinationPath, uploadId, partNumbers) {
    try {
      const expiry = 3600;
      const urls = await Promise.all(
        partNumbers.map(async (partNumber) => {
          const command = new UploadPartCommand({
            Bucket: this.bucket,
            Key: destinationPath,
            UploadId: uploadId,
            PartNumber: partNumber,
          });
          const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: expiry });
          return { partNumber, uploadUrl };
        })
      );
      return urls;
    } catch (error) {
      throw new Error(`R2 presigned part URL generation failed: ${error.message}`);
    }
  }

  async completeMultipartUpload(destinationPath, uploadId, parts) {
    try {
      const command = new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: destinationPath,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      });
      const result = await this.s3Client.send(command);
      return {
        location: result.Location || `${storage.r2.publicDomain}/${this.bucket}/${destinationPath}`,
        etag: result.ETag,
      };
    } catch (error) {
      throw new Error(`R2 multipart completion failed: ${error.message}`);
    }
  }

  async abortMultipartUpload(destinationPath, uploadId) {
    try {
      const command = new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: destinationPath,
        UploadId: uploadId,
      });
      await this.s3Client.send(command);
      return { success: true };
    } catch (error) {
      throw new Error(`R2 multipart abort failed: ${error.message}`);
    }
  }
}

module.exports = R2Adapter;
