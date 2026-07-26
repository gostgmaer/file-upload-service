const mongoose = require('mongoose');

const versionSchema = new mongoose.Schema({
  versionId: { type: String, required: true },
  storageKey: { type: String, required: true },
  size: { type: Number, required: true },
  mimeType: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const fileSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    originalName: { type: String, required: true, trim: true },
    storageKey: { type: String, required: true, unique: true },
    size: { type: Number, required: true },
    mimeType: { type: String, required: true },
    extension: { type: String, required: true },
    uploader: { type: String, default: 'anonymous' }, // userId string from X-User-Id header
    publicUrl: { type: String },
    category: { type: String, trim: true, default: '' }, // free-form category label
    status: {
      type: String,
      enum: ['active', 'deleted', 'archived', 'pending'],
      default: 'active',
    },
    // Real result of an async post-upload malware scan against the actual
    // bytes (see jobs/virusScan via FileService.scanFileAsync) - SKIPPED
    // means no scanner was configured for this deployment, never reported
    // as CLEAN when nothing was actually checked.
    scanStatus: {
      type: String,
      enum: ['PENDING', 'CLEAN', 'INFECTED', 'SKIPPED', 'ERROR'],
      default: 'PENDING',
    },
    pendingUpload: {
      uploadId: { type: String },       // S3/R2 multipart upload ID
      expiresAt: { type: Date },        // When the presigned URL / multipart session expires
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Multi-tenant compound indexes
fileSchema.index({ tenantId: 1, uploader: 1 });
fileSchema.index({ tenantId: 1, status: 1 });
fileSchema.index({ tenantId: 1, createdAt: -1 });
fileSchema.index({ tenantId: 1, mimeType: 1 });
fileSchema.index({ tenantId: 1, category: 1 });

// Virtual Population link to FileMetadata model
fileSchema.virtual('metadataDoc', {
  ref: 'FileMetadata',
  localField: '_id',
  foreignField: 'fileId',
  justOne: true,
});

fileSchema.virtual('currentVersion').get(function () {
  if (this.versions.length === 0) {
    return {
      versionId: '1',
      storageKey: this.storageKey,
      size: this.size,
      mimeType: this.mimeType,
      createdAt: this.createdAt,
    };
  }
  return this.versions[this.versions.length - 1];
});

module.exports = mongoose.model('File', fileSchema);
