const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const StorageAdapter = require('./StorageAdapter');
const { storage } = require('../config');

class S3Adapter extends StorageAdapter {
  constructor() {
    super();

    const s3Config = {
      region: storage.s3.region,
      credentials: {
        accessKeyId: storage.s3.accessKey,
        secretAccessKey: storage.s3.secretKey,
      },
    };

    const s3Endpoint = process.env.S3_ENDPOINT;
    if (s3Endpoint) {
      s3Config.endpoint = s3Endpoint;
      s3Config.forcePathStyle = true;
    }

    this.s3Client = new S3Client(s3Config);
    this.bucket = storage.s3.bucket;
  }

  async uploadBuffer(buffer, destinationPath, options = {}) {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: destinationPath,
        Body: buffer,
        ContentType: options.contentType || 'application/octet-stream',
        Metadata: options.metadata || {},
      });

      const result = await this.s3Client.send(command);

      return {
        success: true,
        path: destinationPath,
        etag: result.ETag,
        location: `https://${this.bucket}.s3.${storage.s3.region}.amazonaws.com/${destinationPath}`,
      };
    } catch (error) {
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  async uploadStream(stream, destinationPath, options = {}) {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: destinationPath,
        Body: stream,
        ContentType: options.contentType || 'application/octet-stream',
        Metadata: options.metadata || {},
      });

      const result = await this.s3Client.send(command);

      return {
        success: true,
        path: destinationPath,
        etag: result.ETag,
        location: `https://${this.bucket}.s3.${storage.s3.region}.amazonaws.com/${destinationPath}`,
      };
    } catch (error) {
      throw new Error(`S3 stream upload failed: ${error.message}`);
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
      throw new Error(`S3 download failed: ${error.message}`);
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
      throw new Error(`S3 signed URL generation failed: ${error.message}`);
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
      throw new Error(`S3 delete failed: ${error.message}`);
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
        etag: result.CopyObjectResult.ETag,
      };
    } catch (error) {
      throw new Error(`S3 copy failed: ${error.message}`);
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
      throw new Error(`S3 metadata fetch failed: ${error.message}`);
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
      throw new Error(`S3 presigned upload URL generation failed: ${error.message}`);
    }
  }

  // ─── Multipart upload ─────────────────────────────────────────────────────
  async initiateMultipartUpload(destinationPath, options = {}) {
    try {
      const command = new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: destinationPath,
        ContentType: options.contentType || 'application/octet-stream',
        Metadata: options.metadata || {},
      });
      const result = await this.s3Client.send(command);
      return { uploadId: result.UploadId };
    } catch (error) {
      throw new Error(`S3 multipart initiation failed: ${error.message}`);
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
      throw new Error(`S3 presigned part URL generation failed: ${error.message}`);
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
        location: result.Location || `https://${this.bucket}.s3.${storage.s3.region}.amazonaws.com/${destinationPath}`,
        etag: result.ETag,
      };
    } catch (error) {
      throw new Error(`S3 multipart completion failed: ${error.message}`);
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
      throw new Error(`S3 multipart abort failed: ${error.message}`);
    }
  }
}

module.exports = S3Adapter;
