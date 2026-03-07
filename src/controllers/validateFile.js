const mime = require('mime-types');
const { storage } = require('../config/storage');

const validateFile = (req, res, next) => {
  try {
    const files = req.files || (req.file ? [req.file] : []);

    if (files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files provided' });
    }

    const maxSize = storage.maxFileSize;
    const allowedMimeTypes = storage.allowedMimeTypes;

    for (const file of files) {
      if (file.size > maxSize) {
        return res.status(400).json({
          success: false,
          message: `File ${file.originalname} exceeds maximum size of ${maxSize} bytes`,
        });
      }

      if (!allowedMimeTypes.includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: `File type ${file.mimetype} not allowed for file ${file.originalname}`,
        });
      }

      // Sanitize filename
      file.originalname = file.originalname.replace(/[<>:"/\\|?*]/g, '_');
    }

    next();
  } catch (error) {
    res.status(500).json({ success: false, message: 'File validation failed' });
  }
};

module.exports = validateFile;
