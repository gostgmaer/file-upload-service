const Joi = require('joi');

const validateUpload = (req, res, next) => {
  const schema = Joi.object({
    category: Joi.string().max(100).optional(),
    description: Joi.string().max(1000).optional(),
    tags: Joi.alternatives()
      .try(Joi.string(), Joi.array().items(Joi.string().max(50)))
      .optional(),
    custom: Joi.string().optional(),
    title: Joi.string().max(255).optional(),
    altText: Joi.string().max(500).optional(),
    author: Joi.string().max(255).optional(),
    source: Joi.string().max(500).optional(),
    language: Joi.string().max(10).optional(),
    expiresAt: Joi.date().iso().greater('now').optional(),
    isPublic: Joi.boolean().optional(),
    linkedEntityType: Joi.string().max(100).optional(),
    linkedEntityId: Joi.string().max(255).optional(),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ success: false, message: error.details[0].message });
  }

  if (req.body.custom) {
    try {
      JSON.parse(req.body.custom);
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid JSON in custom field' });
    }
  }

  next();
};

const validateUpdate = (req, res, next) => {
  const schema = Joi.object({
    originalName: Joi.string().max(255).optional(),
    category: Joi.string().max(100).allow('').optional(),
    metadata: Joi.object({
      description: Joi.string().max(1000).optional(),
      tags: Joi.array().items(Joi.string().max(50)).optional(),
      custom: Joi.object().optional(),
      title: Joi.string().max(255).optional(),
      altText: Joi.string().max(500).optional(),
      author: Joi.string().max(255).optional(),
      source: Joi.string().max(500).optional(),
      language: Joi.string().max(10).optional(),
      expiresAt: Joi.date().iso().optional(),
      isPublic: Joi.boolean().optional(),
      linkedTo: Joi.object({
        entityType: Joi.string().max(100).optional(),
        entityId: Joi.string().max(255).optional(),
      }).optional(),
    }).optional(),
  }).min(1);

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ success: false, message: error.details[0].message });
  }

  next();
};

const validateQuery = (req, res, next) => {
  const schema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    sort: Joi.string().pattern(/^-?(originalName|size|createdAt|updatedAt)$/).optional(),
    uploader: Joi.string().optional(),
    mimeType: Joi.string().optional(),
    category: Joi.string().max(100).optional(),
    tags: Joi.alternatives()
      .try(Joi.string(), Joi.array().items(Joi.string()))
      .optional(),
    dateFrom: Joi.date().iso().optional(),
    dateTo: Joi.date().iso().min(Joi.ref('dateFrom')).optional(),
    search: Joi.string().max(100).optional(),
    isPublic: Joi.boolean().optional(),
    language: Joi.string().max(10).optional(),
    linkedEntityType: Joi.string().max(100).optional(),
    linkedEntityId: Joi.string().max(255).optional(),
  });

  const { error } = schema.validate(req.query);
  if (error) {
    return res.status(400).json({ success: false, message: error.details[0].message });
  }

  next();
};

const validateRename = (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().trim().max(255).required(),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ success: false, message: error.details[0].message });
  }

  next();
};

// ─── Bulk validation ─────────────────────────────────────────────────────────

const validateBulkDelete = (req, res, next) => {
  const schema = Joi.object({
    ids: Joi.array().items(Joi.string().required()).min(1).max(100).required(),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ success: false, message: error.details[0].message });
  }

  next();
};

const validateBulkMetadata = (req, res, next) => {
  const schema = Joi.object({
    ids: Joi.array().items(Joi.string().required()).min(1).max(100).required(),
    updates: Joi.object({
      category: Joi.string().max(100).allow('').optional(),
      metadata: Joi.object({
        description: Joi.string().max(1000).optional(),
        tags: Joi.array().items(Joi.string().max(50)).optional(),
        custom: Joi.object().optional(),
        title: Joi.string().max(255).optional(),
        altText: Joi.string().max(500).optional(),
        author: Joi.string().max(255).optional(),
        source: Joi.string().max(500).optional(),
        language: Joi.string().max(10).optional(),
        expiresAt: Joi.date().iso().optional(),
        isPublic: Joi.boolean().optional(),
        linkedTo: Joi.object({
          entityType: Joi.string().max(100).optional(),
          entityId: Joi.string().max(255).optional(),
        }).optional(),
      }).optional(),
    }).min(1).required(),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ success: false, message: error.details[0].message });
  }

  next();
};

const validateBulkSignedUrls = (req, res, next) => {
  const schema = Joi.object({
    ids: Joi.array().items(Joi.string().required()).min(1).max(100).required(),
    expiry: Joi.number().integer().min(60).max(604800).optional(), // 1 min – 7 days
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ success: false, message: error.details[0].message });
  }

  next();
};

// ─── Presigned upload validation ──────────────────────────────────────────────

const metadataFields = {
  category: Joi.string().max(100).optional(),
  description: Joi.string().max(1000).optional(),
  tags: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string().max(50))).optional(),
  custom: Joi.alternatives().try(Joi.string(), Joi.object()).optional(),
  title: Joi.string().max(255).optional(),
  altText: Joi.string().max(500).optional(),
  author: Joi.string().max(255).optional(),
  source: Joi.string().max(500).optional(),
  language: Joi.string().max(10).optional(),
  expiresAt: Joi.date().iso().greater('now').optional(),
  isPublic: Joi.boolean().optional(),
  linkedEntityType: Joi.string().max(100).optional(),
  linkedEntityId: Joi.string().max(255).optional(),
};

const validatePresignedUpload = (req, res, next) => {
  const schema = Joi.object({
    filename: Joi.string().max(255).required(),
    contentType: Joi.string().max(100).required(),
    size: Joi.number().integer().min(1).required(),
    expiresIn: Joi.number().integer().min(60).max(604800).optional(),
    ...metadataFields,
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ success: false, message: error.details[0].message });
  }

  next();
};

const validateInitiateMultipart = (req, res, next) => {
  const schema = Joi.object({
    filename: Joi.string().max(255).required(),
    contentType: Joi.string().max(100).required(),
    size: Joi.number().integer().min(1).required(),
    ...metadataFields,
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ success: false, message: error.details[0].message });
  }

  next();
};

const validateGetPartUrls = (req, res, next) => {
  const schema = Joi.object({
    partNumbers: Joi.array()
      .items(Joi.number().integer().min(1).max(10000))
      .min(1)
      .max(1000)
      .required(),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ success: false, message: error.details[0].message });
  }

  next();
};

const validateCompleteMultipart = (req, res, next) => {
  const schema = Joi.object({
    parts: Joi.array()
      .items(
        Joi.object({
          partNumber: Joi.number().integer().min(1).max(10000).required(),
          etag: Joi.string().required(),
        })
      )
      .min(1)
      .required(),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ success: false, message: error.details[0].message });
  }

  next();
};

module.exports = {
  validateUpload,
  validateUpdate,
  validateQuery,
  validateRename,
  validateBulkDelete,
  validateBulkMetadata,
  validateBulkSignedUrls,
  validatePresignedUpload,
  validateInitiateMultipart,
  validateGetPartUrls,
  validateCompleteMultipart,
};
