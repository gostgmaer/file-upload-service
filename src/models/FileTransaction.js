const mongoose = require('mongoose');

const fileTransactionSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File' },
    operation: {
      type: String,
      enum: ['upload', 'update_metadata', 'rename', 'replace', 'delete', 'permanent_delete'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed'],
      default: 'pending',
    },
    performedBy: { type: String, default: 'anonymous' }, // userId string from X-User-Id header (optional)
    requestId: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed },
    providerResponse: { type: mongoose.Schema.Types.Mixed },
    error: { type: String },
  },
  { timestamps: true }
);

// Indexes for efficient queries
fileTransactionSchema.index({ tenantId: 1, fileId: 1, createdAt: -1 });
fileTransactionSchema.index({ tenantId: 1, performedBy: 1, createdAt: -1 });
fileTransactionSchema.index({ status: 1 });
fileTransactionSchema.index({ operation: 1 });

module.exports = mongoose.model('FileTransaction', fileTransactionSchema);
