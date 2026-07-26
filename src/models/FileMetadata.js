const mongoose = require('mongoose');

const fileMetadataSchema = new mongoose.Schema(
  {
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File',
      required: true,
      unique: true,
      index: true,
    },
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    // Production Grade Extracted File Technical Attributes
    technical: {
      hash: {
        md5: { type: String, index: true },
        sha256: { type: String, index: true },
      },
      dimensions: {
        width: { type: Number },
        height: { type: Number },
        aspectRatio: { type: Number },
      },
      format: { type: String, index: true }, // e.g., 'png', 'jpeg', 'pdf'
      colorSpace: { type: String },         // e.g., 'srgb', 'cmyk'
      channels: { type: Number },
      density: { type: Number },
      hasAlpha: { type: Boolean },
      pageCount: { type: Number },           // For PDFs / multi-page docs
      characterCount: { type: Number },      // For text files / PDFs
      wordCount: { type: Number },
      lineCount: { type: Number },
      encoding: { type: String },
      exif: { type: mongoose.Schema.Types.Mixed }, // Camera / image EXIF metadata
    },
    // User / API provided business metadata
    business: {
      title: { type: String, trim: true, index: true },
      description: { type: String, trim: true },
      category: { type: String, trim: true, index: true },
      tags: [{ type: String, trim: true, index: true }],
      author: { type: String, trim: true, index: true },
      source: { type: String, trim: true },
      language: { type: String, trim: true, index: true },
      altText: { type: String, trim: true },
      isPublic: { type: Boolean, default: false, index: true },
      expiresAt: { type: Date, index: true },
      linkedTo: {
        entityType: { type: String, trim: true, index: true },
        entityId: { type: String, trim: true, index: true },
      },
      custom: { type: mongoose.Schema.Types.Mixed },
    },
    // Upload Origin & Ownership Metadata
    audit: {
      uploader: { type: String, required: true, index: true },
      ipAddress: { type: String, index: true },
      userAgent: { type: String },
    },
  },
  {
    timestamps: true,
  }
);

// High-Performance Multi-Tenant Compound Indexes
fileMetadataSchema.index({ tenantId: 1, 'audit.uploader': 1 });
fileMetadataSchema.index({ tenantId: 1, 'audit.ipAddress': 1 });

// High-Performance Multi-Tenant Compound Indexes
fileMetadataSchema.index({ tenantId: 1, 'business.category': 1 });
fileMetadataSchema.index({ tenantId: 1, 'business.tags': 1 });
fileMetadataSchema.index({ tenantId: 1, 'business.isPublic': 1 });
fileMetadataSchema.index({ tenantId: 1, 'business.expiresAt': 1 });
fileMetadataSchema.index({ tenantId: 1, 'technical.hash.sha256': 1 });
fileMetadataSchema.index({ tenantId: 1, 'technical.format': 1 });
fileMetadataSchema.index({
  tenantId: 1,
  'business.linkedTo.entityType': 1,
  'business.linkedTo.entityId': 1,
});

module.exports = mongoose.model('FileMetadata', fileMetadataSchema);
