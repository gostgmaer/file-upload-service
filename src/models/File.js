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
    metadata: {
      description: { type: String, trim: true },
      tags: [{ type: String, trim: true }],
      custom: { type: mongoose.Schema.Types.Mixed },
      title: { type: String, trim: true },        // display title separate from filename
      altText: { type: String, trim: true },       // accessibility alt text (useful for images)
      author: { type: String, trim: true },        // document/content author
      source: { type: String, trim: true },        // origin URL or reference string
      language: { type: String, trim: true },      // ISO 639-1 language code (e.g. 'en', 'fr')
      expiresAt: { type: Date },                   // optional TTL / expiry datetime
      isPublic: { type: Boolean, default: false }, // public visibility flag
      linkedTo: {                                  // optional polymorphic entity reference
        entityType: { type: String, trim: true },  // e.g. 'product', 'user', 'invoice'
        entityId: { type: String, trim: true },    // ID of the linked entity
      },
    },
    versions: [versionSchema],
    status: {
      type: String,
      enum: ['active', 'deleted', 'archived'],
      default: 'active',
    },
  },
  { timestamps: true }
);

// Multi-tenant compound indexes
fileSchema.index({ tenantId: 1, uploader: 1 });
fileSchema.index({ tenantId: 1, status: 1 });
fileSchema.index({ tenantId: 1, createdAt: -1 });
fileSchema.index({ tenantId: 1, mimeType: 1 });
fileSchema.index({ tenantId: 1, 'metadata.tags': 1 });
fileSchema.index({ tenantId: 1, category: 1 });
fileSchema.index({ tenantId: 1, 'metadata.isPublic': 1 });
fileSchema.index({ tenantId: 1, 'metadata.expiresAt': 1 });
fileSchema.index({ tenantId: 1, 'metadata.language': 1 });
fileSchema.index({ tenantId: 1, 'metadata.linkedTo.entityType': 1, 'metadata.linkedTo.entityId': 1 });

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
